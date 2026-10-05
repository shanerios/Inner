package expo.modules.inneraudio

import kotlin.math.PI
import kotlin.math.cos
import kotlin.math.exp
import kotlin.math.ln
import kotlin.math.max
import kotlin.math.min
import kotlin.math.pow
import kotlin.math.sin
import kotlin.math.sqrt
import kotlin.math.tanh

/**
 * A gull, calling far off over the water: a short run of three to six rasping pulses, sometimes finishing in one
 * longer, lower, downward-sweeping cry -- the two shapes a real gull makes. Deliberately low-pitched and harsh
 * (amplitude tremolo and a soft-clipped harmonic stack, not a clean tone) -- a clean tone at songbird pitch read as
 * a tweet, not a caw. Calls on its own schedule, continuous through the night but sparse, pacing with how alive the
 * world is the way the Forest's birds do. Far off and not alarming: heavily low-passed, quiet, no close detail, no
 * room send (open air, not a chamber). The Swift engine mirrors this file.
 */
internal class OceanGulls {
  var left = 0.0
    private set
  var right = 0.0
    private set

  companion object {
    const val PULSES_MIN = 3
    const val PULSES_RANGE = 3
    const val PULSE_LOW_HZ = 650.0
    const val PULSE_HIGH_HZ = 1050.0
    const val PULSE_STEP_DOWN = 0.03
    const val PULSE_LENGTH_LOW_SECONDS = 0.07
    const val PULSE_LENGTH_RANGE_SECONDS = 0.04
    const val PULSE_BEND_LOW = -0.15
    const val PULSE_BEND_RANGE = 0.13
    const val PULSE_GAP_LOW_SECONDS = 0.015
    const val PULSE_GAP_RANGE_SECONDS = 0.025
    const val PULSE_TREMOLO_RATE_LOW = 24.0
    const val PULSE_TREMOLO_RATE_RANGE = 10.0
    const val PULSE_TREMOLO_DEPTH_LOW = 0.45
    const val PULSE_TREMOLO_DEPTH_RANGE = 0.25
    const val PULSE_BREATH_LOW = 0.15
    const val PULSE_BREATH_RANGE = 0.15
    /** Chance a call finishes with the long, lower, sweeping cry after its pulses. */
    const val CRY_CHANCE = 0.6
    const val CRY_PITCH_LOW = 1.1
    const val CRY_PITCH_RANGE = 0.2
    const val CRY_LENGTH_LOW_SECONDS = 0.32
    const val CRY_LENGTH_RANGE_SECONDS = 0.23
    const val CRY_BEND_LOW = -0.55
    const val CRY_BEND_RANGE = 0.25
    const val CRY_TREMOLO_RATE_LOW = 14.0
    const val CRY_TREMOLO_RATE_RANGE = 6.0
    const val CRY_TREMOLO_DEPTH_LOW = 0.2
    const val CRY_TREMOLO_DEPTH_RANGE = 0.15
    const val CRY_BREATH_LOW = 0.2
    const val CRY_BREATH_RANGE = 0.15
    const val ATTACK_SECONDS = 0.008
    const val DECAY_FRACTION = 0.4
    const val BREATH_LOW_RATIO = 1.0
    const val BREATH_HIGH_RATIO = 3.2
    /** A near call's cutoff; a far one's is this many Hz lower. */
    const val NEAR_CUTOFF_HZ = 5_600.0
    const val DISTANCE_CUTOFF_RANGE_HZ = 2_400.0
    const val NEAR_DISTANCE = 0.45
    const val FAR_DISTANCE = 0.9
    /** How often a call begins, before intensity/density pacing: a mean gap of about this long. */
    const val BASE_GAP_LOW_SECONDS = 45.0
    const val BASE_GAP_RANGE_SECONDS = 55.0
    /** Level-checked by ear through the real engine, on the Ocean bed it was approved over. */
    const val LEVEL_GAIN = 0.17522
  }

  private var rate = 48_000.0
  private var seed = 1L
  private var random = 1L

  private var callCountdownSamples = 0.0
  private var callActive = false
  private var pulsesRemaining = 0
  private var hasCry = false
  private var inCry = false
  private var callPan = 0.0
  private var callDistance = 0.0
  private var callCutoffPole = 0.0
  private var callBase = 0.0
  private var pulseIndex = 0

