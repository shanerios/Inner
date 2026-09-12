package expo.modules.inneraudio

import java.io.File
import java.net.URI
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.util.concurrent.locks.ReentrantLock
import kotlin.concurrent.withLock
import kotlin.math.cos
import kotlin.math.max
import kotlin.math.min
import kotlin.math.pow
import kotlin.math.sin
import kotlin.math.tanh

/**
 * Behavioral port of modules/inner-audio/ios/InnerAudioModule.swift's
 * ProceduralAudioEngine. Keep this in lockstep with the Swift renderer —
 * do not "improve" the DSP here without mirroring the change on iOS.
 */
internal data class AudioParameters(
  var carrierHz: Double = 528.0,
  var binauralCarrierHz: Double = 200.0,
  var deltaHz: Double = 4.0,
  var toneGain: Double = 0.22,
  var harmonicWarmth: Double = 0.0,
  var binauralGain: Double = 0.0,
  var noiseColor: String? = null,
  var noiseGain: Double = 0.0,
  var environment: String = "none",
  var environmentGain: Double = 0.0,
  var environmentIntensity: Double = 0.5,
  var templeGain: Double = 0.0,
  var templeIntensity: Double = 0.5,
  var masterGain: Double = 0.8,
  var rampSeconds: Double = 0.08,
  var spatialMode: String = "still",
  var spatialTarget: String = "noise",
  var spatialDepth: Double = 0.0,
  var spatialRate: Double = 0.3,
  var sleepEndMs: Double? = null,
)

private data class TimelineStageState(
  val durationMs: Double,
  val transitionMs: Double,
  val parameters: AudioParameters,
  val spatialEvents: List<SpatialEventState>,
  val cueEvents: List<CueEventState>,
)

private data class SpatialEventState(
  val atMs: Double,
  val durationMs: Double,
  val direction: String,
  val depth: Double,
)

private data class CueEventState(val atMs: Double)

private data class AudioTimelineState(
  val seed: Long,
  val loop: Boolean,
  val fadeInMs: Double,
  val totalDurationMs: Double,
  val stages: List<TimelineStageState>,
)

private class RainPocket(var random: Long) {
  var pan = 0.0
  var targetPan = 0.0
  var level = 0.0
  var targetLevel = 0.0
  var framesRemaining = 0.0
  var filter = 0.0
}

// A short feedback comb filter — one tap of a Schroeder-style reverb tank.
private class CombFilter(delaySamples: Int, private val feedback: Double) {
  private val buffer = DoubleArray(max(1, delaySamples))
  private var index = 0
  fun process(x: Double): Double {
    val y = buffer[index]
    buffer[index] = x + y * feedback
    index = (index + 1) % buffer.size
    return y
  }
}

private class AllpassFilter(delaySamples: Int, private val gain: Double = 0.7) {
  private val buffer = DoubleArray(max(1, delaySamples))
  private var index = 0
  fun process(x: Double): Double {
    val buffered = buffer[index]
    val y = -gain * x + buffered
    buffer[index] = x + buffered * gain
    index = (index + 1) % buffer.size
    return y
  }
}

private fun clamp(value: Double, low: Double, high: Double) = min(high, max(low, value))

// 0x9e3779b97f4a7c15 (golden-ratio xorshift seed) sets bit 63, which exceeds Kotlin's Long hex
// literal range — parse it as an unsigned value to get the identical bit pattern instead.
private val XORSHIFT_SEED: Long = java.lang.Long.parseUnsignedLong("9e3779b97f4a7c15", 16)

private const val COSMIC_NEAR_DELAY_SECONDS = 0.23
private const val COSMIC_MID_DELAY_SECONDS = 0.41
private const val COSMIC_FAR_DELAY_SECONDS = 0.67
private const val COSMIC_FEEDBACK = 0.24
private const val FOREST_NOISE_MIX = 0.3

// The lucidity cue: a fixed, non-seeded ascending three-note motif (the same
// 400/600/800 Hz contour used in published targeted-lucidity-reactivation
// research) with a slow harmonic swell and a wide reverb tail. Unlike every
// other generator in this file, nothing here may vary between plays — the
// whole point is that a listener trained on this exact sound recognizes the
// exact same sound again later, so it must render identically every time.
private val CUE_NOTE_HZ = doubleArrayOf(400.0, 600.0, 800.0)
private val CUE_NOTE_STARTS = doubleArrayOf(0.0, 0.93, 1.86)
private const val CUE_NOTE_SECONDS = 0.75
private const val CUE_ATTACK_SECONDS = 0.24
private const val CUE_RELEASE_SECONDS = 0.32
private val CUE_HARMONIC_RATIOS = doubleArrayOf(1.0, 2.0, 3.0, 4.0)
private val CUE_HARMONIC_WEIGHTS = doubleArrayOf(1.00, 0.35, 0.15, 0.06)
private val CUE_HARMONIC_WEIGHT_SUM = CUE_HARMONIC_WEIGHTS.sum()
private const val CUE_TOTAL_SECONDS = 7.76
private const val CUE_REVERB_RT60 = 3.6
private const val CUE_DRY_GAIN = 0.48
private const val CUE_WET_GAIN = 1.15
private const val CUE_STEREO_WIDTH = 1.7
private const val CUE_OUTPUT_GAIN = 0.2925
private val CUE_LEFT_COMB_MS = doubleArrayOf(27.5, 33.9, 39.4, 46.1, 52.3)
private val CUE_RIGHT_COMB_MS = doubleArrayOf(30.9, 36.7, 43.8, 48.6, 55.9)
private val CUE_LEFT_ALLPASS_MS = doubleArrayOf(5.0, 1.7)
private val CUE_RIGHT_ALLPASS_MS = doubleArrayOf(5.6, 2.1)

private fun combFeedbackForRt60(delaySamples: Int, rt60: Double, sampleRate: Double): Double =
  10.0.pow(-3.0 * delaySamples / (rt60 * sampleRate))

object ProceduralAudioEngine {
  private val lock = ReentrantLock()
  private val diagnosticLock = ReentrantLock()
  private val diagnosticEvents = mutableListOf<Map<String, Any>>()
  private var parameters = AudioParameters()
  private var timeline: AudioTimelineState? = null
  private var timelineElapsedFrames = 0.0
  private var timelineGeneration = 0L
  private var renderedTimelineGeneration = Long.MIN_VALUE

  @Volatile var sampleRate = 48_000.0

  /** Mirrors iOS's `nowPlayingTitle`: persists independently of whether playback is running. */
  @Volatile var nowPlayingTitle: String = "Inner"

  // Render-thread-only state (never touched off the audio thread).
  // carrier, binaural L/R, carrier harmonics, speaker carrier + pulse envelope
  private val phases = DoubleArray(7)
  private val gains = DoubleArray(4)
  /** 1 = private stereo output (binaural), 0 = speaker-safe rhythmic pulse. */
  @Volatile private var privateOutputTarget = 0.0
  private var privateOutputMix = 0.0
  private var random: Long = XORSHIFT_SEED
  private val pink = DoubleArray(7)
  private var brown = 0.0
  private var greyLow = 0.0
  private var rainPockets = buildRainPockets()
  private var noiseEnvelope = 0.0
  private var renderedNoiseColor: String? = null
  private var pendingNoiseColor: String? = null
  private var isChangingNoiseColor = false
  private var rainMix = 0.0
  private var oceanEnvelope = 0.0
  private var oceanRandom = XORSHIFT_SEED xor 0x51ed2705L
  private var oceanLow = 0.0
  private var oceanMid = 0.0
  private var oceanFoamLeft = 0.0
  private var oceanFoamRight = 0.0
  private var windEnvelope = 0.0
  private var windRandom = XORSHIFT_SEED xor 0x7f4a7c15L
  private var windBody = 0.0
  private var windAirLeft = 0.0
  private var windAirRight = 0.0
  private var fireEnvelope = 0.0
  private var fireRandom = XORSHIFT_SEED xor 0x2c1b3c6dL
  private var fireBody = 0.0
  private var fireHiss = 0.0
  private var firePopLeft = 0.0
  private var firePopRight = 0.0
  private var cosmicEnvelope = 0.0
  private var cosmicRandom = XORSHIFT_SEED xor 0x8f1bbcdcL
  private var cosmicRumble = 0.0
  private var cosmicAirLeft = 0.0
  private var cosmicAirRight = 0.0
  private var cosmicSparkFramesRemaining = 0.0
  private var cosmicSparkPhase = 0.0
  private var cosmicSparkFreq = 0.0
  private var cosmicSparkAmp = 0.0
  private var cosmicSparkPan = 0.0
  private var cosmicSparkAgeFrames = 0.0
  private var cosmicSparkDurationFrames = 0.0
  private val cosmicDelay = DoubleArray(48_000)
  private val silentStereo = Pair(0.0, 0.0)
  private var cosmicDelayIndex = 0
  private var forestEnvelope = 0.0
  private var forestRandom = XORSHIFT_SEED xor 0xc2b2ae35L
  private var forestCanopy = 0.0
  private var forestLeafLeft = 0.0
  private var forestLeafRight = 0.0
  private var forestBirdActive = false
  private var forestBirdFramesRemaining = 0.0
  private var forestBirdDurationFrames = 0.0
  private var forestBirdPhase = 0.0
  private var forestBirdFreqStart = 0.0
  private var forestBirdFreqRange = 0.0
  private var forestBirdAmp = 0.0
  private var forestBirdPan = 0.0
  private var templeEnvelope = 0.0
  private var templeRandom = XORSHIFT_SEED xor 0x9c2f5a31L
  private val templePhases = DoubleArray(4)
  private val templeAmps = DoubleArray(4)
  private val templeFreqs = DoubleArray(4)
  @Volatile private var cuePending = false
  private var cueActive = false
  private var cueTimelineThresholdMs = -1.0
  private var cueElapsedFrames = 0.0
  private var cueTotalFrames = 0.0
  private var cueLeftCombs: Array<CombFilter> = emptyArray()
  private var cueRightCombs: Array<CombFilter> = emptyArray()
  private var cueLeftAllpasses: Array<AllpassFilter> = emptyArray()
  private var cueRightAllpasses: Array<AllpassFilter> = emptyArray()
  private var recognitionSignalSamples = FloatArray(0)
  private var recognitionSignalSampleRate = 0.0
  private var recognitionSignalId: String? = null
  private var activeCueSamples = FloatArray(0)
  private var activeCueSampleRate = 0.0
  private var orbitMix = 0.0
  private var orbitNoiseFilter = 0.0
  private var renderedPan = 0.0
  private var renderedSpatialRoom = 1.0
  private var renderedSpatialDistance = 1.0
  private var renderElapsedFrames = 0.0
  @Volatile private var sleepStopScheduled = false
  @Volatile var lastTimerCompletionAtMs: Double? = null
    private set

