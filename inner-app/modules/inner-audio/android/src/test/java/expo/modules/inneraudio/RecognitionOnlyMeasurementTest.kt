package expo.modules.inneraudio

import org.json.JSONObject
import org.junit.After
import org.junit.Assert.*
import org.junit.Test
import java.io.File
import kotlin.math.abs
import kotlin.math.log10
import kotlin.math.sqrt

/**
 * Digital measurements of the real ProceduralAudioEngine, rendered offline, for Recognition Only.
 * Fixtures come from the production TypeScript builders (see nativeFixtures.generate.test.ts), and the
 * recognition signals are the shipped WAV assets. Android engine only: nothing here says anything about
 * iOS, AudioTrack, the device output path or the phone's volume.
 */
class RecognitionOnlyMeasurementTest {
  /** The engine is a process-wide singleton and reset() keeps the loaded recognition signal and sleep timer. */
  @After fun cleanup() {
    ProceduralAudioEngine.wallClockMs = { System.currentTimeMillis() }
    ProceduralAudioEngine.onSleepTimerElapsed = null
    ProceduralAudioEngine.checkpointSessionId = null
    ProceduralAudioEngine.setSleepTimer(null)
    ProceduralAudioEngine.setRecognitionSignal(null, null, 1.0)
    ProceduralAudioEngine.reset()
  }

  private val assets = File("../../../assets/sounds").canonicalFile
  private data class Signal(val id: String, val file: String?, val trimDb: Double, val durationMs: Double)
  private val signals = listOf(
    Signal("ascending", null, -16.6, 7_760.0),
    Signal("bell", "signal_bell.wav", -3.1, 4_741.0),
    Signal("chimes", "signal_chimes.wav", 3.7, 6_727.0),
    Signal("droplets", "signal_droplets.wav", 2.5, 4_759.0),
    Signal("guardian", "signal_guardian.wav", 5.6, 5_000.0),
  )

  private fun configFrom(json: JSONObject) = AudioConfigRecord().apply {
    carrierHz = json.getDouble("carrierHz"); binauralCarrierHz = json.getDouble("binauralCarrierHz")
    binauralDeltaHz = json.getDouble("binauralDeltaHz"); toneGain = json.getDouble("toneGain")
    harmonicWarmth = json.getDouble("harmonicWarmth"); binauralGain = json.getDouble("binauralGain")
    noiseColor = if (json.isNull("noiseColor")) null else json.getString("noiseColor")
    noiseGain = json.getDouble("noiseGain"); environment = json.getString("environment")
    environmentGain = json.getDouble("environmentGain"); environmentIntensity = json.getDouble("environmentIntensity")
    thresholdShift = json.getDouble("thresholdShift"); identityPresence = json.getDouble("identityPresence")
    identityDensity = json.getDouble("identityDensity"); identityVariety = json.getDouble("identityVariety")
    noiseHighCutHz = json.getDouble("noiseHighCutHz"); noiseWidth = json.getDouble("noiseWidth")
    noiseDriftDb = json.getDouble("noiseDriftDb"); noiseDriftSeconds = json.getDouble("noiseDriftSeconds")
    binauralBreathDb = json.getDouble("binauralBreathDb"); binauralBreathInSeconds = json.getDouble("binauralBreathInSeconds")
    binauralBreathOutSeconds = json.getDouble("binauralBreathOutSeconds"); binauralBreathVariation = json.getDouble("binauralBreathVariation")
    harmonicTranslation = json.getDouble("harmonicTranslation"); templeGain = json.getDouble("templeGain")
    templeIntensity = json.getDouble("templeIntensity"); masterGain = json.getDouble("masterGain")
    rampMs = json.getDouble("rampMs"); spatialMode = json.getString("spatialMode")
    spatialTarget = json.getString("spatialTarget"); spatialDepth = json.getDouble("spatialDepth")
    spatialRate = json.getDouble("spatialRate")
  }

