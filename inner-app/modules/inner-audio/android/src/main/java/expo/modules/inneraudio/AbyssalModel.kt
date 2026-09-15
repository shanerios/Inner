package expo.modules.inneraudio

import kotlin.math.*

/** Enclosed deep-water world: pressure, hydrophone motion, glass, and sparse life. */
internal class AbyssalModel {
  var left = 0.0
    private set
  var right = 0.0
    private set

  private var random = 1L
  private var rate = 48_000.0
  private var pressurePhase = 0.0
  private var pressureUpperPhase = 0.0
  private var pressureNoise = 0.0
  private var hydroMid = 0.0
  private var hydroLeft = 0.0
  private var hydroRight = 0.0
  private val glassPhases = DoubleArray(4)
  private val glassFrequencies = doubleArrayOf(146.8, 233.1, 379.9, 612.4)
  private val glassWeights = doubleArrayOf(0.014, 0.009, 0.005, 0.0025)

  private var creatureCountdown = rate * 14.0
  private var creatureActive = false
  private var creatureAge = 0.0
  private var creatureDuration = 0.0
  private var creaturePhase = 0.0
  private var creatureStartHz = 94.0
  private var creatureEndHz = 58.0
  private var creaturePan = 0.0
  private var creatureLevel = 0.0
  private var creatureLeft = 0.0
  private var creatureRight = 0.0

  private var dropCountdown = rate * 5.5
  private var dropAge = 0.0
  private var dropDuration = 0.0
  private var dropPhase = 0.0
  private var dropFrequency = 0.0
  private var dropPan = 0.0
  private var dropLevel = 0.0
  private var dropLeft = 0.0
  private var dropRight = 0.0
  private val dropDelay = DoubleArray(48_000)
  private var dropDelayIndex = 0

  fun reset(seed: Long, sampleRate: Double) {
    random = (seed xor 0xbb67ae85L).let { if (it == 0L) 1L else it }
    rate = sampleRate
    pressurePhase = 0.0; pressureUpperPhase = 0.0
    pressureNoise = 0.0; hydroMid = 0.0; hydroLeft = 0.0; hydroRight = 0.0
    glassPhases.fill(0.0)
    creatureCountdown = rate * 14.0; creatureActive = false; creatureAge = 0.0
    creatureDuration = 0.0; creaturePhase = 0.0; creaturePan = 0.0; creatureLevel = 0.0
    creatureLeft = 0.0; creatureRight = 0.0
    dropCountdown = rate * 5.5; dropAge = 0.0; dropDuration = 0.0
    dropPhase = 0.0; dropFrequency = 0.0; dropPan = 0.0; dropLevel = 0.0
    dropLeft = 0.0; dropRight = 0.0
    dropDelay.fill(0.0); dropDelayIndex = 0
    left = 0.0; right = 0.0
  }

  private fun unit(): Double {
    random = random xor (random shl 13)
    random = random xor (random ushr 7)
    random = random xor (random shl 17)
    return (random and 0x00ff_ffffL).toDouble() / 0x00ff_ffffL
  }

  private fun white(): Double = unit() * 2.0 - 1.0
  private fun smooth(value: Double): Double {
    val x = value.coerceIn(0.0, 1.0)
    return x * x * (3.0 - 2.0 * x)
  }

  private fun nextCreature(intensity: Double, salience: WorldSalienceScheduler) {
    if (!creatureActive) {
      creatureCountdown -= 1.0
      if (creatureCountdown <= 0.0) {
        if (salience.reserve(salience = 0.58, durationSeconds = 12.0, recoverySeconds = 5.0)) {
          creatureActive = true
          creatureAge = 0.0
          creatureDuration = rate * (8.5 + unit() * 3.5)
          creaturePhase = unit() * PI * 2.0
          creatureStartHz = 88.0 + unit() * 24.0
          creatureEndHz = 48.0 + unit() * 15.0
          creaturePan = (unit() * 2.0 - 1.0) * 0.48
          creatureLevel = (0.09 + unit() * 0.035) * (0.78 + intensity * 0.22)
          creatureCountdown = rate * (42.0 + unit() * 58.0)
        } else {
          creatureCountdown = rate * (3.0 + unit() * 3.0)
        }
      }
    }
    if (!creatureActive || creatureDuration <= 0.0) {
      creatureLeft = 0.0
      creatureRight = 0.0
      return
    }
    val progress = (creatureAge / creatureDuration).coerceIn(0.0, 1.0)
    val attack = smooth(creatureAge / max(1.0, rate * 2.4))
    val release = 1.0 - smooth((progress - 0.62) / 0.38)
    val bend = smooth(progress)
    val frequency = (creatureStartHz + (creatureEndHz - creatureStartHz) * bend) *
      (1.0 + sin(progress * PI * 9.0) * 0.006)
    val voice = (sin(creaturePhase) + sin(creaturePhase * 2.0) * 0.23 + sin(creaturePhase * 3.0) * 0.07) *
      attack * release * creatureLevel
    creaturePhase = (creaturePhase + PI * 2.0 * frequency / rate) % (PI * 2.0)
    creatureAge += 1.0
    if (creatureAge >= creatureDuration) creatureActive = false
    val travel = creaturePan + sin(progress * PI) * 0.12 * if (creaturePan < 0) 1.0 else -1.0
    creatureLeft = voice * (1.0 - travel) * 0.68
    creatureRight = voice * (1.0 + travel) * 0.68
  }

