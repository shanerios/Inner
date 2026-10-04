package expo.modules.inneraudio

import kotlin.math.PI
import kotlin.math.cos
import kotlin.math.exp
import kotlin.math.min
import kotlin.math.sin
import kotlin.math.sqrt

/**
 * A cricket chorus for the forest floor: a small fixed cast of singers, each its own pitch, pulse rate, chirp-or-trill
 * style, pan and distance, calling on its own schedule from its own random stream -- never synced to the leaves, the
 * gusts, or the howl, the way a real chorus runs on its own clock. A near singer is brighter and drier; a far one is
 * duller and carries more of the shared night air. Deliberately steady: unlike the howl (the forest's identity, which
 * the night thins down) the chorus holds its level through every stage, the way insects do not go quiet for a sleeper.
 * The Swift engine mirrors this file.
 */
internal class CricketModel {
  var left = 0.0
    private set
  var right = 0.0
    private set

  companion object {
    const val SINGERS = 6
    const val CARRIER_LOW_HZ = 3_600.0
    const val CARRIER_HIGH_HZ = 5_600.0
    /** The whole chorus, level-checked by ear through the real engine render (not just the offline mockup), on the
     * forest bed it was approved over. */
    const val CHORUS_GAIN = 0.504
    const val SECOND_HARMONIC = 0.35
    /** A pulse's attack, and the fraction of its length that sets its decay. */
    const val PULSE_ATTACK_SECONDS = 0.002
    const val PULSE_DECAY_FRACTION = 0.45
    /** How far a singer's pitch wanders, pulse to pulse. */
    const val WANDER_HZ = 6.0
    const val WANDER_RANGE = 0.06
    /** A trill runs this many pulses before its breath; a chirp this few. */
    const val TRILL_BURST_LOW = 40
    const val TRILL_BURST_RANGE = 50
    const val CHIRP_BURST_LOW = 3
    const val CHIRP_BURST_RANGE = 3
    const val TRILL_GAP_LOW_SECONDS = 1.2
    const val TRILL_GAP_RANGE_SECONDS = 3.3
    const val CHIRP_GAP_LOW_SECONDS = 0.25
    const val CHIRP_GAP_RANGE_SECONDS = 0.65
    /** A near singer's cutoff; a far one's is this many Hz lower. */
    const val NEAR_CUTOFF_HZ = 7_500.0
    const val DISTANCE_CUTOFF_RANGE_HZ = 2_500.0
    const val SPACE_SECONDS = 0.34
  }

  private var rate = 48_000.0
  private var seed = 1L
  private var random = 1L

  // fixed for the life of the model, drawn once at reset: the cast
  private val carrierHz = DoubleArray(SINGERS)
  private val isTrill = BooleanArray(SINGERS)
  private val pulseSeconds = DoubleArray(SINGERS)
  private val pulseRateHz = DoubleArray(SINGERS)
  private val panLeftGain = DoubleArray(SINGERS)
  private val panRightGain = DoubleArray(SINGERS)
  private val levelFactor = DoubleArray(SINGERS)
  private val cutoffPole = DoubleArray(SINGERS)
  private val distance = DoubleArray(SINGERS)

  // per-sample state
  private val phase = DoubleArray(SINGERS)
  private val freq = DoubleArray(SINGERS)
  private val amp = DoubleArray(SINGERS)
  private val sounding = BooleanArray(SINGERS)
  private val ageSamples = DoubleArray(SINGERS)
  private val countdownSamples = DoubleArray(SINGERS)
  private val burstRemaining = IntArray(SINGERS)
  private val lowpassOne = DoubleArray(SINGERS)
  private val lowpassTwo = DoubleArray(SINGERS)

  // one shared, short night-air send so distant singers carry a touch of the same space, not a separate room each
  private var space = DoubleArray(1)
  private var spaceIndex = 0
  private var spaceSmoothed = 0.0

