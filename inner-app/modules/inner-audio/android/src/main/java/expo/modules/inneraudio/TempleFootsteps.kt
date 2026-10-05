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

/**
 * Someone passing by, far off, on the stone of the Temple: a short walking sequence of five to nine steps, each a
 * grainy drag/scuff -- sandpaper, not a knock -- receding step by step as the sequence goes, so it reads as walking
 * away rather than holding one fixed distance. Twenty percent of nights stay empty, sixty percent hear one passage,
 * and twenty percent hear two. Appearances are limited to the opening [ELIGIBLE_UNTIL_SECONDS] of the journey --
 * once deeper sleep has settled in,
 * nobody else is still moving around. Feeds the Temple's own shared room (templeSpaceDelay in the engine), so it
 * carries the same reflections as the bowl and the chant rather than its own separate reverb. The Swift engine
 * mirrors this file.
 */
internal class TempleFootsteps {
  var left = 0.0
    private set
  var right = 0.0
    private set

  companion object {
    const val ELIGIBLE_UNTIL_SECONDS = 2400.0
    const val MIN_STEPS = 5
    const val STEP_RANGE = 4
    const val STEP_TEMPO_SECONDS = 0.56
    const val TEMPO_JITTER = 0.12
    /** The drag's swell: rises and falls back to nothing over this long. */
    const val STEP_SWELL_SECONDS = 0.07
    const val STEP_TOTAL_SECONDS = 0.105
    const val GRAIN_RATE_PER_SECOND = 460.0
    const val GRAIN_DECAY_SECONDS = 0.0025
    /** The grain band: high-passed then low-passed, so what's left is the grit of the drag, no pitched ring. */
    const val HIGHPASS_HZ = 2500.0
    const val LOWPASS_HZ = 8000.0
    const val THUD_LOWPASS_HZ = 260.0
    const val THUD_DECAY_SECONDS = 0.016
    const val THUD_LEVEL = 0.22
    /** A sequence's first step sits here; its last step has receded to here. */
    const val NEAR_DISTANCE = 0.72
    const val FAR_DISTANCE = 0.98
    const val DISTANCE_CUTOFF_NEAR_HZ = 6500.0
    const val DISTANCE_CUTOFF_RANGE_HZ = 3600.0
    /** Level-checked by ear through the real engine, then trimmed 4.5 dB and a further 4 dB after the echo and
     * the level together read strong against the Temple bed. */
    const val LEVEL_GAIN = 1.0918
  }

  private var rate = 48_000.0
  private var seed = 1L
  private var random = 1L

  // night-level scheduling: when zero, one, or two appearances may begin
  private val appearanceAtSeconds = DoubleArray(2)
  private var appearancesTotal = 0
  private var appearancesUsed = 0

  // sequence-level state
  private var sequenceActive = false
  private var stepsRemainingInSequence = 0
  private var totalStepsInSequence = 0
  private var stepIndexInSequence = 0
  private var stepCountdownSamples = 0.0
  private var sequenceStartPan = 0.0
  private var sequenceEndPan = 0.0

  // the one step currently sounding (steps never overlap -- a single walker, not a crowd)
  private var stepActive = false
  private var stepAgeSamples = 0.0
  private var stepPan = 0.0
  private var stepDistance = 0.0
  private var stepCutoffPole = 0.0

  // per-sample DSP state, persistent across steps
  private var hp = 0.0
  private var lp = 0.0
  private var grainLevel = 0.0
  private var thudAmplitude = 0.0
  private var thudLp = 0.0
  private var lowpassOne = 0.0
  private var lowpassTwo = 0.0

  private var kHp = 0.0
  private var kLp = 0.0
  private var kThudLp = 0.0
  private var grainDecay = 0.0
  private var thudDecay = 0.0