  /** Set by the playback service; invoked (off the lock) once the sleep timer fade completes. */
  @Volatile var onSleepTimerElapsed: (() -> Unit)? = null

  private fun buildRainPockets(seed: Long = XORSHIFT_SEED) =
    Array(5) { index -> RainPocket(seed + (index + 1).toLong() * 0x100000001b3L) }

  fun recordDiagnostic(type: String, reason: String? = null, route: String? = null, extras: Map<String, Any> = emptyMap()) {
    val event = mutableMapOf<String, Any>("type" to type, "atMs" to System.currentTimeMillis().toDouble())
    reason?.let { event["reason"] = it }
    route?.let { event["route"] = it }
    event.putAll(extras)
    diagnosticLock.withLock {
      diagnosticEvents.add(event)
      while (diagnosticEvents.size > 100) diagnosticEvents.removeAt(0)
    }
  }

  fun drainDiagnosticEvents(): List<Map<String, Any>> = diagnosticLock.withLock {
    diagnosticEvents.toList().also { diagnosticEvents.clear() }
  }

  fun setRecognitionSignal(signalId: String?, uri: String?) {
    if (uri.isNullOrEmpty()) {
      lock.withLock {
        recognitionSignalSamples = FloatArray(0)
        recognitionSignalSampleRate = 0.0
        recognitionSignalId = signalId
      }
      return
    }
    val bytes = File(URI(uri)).readBytes()
    require(bytes.size >= 44 && String(bytes, 0, 4, Charsets.US_ASCII) == "RIFF" && String(bytes, 8, 4, Charsets.US_ASCII) == "WAVE") {
      "Recognition signal is not a valid WAV file"
    }
    val buffer = ByteBuffer.wrap(bytes).order(ByteOrder.LITTLE_ENDIAN)
    var format = 0
    var channels = 0
    var sourceRate = 0
    var bits = 0
    var dataOffset = -1
    var dataSize = 0
    var offset = 12
    while (offset + 8 <= bytes.size) {
      val chunkId = String(bytes, offset, 4, Charsets.US_ASCII)
      val chunkSize = buffer.getInt(offset + 4)
      val body = offset + 8
      if (chunkSize < 0 || body + chunkSize > bytes.size) break
      if (chunkId == "fmt " && chunkSize >= 16) {
        format = buffer.getShort(body).toInt() and 0xffff
        channels = buffer.getShort(body + 2).toInt() and 0xffff
        sourceRate = buffer.getInt(body + 4)
        bits = buffer.getShort(body + 14).toInt() and 0xffff
      } else if (chunkId == "data") {
        dataOffset = body
        dataSize = chunkSize
      }
      offset = body + chunkSize + (chunkSize and 1)
    }
    require(format == 1 && channels == 1 && bits == 16 && sourceRate > 0 && dataOffset >= 0) {
      "Recognition signal must be 16-bit mono PCM WAV"
    }
    val sampleCount = dataSize / 2
    val samples = FloatArray(sampleCount) { index -> buffer.getShort(dataOffset + index * 2) / 32768f }
    lock.withLock {
      recognitionSignalSamples = samples
      recognitionSignalSampleRate = sourceRate.toDouble()
      recognitionSignalId = signalId
    }
  }

  fun configure(raw: AudioConfigRecord) {
    lock.withLock {
      parameters = normalizedParameters(raw, parameters.sleepEndMs)
      timeline = null
      timelineElapsedFrames = 0.0
      timelineGeneration++
    }
  }

  fun setTimeline(raw: AudioTimelineRecord?) {
    lock.withLock {
      if (raw == null || raw.stages.isEmpty()) {
        timeline = null
        timelineElapsedFrames = 0.0
        timelineGeneration++
        return@withLock
      }
      val stages = raw.stages.take(32).map { stage ->
        val durationMs = clamp(stage.durationMs, 1_000.0, 14_400_000.0)
        TimelineStageState(
          durationMs = durationMs,
          transitionMs = clamp(stage.transitionMs, 0.0, durationMs),
          parameters = normalizedParameters(stage.config, null),
          spatialEvents = stage.spatialEvents.take(16).mapNotNull { event ->
            if (event.type != "swoosh" || event.atMs < 0 || event.durationMs < 500) return@mapNotNull null
            SpatialEventState(
              atMs = event.atMs,
              durationMs = min(5_000.0, event.durationMs),
              direction = if (event.direction == "left") "left" else "right",
              depth = clamp(event.depth, 0.0, 0.8),
            )
          },
          cueEvents = stage.spatialEvents.take(16).mapNotNull { event ->
            if (event.type != "cue" || event.atMs < 0) return@mapNotNull null
            CueEventState(atMs = event.atMs)
          },
        )
      }
      val total = stages.sumOf { it.durationMs }
      timeline = AudioTimelineState(
        seed = max(1L, raw.seed.toLong()),
        loop = raw.loop,
        fadeInMs = clamp(raw.fadeInMs, 0.0, 10_000.0),
        totalDurationMs = total,
        stages = stages,
      )
      timelineElapsedFrames = 0.0
      timelineGeneration++
    }
  }

  fun seekTimeline(positionMs: Double) {
    lock.withLock {
      val activeTimeline = timeline ?: return@withLock
      val boundedMs = if (activeTimeline.loop) {
        max(0.0, positionMs) % activeTimeline.totalDurationMs
      } else {
        clamp(positionMs, 0.0, activeTimeline.totalDurationMs)
      }
      timelineElapsedFrames = boundedMs * sampleRate / 1_000.0
      timelineGeneration++
    }
  }

  fun setSleepTimer(endAtMs: Double?) {
    lock.withLock {
      parameters.sleepEndMs = endAtMs
      sleepStopScheduled = false
      lastTimerCompletionAtMs = null
    }
  }

  /** Fires the fixed lucidity cue once. Safe to call at any time; a call while
   * the cue is already ringing restarts it cleanly rather than layering. */
  fun triggerCue() {
    cuePending = true
  }

  fun setPrivateOutput(isPrivate: Boolean) {
    privateOutputTarget = if (isPrivate) 1.0 else 0.0
  }