  fun reset(seed: Long, sampleRate: Double) {
    this.seed = seed
    rate = sampleRate
    random = (seed xor 0x437269636b657473L).let { if (it == 0L) 1L else it }
    for (s in 0 until SINGERS) {
      carrierHz[s] = CARRIER_LOW_HZ + unit() * (CARRIER_HIGH_HZ - CARRIER_LOW_HZ)
      isTrill[s] = unit() < 0.4
      pulseSeconds[s] = 0.012 + unit() * 0.010
      pulseRateHz[s] = 28.0 + unit() * 10.0
      val pan = unit() * 2.0 - 1.0
      val angle = (pan + 1.0) * PI / 4.0
      panLeftGain[s] = cos(angle) * sqrt(2.0)
      panRightGain[s] = sin(angle) * sqrt(2.0)
      distance[s] = 0.15 + unit() * 0.85
      levelFactor[s] = 0.35 + 0.65 * (1.0 - distance[s])
      cutoffPole[s] = pole(NEAR_CUTOFF_HZ - distance[s] * DISTANCE_CUTOFF_RANGE_HZ)
      phase[s] = unit() * 2.0 * PI
      freq[s] = carrierHz[s]
      amp[s] = 0.0
      sounding[s] = false
      ageSamples[s] = 0.0
      countdownSamples[s] = unit() * rate * 1.5
      burstRemaining[s] = 0
      lowpassOne[s] = 0.0; lowpassTwo[s] = 0.0
    }
    space = DoubleArray(maxOf(2, (rate * SPACE_SECONDS).toInt()))
    spaceIndex = 0
    spaceSmoothed = 0.0
    left = 0.0; right = 0.0
  }

  private fun pole(hz: Double): Double = 1.0 - exp(-2.0 * PI * hz / rate)

  private fun unit(): Double {
    random = random xor (random shl 13)
    random = random xor (random ushr 7)
    random = random xor (random shl 17)
    return (random ushr 11).toDouble() / 9007199254740992.0
  }

  fun render(sampleRate: Double) {
    if (rate != sampleRate) reset(seed, sampleRate)
    var dryLeft = 0.0
    var dryRight = 0.0
    var farMono = 0.0
    for (s in 0 until SINGERS) {
      countdownSamples[s] -= 1.0
      if (countdownSamples[s] <= 0.0) {
        if (burstRemaining[s] > 0) {
          sounding[s] = true
          ageSamples[s] = 0.0
          freq[s] = clampHz(freq[s] + (unit() * 2.0 - 1.0) * WANDER_HZ, carrierHz[s])
          amp[s] = (0.75 + 0.25 * unit()) * (if (isTrill[s]) 0.6 else 1.0)
          burstRemaining[s] -= 1
          countdownSamples[s] = (rate / pulseRateHz[s]) * (1.0 + 0.06 * (unit() * 2.0 - 1.0))
        } else {
          burstRemaining[s] = if (isTrill[s]) TRILL_BURST_LOW + (unit() * TRILL_BURST_RANGE).toInt()
          else CHIRP_BURST_LOW + (unit() * CHIRP_BURST_RANGE).toInt()
          val gapSeconds = if (isTrill[s]) TRILL_GAP_LOW_SECONDS + unit() * TRILL_GAP_RANGE_SECONDS
          else CHIRP_GAP_LOW_SECONDS + unit() * CHIRP_GAP_RANGE_SECONDS
          countdownSamples[s] = gapSeconds * rate
        }
      }
      var voice = 0.0
      if (sounding[s]) {
        val t = ageSamples[s] / rate
        if (t >= pulseSeconds[s]) {
          sounding[s] = false
        } else {
          val envelope = min(1.0, t / PULSE_ATTACK_SECONDS) * exp(-t / (pulseSeconds[s] * PULSE_DECAY_FRACTION))
          phase[s] = (phase[s] + 2.0 * PI * freq[s] / rate) % (2.0 * PI)
          val tone = sin(phase[s]) + SECOND_HARMONIC * sin(2.0 * phase[s])
          voice = amp[s] * envelope * tone
          ageSamples[s] += 1.0
        }
      }
      lowpassOne[s] += cutoffPole[s] * (voice - lowpassOne[s])
      lowpassTwo[s] += cutoffPole[s] * (lowpassOne[s] - lowpassTwo[s])
      val filtered = lowpassTwo[s]
      dryLeft += filtered * panLeftGain[s] * levelFactor[s]
      dryRight += filtered * panRightGain[s] * levelFactor[s]
      farMono += filtered * distance[s]
    }
    // one shared, cheap sense of the night air around the chorus, carried mostly by the farther singers
    val size = space.size
    val tap = space[(spaceIndex - (rate * 0.07).toInt() + size) % size] * 0.6 +
      space[(spaceIndex - (rate * 0.15).toInt() + size) % size] * 0.4
    spaceSmoothed += 0.03 * (tap - spaceSmoothed)
    space[spaceIndex] = farMono + spaceSmoothed * 0.3
    spaceIndex = (spaceIndex + 1) % size
    left = (dryLeft + spaceSmoothed * 0.5) * CHORUS_GAIN
    right = (dryRight + spaceSmoothed * 0.5) * CHORUS_GAIN
  }

  private fun clampHz(value: Double, carrier: Double): Double {
    val low = carrier * (1.0 - WANDER_RANGE)
    val high = carrier * (1.0 + WANDER_RANGE)
    return if (value < low) low else if (value > high) high else value
  }
}
