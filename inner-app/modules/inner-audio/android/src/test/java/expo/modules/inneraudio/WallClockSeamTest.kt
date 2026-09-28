package expo.modules.inneraudio

import org.junit.After
import org.junit.Assert.*
import org.junit.Test

/**
 * Confirms the sleep-timer and checkpoint wall-clock reads go through the
 * injectable `wallClockMs` seam rather than a direct `System.currentTimeMillis()`
 * call, that the default -- used everywhere in production -- is real time, and
 * that the seam deterministically controls deadline creation, firing,
 * pause/resume re-anchoring, exactly-once completion, and its independence
 * from rendered/protocol position.
 */
class WallClockSeamTest {
  @After fun restoreRealClock() {
    ProceduralAudioEngine.wallClockMs = { System.currentTimeMillis() }
    ProceduralAudioEngine.onSleepTimerElapsed = null
  }

  @Test fun defaultClockIsRealSystemTime() {
    val before = System.currentTimeMillis()
    val sampled = ProceduralAudioEngine.wallClockMs()
    val after = System.currentTimeMillis()
    assertTrue(sampled in before..after)
  }

  @Test fun sleepTimerFiresOnTheInjectedClockNotRealTime() {
    ProceduralAudioEngine.reset()
    ProceduralAudioEngine.configure(AudioConfigRecord())
    var fakeNowMs = 1_000_000L
    ProceduralAudioEngine.wallClockMs = { fakeNowMs }
    ProceduralAudioEngine.setSleepTimer(fakeNowMs + 50.0)
    // Deadline creation is explicit and observable, not just inferred later.
    assertEquals(1_000_050.0, ProceduralAudioEngine.debugState()["sleepEndMs"])

    val buffer = FloatArray(2 * 64)
    ProceduralAudioEngine.render(buffer, 64)
    assertNull("must not fire before the injected deadline", ProceduralAudioEngine.lastTimerCompletionAtMs)

    // Advance only the injected clock. Real wall time has not moved.
    fakeNowMs += 1_000
    ProceduralAudioEngine.render(buffer, 64)
    assertEquals(fakeNowMs.toDouble(), ProceduralAudioEngine.lastTimerCompletionAtMs)
  }

  @Test fun pauseResumeReanchorsToTheInjectedClock() {
    ProceduralAudioEngine.reset()
    ProceduralAudioEngine.configure(AudioConfigRecord())
    var fakeNowMs = 5_000_000L
    ProceduralAudioEngine.wallClockMs = { fakeNowMs }
    ProceduralAudioEngine.setSleepTimer(fakeNowMs + 10_000.0)
    assertEquals(5_010_000.0, ProceduralAudioEngine.debugState()["sleepEndMs"])

    ProceduralAudioEngine.pauseSleepTimer()
    assertNull("no active deadline while paused", ProceduralAudioEngine.debugState()["sleepEndMs"])

    // A jump the injected clock experiences entirely while paused.
    fakeNowMs += 400_000
    ProceduralAudioEngine.resumeSleepTimer()
    // The preserved 10s remaining is re-anchored to the NEW now, not to the
    // stale original deadline and not lost to the 400s gap.
    assertEquals(5_410_000.0, ProceduralAudioEngine.debugState()["sleepEndMs"])

    val buffer = FloatArray(2 * 64)
    ProceduralAudioEngine.render(buffer, 64)
    assertNull(ProceduralAudioEngine.lastTimerCompletionAtMs)

    fakeNowMs += 10_000
    ProceduralAudioEngine.render(buffer, 64)
    assertNotNull(ProceduralAudioEngine.lastTimerCompletionAtMs)
  }

  @Test fun advancingRealTimeAloneHasNoEffect() {
    ProceduralAudioEngine.reset()
    ProceduralAudioEngine.configure(AudioConfigRecord())
    val fakeNowMs = 9_000_000L
    ProceduralAudioEngine.wallClockMs = { fakeNowMs }
    ProceduralAudioEngine.setSleepTimer(fakeNowMs + 30.0)

    // Real wall-clock time passes here; the injected clock does not move.
    Thread.sleep(50)

    val buffer = FloatArray(2 * 64)
    ProceduralAudioEngine.render(buffer, 64)
    assertNull("real elapsed time must not count toward the deadline in test mode", ProceduralAudioEngine.lastTimerCompletionAtMs)
  }