  /** Mirrors iOS stop(): clears render-thread DSP state and any active timeline. */
  fun reset() {
    phases.fill(0.0)
    gains.fill(0.0)
    random = XORSHIFT_SEED
    pink.fill(0.0)
    brown = 0.0
    greyLow = 0.0
    rainPockets = buildRainPockets()
    noiseEnvelope = 0.0
    renderedNoiseColor = null
    pendingNoiseColor = null
    isChangingNoiseColor = false
    rainMix = 0.0
    oceanEnvelope = 0.0
    oceanRandom = XORSHIFT_SEED xor 0x51ed2705L
    oceanLow = 0.0
    oceanMid = 0.0
    oceanFoamLeft = 0.0
    oceanFoamRight = 0.0
    windEnvelope = 0.0
    windRandom = XORSHIFT_SEED xor 0x7f4a7c15L
    windBody = 0.0
    windAirLeft = 0.0
    windAirRight = 0.0
    fireEnvelope = 0.0
    fireRandom = XORSHIFT_SEED xor 0x2c1b3c6dL
    fireBody = 0.0
    fireHiss = 0.0
    firePopLeft = 0.0
    firePopRight = 0.0
    cosmicEnvelope = 0.0
    cosmicRandom = XORSHIFT_SEED xor 0x8f1bbcdcL
    cosmicRumble = 0.0
    cosmicAirLeft = 0.0
    cosmicAirRight = 0.0
    cosmicSparkFramesRemaining = 0.0
    cosmicSparkPhase = 0.0
    cosmicSparkFreq = 0.0
    cosmicSparkAmp = 0.0
    cosmicSparkPan = 0.0
    cosmicSparkAgeFrames = 0.0
    cosmicSparkDurationFrames = 0.0
    cosmicDelay.fill(0.0)
    cosmicDelayIndex = 0
    cueTimelineThresholdMs = -1.0
    forestEnvelope = 0.0
    forestRandom = XORSHIFT_SEED xor 0xc2b2ae35L
    forestCanopy = 0.0
    forestLeafLeft = 0.0
    forestLeafRight = 0.0
    forestBirdActive = false
    forestBirdFramesRemaining = 0.0
    forestBirdDurationFrames = 0.0
    forestBirdPhase = 0.0
    forestBirdFreqStart = 0.0
    forestBirdFreqRange = 0.0
    forestBirdAmp = 0.0
    forestBirdPan = 0.0
    templeEnvelope = 0.0
    templeRandom = XORSHIFT_SEED xor 0x9c2f5a31L
    templePhases.fill(0.0)
    templeAmps.fill(0.0)
    templeFreqs.fill(0.0)
    cuePending = false
    cueActive = false
    cueElapsedFrames = 0.0
    cueTotalFrames = 0.0
    cueLeftCombs = emptyArray()
    cueRightCombs = emptyArray()
    cueLeftAllpasses = emptyArray()
    cueRightAllpasses = emptyArray()
    orbitMix = 0.0
    orbitNoiseFilter = 0.0
    renderedPan = 0.0
    renderedSpatialRoom = 1.0
    renderedSpatialDistance = 1.0
    privateOutputMix = privateOutputTarget
    renderElapsedFrames = 0.0
    sleepStopScheduled = false
    lock.withLock {
      timeline = null
      timelineElapsedFrames = 0.0
      timelineGeneration++
    }
  }

