package expo.modules.inneraudio

import kotlin.math.PI
import kotlin.math.cos
import kotlin.math.exp
import kotlin.math.max
import kotlin.math.min
import kotlin.math.pow
import kotlin.math.sin

/**
 * The second stream of the noise bed. The engine's own noise is one stream heard identically in both ears, which
 * sounds narrow; this makes a companion with the same color, level and high cut but different noise, so the two ears
 * can hear different noise and the bed is wide. It draws only from its own random stream. The Swift engine mirrors this file.
 */
internal class BedSideNoise {
  companion object {
    const val SALT = 0x5369646542656421L
    /** The bed's high cut counts as off at or above this (as in the engine). */
    const val CUT_OFF_HZ = 19_990.0
  }

  private var random = 1L
  private val pink = DoubleArray(7)
  private var brown = 0.0
  private var greyLow = 0.0
  private var lastIncoming: String? = null
  private var cutOne = 0.0
  private var cutTwo = 0.0

  fun reset(seed: Long) {
    random = (seed xor SALT).let { if (it == 0L) 1L else it }
    pink.fill(0.0); brown = 0.0; greyLow = 0.0
    lastIncoming = null
    cutOne = 0.0; cutTwo = 0.0
  }

  private fun white(): Double {
    random = random xor (random shl 13)
    random = random xor (random ushr 7)
    random = random xor (random shl 17)
    return (random and 0x00ff_ffffL).toDouble() / 0x007f_ffffL.toDouble() - 1
  }

  private fun color(color: String?): Double {
    color ?: return 0.0
    val white = white()
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

  /**
   * One sample of the companion noise, before the bed's gain. [incoming] is the color now sounding, [outgoing] the
   * color it is blending away from (or null), [blend] how far that blend has gone, [cutHz] the bed's high cut.
   */
  fun next(sampleRate: Double, incoming: String?, outgoing: String?, blend: Double, cutHz: Double): Double {
    if (incoming != lastIncoming) {
      when (incoming) {
        "pink" -> pink.fill(0.0)
        "brown" -> brown = 0.0
        "grey" -> greyLow = 0.0
      }
      lastIncoming = incoming
    }
    val mixed = if (outgoing != null) {
      val arriving = color(incoming)
      val leaving = color(outgoing)
      val angle = blend * PI / 2
      leaving * cos(angle) + arriving * sin(angle)
    } else color(incoming)
    return if (cutHz < CUT_OFF_HZ) {
      val coefficient = 1.0 - exp(-2.0 * PI * cutHz / sampleRate)
      cutOne += coefficient * (mixed - cutOne)
      cutTwo += coefficient * (cutOne - cutTwo)
      cutTwo
    } else {
      cutOne = mixed
      cutTwo = mixed
      mixed
    }
  }
}

/**
 * A slow, irregular drift for the bed, one for each ear: randomly timed surges of random size, so the two ears swell on
 * their own schedules and the weight of the bed wanders from side to side, with no cycle to hear. Depth is how far each
 * ear's level swings either side of its average (the 5th to 95th percentile), and the average level does not change.
 * It draws only from its own random streams. The Swift engine mirrors this file.
 */
internal class BedDrift {
  companion object {
    const val LEFT_SALT = 0x4c65667444726966L
    const val RIGHT_SALT = 0x5269676874447266L
    const val SURGES = 8
    /** The raw sum of surges is scaled by this, clipped to 0..1, and centred on this mean; this turns it into a unit swing. */
    const val SUM_SCALE = 1.1112
    const val SUM_MEAN = 0.4843
    const val SWING = 0.7054
    /** The level is worked out this often (samples) and smoothed over this long (seconds). */
    const val UPDATE_SAMPLES = 64
    const val SMOOTH_SECONDS = 0.4
  }

  /** The gain for each ear: 1 when the drift is off. */
  var left = 1.0
    private set
  var right = 1.0
    private set