  /** Cue start times (absolute ms) taken from the fixture, in order. */
  private class Fixture(val timeline: AudioTimelineRecord, val cueStartsMs: List<Double>, val totalMs: Double)

  private fun load(name: String): Fixture {
    val json = JSONObject(javaClass.classLoader!!.getResourceAsStream(name)!!.bufferedReader().readText())
    val cueStarts = mutableListOf<Double>()
    var cursor = 0.0
    val stagesJson = json.getJSONArray("stages")
    val timeline = AudioTimelineRecord().apply {
      id = name; title = json.getString("title"); seed = json.getDouble("seed")
      fadeInMs = json.optDouble("fadeInMs", 0.0)
      stages = (0 until stagesJson.length()).map { i ->
        val s = stagesJson.getJSONObject(i)
        val events = s.getJSONArray("spatialEvents")
        for (j in 0 until events.length()) {
          val e = events.getJSONObject(j)
          if (e.getString("type") == "cue") cueStarts.add(cursor + e.getDouble("atMs"))
        }
        cursor += s.getDouble("durationMs")
        TimelineStageRecord().apply {
          id = s.getString("id"); label = s.getString("label")
          durationMs = s.getDouble("durationMs"); transitionMs = s.getDouble("transitionMs")
          config = configFrom(s.getJSONObject("config"))
          spatialEvents = (0 until events.length()).map { j ->
            val e = events.getJSONObject(j)
            SpatialEventRecord().apply {
              id = e.getString("id"); atMs = e.getDouble("atMs"); type = e.getString("type")
              recognitionSpace = e.optBoolean("recognitionSpace", false)
              signalGainScale = e.optDouble("signalGainScale", 1.0)
              recoverySeconds = e.optDouble("recoverySeconds", 30.0)
              applyExtra(e)
            }
          }
        }
      }
    }
    return Fixture(timeline, cueStarts, cursor)
  }

  /** Fade-in applied to every cue event of the next render; 0 is the unchanged signal. */
  private var cueFadeOverrideMs: Double? = null

  @Suppress("UNUSED_PARAMETER")
  private fun SpatialEventRecord.applyExtra(e: JSONObject) { cueFadeInMs = cueFadeOverrideMs ?: e.optDouble("cueFadeInMs", 0.0) }

  class Result(
    val silentPeak: Float, val silentSamples: Long, val cuePeaks: List<Float>, val checksum: Long,
    val attackPeaks: List<DoubleArray>, val cueRms: List<Double>, val frames: Long,
  )

  private fun render(fixtureName: String, signal: Signal, signalGainScale: Double?): Result {
    val fx = load(fixtureName)
    ProceduralAudioEngine.reset()
    ProceduralAudioEngine.onSleepTimerElapsed = null
    ProceduralAudioEngine.checkpointSessionId = null
    val sr = ProceduralAudioEngine.sampleRate
    var frames = 0L
    ProceduralAudioEngine.wallClockMs = { (frames * 1_000.0 / sr).toLong() }
    ProceduralAudioEngine.configure(AudioConfigRecord())
    val uri = signal.file?.let { File(assets, it).toURI().toString() }
    ProceduralAudioEngine.setRecognitionSignal(signal.id, uri, Math.pow(10.0, signal.trimDb / 20.0))
    ProceduralAudioEngine.setTimeline(fx.timeline)
    ProceduralAudioEngine.setSleepTimer(fx.totalMs)
    val windowsMs = fx.cueStartsMs.map { (it - 100.0) to (it + signal.durationMs + 1_500.0) }
    val buffer = FloatArray(960 * 2)
    var silentPeak = 0f; var silentSamples = 0L; var checksum = 1125899906842597L
    val cuePeaks = MutableList(windowsMs.size) { 0f }
    val cueSq = MutableList(windowsMs.size) { 0.0 }; val cueN = MutableList(windowsMs.size) { 0L }
    // Peak magnitude in the first 10, 50, 100, 250 ms after each cue's scheduled start.
    val attackEdges = doubleArrayOf(10.0, 50.0, 100.0, 250.0)
    val attack = MutableList(windowsMs.size) { DoubleArray(attackEdges.size) }
    val endFrames = ((fx.totalMs + 2_000.0) * sr / 1_000.0).toLong()
    while (frames < endFrames) {
      java.util.Arrays.fill(buffer, 0f)
      ProceduralAudioEngine.render(buffer, 960)
      for (f in 0 until 960) {
        val tMs = (frames + f) * 1_000.0 / sr
        val idx = windowsMs.indexOfFirst { tMs >= it.first && tMs < it.second }
        for (c in 0..1) {
          val v = buffer[f * 2 + c]
          checksum = checksum * 31 + java.lang.Float.floatToIntBits(v)
          val a = abs(v)
          if (idx < 0) { silentSamples++; if (a > silentPeak) silentPeak = a }
          else {
            if (a > cuePeaks[idx]) cuePeaks[idx] = a
            cueSq[idx] += v.toDouble() * v.toDouble(); cueN[idx]++
            val since = tMs - fx.cueStartsMs[idx]
            for (k in attackEdges.indices) if (since in 0.0..attackEdges[k] && a > attack[idx][k]) attack[idx][k] = a.toDouble()
          }
        }
      }
      frames += 960
    }
    return Result(silentPeak, silentSamples, cuePeaks, checksum, attack, cueSq.indices.map { if (cueN[it] > 0) sqrt(cueSq[it] / cueN[it]) else 0.0 }, frames)
  }

