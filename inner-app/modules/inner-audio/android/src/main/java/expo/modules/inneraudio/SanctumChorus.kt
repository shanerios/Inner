package expo.modules.inneraudio

import kotlin.math.PI
import kotlin.math.cos
import kotlin.math.exp
import kotlin.math.max
import kotlin.math.min
import kotlin.math.sin
import kotlin.math.tan

private fun clamp(value: Double, low: Double, high: Double) = min(high, max(low, value))

/**
 * The Sanctum's chorus: six imperfect virtual voices holding an open "O" on an A, an open fifth with its
 * octaves, each doubled a little out of tune. It never closes to a hum and has no gaps; its level is the
 * identity presence, so a journey's stages shape its arc, and it blooms in over a few seconds. It carries its
 * own long tail (four combs a side), which is what makes the hall feel enormous. The Swift engine mirrors this
 * file.
 *
 * It replaces the Temple's periodic Aum while the Sanctum is sounding; the Temple world never uses it.
 */
internal class SanctumChorus {
  companion object {
    /** Hz: a sub A and E, two As an octave up (the second a little out of tune), then the E and A above them. */
    private val FREQS = doubleArrayOf(27.5, 41.2, 55.0, 55.5, 82.41, 110.0)
    private val WEIGHTS = doubleArrayOf(0.34, 0.30, 0.24, 0.20, 0.12, 0.05)
    /** From the left ear (-1) to the right (1). */
    private val PANS = doubleArrayOf(-0.4, 0.4, 0.0, -0.7, 0.7, 0.3)
    private const val VOICES = 6
    /** Seconds the chorus takes to reach a new level, so it blooms and is never switched on. */
    private const val BLOOM_SECONDS = 6.0
    private val COMB_SECONDS_LEFT = doubleArrayOf(0.1871, 0.2297, 0.2753, 0.3331)
    private val COMB_SECONDS_RIGHT = doubleArrayOf(0.1993, 0.2411, 0.2879, 0.3469)
    /** About seven seconds to fade 60 dB. */
    private const val COMB_FEEDBACK = 0.78
    private const val COMB_DAMPING = 0.6
    /** Everything above this is rolled off (two one-pole stages), so the chorus is a drone and does not ring. */
    private const val LOWPASS_HZ = 380.0
    private const val COMB_CAPACITY = 24_000
    private const val DRY_MIX = 0.55
    private const val WET_MIX = 0.9
    /** Share of the chorus that also goes to the Temple hall's own reflections. */
    private const val HALL_SEND = 0.25
  }

  /** The chorus for this sample, already scaled by its level and placed in the stereo field. */
  var voiceLeft = 0.0
    private set
  var voiceRight = 0.0
    private set
  /** Level sent to the hall's reflections as well. */
  var farWet = 0.0
    private set

  private val panLeft = DoubleArray(VOICES) { cos((PANS[it] + 1.0) * PI / 4.0) * 1.4142135623730951 }
  private val panRight = DoubleArray(VOICES) { sin((PANS[it] + 1.0) * PI / 4.0) * 1.4142135623730951 }
  private val phases = DoubleArray(VOICES)
  private val offsets = DoubleArray(VOICES)
  private val formantIc1 = DoubleArray(4)
  private val formantIc2 = DoubleArray(4)
  private var level = 0.0
  private val combLeft = Array(4) { DoubleArray(COMB_CAPACITY) }
  private val combRight = Array(4) { DoubleArray(COMB_CAPACITY) }
  private val lowpass = DoubleArray(4)
  private val dampLeft = DoubleArray(4)
  private val dampRight = DoubleArray(4)
  private var combIndex = 0

  /** Starts a night: clears every voice and tail, and sets the phases the voices begin from. */
  fun reset(nightSeed: Long) {
    val tau = PI * 2
    for (index in 0 until VOICES) {
      offsets[index] = ((nightSeed ushr (index * 8)) and 0xFFL).toDouble() / 256.0 * tau
      phases[index] = offsets[index]
    }
    formantIc1.fill(0.0); formantIc2.fill(0.0)
    level = 0.0
    for (comb in combLeft) comb.fill(0.0)
    for (comb in combRight) comb.fill(0.0)
    dampLeft.fill(0.0); dampRight.fill(0.0)
    lowpass.fill(0.0)
    combIndex = 0
    voiceLeft = 0.0; voiceRight = 0.0; farWet = 0.0
  }