  /**
   * Renders [frameCount] stereo frames into [output] (interleaved L,R, size >= frameCount*2).
   * Must only ever be called from a single dedicated audio render thread.
   */
  fun render(output: FloatArray, frameCount: Int) {
    val baseTarget: AudioParameters
    val activeTimeline: AudioTimelineState?
    val timelineStartFrame: Double
    val renderStartFrame = renderElapsedFrames
    val generation: Long
    lock.withLock {
      baseTarget = parameters.copy()
      activeTimeline = timeline
      timelineStartFrame = timelineElapsedFrames
      generation = timelineGeneration
    }
    if (activeTimeline != null && renderedTimelineGeneration != generation) {
      random = activeTimeline.seed
      oceanRandom = activeTimeline.seed xor 0x51ed2705L
      windRandom = activeTimeline.seed xor 0x7f4a7c15L
      fireRandom = activeTimeline.seed xor 0x2c1b3c6dL
      cosmicRandom = activeTimeline.seed xor 0x8f1bbcdcL
      cosmicRumble = 0.0
      cosmicAirLeft = 0.0
      cosmicAirRight = 0.0
      templeRandom = activeTimeline.seed xor 0x9c2f5a31L
      rainPockets = buildRainPockets(activeTimeline.seed)
      pink.fill(0.0)
      brown = 0.0
      greyLow = 0.0
      cosmicDelay.fill(0.0)
      cosmicDelayIndex = 0
      cosmicSparkFramesRemaining = 0.0
      cosmicSparkAgeFrames = 0.0
      cosmicSparkDurationFrames = 0.0
      forestRandom = activeTimeline.seed xor 0xc2b2ae35L
      forestBirdActive = false
      forestBirdFramesRemaining = 0.0
      // Anything at-or-before the timeline's current position counts as
      // already fired, so a fresh timeline or a seek doesn't replay past cues.
      cueTimelineThresholdMs = timelineStartFrame * 1_000.0 / sampleRate
      renderedTimelineGeneration = generation
    }
    if (cuePending) {
      cuePending = false
      startCue()
    }
    val tau = Math.PI * 2
    val bufferStartMs = System.currentTimeMillis().toDouble()

    for (frame in 0 until frameCount) {
      val target = activeTimeline?.let {
        timelineParameters(it, (timelineStartFrame + frame) * 1_000.0 / sampleRate, baseTarget)
      } ?: baseTarget
      val spatialTime = (if (activeTimeline == null) renderStartFrame else timelineStartFrame) + frame
      val spatialSeconds = spatialTime / sampleRate
      val journeyFade = activeTimeline?.let {
        if (it.fadeInMs > 0) min(1.0, spatialTime * 1_000.0 / sampleRate / it.fadeInMs) else 1.0
      } ?: 1.0
      val timelineElapsedMs = spatialTime * 1_000.0 / sampleRate
      val event = activeTimeline?.let { timelineSpatialEvent(it, timelineElapsedMs) }
      if (activeTimeline != null) {
        val cueFireMs = timelineCueEventMs(activeTimeline, timelineElapsedMs, cueTimelineThresholdMs)
        if (cueFireMs != null) {
          cueTimelineThresholdMs = cueFireMs
          startCue()
          recordDiagnostic("recognition_signal_fired", extras = mapOf(
            "signalId" to (recognitionSignalId ?: "ascending"),
            "scheduledPositionMs" to cueFireMs,
            "actualPositionMs" to timelineElapsedMs,
            "driftMs" to (timelineElapsedMs - cueFireMs),
          ))
        }
      }
      val orbitPhase = spatialSeconds * target.spatialRate * Math.PI * 2 / 60
      val orbitNear = (cos(orbitPhase) + 1) / 2
      // Vortex reuses orbit's "pulled toward/away from center" distance-darkening
      // mechanic — a spiral is a kind of orbit whose radius and rate aren't constant.
      val orbitTarget = if (target.spatialMode == "orbit" || target.spatialMode == "vortex") 1.0 else 0.0
      val orbitStep = 1 / max(1.0, sampleRate * 2.0)
      orbitMix += clamp(orbitTarget - orbitMix, -orbitStep, orbitStep)
      val requestedPan = event?.pan ?: spatialPan(target, spatialSeconds)
      val requestedSpatialRoom = min(
        spatialCenterGain(target, spatialSeconds),
        event?.let { 1 - 0.62 * it.crossing } ?: 1.0,
      )
      val orbitDistance = 1 - target.spatialDepth * 0.5 * (1 - orbitNear)
      val requestedSpatialDistance = 1 + (orbitDistance - 1) * orbitMix
      val spatialSlew = 1 / max(1.0, sampleRate * 0.12)
      renderedPan += clamp(requestedPan - renderedPan, -spatialSlew, spatialSlew)
      renderedSpatialRoom += clamp(requestedSpatialRoom - renderedSpatialRoom, -spatialSlew, spatialSlew)
      renderedSpatialDistance += clamp(requestedSpatialDistance - renderedSpatialDistance, -spatialSlew, spatialSlew)
      val pan = renderedPan
      val spatialRoom = renderedSpatialRoom
      val spatialDistance = renderedSpatialDistance
      val leftSpatial = 1 - pan
      val rightSpatial = 1 + pan
      val smoothing = min(1.0, 1 / max(1.0, target.rampSeconds * sampleRate))
      val leftHz = max(20.0, target.binauralCarrierHz - target.deltaHz / 2)
      val rightHz = min(2_000.0, target.binauralCarrierHz + target.deltaHz / 2)
      val routeStep = 1 / max(1.0, sampleRate * 5.0)
      privateOutputMix += clamp(privateOutputTarget - privateOutputMix, -routeStep, routeStep)
      gains[0] += (target.toneGain - gains[0]) * smoothing
      gains[1] += (target.binauralGain - gains[1]) * smoothing
      gains[2] += (target.noiseGain - gains[2]) * smoothing
      gains[3] += (target.masterGain - gains[3]) * smoothing
      if (target.noiseColor != renderedNoiseColor && (!isChangingNoiseColor || pendingNoiseColor != target.noiseColor)) {
        pendingNoiseColor = target.noiseColor
        isChangingNoiseColor = true
      }
      val noiseIsPresent = renderedNoiseColor != null && target.noiseGain > 0.0001
      val noiseEnvelopeTarget = if (isChangingNoiseColor) 0.0 else if (noiseIsPresent) 1.0 else 0.0
      val noiseEnvelopeStep = 1 / max(1.0, sampleRate * 4.5)
      noiseEnvelope += clamp(noiseEnvelopeTarget - noiseEnvelope, -noiseEnvelopeStep, noiseEnvelopeStep)
      if (isChangingNoiseColor && noiseEnvelope <= 0.0001) {
        renderedNoiseColor = pendingNoiseColor
        pendingNoiseColor = null
        isChangingNoiseColor = false
        pink.fill(0.0)
        brown = 0.0
        greyLow = 0.0
      }
      val rainTarget = if (target.spatialMode == "rain") 1.0 else 0.0
      val rainStep = 1 / max(1.0, sampleRate * 4.5)
      rainMix += clamp(rainTarget - rainMix, -rainStep, rainStep)
      val oceanTarget = if (target.environment == "ocean" && target.environmentGain > 0.0001) 1.0 else 0.0
      val oceanStep = 1 / max(1.0, sampleRate * 4.5)
      oceanEnvelope += clamp(oceanTarget - oceanEnvelope, -oceanStep, oceanStep)
      val windTarget = if (target.environment == "wind" && target.environmentGain > 0.0001) 1.0 else 0.0
      val windStep = 1 / max(1.0, sampleRate * 4.5)
      windEnvelope += clamp(windTarget - windEnvelope, -windStep, windStep)
      val fireTarget = if (target.environment == "fire" && target.environmentGain > 0.0001) 1.0 else 0.0
      val fireStep = 1 / max(1.0, sampleRate * 4.5)
      fireEnvelope += clamp(fireTarget - fireEnvelope, -fireStep, fireStep)
      val cosmicTarget = if (target.environment == "cosmic" && target.environmentGain > 0.0001) 1.0 else 0.0
      val cosmicStep = 1 / max(1.0, sampleRate * 4.5)
      cosmicEnvelope += clamp(cosmicTarget - cosmicEnvelope, -cosmicStep, cosmicStep)
      val forestTarget = if (target.environment == "forest" && target.environmentGain > 0.0001) 1.0 else 0.0
      val forestStep = 1 / max(1.0, sampleRate * 4.5)
      forestEnvelope += clamp(forestTarget - forestEnvelope, -forestStep, forestStep)
      // Temple is its own independent layer (like tone/binaural/noise), not tied
      // to the mutually-exclusive environment selector.
      val templeTarget = if (target.templeGain > 0.0001) 1.0 else 0.0
      val templeStep = 1 / max(1.0, sampleRate * 4.5)
      // Pick a fresh (seeded) fundamental and start from silence right as temple
      // fades in, so re-engaging it always begins cleanly rather than resuming
      // mid-swell from whatever partial amplitudes were left over.
      if (templeTarget > 0 && templeEnvelope <= 0.0001) {
        val templeBase = 196 + Math.abs(nextTempleWhite()) * 51
        for (index in 0 until 4) {
          templeFreqs[index] = templeBase * templeRatios[index]
          templePhases[index] = 0.0
          templeAmps[index] = 0.0
        }
      }
      templeEnvelope += clamp(templeTarget - templeEnvelope, -templeStep, templeStep)
      val warmth = target.harmonicWarmth
      val carrierBody = sin(phases[0]) + warmth * (sin(phases[3]) * 0.22 + sin(phases[4]) * 0.14)
      val carrier = carrierBody / (1 + warmth * 0.18) * gains[0]
      val rawNoise = nextNoise(renderedNoiseColor)
      val orbitShadow = orbitMix * target.spatialDepth * (1 - orbitNear)
      val orbitFilterCoefficient = 0.06 + 0.94 * (1 - orbitShadow)
      orbitNoiseFilter += orbitFilterCoefficient * (rawNoise - orbitNoiseFilter)
      val orbitShapedNoise = rawNoise * (1 - orbitShadow) + orbitNoiseFilter * orbitShadow
      val noise = orbitShapedNoise * gains[2] * noiseEnvelope
      val movesTone = target.spatialTarget == "tone" || target.spatialTarget == "both"
      val movesNoise = target.spatialTarget == "noise" || target.spatialTarget == "both"
      val leftCarrier = carrier * (if (movesTone) leftSpatial * spatialDistance else spatialRoom)
      val rightCarrier = carrier * (if (movesTone) rightSpatial * spatialDistance else spatialRoom)
      val baseLeftNoise = noise * (if (movesNoise) leftSpatial else 1.0)
      val baseRightNoise = noise * (if (movesNoise) rightSpatial else 1.0)
      val rainNoise = nextRainNoise(target)
      val rainGain = gains[2] * noiseEnvelope
      val leftNoise = (baseLeftNoise * (1 - rainMix) + rainNoise.first * rainGain * rainMix) * spatialDistance
      val rightNoise = (baseRightNoise * (1 - rainMix) + rainNoise.second * rainGain * rainMix) * spatialDistance
      val ocean = if (oceanEnvelope > 0.0001) nextOcean(spatialSeconds, target.environmentIntensity) else silentStereo
      val oceanGain = target.environmentGain * oceanEnvelope
      val wind = if (windEnvelope > 0.0001) nextWind(spatialSeconds, target.environmentIntensity) else silentStereo
      val windGain = target.environmentGain * windEnvelope
      val fire = if (fireEnvelope > 0.0001) nextFire(spatialSeconds, target.environmentIntensity) else silentStereo
      val fireGain = target.environmentGain * fireEnvelope
      val cosmic = if (cosmicEnvelope > 0.0001) nextCosmic(spatialSeconds, target.environmentIntensity) else silentStereo
      val cosmicGain = target.environmentGain * cosmicEnvelope
      val forest = if (forestEnvelope > 0.0001) nextForest(spatialSeconds, target.environmentIntensity) else silentStereo
      val forestGain = target.environmentGain * forestEnvelope
      val temple = if (templeEnvelope > 0.0001) nextTemple(spatialSeconds, target.templeIntensity) else silentStereo
      val templeLevel = target.templeGain * templeEnvelope
      val cue = nextCue()
      val sampleNowMs = bufferStartMs + frame * 1_000.0 / sampleRate
      val sleepGain = target.sleepEndMs?.let { clamp((it - sampleNowMs) / 6_000.0, 0.0, 1.0) } ?: 1.0
      val pulseEnvelope = 0.12 + 0.88 * (0.5 - 0.5 * cos(phases[6]))
      val speakerPulse = sin(phases[5]) * pulseEnvelope * gains[1] * spatialRoom
      val leftEntrainment = sin(phases[1]) * gains[1] * spatialRoom * privateOutputMix + speakerPulse * (1 - privateOutputMix)
      val rightEntrainment = sin(phases[2]) * gains[1] * spatialRoom * privateOutputMix + speakerPulse * (1 - privateOutputMix)
      val leftMix = (leftCarrier + leftEntrainment + leftNoise + ocean.first * oceanGain + wind.first * windGain + fire.first * fireGain + cosmic.first * cosmicGain + forest.first * forestGain + temple.first * templeLevel + cue.first) * gains[3] * journeyFade * sleepGain * 0.32
      val rightMix = (rightCarrier + rightEntrainment + rightNoise + ocean.second * oceanGain + wind.second * windGain + fire.second * fireGain + cosmic.second * cosmicGain + forest.second * forestGain + temple.second * templeLevel + cue.second) * gains[3] * journeyFade * sleepGain * 0.32
      output[frame * 2] = softLimit(leftMix).toFloat()
      output[frame * 2 + 1] = softLimit(rightMix).toFloat()
      phases[0] = (phases[0] + tau * target.carrierHz / sampleRate) % tau
      phases[1] = (phases[1] + tau * leftHz / sampleRate) % tau
      phases[2] = (phases[2] + tau * rightHz / sampleRate) % tau
      phases[3] = (phases[3] + tau * target.carrierHz * 2 / sampleRate) % tau
      phases[4] = (phases[4] + tau * target.carrierHz * 1.5 / sampleRate) % tau
      phases[5] = (phases[5] + tau * target.binauralCarrierHz / sampleRate) % tau
      phases[6] = (phases[6] + tau * target.deltaHz / sampleRate) % tau
    }

    if (activeTimeline != null) {
      lock.withLock {
        if (generation == timelineGeneration) timelineElapsedFrames += frameCount.toDouble()
      }
    }
    renderElapsedFrames += frameCount.toDouble()

    val endMs = baseTarget.sleepEndMs
    if (endMs != null && bufferStartMs >= endMs && !sleepStopScheduled) {
      sleepStopScheduled = true
      lastTimerCompletionAtMs = System.currentTimeMillis().toDouble()
      onSleepTimerElapsed?.invoke()
    }
  }

