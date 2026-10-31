package expo.modules.inneraudio

import org.junit.Assert.*
import org.junit.Test
import kotlin.math.abs
import kotlin.math.sqrt

/**
 * Renders the Sanctum chorus on its own: it stays finite, blooms in rather than starting at full level,
 * holds a level close to the Temple Aum's, and rings out when it is brought down. The Swift engine's chorus
 * measures the same RMS (0.0873, left channel, presence 1, intensity 0.5, seed 0x9e3779b97f4a7c15).
 */
class SanctumChorusTest {
  private val sampleRate = 48_000.0
  private val seed = -0x61c8864680b583ebL // 0x9e3779b97f4a7c15

  private fun rms(chorus: SanctumChorus, fromSecond: Double, toSecond: Double, presence: Double, startSecond: Double = 0.0): Pair<Double, Double> {
    var sumSquares = 0.0
    var peak = 0.0
    var count = 0
    val first = (fromSecond * sampleRate).toInt()
    val last = (toSecond * sampleRate).toInt()
    for (frame in (startSecond * sampleRate).toInt() until last) {
      chorus.render(sampleRate, frame / sampleRate, 0.5, presence)
      if (frame >= first) {
        sumSquares += chorus.voiceLeft * chorus.voiceLeft
        peak = maxOf(peak, abs(chorus.voiceLeft))
        count += 1
      }
    }
    return Pair(sqrt(sumSquares / count), peak)
  }

  @Test fun holdsALevelCloseToTheAumAndStaysBounded() {
    val chorus = SanctumChorus()
    chorus.reset(seed)
    val (level, peak) = rms(chorus, 30.0, 40.0, 1.0)
    assertEquals(0.0873, level, 0.002)
    assertTrue("peak $peak", peak < 0.6)
  }

  @Test fun bloomsInRatherThanStartingAtFullLevel() {
    val chorus = SanctumChorus()
    chorus.reset(seed)
    val (opening, _) = rms(chorus, 0.0, 1.0, 1.0)
    val (settled, _) = rms(chorus, 30.0, 40.0, 1.0, startSecond = 1.0)
    assertTrue("opening $opening settled $settled", opening < settled * 0.2)
  }

  @Test fun ringsOutWhenBroughtDownAndIsSilentAtPresenceZero() {
    val chorus = SanctumChorus()
    chorus.reset(seed)
    rms(chorus, 29.0, 30.0, 1.0)
    var sumSquares = 0.0
    var frames = 0
    var tailSquares = 0.0
    var tailFrames = 0
    for (frame in (30.0 * sampleRate).toInt() until (120.0 * sampleRate).toInt()) {
      chorus.render(sampleRate, frame / sampleRate, 0.5, 0.0)
      assertTrue(chorus.voiceLeft.isFinite() && chorus.voiceRight.isFinite() && chorus.farWet.isFinite())
      val second = frame / sampleRate
      if (second in 31.0..33.0) { sumSquares += chorus.voiceLeft * chorus.voiceLeft; frames += 1 }
      if (second in 118.0..120.0) { tailSquares += chorus.voiceLeft * chorus.voiceLeft; tailFrames += 1 }
    }
    // Still sounding a moment after presence drops (the bloom and the tail), and gone well before two minutes.
    assertTrue(sqrt(sumSquares / frames) > 0.005)
    assertTrue(sqrt(tailSquares / tailFrames) < 0.0005)
  }

  @Test fun resetClearsTheTail() {
    val chorus = SanctumChorus()
    chorus.reset(seed)
    rms(chorus, 29.0, 30.0, 1.0)
    chorus.reset(seed)
    chorus.render(sampleRate, 0.0, 0.5, 0.0)
    assertEquals(0.0, chorus.voiceLeft, 1e-12)
    assertEquals(0.0, chorus.voiceRight, 1e-12)
    assertEquals(0.0, chorus.farWet, 1e-12)
  }
}
