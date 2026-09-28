package expo.modules.inneraudio

import org.junit.After
import org.junit.Assert.*
import org.junit.Test

/**
 * Proof-of-concept: drive the real production ProceduralAudioEngine offline,
 * without hardware pacing, through a short deterministic fixture, and prove
 * fidelity (timeline load, frame/protocol position, wall-clock derivation,
 * stage transitions, cue firing, sleep-timer completion, determinism, and
 * buffer-size invariance) before any acceleration or speed work.
 *
 * Fixture durations (2_013ms / 3_018ms = 5_031ms total = 241_488 frames at
 * 48kHz) are deliberately not whole multiples of any swept buffer size, so
 * buffer-boundary drift in the wall-clock-gated sleep timer is genuinely
 * observable rather than accidentally hidden by round numbers.
 */
class OfflineRenderHarnessTest {

  @After fun cleanup() {
    ProceduralAudioEngine.wallClockMs = { System.currentTimeMillis() }
    ProceduralAudioEngine.onSleepTimerElapsed = null
    ProceduralAudioEngine.checkpointSessionId = null
    ProceduralAudioEngine.reset()
  }

  private fun fixtureTimeline(): AudioTimelineRecord = AudioTimelineRecord().apply {
    id = "offline-harness-fixture"
    title = "Offline Harness Fixture"
    seed = 4_242.0
    stages = listOf(
      TimelineStageRecord().apply {
        id = "stage-a"; label = "Stage A"; durationMs = 2_013.0
        config = AudioConfigRecord().apply { environment = "ocean"; environmentGain = 0.12; masterGain = 0.5 }
        spatialEvents = listOf(SpatialEventRecord().apply { id = "cue-1"; atMs = 1_000.0; type = "cue" })
      },
      TimelineStageRecord().apply {
        id = "stage-b"; label = "Stage B"; durationMs = 3_018.0
        config = AudioConfigRecord().apply { environment = "ocean"; environmentGain = 0.12; masterGain = 0.3 }
      },
    )
  }

  private fun fixtureConfig(): AudioConfigRecord = AudioConfigRecord()

  private fun totalFrames(sampleRate: Double) = (5_031.0 * sampleRate / 1_000.0).toLong()

  @Test fun productionEngineRunsOfflineAndReachesCleanCompletion() {
    val started = System.nanoTime()
    val result = OfflineRenderHarness.run(fixtureTimeline(), fixtureConfig(), bufferFrames = 960)
    val elapsedMs = (System.nanoTime() - started) / 1_000_000.0

    // 1/2/3: a production timeline was loaded and driven without hardware
    // pacing, and rendered-frame position advanced.
    assertTrue(result.totalRenderedFrames > 0)
    // 4: protocol position reaches the end of the authored timeline. The
    // final position (read after the 3 extra post-completion buffers this
    // run deliberately renders) is allowed a wider tolerance than the
    // completion-moment position asserted below; it is not a drift bug.
    assertEquals(5_031.0, result.finalTimelinePositionMs!!, 100.0)
    // 6: both authored stages were entered, in the authored order.
    assertEquals(listOf("stage-a", "stage-b"), result.stageTransitions.map { it.stageId })
    // 7: the one authored cue fired, with the expected id and exact scheduled position.
    assertEquals(1, result.cueFires.size)
    assertEquals("stage-a/cue-1", result.cueFires[0].cueId)
    assertEquals(1_000.0, result.cueFires[0].scheduledPositionMs, 0.0001)
    // 8/9: completion occurred exactly once, at the expected protocol
    // position. Two buffers' worth of tolerance, not one: the deadline check
    // reads a wall clock derived from frames rendered BEFORE this buffer,
    // but by the time this callback runs, timelineElapsedFrames already
    // includes this buffer's frames too -- a systematic (not random)
    // one-buffer offset between "the frame basis the deadline check used"
    // and "the protocol position visible once it fires", on top of the
    // buffer-boundary drift itself. See the buffer-size sweep test for the
    // drift measured against the true frame basis.
    assertEquals(1, result.completionCount)
    assertEquals(5_031.0, result.completionProtocolPositionMs!!, 45.0)
    // 10: no non-finite samples anywhere in the run.
    assertEquals(0L, result.nonFiniteSampleCount)
    // Basic output sanity: not silent, not runaway/clipping far beyond the
    // engine's own soft limiter.
    assertTrue("peak was suspiciously silent: ${result.peakAbs}", result.peakAbs > 0.001f)
    assertTrue("peak was suspiciously large: ${result.peakAbs}", result.peakAbs < 1.5f)

    println(
      "[offline-harness] single run: simulatedMs=5031 wallClockExecutionMs=%.1f realtimeMultiple=%.1fx peak=%.4f rms=%.4f"
        .format(elapsedMs, 5_031.0 / elapsedMs, result.peakAbs, result.rms),
    )
  }