  fun reset(seed: Long, sampleRate: Double) {
    this.seed = seed
    rate = sampleRate
    random = (seed xor 0x466f6f7473746570L).let { if (it == 0L) 1L else it }
    val appearanceRoll = unit()
    appearancesTotal = if (appearanceRoll < 0.2) 0 else if (appearanceRoll < 0.8) 1 else 2
    appearancesUsed = 0
    appearanceAtSeconds[0] = 60.0 + unit() * (ELIGIBLE_UNTIL_SECONDS * 0.5 - 120.0)
    appearanceAtSeconds[1] = ELIGIBLE_UNTIL_SECONDS * 0.5 + unit() * (ELIGIBLE_UNTIL_SECONDS * 0.5 - 60.0)
    sequenceActive = false
    stepsRemainingInSequence = 0; totalStepsInSequence = 0; stepIndexInSequence = 0
    stepCountdownSamples = 0.0; sequenceStartPan = 0.0; sequenceEndPan = 0.0
    stepActive = false; stepAgeSamples = 0.0; stepPan = 0.0; stepDistance = 0.0; stepCutoffPole = 0.0
    hp = 0.0; lp = 0.0; grainLevel = 0.0; thudAmplitude = 0.0; thudLp = 0.0; lowpassOne = 0.0; lowpassTwo = 0.0
    kHp = pole(HIGHPASS_HZ); kLp = pole(LOWPASS_HZ); kThudLp = pole(THUD_LOWPASS_HZ)
    grainDecay = exp(-1.0 / (GRAIN_DECAY_SECONDS * rate))
    thudDecay = exp(-1.0 / (THUD_DECAY_SECONDS * rate))
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

  private fun beginSequence() {
    sequenceActive = true
    totalStepsInSequence = MIN_STEPS + (unit() * (STEP_RANGE + 1)).toInt()
    stepsRemainingInSequence = totalStepsInSequence
    stepIndexInSequence = 0
    val side = if (unit() < 0.5) -1.0 else 1.0
    sequenceStartPan = side * (0.25 + unit() * 0.4)
    sequenceEndPan = -sequenceStartPan * (0.55 + unit() * 0.3)
    stepCountdownSamples = 0.0
  }

  private fun beginStep() {
    val fraction = if (totalStepsInSequence <= 1) 0.0 else stepIndexInSequence.toDouble() / (totalStepsInSequence - 1)
    stepPan = sequenceStartPan + (sequenceEndPan - sequenceStartPan) * fraction
    stepDistance = NEAR_DISTANCE + (FAR_DISTANCE - NEAR_DISTANCE) * fraction
    stepCutoffPole = pole(DISTANCE_CUTOFF_NEAR_HZ - stepDistance * DISTANCE_CUTOFF_RANGE_HZ)
    stepActive = true
    stepAgeSamples = 0.0
    thudAmplitude = 1.0
    stepIndexInSequence += 1
    stepsRemainingInSequence -= 1
    stepCountdownSamples = (STEP_TEMPO_SECONDS * rate) * (1.0 + TEMPO_JITTER * (unit() * 2.0 - 1.0))
  }

  fun render(sampleRate: Double, elapsedSeconds: Double, salience: WorldSalienceScheduler) {
    if (rate != sampleRate) reset(seed, sampleRate)

    if (!sequenceActive && appearancesUsed < appearancesTotal) {
      if (elapsedSeconds > ELIGIBLE_UNTIL_SECONDS) {
        appearancesUsed = appearancesTotal
      } else if (elapsedSeconds >= appearanceAtSeconds[appearancesUsed]) {
        if (salience.reserve(salience = 0.3, durationSeconds = 7.0, recoverySeconds = 3.0)) {
          beginSequence()
          appearancesUsed += 1
        } else {
          appearanceAtSeconds[appearancesUsed] += 4.0
        }
      }
    }

    if (sequenceActive) {
      stepCountdownSamples -= 1.0
      if (!stepActive && stepCountdownSamples <= 0.0) {
        if (stepsRemainingInSequence > 0) beginStep() else sequenceActive = false
      }
    }

    if (stepActive) {
      val white = unit() * 2.0 - 1.0
      hp += kHp * (white - hp)
      lp += kLp * ((white - hp) - lp)
      val grainRate = GRAIN_RATE_PER_SECOND / rate
      if (unit() < grainRate) grainLevel += exp(0.6 * gauss())
      grainLevel *= grainDecay
      val ageSeconds = stepAgeSamples / rate
      val shape = sin(PI * min(1.0, ageSeconds / STEP_SWELL_SECONDS)).pow(0.8)
      val drag = lp * min(grainLevel, 3.0) * shape

      val thudWhite = unit() * 2.0 - 1.0
      thudLp += kThudLp * (thudWhite - thudLp)
      val thud = thudLp * thudAmplitude * THUD_LEVEL
      thudAmplitude *= thudDecay

      lowpassOne += stepCutoffPole * ((drag + thud) - lowpassOne)
      lowpassTwo += stepCutoffPole * (lowpassOne - lowpassTwo)

      val level = (0.35 + 0.65 * (1.0 - stepDistance)) * LEVEL_GAIN
      val angle = (stepPan + 1.0) * PI / 4.0
      left = lowpassTwo * cos(angle) * sqrt(2.0) * level
      right = lowpassTwo * sin(angle) * sqrt(2.0) * level

      stepAgeSamples += 1.0
      if (stepAgeSamples >= STEP_TOTAL_SECONDS * rate) stepActive = false
    } else {
      left = 0.0
      right = 0.0
    }
  }
}
