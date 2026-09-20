package expo.modules.inneraudio

import kotlin.math.*

/** A low ember glow and occasional short, dark resonance from settling wood. */
internal class FireEmberModel {
  var left = 0.0
    private set
  var right = 0.0
    private set

  private var rate = 48_000.0
  private var random = 1L
  private var countdown = 0.0
  private var age = -1.0
  private var elapsed = 0.0
  private var emberPhase = 0.0
  private var woodPhase = 0.0
  private var woodHz = 110.0
  private var woodPan = 0.0
  private var woodAir = 0.0

  fun reset(seed: Long, sampleRate: Double) {
    rate = sampleRate
    random = (seed xor 0x46697265456d6265L).let { if (it == 0L) 1L else it }
    countdown = rate * 12.0; age = -1.0; elapsed = 0.0
    emberPhase = 0.0; woodPhase = 0.0; woodHz = 110.0; woodPan = 0.0; woodAir = 0.0
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
    val safePresence = presence.coerceIn(0.0, 1.5)
    val glow = 0.5 + 0.5 * sin(2.0 * PI * elapsed / 13.1)
    val emberHz = 73.0 + 1.8 * sin(2.0 * PI * elapsed / 29.0)
    elapsed += 1.0 / rate
    emberPhase = (emberPhase + 2.0 * PI * emberHz / rate) % (2.0 * PI)
    val ember = (sin(emberPhase) * 0.78 + sin(emberPhase * 2.0) * 0.22) *
      (0.35 + 0.65 * glow) * 0.065 * safePresence

    if (age < 0.0) {
      countdown -= 1.0
      if (countdown <= 0.0) {
        if (safePresence > 0.0001 && salience.reserve(salience = 0.46, durationSeconds = 3.4, recoverySeconds = 3.0)) {
          age = 0.0
          woodHz = 104.0 + unit() * 16.0
          woodPan = (unit() * 2.0 - 1.0) * 0.3
          val immersive = ((variety - 0.6) / 0.4).coerceIn(0.0, 1.0)
          countdown = rate * (70.0 - 25.0 * immersive + unit() * (40.0 - 15.0 * immersive)) /
            density.coerceIn(0.2, 1.0)
        } else {
          countdown = rate * 3.0
        }
      }
    }

    var wood = 0.0
    if (age >= 0.0) {
      val seconds = age / rate
      val attack = (seconds / 0.045).coerceIn(0.0, 1.0)
      val release = (1.0 - seconds / 3.4).coerceIn(0.0, 1.0).pow(2.0)
      val bend = 1.0 + 0.14 * exp(-seconds * 3.2)
      woodPhase = (woodPhase + 2.0 * PI * woodHz * bend / rate) % (2.0 * PI)
      val air = unit() * 2.0 - 1.0
      woodAir += 0.045 * (air - woodAir)
      wood = (sin(woodPhase) * 0.72 + sin(woodPhase * 2.0) * 0.23 + woodAir * 0.28) *
        attack * release * 0.29 * safePresence
      age += 1.0
      if (seconds >= 3.4) age = -1.0
    }

    left = ember + wood * (1.0 - woodPan)
    right = ember + wood * (1.0 + woodPan)
  }
}