  @Test fun sameSeedAndConfigProduceEquivalentEventProgression() {
    val first = OfflineRenderHarness.run(fixtureTimeline(), fixtureConfig(), bufferFrames = 960)
    val second = OfflineRenderHarness.run(fixtureTimeline(), fixtureConfig(), bufferFrames = 960)

    assertEquals(first.stageTransitions, second.stageTransitions)
    assertEquals(first.cueFires, second.cueFires)
    assertEquals(first.completionCount, second.completionCount)
    assertEquals(first.completionProtocolPositionMs, second.completionProtocolPositionMs)
    assertEquals(first.completionCumulativeFrames, second.completionCumulativeFrames)
    assertEquals(first.totalRenderedFrames, second.totalRenderedFrames)
    assertEquals(0L, first.nonFiniteSampleCount)
    assertEquals(0L, second.nonFiniteSampleCount)
  }

  @Test fun invariantsHoldAcrossDifferentBufferSizes() {
    val bufferSizes = listOf(1, 64, 960, 4_096)
    val results = linkedMapOf<Int, OfflineRenderHarness.Result>()
    for (size in bufferSizes) results[size] = OfflineRenderHarness.run(fixtureTimeline(), fixtureConfig(), bufferFrames = size)

    for ((size, result) in results) {
      assertEquals("stage ordering must hold at buffer size $size", listOf("stage-a", "stage-b"), result.stageTransitions.map { it.stageId })
      assertEquals("exactly one cue at buffer size $size", 1, result.cueFires.size)
      assertEquals("cue identity must hold at buffer size $size", "stage-a/cue-1", result.cueFires[0].cueId)
      assertEquals("completion exactly once at buffer size $size", 1, result.completionCount)
      assertEquals("no non-finite samples at buffer size $size", 0L, result.nonFiniteSampleCount)
    }

    // Cue firing is checked once per rendered SAMPLE, not once per buffer, so
    // its reported position must be exactly buffer-size invariant -- unlike
    // sleep-timer completion below.
    val cuePositions = results.values.map { it.cueFires[0].actualPositionMs }
    assertTrue(
      "cue timing must not drift across buffer sizes: $cuePositions",
      cuePositions.all { kotlin.math.abs(it - cuePositions[0]) < 0.0001 },
    )

    // The sleep-timer deadline is checked once per buffer against a wall
    // clock read at buffer start -- a pre-existing production characteristic
    // (unchanged by the WallClock seam), not something the harness
    // introduces. Use the finest (1-frame) run as the ground-truth reference
    // and report -- not hide -- the measured drift at coarser buffer sizes,
    // which must be bounded by exactly one buffer's worth of frames.
    val reference = results.getValue(1)
    println("[offline-harness] buffer-size sweep, completion drift relative to 1-frame reference (frame ${reference.completionCumulativeFrames}):")
    for ((size, result) in results) {
      val driftFrames = result.completionCumulativeFrames!! - reference.completionCumulativeFrames!!
      val driftMs = driftFrames * 1_000.0 / result.sampleRate
      println("  bufferFrames=$size driftFrames=$driftFrames driftMs=%.3f".format(driftMs))
      assertTrue(
        "completion drift at buffer size $size was $driftFrames frames, expected within [0, $size]",
        driftFrames in 0..size.toLong(),
      )
    }
  }
}