  private fun nextNoise(color: String?): Double {
    color ?: return 0.0
    val white = nextWhite()
    return when (color) {
      "pink" -> {
        pink[0] = 0.99886 * pink[0] + white * 0.0555179
        pink[1] = 0.99332 * pink[1] + white * 0.0750759
        pink[2] = 0.96900 * pink[2] + white * 0.1538520
        pink[3] = 0.86650 * pink[3] + white * 0.3104856
        pink[4] = 0.55000 * pink[4] + white * 0.5329522
        pink[5] = -0.7616 * pink[5] - white * 0.0168980
        val value = pink[0] + pink[1] + pink[2] + pink[3] + pink[4] + pink[5] + pink[6] + white * 0.5362
        pink[6] = white * 0.115926
        value * 0.11
      }
      "brown" -> {
        brown = (brown + 0.02 * white) / 1.02
        brown * 3.5
      }
      "grey" -> {
        greyLow += 0.015 * (white - greyLow)
        (white - greyLow) * 0.7
      }
      else -> white
    }
  }

  private fun spatialPan(target: AudioParameters, elapsedSeconds: Double): Double {
    if (target.spatialMode == "still" || target.spatialDepth <= 0) return 0.0
    val phase = elapsedSeconds * target.spatialRate * Math.PI * 2 / 60
    val movement: Double = when (target.spatialMode) {
      "rain" -> return 0.0
      "orbit" -> sin(phase)
      "vortex" -> {
        // A spiral's swing widens and narrows as it turns, rather than tracing
        // orbit's constant-radius circle — it reads as being pulled inward and
        // released rather than simply revolving.
        sin(phase) * (0.75 + 0.25 * sin(phase * 0.33))
      }
      "channelTest" -> {
        val cycle = elapsedSeconds % 4.0 / 4.0
        when {
          cycle < 0.4 -> -1.0
          cycle < 0.5 -> {
            val t = (cycle - 0.4) / 0.1
            -1 + 2 * (t * t * (3 - 2 * t))
          }
          cycle < 0.9 -> 1.0
          else -> {
            val t = (cycle - 0.9) / 0.1
            1 - 2 * (t * t * (3 - 2 * t))
          }
        }
      }
      "pendulum" -> sin(phase)
      "swoosh" -> {
        val cycle = phase % (Math.PI * 2) / (Math.PI * 2)
        when {
          cycle < 0.38 -> 1.0
          cycle < 0.5 -> {
            val t = (cycle - 0.38) / 0.12
            1 - 2 * (t * t * (3 - 2 * t))
          }
          cycle < 0.88 -> -1.0
          else -> {
            val t = (cycle - 0.88) / 0.12
            -1 + 2 * (t * t * (3 - 2 * t))
          }
        }
      }
      else -> sin(phase) * 0.68 + sin(phase * 0.43 + 1.7) * 0.22 + sin(phase * 1.71 + 4.1) * 0.1
    }
    return clamp(movement * target.spatialDepth, -0.8, 0.8)
  }

  private fun spatialCenterGain(target: AudioParameters, elapsedSeconds: Double): Double {
    if (target.spatialDepth <= 0) return 1.0
    return when (target.spatialMode) {
      "drift" -> 1 - 0.14 * target.spatialDepth
      "pendulum" -> 1 - 0.24 * target.spatialDepth
      "swoosh" -> {
        val phase = elapsedSeconds * target.spatialRate * Math.PI * 2 / 60
        val cycle = phase % (Math.PI * 2) / (Math.PI * 2)
        val crossingProgress = when {
          cycle >= 0.38 && cycle < 0.5 -> (cycle - 0.38) / 0.12
          cycle >= 0.88 -> (cycle - 0.88) / 0.12
          else -> null
        }
        val crossing = crossingProgress?.let { sin(Math.PI * it) } ?: 0.0
        val maximumDuck = 0.58 * target.spatialDepth
        1 - maximumDuck * crossing
      }
      "rain" -> 1 - 0.12 * target.spatialDepth
      "orbit" -> 1 - 0.2 * target.spatialDepth
      "vortex" -> 1 - 0.3 * target.spatialDepth
      else -> 1.0
    }
  }

  // Not loop-aware: a scheduled cue re-crossing the wrap boundary of a
  // looping timeline won't refire. None of today's journeys loop, so this
  // is left simple rather than tracking fired-state per lap.
  private fun timelineCueEventMs(timeline: AudioTimelineState, elapsedMs: Double, afterMs: Double): Double? {
    var cursor = 0.0
    for (stage in timeline.stages) {
      for (event in stage.cueEvents) {
        val globalAtMs = cursor + event.atMs
        if (globalAtMs > afterMs && globalAtMs <= elapsedMs) return globalAtMs
      }
      cursor += stage.durationMs
    }
    return null
  }

  private fun startCue() {
    lock.withLock {
      activeCueSamples = recognitionSignalSamples
      activeCueSampleRate = recognitionSignalSampleRate
    }
    cueActive = true
    cueElapsedFrames = 0.0
    cueTotalFrames = if (activeCueSamples.isEmpty()) sampleRate * CUE_TOTAL_SECONDS
      else activeCueSamples.size / activeCueSampleRate * sampleRate
    cueLeftCombs = CUE_LEFT_COMB_MS.map { ms ->
      val delaySamples = max(1, (ms / 1_000.0 * sampleRate).toInt())
      CombFilter(delaySamples, combFeedbackForRt60(delaySamples, CUE_REVERB_RT60, sampleRate))
    }.toTypedArray()
    cueRightCombs = CUE_RIGHT_COMB_MS.map { ms ->
      val delaySamples = max(1, (ms / 1_000.0 * sampleRate).toInt())
      CombFilter(delaySamples, combFeedbackForRt60(delaySamples, CUE_REVERB_RT60, sampleRate))
    }.toTypedArray()
    cueLeftAllpasses = CUE_LEFT_ALLPASS_MS.map { ms -> AllpassFilter(max(1, (ms / 1_000.0 * sampleRate).toInt())) }.toTypedArray()
    cueRightAllpasses = CUE_RIGHT_ALLPASS_MS.map { ms -> AllpassFilter(max(1, (ms / 1_000.0 * sampleRate).toInt())) }.toTypedArray()
  }

  private fun timelineSpatialEvent(timeline: AudioTimelineState, rawElapsedMs: Double): SpatialCrossing? {
    if (timeline.totalDurationMs <= 0) return null
    val elapsedMs = if (timeline.loop) rawElapsedMs % timeline.totalDurationMs else min(rawElapsedMs, timeline.totalDurationMs)
    var cursor = 0.0
    for (stage in timeline.stages) {
      val localMs = elapsedMs - cursor
      if (localMs >= 0 && localMs < stage.durationMs) {
        for (event in stage.spatialEvents) {
          if (localMs >= event.atMs && localMs <= event.atMs + event.durationMs) {
            val progress = clamp((localMs - event.atMs) / event.durationMs, 0.0, 1.0)
            val smooth = progress * progress * (3 - 2 * progress)
            val direction = if (event.direction == "left") -1.0 else 1.0
            return SpatialCrossing(
              pan = (-direction + 2 * direction * smooth) * event.depth,
              crossing = sin(Math.PI * progress),
            )
          }
        }
        return null
      }
      cursor += stage.durationMs
    }
    return null
  }

  private fun nextRainNoise(target: AudioParameters): Pair<Double, Double> {
    var left = 0.0
    var right = 0.0
    for (pocket in rainPockets) {
      if (pocket.framesRemaining <= 0) {
        pocket.targetPan = clamp(nextPocketWhite(pocket) * 0.8, -0.8, 0.8)
        pocket.targetLevel = 0.08 + Math.abs(nextPocketWhite(pocket)) * 0.34
        val speedScale = clamp(target.spatialRate / 1.2, 0.35, 2.5)
        pocket.framesRemaining = sampleRate * (0.45 + Math.abs(nextPocketWhite(pocket)) * 2.2) / speedScale
      }
      val step = min(1.0, 1 / max(1.0, pocket.framesRemaining))
      pocket.pan += (pocket.targetPan - pocket.pan) * step
      pocket.level += (pocket.targetLevel - pocket.level) * step
      pocket.framesRemaining -= 1
      val white = nextPocketWhite(pocket)
      val value = when (target.noiseColor) {
        "brown" -> {
          pocket.filter = (pocket.filter + 0.02 * white) / 1.02
          pocket.filter * 3.2
        }
        "grey" -> {
          pocket.filter += 0.015 * (white - pocket.filter)
          (white - pocket.filter) * 0.65
        }
        "pink" -> {
          pocket.filter += 0.075 * (white - pocket.filter)
          (pocket.filter * 0.8 + white * 0.2) * 1.6
        }
        else -> white
      }
      left += value * pocket.level * (1 - pocket.pan)
      right += value * pocket.level * (1 + pocket.pan)
    }
    return Pair(left * 0.42, right * 0.42)
  }