  private var syllableCountdownSamples = 0.0
  private var syllableActive = false
  private var syllableAgeSamples = 0.0
  private var syllablePitch0 = 0.0
  private var syllableBend = 0.0
  private var syllableLengthSeconds = 0.0
  private var syllableTremoloRate = 0.0
  private var syllableTremoloDepth = 0.0
  private var syllableBreathiness = 0.0
  private var syllablePhase = 0.0

  private var breathHp = 0.0
  private var breathLp = 0.0
  private var kBreathHp = 0.0
  private var kBreathLp = 0.0
  private var lowpassOne = 0.0
  private var lowpassTwo = 0.0

  fun reset(seed: Long, sampleRate: Double) {
    this.seed = seed
    rate = sampleRate
    random = (seed xor 0x477566656c6c73L).let { if (it == 0L) 1L else it }
    callCountdownSamples = unit() * rate * 20.0
    callActive = false
    pulsesRemaining = 0; hasCry = false; inCry = false
    callPan = 0.0; callDistance = 0.0; callCutoffPole = 0.0; callBase = 0.0; pulseIndex = 0
    syllableCountdownSamples = 0.0; syllableActive = false; syllableAgeSamples = 0.0
    syllablePitch0 = 0.0; syllableBend = 0.0; syllableLengthSeconds = 0.0
    syllableTremoloRate = 0.0; syllableTremoloDepth = 0.0; syllableBreathiness = 0.0; syllablePhase = 0.0
    breathHp = 0.0; breathLp = 0.0; kBreathHp = 0.0; kBreathLp = 0.0; lowpassOne = 0.0; lowpassTwo = 0.0
    left = 0.0; right = 0.0
  }

  private fun pole(hz: Double): Double = 1.0 - exp(-2.0 * PI * hz / rate)

  private fun unit(): Double {
    random = random xor (random shl 13)
    random = random xor (random ushr 7)
    random = random xor (random shl 17)
    return (random ushr 11).toDouble() / 9007199254740992.0
  }

  private fun gauss(): Double {
    val u1 = max(1e-12, unit())
    val u2 = unit()
    return sqrt(-2.0 * ln(u1)) * cos(2.0 * PI * u2)
  }

  private fun beginCall() {
    callActive = true
    pulsesRemaining = PULSES_MIN + (unit() * (PULSES_RANGE + 1)).toInt()
    hasCry = unit() < CRY_CHANCE
    inCry = false
    pulseIndex = 0
    callBase = PULSE_LOW_HZ + unit() * (PULSE_HIGH_HZ - PULSE_LOW_HZ)
    callPan = unit() * 2.0 - 1.0
    callDistance = NEAR_DISTANCE + unit() * (FAR_DISTANCE - NEAR_DISTANCE)
    callCutoffPole = pole(NEAR_CUTOFF_HZ - callDistance * DISTANCE_CUTOFF_RANGE_HZ)
    syllableCountdownSamples = 0.0
  }

  private fun beginSyllable(cry: Boolean) {
    if (cry) {
      syllablePitch0 = callBase * (CRY_PITCH_LOW + unit() * CRY_PITCH_RANGE)
      syllableLengthSeconds = CRY_LENGTH_LOW_SECONDS + unit() * CRY_LENGTH_RANGE_SECONDS
      syllableBend = CRY_BEND_LOW + unit() * CRY_BEND_RANGE
      syllableTremoloRate = CRY_TREMOLO_RATE_LOW + unit() * CRY_TREMOLO_RATE_RANGE
      syllableTremoloDepth = CRY_TREMOLO_DEPTH_LOW + unit() * CRY_TREMOLO_DEPTH_RANGE
      syllableBreathiness = CRY_BREATH_LOW + unit() * CRY_BREATH_RANGE
    } else {
      syllablePitch0 = callBase * (1.0 - PULSE_STEP_DOWN * pulseIndex) * (1.0 + 0.05 * gauss())
      syllableLengthSeconds = PULSE_LENGTH_LOW_SECONDS + unit() * PULSE_LENGTH_RANGE_SECONDS
      syllableBend = PULSE_BEND_LOW + unit() * PULSE_BEND_RANGE
      syllableTremoloRate = PULSE_TREMOLO_RATE_LOW + unit() * PULSE_TREMOLO_RATE_RANGE
      syllableTremoloDepth = PULSE_TREMOLO_DEPTH_LOW + unit() * PULSE_TREMOLO_DEPTH_RANGE
      syllableBreathiness = PULSE_BREATH_LOW + unit() * PULSE_BREATH_RANGE
      pulseIndex += 1
      pulsesRemaining -= 1
    }
    kBreathHp = pole(syllablePitch0 * BREATH_LOW_RATIO)
    kBreathLp = pole(syllablePitch0 * BREATH_HIGH_RATIO)
    syllableActive = true
    syllableAgeSamples = 0.0
    syllablePhase = 0.0
    inCry = cry
  }