  private fun db(x: Double) = 20 * log10(maxOf(x, 1e-12))

  @Test fun recognitionOnlySilenceAndCueLevels() {
    cueFadeOverrideMs = null // use what the production builder wrote into the fixture
    val sb = StringBuilder()
    for (signal in signals) {
      val r = render("recognition-only-accelerated-fixture.json", signal, null)
      sb.append("RO ${signal.id}: silentSamples=${r.silentSamples} silentPeak=${r.silentPeak} (${db(r.silentPeak.toDouble()).toInt()} dBFS) ")
      sb.append("cuePeaks=${r.cuePeaks.map { "%.1f".format(db(it.toDouble())) }} dBFS attackPeaks(10/50/100/250ms, cue1)=${r.attackPeaks.first().map { "%.1f".format(db(it)) }} checksum=${r.checksum}\n")
      assertEquals("digital silence outside cue windows for ${signal.id}", 0f, r.silentPeak, 0f)
      assertTrue("cues must sound for ${signal.id}", r.cuePeaks.all { it > 0f })
    }
    val full = render("full-reference-accelerated-fixture.json", signals[1], null)
    sb.append("FULL bell: silentPeakOutsideCues=${full.silentPeak} (${db(full.silentPeak.toDouble()).toInt()} dBFS) cuePeaks=${full.cuePeaks.map { "%.1f".format(db(it.toDouble())) }} checksum=${full.checksum}\n")
    println("MEASUREMENT\n$sb")
    File("build/recognition-only-measurement.txt").writeText(sb.toString())
  }

  /** Checksums of the pre-fade engine (commit "Add offline Android measurement"), accelerated fixtures. */
  private val baselineChecksums = mapOf(
    "ascending" to 4428982168361108263L, "bell" to -6432970975180044955L, "chimes" to -1513313917085856507L,
    "droplets" to -4223457457938525691L, "guardian" to -986510275622859880L,
  )
  private val baselineFullBell = 5982285127743174121L

  @Test fun noFadeIsBitIdenticalToTheEngineBeforeTheFadeExisted() {
    cueFadeOverrideMs = 0.0
    for (signal in signals) {
      assertEquals("Recognition Only ${signal.id} output changed with no fade", baselineChecksums[signal.id], render("recognition-only-accelerated-fixture.json", signal, null).checksum)
    }
    assertEquals("full journey output changed", baselineFullBell, render("full-reference-accelerated-fixture.json", signals[1], null).checksum)
  }

