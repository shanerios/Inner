package expo.modules.inneraudio

import kotlin.math.PI
import kotlin.math.cos
import kotlin.math.max
import kotlin.math.pow

/**
 * A slow breathing in the level of the binaural layer, so it sits in a world and moves with it rather than holding
 * still. The level rises over each inhale and eases back over each exhale (a raised cosine each way), between the
 * layer's own level (the top of the breath) and [render]'s depth in dB below it. Each breath is a little different
 * from the last, by up to the given variation, drawn from a stream of its own, so it never becomes a metronome.
 * A depth of 0 leaves the gain at exactly 1. The Swift engine mirrors this file.
 */
internal class BinauralBreath {
  companion object {
    const val SALT = 0x427265617468L
    /** The level is worked out this often, in samples; it moves far too slowly for this to be heard. */
    const val UPDATE_SAMPLES = 32
  }

  /** The gain to apply to the binaural layer this sample: 1 at the top of a breath. */
  var gain = 1.0
    private set

  private var random = 1L
  private var inhaling = true
  private var age = 0L
  private var length = 0L
  private var sample = 0L

  fun reset(seed: Long) {
    random = (seed xor SALT).let { if (it == 0L) 1L else it }
    inhaling = true; age = 0L; length = 0L; sample = 0L
    gain = 1.0
  }

  private fun unit(): Double {
    random = random xor (random shl 13)
    random = random xor (random ushr 7)
    random = random xor (random shl 17)
    return (random ushr 11).toDouble() / 9007199254740992.0
  }

  private fun breathLength(sampleRate: Double, seconds: Double, variation: Double): Long =
    max(1L, (seconds * (1.0 + variation * (unit() * 2.0 - 1.0)) * sampleRate).toLong())

  /** Advances one sample. */
  fun render(sampleRate: Double, depthDb: Double, inhaleSeconds: Double, exhaleSeconds: Double, variation: Double) {
    if (depthDb <= 0.0) {
      gain = 1.0
      return
    }
    if (length == 0L) length = breathLength(sampleRate, inhaleSeconds, variation)
    if (sample % UPDATE_SAMPLES == 0L) {
      val u = age.toDouble() / length.toDouble()
      val shape = if (inhaling) 0.5 - 0.5 * cos(PI * u) else 0.5 + 0.5 * cos(PI * u)
      gain = 10.0.pow(-depthDb * (1.0 - shape) / 20.0)
    }
    age += 1
    if (age >= length) {
      age = 0L
      inhaling = !inhaling
      length = breathLength(sampleRate, if (inhaling) inhaleSeconds else exhaleSeconds, variation)
    }
    sample += 1
  }
}