  private fun nextPocketWhite(pocket: RainPocket): Double {
    var state = pocket.random
    state = state xor (state shl 13)
    state = state xor (state ushr 7)
    state = state xor (state shl 17)
    pocket.random = state
    return (state and 0x00ff_ffffL).toDouble() / 0x007f_ffffL.toDouble() - 1
  }

  private fun nextOcean(elapsedSeconds: Double, intensity: Double): Pair<Double, Double> {
    val shared = nextOceanWhite()
    oceanLow += 0.005 * (shared - oceanLow)
    oceanMid += 0.024 * (shared - oceanMid)
    val slowWave = clamp(
      0.5 + 0.32 * sin(elapsedSeconds * Math.PI * 2 / 9.7) +
        0.18 * sin(elapsedSeconds * Math.PI * 2 / 13.9 + 1.8),
      0.0,
      1.0,
    )
    val crest = slowWave * slowWave * (3 - 2 * slowWave)
    val leftWhite = nextOceanWhite()
    val rightWhite = nextOceanWhite()
    oceanFoamLeft += 0.075 * (leftWhite - oceanFoamLeft)
    oceanFoamRight += 0.075 * (rightWhite - oceanFoamRight)
    val undertow = (oceanLow * 2.7 + oceanMid * 0.8) * (0.45 + slowWave * 0.55)
    val foamLevel = 0.08 + intensity * 0.08 + crest * (0.34 + intensity * 0.48)
    val leftFoam = (leftWhite - oceanFoamLeft * 0.65) * foamLevel
    val rightFoam = (rightWhite - oceanFoamRight * 0.65) * foamLevel
    val sway = sin(elapsedSeconds * Math.PI * 2 / 17.0) * 0.12
    return Pair(undertow + leftFoam * (1 - sway), undertow + rightFoam * (1 + sway))
  }

  private fun nextOceanWhite(): Double {
    oceanRandom = oceanRandom xor (oceanRandom shl 13)
    oceanRandom = oceanRandom xor (oceanRandom ushr 7)
    oceanRandom = oceanRandom xor (oceanRandom shl 17)
    return (oceanRandom and 0x00ff_ffffL).toDouble() / 0x007f_ffffL.toDouble() - 1
  }

  private fun nextWind(elapsedSeconds: Double, intensity: Double): Pair<Double, Double> {
    val shared = nextWindWhite()
    windBody += 0.012 * (shared - windBody)
    val rawGust = clamp(
      0.52 + 0.3 * sin(elapsedSeconds * Math.PI * 2 / 6.3 + 0.6) +
        0.2 * sin(elapsedSeconds * Math.PI * 2 / 17.8 + 2.4),
      0.0,
      1.0,
    )
    val gust = rawGust * rawGust * (3 - 2 * rawGust)
    val leftWhite = nextWindWhite()
    val rightWhite = nextWindWhite()
    windAirLeft += 0.045 * (leftWhite - windAirLeft)
    windAirRight += 0.045 * (rightWhite - windAirRight)
    val pressure = windBody * (1.2 + intensity * 0.8 + gust * (1.3 + intensity * 2.2))
    val airLevel = 0.08 + intensity * 0.08 + gust * (0.3 + intensity * 0.44)
    val leftAir = (leftWhite - windAirLeft * 0.72) * airLevel
    val rightAir = (rightWhite - windAirRight * 0.72) * airLevel
    val pass = sin(elapsedSeconds * Math.PI * 2 / 11.5 + sin(elapsedSeconds / 19.0)) * 0.26
    return Pair(pressure + leftAir * (1 - pass), pressure + rightAir * (1 + pass))
  }

  private fun nextWindWhite(): Double {
    windRandom = windRandom xor (windRandom shl 13)
    windRandom = windRandom xor (windRandom ushr 7)
    windRandom = windRandom xor (windRandom shl 17)
    return (windRandom and 0x00ff_ffffL).toDouble() / 0x007f_ffffL.toDouble() - 1
  }

  private fun nextFire(elapsedSeconds: Double, intensity: Double): Pair<Double, Double> {
    val shared = nextFireWhite()
    fireBody = (fireBody + 0.018 * shared) / 1.018
    fireHiss += 0.065 * (shared - fireHiss)
    val flicker = 0.72 + 0.18 * sin(elapsedSeconds * Math.PI * 2 / 1.7) +
      0.1 * sin(elapsedSeconds * Math.PI * 2 / 0.43 + 1.2)
    val eventChance = (5.0 + intensity * 16.0) / sampleRate
    if ((nextFireWhite() + 1) * 0.5 < eventChance) {
      val strength = 0.14 + intensity * 0.18 + Math.abs(nextFireWhite()) * (0.4 + intensity * 0.5)
      if (nextFireWhite() < 0) firePopLeft += strength else firePopRight += strength
    }
    firePopLeft *= 0.99845
    firePopRight *= 0.99845
    val warmBody = fireBody * 4.2 * flicker
    val dryCrackle = (shared - fireHiss) * (0.08 + flicker * 0.08)
    return Pair(warmBody + dryCrackle + firePopLeft, warmBody + dryCrackle + firePopRight)
  }

  private fun nextFireWhite(): Double {
    fireRandom = fireRandom xor (fireRandom shl 13)
    fireRandom = fireRandom xor (fireRandom ushr 7)
    fireRandom = fireRandom xor (fireRandom shl 17)
    return (fireRandom and 0x00ff_ffffL).toDouble() / 0x007f_ffffL.toDouble() - 1
  }

  // A low harmonic field and filtered stellar air move independently across the
  // channels. Sparse particles bloom slowly, then leave staggered reflections;
  // no transient begins sharply enough to resemble a droplet or notification.
  private fun nextCosmic(elapsedSeconds: Double, intensity: Double): Pair<Double, Double> {
    val shared = nextCosmicWhite()
    cosmicRumble += 0.0016 * (shared - cosmicRumble)
    cosmicAirLeft += 0.015 * (nextCosmicWhite() - cosmicAirLeft)
    cosmicAirRight += 0.015 * (nextCosmicWhite() - cosmicAirRight)
    val breathe = 0.72 + 0.28 * sin(elapsedSeconds * Math.PI * 2 / 31.0 + 0.7 * sin(elapsedSeconds * Math.PI * 2 / 47.0))
    val rumbleBody = cosmicRumble * (1.7 + intensity * 1.1) * breathe
    val airLevel = 0.11 + intensity * 0.08
    val fundamental = 38 + intensity * 10
    val slowDrift = sin(elapsedSeconds * Math.PI * 2 / 37.0) * 0.45
    val leftField = sin(elapsedSeconds * Math.PI * 2 * fundamental + slowDrift) * 0.075 +
      sin(elapsedSeconds * Math.PI * 2 * fundamental * 1.5 + 1.2) * 0.028
    val rightField = sin(elapsedSeconds * Math.PI * 2 * fundamental - slowDrift + 0.24) * 0.075 +
      sin(elapsedSeconds * Math.PI * 2 * fundamental * 1.5 + 2.0) * 0.028

    if (cosmicSparkFramesRemaining <= 0) {
      val gapSeconds = (12.0 - intensity * 5.5) * (0.75 + Math.abs(nextCosmicWhite()) * 1.35)
      cosmicSparkFramesRemaining = sampleRate * max(3.0, gapSeconds)
      cosmicSparkDurationFrames = sampleRate * (1.6 + Math.abs(nextCosmicWhite()) * 1.8)
      cosmicSparkAgeFrames = 0.0
      cosmicSparkFreq = 980 + Math.abs(nextCosmicWhite()) * 1_650
      cosmicSparkAmp = 0.065 + Math.abs(nextCosmicWhite()) * 0.09
      cosmicSparkPan = clamp(nextCosmicWhite() * 0.78, -0.78, 0.78)
      cosmicSparkPhase = 0.0
    }
    cosmicSparkFramesRemaining -= 1
    val sparkProgress = if (cosmicSparkDurationFrames > 0) cosmicSparkAgeFrames / cosmicSparkDurationFrames else 1.0
    val sparkWindow = if (sparkProgress < 1) sin(Math.PI * sparkProgress).let { it * it } else 0.0
    val sparkTone = sin(cosmicSparkPhase) + 0.18 * sin(cosmicSparkPhase * 2)
    val sparkMono = sparkTone * sparkWindow * cosmicSparkAmp * (0.7 + intensity * 0.3)
    cosmicSparkAgeFrames += 1
    cosmicSparkFreq *= 0.999997
    cosmicSparkPhase = (cosmicSparkPhase + Math.PI * 2 * cosmicSparkFreq / sampleRate) % (Math.PI * 2)

    val nearFrames = min(cosmicDelay.size - 1, max(1, (COSMIC_NEAR_DELAY_SECONDS * sampleRate).toInt()))
    val midFrames = min(cosmicDelay.size - 1, max(1, (COSMIC_MID_DELAY_SECONDS * sampleRate).toInt()))
    val farFrames = min(cosmicDelay.size - 1, max(1, (COSMIC_FAR_DELAY_SECONDS * sampleRate).toInt()))
    val nearReflection = cosmicDelay[(cosmicDelayIndex - nearFrames + cosmicDelay.size) % cosmicDelay.size]
    val midReflection = cosmicDelay[(cosmicDelayIndex - midFrames + cosmicDelay.size) % cosmicDelay.size]
    val farReflection = cosmicDelay[(cosmicDelayIndex - farFrames + cosmicDelay.size) % cosmicDelay.size]
    cosmicDelay[cosmicDelayIndex] = sparkMono + (nearReflection * 0.5 + midReflection * 0.3 + farReflection * 0.2) * COSMIC_FEEDBACK
    cosmicDelayIndex = (cosmicDelayIndex + 1) % cosmicDelay.size

    val sparkLeft = sparkMono * (1 - cosmicSparkPan)
    val sparkRight = sparkMono * (1 + cosmicSparkPan)
    val reflectionDrift = sin(elapsedSeconds * Math.PI * 2 / 9.7) * 0.34
    val echoLeft = nearReflection * (1 + cosmicSparkPan * 0.55) * 0.34 +
      midReflection * (1 - reflectionDrift) * 0.24 + farReflection * 0.14
    val echoRight = nearReflection * (1 - cosmicSparkPan * 0.55) * 0.34 +
      midReflection * (1 + reflectionDrift) * 0.24 + farReflection * 0.14

    return Pair(
      rumbleBody + leftField + cosmicAirLeft * airLevel + sparkLeft * 0.42 + echoLeft,
      rumbleBody + rightField + cosmicAirRight * airLevel + sparkRight * 0.42 + echoRight,
    )
  }