  @Test fun completionFiresExactlyOnceAcrossRepeatedRenders() {
    ProceduralAudioEngine.reset()
    ProceduralAudioEngine.configure(AudioConfigRecord())
    var fakeNowMs = 2_000_000L
    ProceduralAudioEngine.wallClockMs = { fakeNowMs }
    var firedCount = 0
    ProceduralAudioEngine.onSleepTimerElapsed = { firedCount++ }
    ProceduralAudioEngine.setSleepTimer(fakeNowMs + 20.0)
    fakeNowMs += 100 // now past the deadline

    val buffer = FloatArray(2 * 64)
    repeat(5) { ProceduralAudioEngine.render(buffer, 64) }
    assertEquals("firing must be guarded, not repeated per buffer", 1, firedCount)
  }

  @Test fun injectedWallTimeDoesNotAffectRenderedOrProtocolPosition() {
    ProceduralAudioEngine.reset()
    ProceduralAudioEngine.configure(AudioConfigRecord())
    ProceduralAudioEngine.setTimeline(AudioTimelineRecord().apply { stages = listOf(TimelineStageRecord()) })
    var fakeNowMs = 3_000_000L
    ProceduralAudioEngine.wallClockMs = { fakeNowMs }

    val buffer = FloatArray(2 * 64)
    ProceduralAudioEngine.render(buffer, 64)
    val positionAfterFirstRender = ProceduralAudioEngine.getTimelinePositionMs()

    // A huge wall-clock jump with no rendering must not move protocol position:
    // it is a frame count, never a function of wall time.
    fakeNowMs += 10_000_000
    assertEquals(positionAfterFirstRender, ProceduralAudioEngine.getTimelinePositionMs())

    ProceduralAudioEngine.render(buffer, 64)
    val positionAfterSecondRender = ProceduralAudioEngine.getTimelinePositionMs()
    val expectedAdvanceMs = 64 * 1_000.0 / ProceduralAudioEngine.sampleRate
    assertEquals(positionAfterFirstRender!! + expectedAdvanceMs, positionAfterSecondRender!!, 0.0001)
  }

  /**
   * Level-3 observability: `renderHeartbeatAtMs` must reflect the render
   * thread's own progress -- via the injected clock -- not merely time
   * passing, and must reset cleanly. This is the evidence a stalled render
   * thread would fail to keep advancing even while a separate checkpoint
   * timer keeps writing.
   */
  @Test fun renderHeartbeatTracksInjectedClockAndResetsCleanly() {
    ProceduralAudioEngine.reset()
    assertEquals(0.0, ProceduralAudioEngine.debugState()["renderHeartbeatAtMs"])

    ProceduralAudioEngine.configure(AudioConfigRecord())
    var fakeNowMs = 7_000_000L
    ProceduralAudioEngine.wallClockMs = { fakeNowMs }

    val buffer = FloatArray(2 * 64)
    ProceduralAudioEngine.render(buffer, 64)
    assertEquals(fakeNowMs.toDouble(), ProceduralAudioEngine.debugState()["renderHeartbeatAtMs"])

    // The clock alone moving forward, with no render() call, must not move it.
    fakeNowMs += 60_000
    assertEquals(
      "heartbeat must not advance without an actual render() call",
      7_000_000.0,
      ProceduralAudioEngine.debugState()["renderHeartbeatAtMs"],
    )

    ProceduralAudioEngine.render(buffer, 64)
    assertEquals(fakeNowMs.toDouble(), ProceduralAudioEngine.debugState()["renderHeartbeatAtMs"])

    ProceduralAudioEngine.reset()
    assertEquals(0.0, ProceduralAudioEngine.debugState()["renderHeartbeatAtMs"])
  }
}