  fun render(sampleRate: Double, elapsedSeconds: Double, intensity: Double, presence: Double) {
    val tau = PI * 2
    val target = clamp(presence, 0.0, 12.0) * (0.54 + intensity * 0.36)
    level += (target - level) / max(1.0, sampleRate * BLOOM_SECONDS)
    // Two slow, unrelated swells: the hall breathes in and out without a cycle you can count.
    val swell = 0.62 + 0.2 * sin(elapsedSeconds * tau / 19.0 + offsets[0]) + 0.18 * sin(elapsedSeconds * tau / 27.0 + offsets[1])
    val formant1 = 170.0 * (1.0 + 0.06 * sin(elapsedSeconds * tau * 0.021 + offsets[2]))
    val formant2 = 330.0 * (1.0 + 0.06 * sin(elapsedSeconds * tau * 0.017 + offsets[3]))
    var sourceLeft = 0.0
    var sourceRight = 0.0
    var body = 0.0
    for (index in 0 until VOICES) {
      val phase = phases[index]
      // A compact band-limited glottal source, softer than the Aum's so the "O" stays round and low.
      val glottal = sin(phase) + sin(phase * 2) * 0.55 + sin(phase * 3) * 0.20 + sin(phase * 4) * 0.05
      val shimmer = 0.94 + 0.06 * sin(elapsedSeconds * tau * (0.11 + index * 0.037) + offsets[index])
      val voice = glottal * WEIGHTS[index] * shimmer
      sourceLeft += voice * panLeft[index]
      sourceRight += voice * panRight[index]
      body += sin(phase) * WEIGHTS[index]
      // A slight vibrato and a slower drift keep every voice a little alive, never a held tone.
      val vibrato = 1.0 + 0.0022 * sin(elapsedSeconds * tau * (4.9 + index * 0.23) + offsets[index]) +
        0.0012 * sin(elapsedSeconds * tau * (0.07 + index * 0.013) + offsets[index])
      phases[index] = (phase + tau * FREQS[index] * vibrato / sampleRate) % tau
    }
    val rawLeft = bandpass(sampleRate, sourceLeft, 0, formant1, 2.0) * 1.2 + bandpass(sampleRate, sourceLeft, 1, formant2, 2.2) * 0.6 + body * 1.0
    val rawRight = bandpass(sampleRate, sourceRight, 2, formant1 * 0.994, 2.0) * 1.2 + bandpass(sampleRate, sourceRight, 3, formant2 * 1.006, 2.2) * 0.6 + body * 1.0
    val lowpassCoefficient = 1.0 - exp(-tau * LOWPASS_HZ / sampleRate)
    lowpass[0] += lowpassCoefficient * (rawLeft - lowpass[0])
    lowpass[1] += lowpassCoefficient * (lowpass[0] - lowpass[1])
    lowpass[2] += lowpassCoefficient * (rawRight - lowpass[2])
    lowpass[3] += lowpassCoefficient * (lowpass[2] - lowpass[3])
    val chorusLeft = lowpass[1] * level * swell
    val chorusRight = lowpass[3] * level * swell

    // The tail is fed after the level, so it fades naturally when the chorus is brought down.
    var wetLeft = 0.0
    var wetRight = 0.0
    for (comb in 0 until 4) {
      val delayLeft = (sampleRate * COMB_SECONDS_LEFT[comb]).toInt().coerceIn(1, COMB_CAPACITY - 1)
      val delayRight = (sampleRate * COMB_SECONDS_RIGHT[comb]).toInt().coerceIn(1, COMB_CAPACITY - 1)
      val readLeft = combLeft[comb][(combIndex - delayLeft + COMB_CAPACITY) % COMB_CAPACITY]
      val readRight = combRight[comb][(combIndex - delayRight + COMB_CAPACITY) % COMB_CAPACITY]
      dampLeft[comb] += (readLeft - dampLeft[comb]) * (1.0 - COMB_DAMPING)
      dampRight[comb] += (readRight - dampRight[comb]) * (1.0 - COMB_DAMPING)
      combLeft[comb][combIndex] = chorusLeft + dampLeft[comb] * COMB_FEEDBACK
      combRight[comb][combIndex] = chorusRight + dampRight[comb] * COMB_FEEDBACK
      wetLeft += readLeft
      wetRight += readRight
    }
    combIndex = (combIndex + 1) % COMB_CAPACITY
    voiceLeft = chorusLeft * DRY_MIX + wetLeft * 0.25 * WET_MIX
    voiceRight = chorusRight * DRY_MIX + wetRight * 0.25 * WET_MIX
    farWet = (chorusLeft + chorusRight) * 0.5 * HALL_SEND
  }

  /** Topology-preserving state-variable bandpass; stable while formants move. */
  private fun bandpass(sampleRate: Double, input: Double, index: Int, frequency: Double, q: Double): Double {
    val g = tan(PI * frequency / sampleRate)
    val k = 1.0 / q
    val v1 = (formantIc1[index] + g * (input - formantIc2[index])) / (1.0 + g * (g + k))
    val v2 = formantIc2[index] + g * v1
    formantIc1[index] = 2.0 * v1 - formantIc1[index]
    formantIc2[index] = 2.0 * v2 - formantIc2[index]
    return v1
  }
}
