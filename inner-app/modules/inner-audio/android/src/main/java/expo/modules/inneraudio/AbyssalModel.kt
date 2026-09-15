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
  private val glassWeights = doubleArrayOf(0.019, 0.0125, 0.007, 0.0035)
  private val chamberLeft = DoubleArray(48_000)
  private val chamberRight = DoubleArray(48_000)
  private var chamberIndex = 0

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
  private var responseCountdown = -1.0
  private var responseActive = false
  private var responseAge = 0.0
  private var responseDuration = 0.0
  private var responsePhase = 0.0
  private var responseStartHz = 0.0
  private var responseEndHz = 0.0
  private var responsePan = 0.0
  private var responseLevel = 0.0

  private var bubbleCountdown = rate * 9.5
  private var bubbleActive = false
  private var bubbleAge = 0.0
  private var bubbleDuration = 0.0
  private var bubblePhase = 0.0
  private var bubbleBaseHz = 0.0
  private var bubbleCount = 0
  private var bubblePanStart = 0.0
  private var bubblePanEnd = 0.0
  private var bubbleLevel = 0.0
  private var bubbleLeft = 0.0
  private var bubbleRight = 0.0

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
    chamberLeft.fill(0.0); chamberRight.fill(0.0); chamberIndex = 0
    creatureCountdown = rate * 14.0; creatureActive = false; creatureAge = 0.0
    creatureDuration = 0.0; creaturePhase = 0.0; creaturePan = 0.0; creatureLevel = 0.0
    creatureLeft = 0.0; creatureRight = 0.0
    responseCountdown = -1.0; responseActive = false; responseAge = 0.0; responseDuration = 0.0
    responsePhase = 0.0; responseStartHz = 0.0; responseEndHz = 0.0; responsePan = 0.0; responseLevel = 0.0
    bubbleCountdown = rate * 9.5; bubbleActive = false; bubbleAge = 0.0; bubbleDuration = 0.0
    bubblePhase = 0.0; bubbleBaseHz = 0.0; bubbleCount = 0; bubblePanStart = 0.0; bubblePanEnd = 0.0
    bubbleLevel = 0.0; bubbleLeft = 0.0; bubbleRight = 0.0
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
        if (salience.reserve(salience = 0.58, durationSeconds = 25.0, recoverySeconds = 5.0)) {
          creatureActive = true
          creatureAge = 0.0
          creatureDuration = rate * (8.5 + unit() * 3.5)
          creaturePhase = unit() * PI * 2.0
          creatureStartHz = 88.0 + unit() * 24.0
          creatureEndHz = 48.0 + unit() * 15.0
          creaturePan = (unit() * 2.0 - 1.0) * 0.48
          val baseCreatureLevel = (0.09 + unit() * 0.035) * (0.78 + intensity * 0.22)
          creatureLevel = baseCreatureLevel * 1.95
          responseCountdown = creatureDuration + rate * (3.5 + unit() * 2.5)
          responseStartHz = 145.0 + unit() * 45.0
          responseEndHz = 92.0 + unit() * 32.0
          responsePan = -creaturePan * 0.9
          responseLevel = baseCreatureLevel * (0.4 + unit() * 0.12) * 1.75
          creatureCountdown = rate * (42.0 + unit() * 58.0)
        } else {
          creatureCountdown = rate * (3.0 + unit() * 3.0)
        }
      }
    }
    if (responseCountdown > 0.0 && !responseActive) {
      responseCountdown -= 1.0
      if (responseCountdown <= 0.0) {
        responseActive = true
        responseAge = 0.0
        responseDuration = rate * (5.0 + unit() * 2.0)
        responsePhase = unit() * PI * 2.0
      }
    }
    var answerLeft = 0.0
    var answerRight = 0.0
    if (responseActive && responseDuration > 0.0) {
      val progress = (responseAge / responseDuration).coerceIn(0.0, 1.0)
      val envelope = smooth(responseAge / max(1.0, rate * 1.6)) * (1.0 - smooth((progress - 0.58) / 0.42))
      val frequency = responseStartHz + (responseEndHz - responseStartHz) * smooth(progress)
      val voice = (sin(responsePhase) + sin(responsePhase * 1.51) * 0.18 + sin(responsePhase * 2.03) * 0.12) * envelope * responseLevel
      responsePhase = (responsePhase + PI * 2.0 * frequency / rate) % (PI * 2.0)
      responseAge += 1.0
      if (responseAge >= responseDuration) responseActive = false
      answerLeft = voice * (1.0 - responsePan) * 0.64
      answerRight = voice * (1.0 + responsePan) * 0.64
    }
    if (!creatureActive || creatureDuration <= 0.0) {
      creatureLeft = answerLeft
      creatureRight = answerRight
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
    creatureLeft = voice * (1.0 - travel) * 0.68 + answerLeft
    creatureRight = voice * (1.0 + travel) * 0.68 + answerRight
  }

  private fun nextBubbleTrail(intensity: Double, salience: WorldSalienceScheduler) {
    if (!bubbleActive) {
      bubbleCountdown -= 1.0
      if (bubbleCountdown <= 0.0) {
        if (salience.reserve(salience = 0.18, durationSeconds = 3.2, recoverySeconds = 1.5)) {
          bubbleActive = true
          bubbleAge = 0.0
          bubbleDuration = rate * (2.1 + unit() * 1.1)
          bubblePhase = unit() * PI * 2.0
          bubbleBaseHz = 310.0 + unit() * 210.0
          bubbleCount = 5 + (unit() * 4.0).toInt()
          bubblePanStart = (unit() * 2.0 - 1.0) * 0.58
          bubblePanEnd = (unit() * 2.0 - 1.0) * 0.42
          bubbleLevel = (0.026 + unit() * 0.014) * (0.8 + intensity * 0.2)
          bubbleCountdown = rate * (22.0 + unit() * 28.0)
        } else {
          bubbleCountdown = rate * (2.0 + unit() * 2.0)
        }
      }
    }
    if (!bubbleActive || bubbleDuration <= 0.0) {
      bubbleLeft = 0.0; bubbleRight = 0.0
      return
    }
    val progress = (bubbleAge / bubbleDuration).coerceIn(0.0, 1.0)
    val pulsePosition = (progress * bubbleCount).let { it - floor(it) }
    val pulseEnvelope = sin(PI * pulsePosition).coerceAtLeast(0.0).pow(5.0) * (1.0 - smooth((progress - 0.82) / 0.18))
    val frequency = bubbleBaseHz * (1.0 + progress * 1.15)
    val tone = (sin(bubblePhase) + sin(bubblePhase * 1.97) * 0.28) * pulseEnvelope * bubbleLevel
    bubblePhase = (bubblePhase + PI * 2.0 * frequency / rate) % (PI * 2.0)
    bubbleAge += 1.0
    if (bubbleAge >= bubbleDuration) bubbleActive = false
    val pan = bubblePanStart + (bubblePanEnd - bubblePanStart) * smooth(progress)
    bubbleLeft = tone * (1.0 - pan) * 0.62
    bubbleRight = tone * (1.0 + pan) * 0.62
  }

  private fun nextCondensation(intensity: Double, salience: WorldSalienceScheduler) {
    if (dropAge >= dropDuration) {
      dropCountdown -= 1.0
      if (dropCountdown <= 0.0) {
        if (salience.reserve(salience = 0.22, durationSeconds = 1.4, recoverySeconds = 1.5)) {
          dropAge = 0.0
          dropDuration = rate * (0.16 + unit() * 0.12)
          dropPhase = 0.0
          dropFrequency = 480.0 + unit() * 700.0
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
    val near = dropDelay[(dropDelayIndex - (rate * 0.23).toInt().coerceIn(1, size - 1) + size) % size]
    val far = dropDelay[(dropDelayIndex - (rate * 0.57).toInt().coerceIn(1, size - 1) + size) % size]
    dropDelay[dropDelayIndex] = (dryLeft + dryRight) * 0.5 + (near * 0.38 + far * 0.24) * 0.42
    dropDelayIndex = (dropDelayIndex + 1) % size
    dropLeft = dryLeft + near * 0.26 + far * 0.16
    dropRight = dryRight + near * 0.17 + far * 0.24
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
    val pressure = (sin(pressurePhase) * 0.17 + sin(pressureUpperPhase) * 0.055 + pressureNoise * 2.05) *
      pressureBreath * (0.82 + intensity * 0.28)
    pressurePhase = (pressurePhase + tau * (39.0 + intensity * 4.0) / rate) % tau
    pressureUpperPhase = (pressureUpperPhase + tau * (78.0 + intensity * 8.0) / rate) % tau

    val drift = sin(elapsedSeconds * tau / 41.0 + sin(elapsedSeconds / 23.0) * 0.5) * 0.28
    val currentPass = smooth(0.5 - 0.5 * cos(elapsedSeconds * tau / 33.0 + 1.1))
    val currentPan = sin(elapsedSeconds * tau / 24.0 + 0.7) * currentPass * 0.34
    val hydroBody = (hydroMid - pressureNoise * 0.6) * (0.55 + intensity * 0.4) * (0.84 + currentPass * 0.32)
    val waterLeft = (hydroBody + hydroLeft * (0.45 + currentPass * 0.2)) * (1.0 - drift - currentPan)
    val waterRight = (hydroBody + hydroRight * (0.45 + currentPass * 0.2)) * (1.0 + drift + currentPan)

    val flex = (0.5 - 0.5 * cos(elapsedSeconds * tau / 53.0)).pow(2.0)
    var glassLeft = 0.0
    var glassRight = 0.0
    for (index in glassPhases.indices) {
      val value = sin(glassPhases[index]) * glassWeights[index] * (0.38 + flex * 0.62)
      val spread = if (index % 2 == 0) -0.3 else 0.3
      glassLeft += value * (1.0 - spread)
      glassRight += value * (1.0 + spread)
      val bend = 1.0 + sin(elapsedSeconds / (17.0 + index * 4.0) + index) * 0.0015
      glassPhases[index] = (glassPhases[index] + tau * glassFrequencies[index] * bend / rate) % tau
    }

    nextCreature(intensity, salience)
    nextBubbleTrail(intensity, salience)
    nextCondensation(intensity, salience)
    val roomLeft = chamberLeft[(chamberIndex - (rate * 0.37).toInt().coerceIn(1, chamberLeft.size - 1) + chamberLeft.size) % chamberLeft.size]
    val roomRight = chamberRight[(chamberIndex - (rate * 0.61).toInt().coerceIn(1, chamberRight.size - 1) + chamberRight.size) % chamberRight.size]
    val resonantLeft = waterLeft + glassLeft + creatureLeft + bubbleLeft + dropLeft
    val resonantRight = waterRight + glassRight + creatureRight + bubbleRight + dropRight
    chamberLeft[chamberIndex] = resonantLeft + roomRight * 0.2
    chamberRight[chamberIndex] = resonantRight + roomLeft * 0.2
    chamberIndex = (chamberIndex + 1) % chamberLeft.size
    left = pressure + resonantLeft + roomLeft * 0.13
    right = pressure + resonantRight + roomRight * 0.13
  }
}
