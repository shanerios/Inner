package expo.modules.inneraudio

import kotlin.math.*

/** A slow wind-excited hollow trunk and a quieter answer deeper in the canopy. */
internal class ForestCallModel {
  var left = 0.0
    private set
  var right = 0.0
    private set

  private var rate = 48_000.0
  private var random = 1L
  private var countdown = 0.0
  private var age = -1.0
  private var baseHz = 85.0
  private var pan = 0.0
  private var answerPan = 0.0
  private var phase = 0.0
  private var whistlePhase = 0.0
  private var answerPhase = 0.0
  private var airFast = 0.0
  private var airSlow = 0.0
  private var echoLeft = DoubleArray(57_600)
  private var echoRight = DoubleArray(57_600)
  private var echoIndex = 0
  private var echoWetLeft = 0.0
  private var echoWetRight = 0.0

  fun reset(seed: Long, sampleRate: Double) {
    rate = sampleRate
    random = (seed xor 0x466f72657374L).let { if (it == 0L) 1L else it }
    countdown = rate * 14.0; age = -1.0; baseHz = 85.0; pan = 0.0; answerPan = 0.0
    phase = 0.0; whistlePhase = 0.0; answerPhase = 0.0; airFast = 0.0; airSlow = 0.0
    echoLeft = DoubleArray(max(2, (rate * 1.2).toInt()))
    echoRight = DoubleArray(echoLeft.size)
    echoIndex = 0; echoWetLeft = 0.0; echoWetRight = 0.0
    left = 0.0; right = 0.0
  }

  private fun unit(): Double {
    random = random xor (random shl 13)
    random = random xor (random ushr 7)
    random = random xor (random shl 17)
    return (random and 0x00ff_ffffL).toDouble() / 0x00ff_ffffL
  }

  fun render(sampleRate: Double, salience: WorldSalienceScheduler, presence: Double, density: Double, variety: Double) {
    if (rate != sampleRate) reset(random, sampleRate)
    if (age < 0.0) {
      countdown -= 1.0
      if (countdown <= 0.0) {
        if (presence > 0.0001 && salience.reserve(salience = 0.5, durationSeconds = 13.2, recoverySeconds = 4.0)) {
          age = 0.0
          baseHz = 75.0 + unit() * 22.5
          pan = (unit() * 2.0 - 1.0) * 0.28
          answerPan = if (pan < 0.0) 0.52 else -0.52
          countdown = rate * (110.0 + unit() * 70.0) / density.coerceIn(0.2, 1.0) *
            (1.0 - 0.25 * ((variety - 0.6) / 0.4).coerceIn(0.0, 1.0))
        } else {
          countdown = rate * 3.0
        }
      }
    }

    var main = 0.0
    var answer = 0.0
    if (age >= 0.0) {
      val seconds = age / rate
      val attack = (seconds / 2.0).coerceIn(0.0, 1.0)
      val release = ((9.0 - seconds) / 4.5).coerceIn(0.0, 1.0)
      val rise = attack * attack * (3.0 - 2.0 * attack)
      val fall = release * release * (3.0 - 2.0 * release)
      val sway = 1.0 + 0.003 * sin(seconds * PI * 2.0 / 4.7)
      phase = (phase + 2.0 * PI * baseHz * sway / rate) % (2.0 * PI)
      val wood = sin(phase) * 0.52 + sin(phase * 3.0) * 0.19 + sin(phase * 5.0) * 0.03
      // The high hollow resonance rises with the gust, then recedes. Its independent phase keeps it
      // airy rather than turning the whole low trunk voice into a pitch sweep.
      val whistleArc = sin(PI * (seconds / 9.0).coerceIn(0.0, 1.0))
      val whistleHz = baseHz * 5.0 * (0.88 + 0.14 * whistleArc)
      whistlePhase = (whistlePhase + 2.0 * PI * whistleHz / rate) % (2.0 * PI)
      val whistle = sin(whistlePhase) * 0.21 * whistleArc * whistleArc
      val white = unit() * 2.0 - 1.0
      airFast += 0.06 * (white - airFast)
      airSlow += 0.008 * (white - airSlow)
      val breath = (airFast - airSlow) * 1.1
      val level = 0.34 * presence.coerceIn(0.0, 1.5)
      main = (wood * rise + breath * attack + whistle) * fall * level

      if (seconds >= 7.5 && seconds <= 13.2) {
        val responseProgress = (seconds - 7.5) / 5.7
        val responseEnvelope = sin(PI * responseProgress).pow(2.0)
        answerPhase = (answerPhase + 2.0 * PI * baseHz * 1.5 / rate) % (2.0 * PI)
        val distantWood = sin(answerPhase) * 0.6 + sin(answerPhase * 3.0) * 0.2
        answer = (distantWood + breath * 0.28) * responseEnvelope * level * 0.72
      }
      age += 1.0
      if (seconds >= 13.2) age = -1.0
    }

    val dryLeft = main * (1.0 - pan) + answer * (1.0 - answerPan)
    val dryRight = main * (1.0 + pan) + answer * (1.0 + answerPan)
    val echoSize = echoLeft.size
    val firstIndex = (echoIndex - (rate * 0.19).toInt().coerceIn(1, echoSize - 1) + echoSize) % echoSize
    val secondIndex = (echoIndex - (rate * 0.43).toInt().coerceIn(1, echoSize - 1) + echoSize) % echoSize
    val thirdIndex = (echoIndex - (rate * 0.79).toInt().coerceIn(1, echoSize - 1) + echoSize) % echoSize
    val reflectionLeft = echoLeft[firstIndex] * 0.48 + echoLeft[secondIndex] * 0.31 + echoLeft[thirdIndex] * 0.21
    val reflectionRight = echoRight[firstIndex] * 0.48 + echoRight[secondIndex] * 0.31 + echoRight[thirdIndex] * 0.21
    echoWetLeft += (reflectionLeft - echoWetLeft) * 0.012
    echoWetRight += (reflectionRight - echoWetRight) * 0.012
    echoLeft[echoIndex] = dryLeft + echoWetRight * 0.52
    echoRight[echoIndex] = dryRight + echoWetLeft * 0.52
    echoIndex = (echoIndex + 1) % echoSize
    left = dryLeft + echoWetLeft * 0.52
    right = dryRight + echoWetRight * 0.52
  }
}