  private class Ear(private val salt: Long) {
    var random = 1L
    val start = DoubleArray(SURGES)
    val length = DoubleArray(SURGES)
    val rise = DoubleArray(SURGES)
    val amplitude = DoubleArray(SURGES)
    var count = 0
    var nextAt = 0.0
    var started = false
    var decibels = 0.0

    fun reset(seed: Long) {
      random = (seed xor salt).let { if (it == 0L) 1L else it }
      count = 0; nextAt = 0.0; started = false; decibels = 0.0
    }

    fun unit(): Double {
      random = random xor (random shl 13)
      random = random xor (random ushr 7)
      random = random xor (random shl 17)
      return (random ushr 11).toDouble() / 9007199254740992.0
    }

    /** Adds a surge beginning at [at] and returns when the next one should begin. */
    fun surge(at: Double, seconds: Double): Double {
      val duration = seconds * (0.7 + 0.8 * unit())
      val size = 0.45 + 0.55 * unit()
      val ramp = duration * (0.35 + 0.15 * unit())
      val gap = duration * (0.45 + 0.45 * unit())
      if (count == SURGES) {
        // The oldest surge has all but ended; make room.
        for (i in 1 until SURGES) { start[i - 1] = start[i]; length[i - 1] = length[i]; rise[i - 1] = rise[i]; amplitude[i - 1] = amplitude[i] }
        count -= 1
      }
      start[count] = at; length[count] = duration; rise[count] = ramp; amplitude[count] = size
      count += 1
      return at + gap
    }

    /** The drift, in dB, at [time], for a depth in dB and a typical surge length in seconds. */
    fun update(time: Double, depthDb: Double, seconds: Double): Double {
      if (!started) {
        // Begin already in motion, as if the surges had been going on before.
        var t = -seconds
        while (t < 0.0) t = surge(t, seconds)
        nextAt = t
        started = true
      }
      while (time >= nextAt) nextAt = surge(nextAt, seconds)
      var sum = 0.0
      var i = 0
      while (i < count) {
        val age = time - start[i]
        if (age >= length[i]) {
          for (j in i + 1 until count) { start[j - 1] = start[j]; length[j - 1] = length[j]; rise[j - 1] = rise[j]; amplitude[j - 1] = amplitude[j] }
          count -= 1
          continue
        }
        if (age > 0.0) {
          val shape = if (age < rise[i]) 0.5 - 0.5 * cos(PI * age / rise[i]) else 0.5 + 0.5 * cos(PI * (age - rise[i]) / (length[i] - rise[i]))
          sum += amplitude[i] * shape
        }
        i += 1
      }
      return depthDb * 2.0 * (max(0.0, min(1.0, sum / SUM_SCALE)) - SUM_MEAN) / SWING
    }
  }

  private val leftEar = Ear(LEFT_SALT)
  private val rightEar = Ear(RIGHT_SALT)
  private var sample = 0L

  fun reset(seed: Long) {
    leftEar.reset(seed); rightEar.reset(seed)
    left = 1.0; right = 1.0
    sample = 0L
  }

  /** Advances one sample; [depthDb] 0 keeps both gains at 1. */
  fun render(sampleRate: Double, depthDb: Double, seconds: Double) {
    if (depthDb <= 0.0) {
      left = 1.0; right = 1.0
      sample += 1
      return
    }
    if (sample % UPDATE_SAMPLES == 0L) {
      val time = sample / sampleRate
      val smoothing = 1.0 - exp(-UPDATE_SAMPLES / (SMOOTH_SECONDS * sampleRate))
      leftEar.decibels += smoothing * (leftEar.update(time, depthDb, seconds) - leftEar.decibels)
      rightEar.decibels += smoothing * (rightEar.update(time, depthDb, seconds) - rightEar.decibels)
      left = 10.0.pow(leftEar.decibels / 20.0)
      right = 10.0.pow(rightEar.decibels / 20.0)
    }
    sample += 1
  }
}