  private fun nextCondensation(intensity: Double, salience: WorldSalienceScheduler) {
    if (dropAge >= dropDuration) {
      dropCountdown -= 1.0
      if (dropCountdown <= 0.0) {
        if (salience.reserve(salience = 0.22, durationSeconds = 1.4, recoverySeconds = 1.5)) {
          dropAge = 0.0
          dropDuration = rate * (0.16 + unit() * 0.12)
          dropPhase = 0.0
          dropFrequency = 620.0 + unit() * 820.0
          dropPan = (unit() * 2.0 - 1.0) * 0.6
          dropLevel = (0.018 + unit() * 0.015) * (0.75 + intensity * 0.25)
          dropCountdown = rate * (8.0 + unit() * 12.0)
        } else {
          dropCountdown = rate * (2.0 + unit() * 2.0)
        }
      }
    }
    var dryLeft = 0.0
    var dryRight = 0.0
    if (dropAge < dropDuration && dropDuration > 0.0) {
      val progress = dropAge / dropDuration
      val attack = smooth(dropAge / max(1.0, rate * 0.006))
      val decay = (1.0 - progress).pow(3.0)
      val frequency = dropFrequency * (1.0 - progress * 0.55)
      val tone = (sin(dropPhase) + sin(dropPhase * 2.07) * 0.2) * attack * decay * dropLevel
      dropPhase = (dropPhase + PI * 2.0 * frequency / rate) % (PI * 2.0)
      dropAge += 1.0
      dryLeft = tone * (1.0 - dropPan) * 0.58
      dryRight = tone * (1.0 + dropPan) * 0.58
    }
    val size = dropDelay.size
    val near = dropDelay[(dropDelayIndex - (rate * 0.19).toInt().coerceIn(1, size - 1) + size) % size]
    val far = dropDelay[(dropDelayIndex - (rate * 0.43).toInt().coerceIn(1, size - 1) + size) % size]
    dropDelay[dropDelayIndex] = (dryLeft + dryRight) * 0.5 + (near * 0.26 + far * 0.18) * 0.35
    dropDelayIndex = (dropDelayIndex + 1) % size
    dropLeft = dryLeft + near * 0.18 + far * 0.1
    dropRight = dryRight + near * 0.12 + far * 0.16
  }

  fun render(sampleRate: Double, intensity: Double, elapsedSeconds: Double, salience: WorldSalienceScheduler) {
    if (rate != sampleRate) reset(random, sampleRate)
    val tau = PI * 2.0
    val shared = white()
    pressureNoise += (shared - pressureNoise) * (0.00055 + intensity * 0.00035)
    hydroMid += (shared - hydroMid) * (0.004 + intensity * 0.002)
    hydroLeft += (white() - hydroLeft) * 0.0028
    hydroRight += (white() - hydroRight) * 0.0028

    val pressureBreath = 0.72 + 0.28 * (0.5 - 0.5 * cos(elapsedSeconds * tau / 27.0))
    val pressure = (sin(pressurePhase) * 0.14 + sin(pressureUpperPhase) * 0.045 + pressureNoise * 1.9) *
      pressureBreath * (0.82 + intensity * 0.28)
    pressurePhase = (pressurePhase + tau * (39.0 + intensity * 4.0) / rate) % tau
    pressureUpperPhase = (pressureUpperPhase + tau * (78.0 + intensity * 8.0) / rate) % tau

    val drift = sin(elapsedSeconds * tau / 41.0 + sin(elapsedSeconds / 23.0) * 0.5) * 0.22
    val hydroBody = (hydroMid - pressureNoise * 0.6) * (0.45 + intensity * 0.35)
    val waterLeft = (hydroBody + hydroLeft * 0.5) * (1.0 - drift)
    val waterRight = (hydroBody + hydroRight * 0.5) * (1.0 + drift)

    val flex = (0.5 - 0.5 * cos(elapsedSeconds * tau / 53.0)).pow(2.0)
    var glassLeft = 0.0
    var glassRight = 0.0
    for (index in glassPhases.indices) {
      val value = sin(glassPhases[index]) * glassWeights[index] * (0.28 + flex * 0.72)
      val spread = if (index % 2 == 0) -0.22 else 0.22
      glassLeft += value * (1.0 - spread)
      glassRight += value * (1.0 + spread)
      val bend = 1.0 + sin(elapsedSeconds / (17.0 + index * 4.0) + index) * 0.0015
      glassPhases[index] = (glassPhases[index] + tau * glassFrequencies[index] * bend / rate) % tau
    }

    nextCreature(intensity, salience)
    nextCondensation(intensity, salience)
    left = pressure + waterLeft + glassLeft + creatureLeft + dropLeft
    right = pressure + waterRight + glassRight + creatureRight + dropRight
  }
}
