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
  // Per-appearance gestures (see WhaleGesture). All idle at variety 0.
  private var gestureSeed = 1L
  private val gesture = WhaleGesture()
  private var callCount = 0L
  private var gestureIndex = 0L
  private var callFarLeft = 0.0
  private var callFarRight = 0.0
  private val companionCountdown = DoubleArray(2)
  private val companionActive = BooleanArray(2)
  private val companionAge = DoubleArray(2)
  private val companionDuration = DoubleArray(2)
  private val companionPhase = DoubleArray(2)
  private val companionStartHz = DoubleArray(2)
  private val companionEndHz = DoubleArray(2)
  private val companionPan = DoubleArray(2)
  private val companionLevel = DoubleArray(2)
  private val companionFar = DoubleArray(2)
  private val companionFarLeft = DoubleArray(2)
  private val companionFarRight = DoubleArray(2)
  private val callEchoLeft = DoubleArray(300_000)
  private val callEchoRight = DoubleArray(300_000)
  private var callEchoIndex = 0
  private var callEchoDampLeft = 0.0
  private var callEchoDampRight = 0.0
  private val farRoom = DoubleArray(48_000)
  private var farRoomIndex = 0
  private var responseCountdown = -1.0
  private var responseLag = 0.0
  private var responseBright = 1.0
  private var responseWaiting = false
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
    gestureSeed = seed xor 0x57484c45L
    gesture.neutral(); callCount = 0L; gestureIndex = 0L
    gestureExtraLeft = 0.0; gestureExtraRight = 0.0; shapedLeft = 0.0; shapedRight = 0.0
    callFarLeft = 0.0; callFarRight = 0.0
    companionCountdown.fill(0.0); companionActive.fill(false); companionAge.fill(0.0); companionDuration.fill(0.0)
    companionPhase.fill(0.0); companionFarLeft.fill(0.0); companionFarRight.fill(0.0)
    callEchoLeft.fill(0.0); callEchoRight.fill(0.0); callEchoIndex = 0; callEchoDampLeft = 0.0; callEchoDampRight = 0.0
    farRoom.fill(0.0); farRoomIndex = 0
    responseBright = 1.0
    responseCountdown = -1.0; responseLag = 0.0; responseWaiting = false; responseActive = false; responseAge = 0.0; responseDuration = 0.0
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

  private fun nextCreature(intensity: Double, salience: WorldSalienceScheduler, presence: Double, density: Double, variety: Double) {
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
          // Sparser identity: longer silences between calls. From variety 0.6 the silences shorten, so a
          // fuller feel hears the whale about a quarter more often (Gentle and Deep are unchanged).
          creatureCountdown = rate * (42.0 + unit() * 58.0) / density * (1.0 - 0.2 * ((variety - 0.6) / 0.4).coerceIn(0.0, 1.0))
          beginGesture(variety)
        } else {
          creatureCountdown = rate * (3.0 + unit() * 3.0)
        }
      }
    }
    if (responseCountdown > 0.0 && !responseActive) {
      responseCountdown -= 1.0
      if (responseCountdown <= 0.0) {
        // The draws happen at the answer's original moment whatever the gesture, so the water's other random
        // details keep to their own schedule; a longer call only delays when the answer is heard.
        responseAge = 0.0
        responseDuration = rate * (5.0 + unit() * 2.0)
        responsePhase = unit() * PI * 2.0
        if (responseLag > 0.0) responseWaiting = true else responseActive = true
      }
    }
    if (responseWaiting) {
      responseLag -= 1.0
      if (responseLag <= 0.0) { responseWaiting = false; responseActive = true }
    }
    var answerLeft = 0.0
    var answerRight = 0.0
    if (responseActive && responseDuration > 0.0) {
      val progress = (responseAge / responseDuration).coerceIn(0.0, 1.0)
      val envelope = smooth(responseAge / max(1.0, rate * 1.6)) * (1.0 - smooth((progress - 0.58) / 0.42))
      val frequency = responseStartHz + (responseEndHz - responseStartHz) * smooth(progress)
      val voice = (sin(responsePhase) + sin(responsePhase * 1.51) * 0.18 * responseBright + sin(responsePhase * 2.03) * 0.12 * responseBright) * envelope * responseLevel
      responsePhase = (responsePhase + PI * 2.0 * frequency / rate) % (PI * 2.0)
      responseAge += 1.0
      if (responseAge >= responseDuration) responseActive = false
      answerLeft = voice * (1.0 - responsePan) * 0.64
      answerRight = voice * (1.0 + responsePan) * 0.64
    }
    var callLeft = 0.0
    var callRight = 0.0
    if (creatureActive && creatureDuration > 0.0) {
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
      callLeft = voice * (1.0 - travel) * 0.68
      callRight = voice * (1.0 + travel) * 0.68
    }
    if (variety <= 0.0) {
      creatureLeft = (callLeft + answerLeft) * presence
      creatureRight = (callRight + answerRight) * presence
      return
    }
    shapeGestures(callLeft, callRight)
    creatureLeft = (shapedLeft + answerLeft + gestureExtraLeft) * presence
    creatureRight = (shapedRight + answerRight + gestureExtraRight) * presence
  }

  private var gestureExtraLeft = 0.0
  private var gestureExtraRight = 0.0
  private var shapedLeft = 0.0
  private var shapedRight = 0.0

  /**
   * Draws this call's gesture and bends the call, its answer and what is around them to it. It only moves
   * things the scheduler has already drawn, and takes its own randomness from the night's seed, so the
   * whale calls at exactly the same moments at any variety.
   */
  private fun beginGesture(variety: Double) {
    responseLag = 0.0
    responseBright = 1.0
    if (variety <= 0.0) { gesture.neutral(); return }
    val index = callCount++
    gestureIndex = index
    gesture.draw(gestureSeed, index, variety)
    val g = gesture
    val oldDuration = creatureDuration
    creatureDuration = oldDuration * g.durationScale
    responseLag = max(0.0, creatureDuration - oldDuration)
    // The next call's countdown only runs while nothing is sounding, so a longer or shorter call would move
    // every later call. Take the difference off it, and the whale calls at the same moments at any variety.
    creatureCountdown -= creatureDuration - oldDuration
    creatureLevel *= g.callLevel
    when (g.pitchMode) {
      WhaleGesture.PITCH_RISING -> {
        // Up from the bottom of its range instead of down from the top.
        val low = creatureEndHz
        creatureEndHz = creatureStartHz * 1.05
        creatureStartHz = low
      }
      WhaleGesture.PITCH_DEEP_FALL -> {
        creatureStartHz *= 1.25
        creatureEndHz = max(38.0, creatureEndHz * 0.72)
      }
    }
    responseLevel *= g.answerLevel
    // Answered from close by: nearer the middle of the room, and brighter.
    responseBright = g.answerBright
    if (g.answerNear) responsePan *= 0.3
    for (slot in 0 until 2) companionActive[slot] = false
    companionCountdown.fill(0.0)
    fun draw(slot: Int) = IdentityGestures.draw(gestureSeed, IdentityGestures.WHALE_SALT, index, slot)
    if (g.companions >= 1) {
      // A second whale, farther off, on the other side, joining a moment after.
      companionCountdown[0] = rate * (1.5 + 2.0 * draw(10))
      companionDuration[0] = creatureDuration * (0.8 + 0.3 * draw(11))
      companionStartHz[0] = 62.0 + 30.0 * draw(12)
      companionEndHz[0] = 40.0 + 14.0 * draw(13)
      companionPan[0] = (if (creaturePan < 0) 1.0 else -1.0) * (0.35 + 0.35 * draw(14))
      companionLevel[0] = creatureLevel * (0.55 + 0.25 * variety) / max(g.callLevel, 0.05)
      companionFar[0] = 0.75
    }
    if (g.companions >= 2) {
      // And a third, smaller, higher and farther still.
      companionCountdown[1] = rate * (4.0 + 3.0 * draw(15))
      companionDuration[1] = creatureDuration * (0.7 + 0.3 * draw(16))
      companionStartHz[1] = 110.0 + 30.0 * draw(17)
      companionEndHz[1] = 70.0 + 20.0 * draw(18)
      companionPan[1] = (if (draw(19) < 0.5) -1.0 else 1.0) * (0.5 + 0.4 * draw(20))
      companionLevel[1] = creatureLevel * 0.4 / max(g.callLevel, 0.05)
      companionFar[1] = 0.92
    }
  }

  /** One-pole low-pass coefficient for a distance: the farther, the darker. */
  private fun farCoefficient(distance: Double): Double = 1.0 - exp(-PI * 2.0 * (1_200.0 - 850.0 * distance) / rate)

  /** Adds the gestures' far-off voices, echo and room to the call: sets the shaped call and the extras. */
  private fun shapeGestures(callLeft: Double, callRight: Double) {
    val g = gesture
    var left = callLeft
    var right = callRight
    var extraLeft = 0.0
    var extraRight = 0.0
    var roomIn = 0.0
    if (g.callFar > 0.0) {
      // A far call is darker, quieter, and mostly reverb.
      val coefficient = farCoefficient(g.callFar)
      callFarLeft += (left - callFarLeft) * coefficient
      callFarRight += (right - callFarRight) * coefficient
      val gain = 1.0 - 0.7 * g.callFar
      left = callFarLeft * gain * (1.0 - 0.65 * g.callFar)
      right = callFarRight * gain * (1.0 - 0.65 * g.callFar)
      roomIn += (callFarLeft + callFarRight) * 0.5 * gain * 0.6 * g.callFar
    }
    for (slot in 0 until 2) {
      if (!companionActive[slot] && companionCountdown[slot] > 0.0) {
        companionCountdown[slot] -= 1.0
        if (companionCountdown[slot] <= 0.0) {
          companionActive[slot] = true
          companionAge[slot] = 0.0
          companionPhase[slot] = IdentityGestures.draw(gestureSeed, IdentityGestures.WHALE_SALT, gestureIndex, 21 + slot) * PI * 2.0
        }
      }
      if (!companionActive[slot]) continue
      val duration = companionDuration[slot]
      val progress = (companionAge[slot] / duration).coerceIn(0.0, 1.0)
      val attack = smooth(companionAge[slot] / max(1.0, rate * 2.4))
      val release = 1.0 - smooth((progress - 0.62) / 0.38)
      val bend = smooth(progress)
      val frequency = (companionStartHz[slot] + (companionEndHz[slot] - companionStartHz[slot]) * bend) *
        (1.0 + sin(progress * PI * 9.0 + slot) * 0.006)
      val phase = companionPhase[slot]
      val voice = (sin(phase) + sin(phase * 2.0) * 0.23 + sin(phase * 3.0) * 0.07) * attack * release * companionLevel[slot]
      companionPhase[slot] = (phase + PI * 2.0 * frequency / rate) % (PI * 2.0)
      companionAge[slot] += 1.0
      if (companionAge[slot] >= duration) companionActive[slot] = false
      val coefficient = farCoefficient(companionFar[slot])
      val gain = 1.0 - 0.7 * companionFar[slot]
      companionFarLeft[slot] += (voice * (1.0 - companionPan[slot]) * 0.68 - companionFarLeft[slot]) * coefficient
      companionFarRight[slot] += (voice * (1.0 + companionPan[slot]) * 0.68 - companionFarRight[slot]) * coefficient
      extraLeft += companionFarLeft[slot] * gain * (1.0 - 0.65 * companionFar[slot])
      extraRight += companionFarRight[slot] * gain * (1.0 - 0.65 * companionFar[slot])
      roomIn += (companionFarLeft[slot] + companionFarRight[slot]) * 0.5 * gain * 0.6 * companionFar[slot]
    }
    // The call calls back to itself, ping-ponging across the water, each time a little darker.
    val echoSize = callEchoLeft.size
    val echoLength = min(echoSize - 1, max(1, (rate * 4.6).toInt()))
    val echoAt = (callEchoIndex - echoLength + echoSize) % echoSize
    callEchoDampLeft += (callEchoLeft[echoAt] - callEchoDampLeft) * 0.3
    callEchoDampRight += (callEchoRight[echoAt] - callEchoDampRight) * 0.3
    callEchoLeft[callEchoIndex] = left * g.echoSend + callEchoDampRight * 0.62
    callEchoRight[callEchoIndex] = right * g.echoSend + callEchoDampLeft * 0.62
    callEchoIndex = (callEchoIndex + 1) % echoSize
    extraLeft += callEchoDampLeft * 0.9
    extraRight += callEchoDampRight * 0.9
    // Far voices sit in a room of their own.
    val roomSize = farRoom.size
    val tapLeft = farRoom[(farRoomIndex - (rate * 0.29).toInt().coerceIn(1, roomSize - 1) + roomSize) % roomSize]
    val tapRight = farRoom[(farRoomIndex - (rate * 0.47).toInt().coerceIn(1, roomSize - 1) + roomSize) % roomSize]
    val tapLong = farRoom[(farRoomIndex - (rate * 0.71).toInt().coerceIn(1, roomSize - 1) + roomSize) % roomSize]
    farRoom[farRoomIndex] = roomIn + (tapLeft + tapRight) * 0.28
    farRoomIndex = (farRoomIndex + 1) % roomSize
    extraLeft += tapLeft * 0.8 + tapLong * 0.4
    extraRight += tapRight * 0.8 + tapLong * 0.4
    gestureExtraLeft = extraLeft
    gestureExtraRight = extraRight
    shapedLeft = left
    shapedRight = right
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

  fun render(sampleRate: Double, intensity: Double, elapsedSeconds: Double, salience: WorldSalienceScheduler, presence: Double, density: Double, variety: Double) {
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

    nextCreature(intensity, salience, presence, density, variety)
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