  private fun nextCosmicWhite(): Double {
    cosmicRandom = cosmicRandom xor (cosmicRandom shl 13)
    cosmicRandom = cosmicRandom xor (cosmicRandom ushr 7)
    cosmicRandom = cosmicRandom xor (cosmicRandom shl 17)
    return (cosmicRandom and 0x00ff_ffffL).toDouble() / 0x007f_ffffL.toDouble() - 1
  }

  // A canopy rustle bed (smoothed noise breathing on a light breeze cycle, plus a
  // crisper high-passed leaf shimmer) carries the space, while seeded bird calls —
  // frequency-sweeping tone bursts rather than noise transients, the way an actual
  // chirp reads as pitched motion instead of a click — punctuate it at random.
  private fun nextForest(elapsedSeconds: Double, intensity: Double): Pair<Double, Double> {
    val shared = nextForestWhite()
    forestCanopy += 0.02 * (shared - forestCanopy)
    val sway = clamp(
      0.55 + 0.35 * sin(elapsedSeconds * Math.PI * 2 / 14.0) +
        0.15 * sin(elapsedSeconds * Math.PI * 2 / 5.3 + 1.1),
      0.0,
      1.0,
    )
    val canopyBody = forestCanopy * (1.4 + intensity * 1.6) * (0.5 + sway * 0.5)

    val leftWhite = nextForestWhite()
    val rightWhite = nextForestWhite()
    forestLeafLeft += 0.09 * (leftWhite - forestLeafLeft)
    forestLeafRight += 0.09 * (rightWhite - forestLeafRight)
    val leafLevel = 0.05 + intensity * 0.07 + sway * (0.08 + intensity * 0.14)
    val leftLeaf = (leftWhite - forestLeafLeft * 0.7) * leafLevel
    val rightLeaf = (rightWhite - forestLeafRight * 0.7) * leafLevel

    if (!forestBirdActive) {
      forestBirdFramesRemaining -= 1
      if (forestBirdFramesRemaining <= 0) {
        forestBirdActive = true
        forestBirdDurationFrames = sampleRate * (0.12 + Math.abs(nextForestWhite()) * 0.16)
        forestBirdFramesRemaining = forestBirdDurationFrames
        forestBirdFreqStart = 1_800 + Math.abs(nextForestWhite()) * 1_600
        forestBirdFreqRange = (if (nextForestWhite() < 0) -1.0 else 1.0) * (400 + Math.abs(nextForestWhite()) * 900)
        forestBirdAmp = 0.3 + Math.abs(nextForestWhite()) * 0.34
        forestBirdPan = clamp(nextForestWhite() * 0.75, -0.75, 0.75)
        forestBirdPhase = 0.0
      }
    }
    var birdMono = 0.0
    if (forestBirdActive) {
      val progress = clamp(1 - forestBirdFramesRemaining / forestBirdDurationFrames, 0.0, 1.0)
      val envelope = sin(Math.PI * progress)
      val wobble = sin(progress * Math.PI * 5) * 90
      val freq = forestBirdFreqStart + forestBirdFreqRange * progress + wobble
      forestBirdPhase = (forestBirdPhase + Math.PI * 2 * freq / sampleRate) % (Math.PI * 2)
      birdMono = sin(forestBirdPhase) * envelope * forestBirdAmp * (0.5 + intensity * 0.7)
      forestBirdFramesRemaining -= 1
      if (forestBirdFramesRemaining <= 0) {
        forestBirdActive = false
        val gapSeconds = (7.0 - intensity * 4.5) * (0.4 + Math.abs(nextForestWhite()) * 1.4)
        forestBirdFramesRemaining = sampleRate * max(0.6, gapSeconds)
      }
    }
    val birdLeft = birdMono * (1 - forestBirdPan)
    val birdRight = birdMono * (1 + forestBirdPan)

    // The rustle bed is itself broadband noise, so it stacks directly with the
    // separate white/pink/brown/grey layer instead of sitting alongside it —
    // keep it as a quiet texture underneath the birds rather than a competing
    // noise floor.
    return Pair(
      (canopyBody + leftLeaf) * FOREST_NOISE_MIX + birdLeft,
      (canopyBody + rightLeaf) * FOREST_NOISE_MIX + birdRight,
    )
  }

  private fun nextForestWhite(): Double {
    forestRandom = forestRandom xor (forestRandom shl 13)
    forestRandom = forestRandom xor (forestRandom ushr 7)
    forestRandom = forestRandom xor (forestRandom shl 17)
    return (forestRandom and 0x00ff_ffffL).toDouble() / 0x007f_ffffL.toDouble() - 1
  }

  private fun nextCue(): Pair<Double, Double> {
    if (!cueActive) return Pair(0.0, 0.0)
    if (activeCueSamples.isNotEmpty() && activeCueSampleRate > 0) {
      val sourcePosition = cueElapsedFrames * activeCueSampleRate / sampleRate
      val lower = min(activeCueSamples.lastIndex, sourcePosition.toInt())
      val upper = min(activeCueSamples.lastIndex, lower + 1)
      val fraction = sourcePosition - lower
      val sample = activeCueSamples[lower] * (1 - fraction) + activeCueSamples[upper] * fraction
      cueElapsedFrames += 1
      if (cueElapsedFrames >= cueTotalFrames) cueActive = false
      return Pair(sample * 1.45, sample * 1.45)
    }
    val t = cueElapsedFrames / sampleRate
    var dry = 0.0
    for (index in CUE_NOTE_HZ.indices) {
      val localT = t - CUE_NOTE_STARTS[index]
      if (localT < 0 || localT > CUE_NOTE_SECONDS) continue
      dry += cueNoteEnvelope(localT) * cueToneSample(localT, CUE_NOTE_HZ[index])
    }
    val leftWet = cueProcessReverb(dry, cueLeftCombs, cueLeftAllpasses)
    val rightWet = cueProcessReverb(dry, cueRightCombs, cueRightAllpasses)
    val mixedLeft = dry * CUE_DRY_GAIN + leftWet * CUE_WET_GAIN
    val mixedRight = dry * CUE_DRY_GAIN + rightWet * CUE_WET_GAIN
    val mid = (mixedLeft + mixedRight) / 2
    val side = (mixedLeft - mixedRight) / 2 * CUE_STEREO_WIDTH
    cueElapsedFrames += 1
    if (cueElapsedFrames >= cueTotalFrames) cueActive = false
    return Pair((mid + side) * CUE_OUTPUT_GAIN, (mid - side) * CUE_OUTPUT_GAIN)
  }