  fun render(sampleRate: Double, intensity: Double, density: Double, salience: WorldSalienceScheduler) {
    if (rate != sampleRate) reset(seed, sampleRate)

    if (!callActive) {
      callCountdownSamples -= 1.0
      if (callCountdownSamples <= 0.0) {
        if (salience.reserve(salience = 0.3, durationSeconds = 3.0, recoverySeconds = 2.0)) {
          beginCall()
        } else {
          callCountdownSamples = rate * 4.0
        }
      }
    }

    if (callActive && !syllableActive) {
      syllableCountdownSamples -= 1.0
      if (syllableCountdownSamples <= 0.0) {
        if (pulsesRemaining > 0) {
          beginSyllable(cry = false)
          syllableCountdownSamples = (PULSE_GAP_LOW_SECONDS + unit() * PULSE_GAP_RANGE_SECONDS) * rate
        } else if (hasCry && !inCry) {
          beginSyllable(cry = true)
        } else {
          callActive = false
          val gap = (BASE_GAP_LOW_SECONDS + unit() * BASE_GAP_RANGE_SECONDS) *
            (1.4 - 0.5 * intensity.coerceIn(0.0, 1.0)) / density.coerceIn(0.2, 1.0)
          callCountdownSamples = gap * rate
        }
      }
    }

    if (syllableActive) {
      val t = syllableAgeSamples / rate
      if (t >= syllableLengthSeconds) {
        syllableActive = false
        // Ending the call (and computing its gap to the next one) happens only in the scheduling block above, on
        // the next render pass: with no pulses left and inCry already true, "hasCry && !inCry" is false there too,
        // so it falls to the same branch whether this was the last pulse or the cry. Setting callActive here
        // instead would skip that gap entirely and leave the next call paced only by the salience recovery.
      } else {
        val contour = syllablePitch0 * (1.0 + syllableBend * (t / syllableLengthSeconds))
        syllablePhase = (syllablePhase + 2.0 * PI * contour / rate) % (2.0 * PI)
        var tone = sin(syllablePhase) + 0.65 * sin(2.0 * syllablePhase) + 0.5 * sin(3.0 * syllablePhase) +
          0.35 * sin(4.0 * syllablePhase) + 0.22 * sin(5.0 * syllablePhase)
        tone = tanh(tone * 1.5) / tanh(1.5)
        val tremolo = 1.0 - syllableTremoloDepth * (0.5 - 0.5 * cos(2.0 * PI * syllableTremoloRate * t))
        val breathWhite = unit() * 2.0 - 1.0
        breathHp += kBreathHp * (breathWhite - breathHp)
        breathLp += kBreathLp * ((breathWhite - breathHp) - breathLp)
        val envelope = min(1.0, t / ATTACK_SECONDS) * exp(-max(0.0, t - ATTACK_SECONDS) / (syllableLengthSeconds * DECAY_FRACTION))
        val voice = (tone * tremolo * (1.0 - syllableBreathiness * 0.35) + breathLp * syllableBreathiness) * envelope
        lowpassOne += callCutoffPole * (voice - lowpassOne)
        lowpassTwo += callCutoffPole * (lowpassOne - lowpassTwo)
        val level = (0.3 + 0.5 * (1.0 - callDistance)) * LEVEL_GAIN
        val angle = (callPan + 1.0) * PI / 4.0
        left = lowpassTwo * cos(angle) * sqrt(2.0) * level
        right = lowpassTwo * sin(angle) * sqrt(2.0) * level
        syllableAgeSamples += 1.0
      }
    } else {
      left = 0.0
      right = 0.0
    }
  }
}
