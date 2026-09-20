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
  private var phase = 0.0
  private var whistlePhase = 0.0
  private var answerPhase = 0.0
  private var airFast = 0.0
  private var airSlow = 0.0
  private var echo = DoubleArray(24_000)
  private var echoIndex = 0
  private var echoWet = 0.0

  fun reset(seed: Long, sampleRate: Double) {
    rate = sampleRate
    random = (seed xor 0x466f72657374L).let { if (it == 0L) 1L else it }
    countdown = rate * 14.0; age = -1.0; baseHz = 85.0; pan = 0.0
    phase = 0.0; whistlePhase = 0.0; answerPhase = 0.0; airFast = 0.0; airSlow = 0.0
    echo = DoubleArray(max(2, (rate * 0.5).toInt())); echoIndex = 0; echoWet = 0.0
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
        if (presence > 0.0001 && salience.reserve(salience = 0.5, durationSeconds = 11.0, recoverySeconds = 4.0)) {
          age = 0.0
          baseHz = 75.0 + unit() * 22.5
          pan = (unit() * 2.0 - 1.0) * 0.28
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
      val release = ((10.5 - seconds) / 5.0).coerceIn(0.0, 1.0)
      val rise = attack * attack * (3.0 - 2.0 * attack)
      val fall = release * release * (3.0 - 2.0 * release)
      val sway = 1.0 + 0.003 * sin(seconds * PI * 2.0 / 4.7)
      phase = (phase + 2.0 * PI * baseHz * sway / rate) % (2.0 * PI)
      val wood = sin(phase) * 0.52 + sin(phase * 3.0) * 0.19 + sin(phase * 5.0) * 0.03
      // The high hollow resonance rises with the gust, then recedes. Its independent phase keeps it
      // airy rather than turning the whole low trunk voice into a pitch sweep.
      val whistleArc = sin(PI * (seconds / 10.5).coerceIn(0.0, 1.0))
      val whistleHz = baseHz * 5.0 * (0.93 + 0.08 * whistleArc)
      whistlePhase = (whistlePhase + 2.0 * PI * whistleHz / rate) % (2.0 * PI)
      val whistle = sin(whistlePhase) * 0.18 * whistleArc * whistleArc
      val white = unit() * 2.0 - 1.0
      airFast += 0.06 * (white - airFast)
      airSlow += 0.008 * (white - airSlow)
      val breath = (airFast - airSlow) * 0.9
      val level = 0.34 * presence.coerceIn(0.0, 1.5)
      main = (wood * rise + breath * attack + whistle) * fall * level

      if (seconds >= 6.0 && seconds <= 10.5) {
        val responseProgress = (seconds - 6.0) / 4.5
        val responseEnvelope = sin(PI * responseProgress).pow(2.0)
        answerPhase = (answerPhase + 2.0 * PI * baseHz * 0.75 / rate) % (2.0 * PI)
        val distantWood = sin(answerPhase) * 0.6 + sin(answerPhase * 3.0) * 0.2
        answer = distantWood * responseEnvelope * level * 0.32
      }
      age += 1.0
      if (seconds >= 10.5) age = -1.0
    }

    val echoSize = echo.size
    val first = echo[(echoIndex - (rate * 0.21).toInt().coerceIn(1, echoSize - 1) + echoSize) % echoSize]
    val second = echo[(echoIndex - (rate * 0.43).toInt().coerceIn(1, echoSize - 1) + echoSize) % echoSize]
    echoWet += ((first + second) * 0.5 - echoWet) * 0.02
    echo[echoIndex] = main + answer + echoWet * 0.26
    echoIndex = (echoIndex + 1) % echoSize
    left = main * (1.0 - pan) + answer * (1.0 + pan * 1.2) + echoWet * 0.28
    right = main * (1.0 + pan) + answer * (1.0 - pan * 1.2) + echoWet * 0.28
  }
}