  private fun cueNoteEnvelope(t: Double): Double {
    if (t < 0 || t > CUE_NOTE_SECONDS) return 0.0
    if (t < CUE_ATTACK_SECONDS) return 0.5 - 0.5 * cos(Math.PI * t / CUE_ATTACK_SECONDS)
    if (t > CUE_NOTE_SECONDS - CUE_RELEASE_SECONDS) {
      val releaseT = t - (CUE_NOTE_SECONDS - CUE_RELEASE_SECONDS)
      return 0.5 + 0.5 * cos(Math.PI * releaseT / CUE_RELEASE_SECONDS)
    }
    return 1.0
  }

  private fun cueToneSample(t: Double, freq: Double): Double {
    var value = 0.0
    for (index in CUE_HARMONIC_RATIOS.indices) {
      value += CUE_HARMONIC_WEIGHTS[index] * sin(Math.PI * 2 * freq * CUE_HARMONIC_RATIOS[index] * t)
    }
    return value / CUE_HARMONIC_WEIGHT_SUM
  }

  private fun cueProcessReverb(x: Double, combs: Array<CombFilter>, allpasses: Array<AllpassFilter>): Double {
    if (combs.isEmpty()) return 0.0
    var combSum = 0.0
    for (comb in combs) combSum += comb.process(x)
    combSum /= combs.size
    var y = combSum
    for (allpass in allpasses) y = allpass.process(y)
    return y
  }

  // Four inharmonic partials (a fundamental plus three off-integer overtones, the
  // way a real bowl's wall modes aren't clean octaves) sustain continuously rather
  // than being struck — each swells and recedes on its own slow, independent cycle
  // so the resonance breathes without ever fully repeating or falling silent. This
  // is a hum, not a bell: there's no attack transient, and no noise floor either —
  // it's a pure tonal layer that stays out of the way of an independent noise bed.
  private val templeRatios = doubleArrayOf(1.0, 2.76, 3.76, 5.4)
  private val templeWeights = doubleArrayOf(1.0, 0.42, 0.24, 0.12)
  private val templeSwellPeriods = doubleArrayOf(23.0, 17.0, 29.0, 13.0)
  private val templeSwellPhases = doubleArrayOf(0.0, 1.7, 3.1, 4.6)

  private fun nextTemple(elapsedSeconds: Double, intensity: Double): Pair<Double, Double> {
    var body = 0.0
    val tau = Math.PI * 2
    for (index in 0 until 4) {
      val swell = 0.55 + 0.45 * sin(elapsedSeconds * tau / templeSwellPeriods[index] + templeSwellPhases[index])
      val ampTarget = templeWeights[index] * (0.35 + intensity * 0.65) * swell
      // A slow ~2.5s glide keeps amplitude changes inaudible as movement rather
      // than as a discrete event, matching the "hum" rather than "ding" feel.
      templeAmps[index] += (ampTarget - templeAmps[index]) / max(1.0, sampleRate * 2.5)
      body += sin(templePhases[index]) * templeAmps[index]
      templePhases[index] = (templePhases[index] + tau * templeFreqs[index] / sampleRate) % tau
    }
    body *= 0.5
    return Pair(body, body)
  }

  private fun nextTempleWhite(): Double {
    templeRandom = templeRandom xor (templeRandom shl 13)
    templeRandom = templeRandom xor (templeRandom ushr 7)
    templeRandom = templeRandom xor (templeRandom shl 17)
    return (templeRandom and 0x00ff_ffffL).toDouble() / 0x007f_ffffL.toDouble() - 1
  }

  private fun nextWhite(): Double {
    random = random xor (random shl 13)
    random = random xor (random ushr 7)
    random = random xor (random shl 17)
    return (random and 0x00ff_ffffL).toDouble() / 0x007f_ffffL.toDouble() - 1
  }

  private fun normalizedParameters(raw: AudioConfigRecord, sleepEndMs: Double?): AudioParameters {
    val noiseColor = raw.noiseColor.takeIf { it == "white" || it == "pink" || it == "brown" || it == "grey" }
    val spatialMode = raw.spatialMode.takeIf {
      it == "still" || it == "drift" || it == "pendulum" || it == "swoosh" || it == "rain" || it == "orbit" || it == "vortex" || it == "channelTest"
    } ?: "still"
    val spatialTarget = raw.spatialTarget.takeIf { it == "noise" || it == "tone" || it == "both" } ?: "noise"
    return AudioParameters(
      carrierHz = clamp(raw.carrierHz, 20.0, 2_000.0),
      binauralCarrierHz = clamp(raw.binauralCarrierHz, 100.0, 500.0),
      deltaHz = clamp(raw.binauralDeltaHz, 0.5, 40.0),
      toneGain = clamp(raw.toneGain, 0.0, 1.0),
      harmonicWarmth = clamp(raw.harmonicWarmth, 0.0, 1.0),
      binauralGain = clamp(raw.binauralGain, 0.0, 1.0),
      noiseColor = noiseColor,
      noiseGain = clamp(raw.noiseGain, 0.0, 1.0),
      environment = if (raw.environment == "cave") "cosmic" else raw.environment.takeIf { it == "ocean" || it == "wind" || it == "fire" || it == "cosmic" || it == "forest" } ?: "none",
      environmentGain = clamp(raw.environmentGain, 0.0, 1.0),
      environmentIntensity = clamp(raw.environmentIntensity, 0.0, 1.0),
      templeGain = clamp(raw.templeGain, 0.0, 1.0),
      templeIntensity = clamp(raw.templeIntensity, 0.0, 1.0),
      masterGain = clamp(raw.masterGain, 0.0, 1.0),
      rampSeconds = clamp(raw.rampMs, 20.0, 5_000.0) / 1_000.0,
      spatialMode = spatialMode,
      spatialTarget = spatialTarget,
      spatialDepth = clamp(raw.spatialDepth, 0.0, 0.8),
      spatialRate = clamp(raw.spatialRate, 0.1, 3.0),
      sleepEndMs = sleepEndMs,
    )
  }

  private fun timelineParameters(timeline: AudioTimelineState, rawElapsedMs: Double, base: AudioParameters): AudioParameters {
    val last = timeline.stages.lastOrNull() ?: return base
    if (timeline.totalDurationMs <= 0) return base
    val elapsedMs = if (timeline.loop) rawElapsedMs % timeline.totalDurationMs else min(rawElapsedMs, timeline.totalDurationMs)
    var cursor = 0.0
    timeline.stages.forEachIndexed { index, stage ->
      val end = cursor + stage.durationMs
      if (elapsedMs < end) {
        val previous = if (index > 0) timeline.stages[index - 1].parameters else (if (timeline.loop) last.parameters else base)
        val localMs = max(0.0, elapsedMs - cursor)
        val progress = if (stage.transitionMs > 0) min(1.0, localMs / stage.transitionMs) else 1.0
        val result = interpolate(previous, stage.parameters, progress)
        result.sleepEndMs = base.sleepEndMs
        return result
      }
      cursor = end
    }
    val result = last.parameters.copy()
    result.sleepEndMs = base.sleepEndMs
    return result
  }

  private fun interpolate(from: AudioParameters, to: AudioParameters, progress: Double): AudioParameters {
    val t = clamp(progress, 0.0, 1.0)
    fun lerp(start: Double, end: Double) = start + (end - start) * t
    return AudioParameters(
      carrierHz = lerp(from.carrierHz, to.carrierHz),
      binauralCarrierHz = lerp(from.binauralCarrierHz, to.binauralCarrierHz),
      deltaHz = lerp(from.deltaHz, to.deltaHz),
      toneGain = lerp(from.toneGain, to.toneGain),
      harmonicWarmth = lerp(from.harmonicWarmth, to.harmonicWarmth),
      binauralGain = lerp(from.binauralGain, to.binauralGain),
      noiseColor = if (t < 0.5) from.noiseColor else to.noiseColor,
      noiseGain = lerp(from.noiseGain, to.noiseGain),
      environment = if (t < 0.5) from.environment else to.environment,
      environmentGain = lerp(from.environmentGain, to.environmentGain),
      environmentIntensity = lerp(from.environmentIntensity, to.environmentIntensity),
      templeGain = lerp(from.templeGain, to.templeGain),
      templeIntensity = lerp(from.templeIntensity, to.templeIntensity),
      masterGain = lerp(from.masterGain, to.masterGain),
      rampSeconds = lerp(from.rampSeconds, to.rampSeconds),
      spatialMode = if (t < 0.5) from.spatialMode else to.spatialMode,
      spatialTarget = if (t < 0.5) from.spatialTarget else to.spatialTarget,
      spatialDepth = lerp(from.spatialDepth, to.spatialDepth),
      spatialRate = lerp(from.spatialRate, to.spatialRate),
      sleepEndMs = null,
    )
  }

  private fun softLimit(sample: Double) = tanh(sample * 1.1) / 1.1

  private data class SpatialCrossing(val pan: Double, val crossing: Double)
}
