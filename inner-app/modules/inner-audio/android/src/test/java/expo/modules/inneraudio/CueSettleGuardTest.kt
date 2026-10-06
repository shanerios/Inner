package expo.modules.inneraudio

import org.junit.After
import org.junit.Assert.*
import org.junit.Before
import org.junit.Test

/**
 * Drives the real production engine through pause/resume the way the playback
 * service does (pauseSleepTimer on pause, resumeSleepTimer on play) and checks
 * that a recognition cue coming due shortly after a resume waits for the
 * settle window, while untouched nights keep their exact schedule.
 */
class CueSettleGuardTest {
  private val bufferFrames = 960
  private val cueAtMs = 100_000.0

  @Before fun setUp() {
    ProceduralAudioEngine.reset()
    ProceduralAudioEngine.onSleepTimerElapsed = null
    ProceduralAudioEngine.checkpointSessionId = null
  }

  @After fun cleanup() {
    ProceduralAudioEngine.wallClockMs = { System.currentTimeMillis() }
    ProceduralAudioEngine.onSleepTimerElapsed = null
    ProceduralAudioEngine.checkpointSessionId = null
    ProceduralAudioEngine.reset()
  }

  private fun timeline(): AudioTimelineRecord = AudioTimelineRecord().apply {
    id = "cue-settle-fixture"
    title = "Cue settle fixture"
    seed = 4_242.0
    stages = listOf(
      TimelineStageRecord().apply {
        id = "stage-a"; label = "Stage A"; durationMs = 600_000.0
        config = AudioConfigRecord().apply { environment = "ocean"; environmentGain = 0.12; masterGain = 0.5 }
        spatialEvents = listOf(SpatialEventRecord().apply { id = "cue-1"; atMs = cueAtMs; type = "cue"; recognitionSpace = true })
      },
    )
  }

  private class Run {
    val fired = mutableListOf<Map<String, Any>>()
    val held = mutableListOf<Map<String, Any>>()
  }

  private fun start(): Run {
    ProceduralAudioEngine.configure(AudioConfigRecord())
    ProceduralAudioEngine.setTimeline(timeline())
    return Run()
  }

  private fun renderUntil(run: Run, positionMs: Double) {
    val buffer = FloatArray(bufferFrames * 2)
    while ((ProceduralAudioEngine.getTimelinePositionMs() ?: 0.0) < positionMs) {
      java.util.Arrays.fill(buffer, 0f)
      ProceduralAudioEngine.render(buffer, bufferFrames)
      for (event in ProceduralAudioEngine.drainDiagnosticEvents()) {
        when (event["type"]) {
          "recognition_signal_fired" -> run.fired.add(event)
          "recognition_signal_held" -> run.held.add(event)
        }
      }
    }
  }

  /** Mirrors the service: pause stops rendering, resume restarts it. */
  private fun disturb() {
    ProceduralAudioEngine.pauseSleepTimer()
    ProceduralAudioEngine.resumeSleepTimer()
  }

  @Test fun untouchedNightFiresTheCueOnSchedule() {
    val run = start()
    renderUntil(run, 130_000.0)
    assertEquals(1, run.fired.size)
    assertEquals(0, run.held.size)
    assertTrue(Math.abs(run.fired[0]["driftMs"] as Double) < 100.0)
  }

  @Test fun startingPlaybackIsNotADisturbance() {
    val run = start()
    ProceduralAudioEngine.resumeSleepTimer()
    renderUntil(run, 130_000.0)
    assertEquals(1, run.fired.size)
    assertEquals(0, run.held.size)
    assertTrue(Math.abs(run.fired[0]["driftMs"] as Double) < 100.0)
  }

  @Test fun cueDueSoonAfterAResumeWaitsForTheSettleWindow() {
    val run = start()
    renderUntil(run, 95_000.0)
    assertEquals(0, run.fired.size)
    disturb()
    val resumedAtMs = ProceduralAudioEngine.getTimelinePositionMs()!!
    renderUntil(run, 200_000.0)

    assertEquals(1, run.held.size)
    assertEquals("stage-a/cue-1", run.held[0]["cueId"])
    assertEquals(1, run.fired.size)
    val actualMs = run.fired[0]["actualPositionMs"] as Double
    assertTrue("fired at $actualMs", actualMs >= resumedAtMs + 90_000.0)
    assertTrue("fired at $actualMs", actualMs < resumedAtMs + 90_000.0 + 500.0)
    assertEquals(cueAtMs, run.fired[0]["scheduledPositionMs"] as Double, 0.001)
    assertTrue((run.fired[0]["driftMs"] as Double) > 80_000.0)
  }

  @Test fun cueDueAfterTheSettleWindowIsUntouched() {
    val run = start()
    renderUntil(run, 5_000.0)
    disturb()
    renderUntil(run, 130_000.0)
    assertEquals(0, run.held.size)
    assertEquals(1, run.fired.size)
    assertTrue(Math.abs(run.fired[0]["driftMs"] as Double) < 100.0)
  }

  @Test fun repeatedDisturbancesCannotPushACueBeyondTheHoldCap() {
    val run = start()
    renderUntil(run, 95_000.0)
    var next = 95_000.0
    while (next < 395_000.0) {
      disturb()
      next += 60_000.0
      renderUntil(run, next)
    }
    renderUntil(run, 450_000.0)
    assertEquals(1, run.held.size)
    assertEquals(1, run.fired.size)
    assertTrue((run.fired[0]["actualPositionMs"] as Double) <= cueAtMs + 300_000.0 + 500.0)
  }
}