  @Test fun fadeInSweep() {
    val sb = StringBuilder("fadeMs signal  cue1 peak@10/50/100/250ms (dBFS) | peak(dBFS) rms(dBFS) | silentPeak\n")
    for (fade in listOf(0.0, 50.0, 100.0, 150.0)) {
      cueFadeOverrideMs = fade
      for (signal in signals) {
        val r = render("recognition-only-accelerated-fixture.json", signal, null)
        val rms = db(r.cueRms.first())
        sb.append("%5.0f  %-9s %s | %6.1f %6.1f | %s\n".format(fade, signal.id, r.attackPeaks.first().joinToString("/") { "%.1f".format(db(it)) }, db(r.cuePeaks.first().toDouble()), rms, r.silentPeak))
        assertEquals(0f, r.silentPeak, 0f)
        if (fade == 0.0) assertEquals(baselineChecksums[signal.id], r.checksum) else assertNotEquals(baselineChecksums[signal.id], r.checksum)
      }
    }
    cueFadeOverrideMs = null
    println("FADE SWEEP\n$sb")
    File("build/recognition-only-fade-sweep.txt").writeText(sb.toString())
  }

  /** Preview path: a bare triggerCue(), as the mixer and full-journey preview make it, versus one with a fade. */
  private fun previewCue(signal: Signal, fadeInMs: Double?): Pair<DoubleArray, Long> {
    ProceduralAudioEngine.reset()
    val sr = ProceduralAudioEngine.sampleRate
    ProceduralAudioEngine.configure(AudioConfigRecord().apply { toneGain = 0.0; binauralGain = 0.0; noiseGain = 0.0; environmentGain = 0.0; masterGain = 0.35 })
    ProceduralAudioEngine.setRecognitionSignal(signal.id, signal.file?.let { File(assets, it).toURI().toString() }, Math.pow(10.0, signal.trimDb / 20.0))
    if (fadeInMs == null) ProceduralAudioEngine.triggerCue() else ProceduralAudioEngine.triggerCue(fadeInMs)
    val buffer = FloatArray(960 * 2)
    val edges = doubleArrayOf(10.0, 50.0, 100.0, 250.0)
    val peaks = DoubleArray(edges.size)
    var checksum = 1125899906842597L
    var frames = 0L
    while (frames < sr * 3) {
      java.util.Arrays.fill(buffer, 0f)
      ProceduralAudioEngine.render(buffer, 960)
      for (f in 0 until 960) {
        val tMs = (frames + f) * 1_000.0 / sr
        for (c in 0..1) {
          val v = buffer[f * 2 + c]
          checksum = checksum * 31 + java.lang.Float.floatToIntBits(v)
          for (k in edges.indices) if (tMs <= edges[k] && abs(v) > peaks[k]) peaks[k] = abs(v).toDouble()
        }
      }
      frames += 960
    }
    return peaks to checksum
  }

  @Test fun previewFadeIsOptInAndLeavesTheBareCallUnchanged() {
    val sb = StringBuilder()
    for (signal in listOf(signals[1], signals[2])) {
      val (barePeaks, bareSum) = previewCue(signal, null)
      val (zeroPeaks, zeroSum) = previewCue(signal, 0.0)
      val (fadedPeaks, fadedSum) = previewCue(signal, 100.0)
      assertEquals("a zero fade must equal the bare call (${signal.id})", bareSum, zeroSum)
      assertNotEquals("a 100 ms fade must change the output (${signal.id})", bareSum, fadedSum)
      assertTrue("fade must soften the first 10 ms of ${signal.id}", fadedPeaks[0] < barePeaks[0] * 0.1)
      sb.append("${signal.id} preview first-10/50/100/250ms dBFS: bare=${barePeaks.map { "%.1f".format(db(it)) }} fade100=${fadedPeaks.map { "%.1f".format(db(it)) }}\n")
    }
    println("PREVIEW\n$sb")
    File("build/recognition-only-preview.txt").writeText(sb.toString())
  }
}
