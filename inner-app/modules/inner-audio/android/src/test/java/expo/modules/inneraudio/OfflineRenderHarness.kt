package expo.modules.inneraudio

import kotlin.math.abs
import kotlin.math.sqrt

/**
 * Test-only offline-rendering harness. Drives the real production
 * ProceduralAudioEngine (configure/setTimeline/render) directly -- no
 * AudioTrack, no InnerAudioPlaybackService, no foreground service, no wake
 * lock, no physical speaker output. Acceleration comes only from pulling
 * render() back-to-back; the injected wall clock is derived solely from
 * cumulative rendered frames, never from a speed multiplier or from
 * manipulating sampleRate.
 *
 * Lives under src/test so it is neither included in nor reachable from the
 * shipped Android module.
 */
object OfflineRenderHarness {

  data class CueFire(
    val cueId: String,
    val scheduledPositionMs: Double,
    val actualPositionMs: Double,
    val driftMs: Double,
    val cumulativeFrames: Long,
  )

  data class StageTransition(val stageId: String, val observedPositionMs: Double, val cumulativeFrames: Long)

  data class Result(
    val sampleRate: Double,
    val bufferFrames: Int,
    val stageTransitions: List<StageTransition>,
    val cueFires: List<CueFire>,
    val completionCount: Int,
    val completionCumulativeFrames: Long?,
    val completionProtocolPositionMs: Double?,
    val completionWallClockMs: Long?,
    val nonFiniteSampleCount: Long,
    val peakAbs: Float,
    val rms: Double,
    val totalRenderedFrames: Long,
    val finalTimelinePositionMs: Double?,
  )

  /**
   * Runs [timeline]/[config] until the sleep timer fires plus
   * [extraBuffersAfterCompletion] more buffers (to demonstrate no re-fire and
   * a clean terminal state), then stops. [baseWallMs] is the synthetic
   * clock's starting value; from then on it advances by exactly
   * cumulativeFrames * 1000 / sampleRate and by nothing else --
   * render buffer -> advance cumulative frames -> derive wall time from
   * cumulative frames -> render next buffer -> repeat.
   */
  fun run(
    timeline: AudioTimelineRecord,
    config: AudioConfigRecord,
    bufferFrames: Int,
    baseWallMs: Long = 0L,
    extraBuffersAfterCompletion: Int = 3,
    maxBuffers: Int = 1_000_000,
  ): Result {
    ProceduralAudioEngine.reset()
    ProceduralAudioEngine.onSleepTimerElapsed = null
    ProceduralAudioEngine.checkpointSessionId = null
    ProceduralAudioEngine.wallClockMs = { System.currentTimeMillis() }

    val sampleRate = ProceduralAudioEngine.sampleRate
    var cumulativeFrames = 0L
    // The ONLY thing that ever advances this clock is frames already rendered.
    ProceduralAudioEngine.wallClockMs = { baseWallMs + (cumulativeFrames * 1_000.0 / sampleRate).toLong() }

    ProceduralAudioEngine.configure(config)
    ProceduralAudioEngine.setTimeline(timeline)
    ProceduralAudioEngine.checkpointSessionId = "offline-harness"

    val totalDurationMs = timeline.stages.sumOf { it.durationMs }
    ProceduralAudioEngine.setSleepTimer(baseWallMs + totalDurationMs)

    var completionCount = 0
    var completionCumulativeFrames: Long? = null
    var completionProtocolPositionMs: Double? = null
    var completionWallClockMs: Long? = null
    ProceduralAudioEngine.onSleepTimerElapsed = {
      completionCount++
      completionCumulativeFrames = cumulativeFrames
      completionProtocolPositionMs = ProceduralAudioEngine.getTimelinePositionMs()
      completionWallClockMs = ProceduralAudioEngine.wallClockMs()
    }

    val stageTransitions = mutableListOf<StageTransition>()
    val cueFires = mutableListOf<CueFire>()
    var lastStageId: String? = null
    var nonFiniteCount = 0L
    var peakAbs = 0f
    var sumSquares = 0.0
    var totalSamples = 0L

    val buffer = FloatArray(bufferFrames * 2)
    var buffersAfterCompletion = 0
    var iterations = 0
    while (iterations++ < maxBuffers) {
      java.util.Arrays.fill(buffer, 0f)
      ProceduralAudioEngine.render(buffer, bufferFrames)
      cumulativeFrames += bufferFrames

      for (i in 0 until bufferFrames * 2) {
        val sample = buffer[i]
        if (sample.isNaN() || sample.isInfinite()) nonFiniteCount++
        val magnitude = abs(sample)
        if (magnitude > peakAbs) peakAbs = magnitude
        sumSquares += sample.toDouble() * sample.toDouble()
        totalSamples++
      }

      val stageId = ProceduralAudioEngine.checkpointSnapshot()?.get("stageId") as? String
      if (stageId != null && stageId != lastStageId) {
        stageTransitions.add(StageTransition(stageId, ProceduralAudioEngine.getTimelinePositionMs() ?: -1.0, cumulativeFrames))
        lastStageId = stageId
      }

      for (event in ProceduralAudioEngine.drainDiagnosticEvents()) {
        if (event["type"] == "recognition_signal_fired") {
          cueFires.add(
            CueFire(
              cueId = event["cueId"] as? String ?: "unknown",
              scheduledPositionMs = (event["scheduledPositionMs"] as? Double) ?: -1.0,
              actualPositionMs = (event["actualPositionMs"] as? Double) ?: -1.0,
              driftMs = (event["driftMs"] as? Double) ?: 0.0,
              cumulativeFrames = cumulativeFrames,
            ),
          )
        }
      }

      if (completionCount > 0) {
        buffersAfterCompletion++
        if (buffersAfterCompletion > extraBuffersAfterCompletion) break
      }
    }

    return Result(
      sampleRate = sampleRate,
      bufferFrames = bufferFrames,
      stageTransitions = stageTransitions,
      cueFires = cueFires,
      completionCount = completionCount,
      completionCumulativeFrames = completionCumulativeFrames,
      completionProtocolPositionMs = completionProtocolPositionMs,
      completionWallClockMs = completionWallClockMs,
      nonFiniteSampleCount = nonFiniteCount,
      peakAbs = peakAbs,
      rms = if (totalSamples > 0) sqrt(sumSquares / totalSamples) else 0.0,
      totalRenderedFrames = cumulativeFrames,
      finalTimelinePositionMs = ProceduralAudioEngine.getTimelinePositionMs(),
    )
  }
}
