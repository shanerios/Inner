package expo.modules.inneraudio

import org.junit.Assert.*
import org.junit.Test
import kotlin.math.abs
import kotlin.math.sqrt

/**
 * The Sanctum calls its footsteps by hand: a passage walks toward the listener or away from them exactly when
 * asked, and while the Sanctum sounds the hall's own random passers-by stay off.
 */
class TempleFootstepsScriptedTest {
  private val sampleRate = 48_000.0

  private fun rendered(seed: Long, approach: Boolean?, seconds: Double, scriptedOnly: Boolean = true): DoubleArray {
    val footsteps = TempleFootsteps()
    footsteps.reset(seed, sampleRate)
    val salience = WorldSalienceScheduler()
    salience.reset(sampleRate)
    val out = DoubleArray((seconds * sampleRate).toInt())
    if (approach != null) footsteps.trigger(approach)
    for (frame in out.indices) {
      salience.beginFrame(false)
      footsteps.render(sampleRate, frame / sampleRate, salience, scriptedOnly)
      out[frame] = footsteps.left * footsteps.left + footsteps.right * footsteps.right
    }
    return out
  }

  private fun rms(energy: DoubleArray, from: Int, to: Int) = sqrt(energy.slice(from until to).sum() / (to - from))

  @Test fun staysSilentWithNoTriggerWhenScriptedOnly() {
    for (seed in 1L..4L) {
      val energy = rendered(seed, null, 90.0)
      assertEquals("seed $seed", 0.0, energy.sum(), 0.0)
    }
  }

  @Test fun walksWhenCalledThenStopsAndStaysSilent() {
    val energy = rendered(-0x61c8864680b583ebL, true, 20.0)
    val first = energy.indexOfFirst { it > 0.0 }
    assertTrue("steps begin at once", first in 0 until (0.2 * sampleRate).toInt())
    val last = energy.indexOfLast { it > 0.0 }
    assertTrue("a passage is a few seconds long", last < (7.0 * sampleRate).toInt())
    assertEquals(0.0, energy.slice((8.0 * sampleRate).toInt() until energy.size).sum(), 0.0)
  }

  @Test fun approachingGrowsAndRecedingFades() {
    var approachRatio = 0.0
    var recedeRatio = 0.0
    val seeds = 1L..6L
    for (seed in seeds) {
      for (approach in listOf(true, false)) {
        val energy = rendered(seed, approach, 8.0)
        val end = energy.indexOfLast { it > 0.0 }
        val third = end / 3
        val ratio = rms(energy, 2 * third, end) / rms(energy, 0, third)
        if (approach) approachRatio += ratio else recedeRatio += ratio
      }
    }
    val count = seeds.count().toDouble()
    assertTrue("approach ${approachRatio / count}", approachRatio / count > 1.0)
    assertTrue("recede ${recedeRatio / count}", recedeRatio / count < 1.0)
  }

  @Test fun randomPassersByStillWalkOutsideTheSanctum() {
    // The Temple is unchanged: across a set of nights some hear a passage within the first 2400 seconds. The clock
    // is stepped a second at a time (two renders each, enough for a due passage to take its first step).
    var heard = 0
    for (seed in 1L..8L) {
      val footsteps = TempleFootsteps()
      footsteps.reset(seed, sampleRate)
      val salience = WorldSalienceScheduler()
      salience.reset(sampleRate)
      var any = false
      var second = 0
      while (second < 2_400 && !any) {
        for (repeat in 0 until 2) {
          salience.beginFrame(false)
          footsteps.render(sampleRate, second.toDouble(), salience)
          if (abs(footsteps.left) > 0.0) any = true
        }
        second += 1
      }
      if (any) heard += 1
    }
    assertTrue("heard $heard of 8", heard >= 1)
  }
}
