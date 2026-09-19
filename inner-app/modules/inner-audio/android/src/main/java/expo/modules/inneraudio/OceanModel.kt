package expo.modules.inneraudio

import kotlin.math.*

/** Probabilistic surf model with a fixed micro-water voice pool. */
internal class OceanModel {
  var left = 0.0
    private set
  var right = 0.0
    private set

  private var random = 1L
  private var rate = 48_000.0
  private var phase = 0
  private var phaseAge = 0.0
  private var phaseDuration = rate * 2
  private var wavesRemaining = 0
  private var waveAmplitude = 0.7
  private var wavePan = 0.0
  private var bodyLevel = 0.3
  private var foamLevel = 0.05
  private var renderedPan = 0.0
  private var renderedWidth = 0.3
  private var mood = 0.5
  private var moodTarget = 0.5
  private var moodFrames = rate * 120
  private var low = 0.0
  private var mid = 0.0
  private var foamLeft = 0.0
  private var foamRight = 0.0

  private val bubblePhases = DoubleArray(8)
  private val bubbleAges = DoubleArray(8)
  private val bubbleDurations = DoubleArray(8)
  private val bubbleFrequencies = DoubleArray(8)
  private val bubbleAmplitudes = DoubleArray(8)
  private val bubblePans = DoubleArray(8)
  private var bubbleCursor = 0
  private var bubbleCountdown = 0.0
  private var bubbleBurstRemaining = 0
  private var bubbleSequenceAdmitted = false
  private var bubbleLeft = 0.0
  private var bubbleRight = 0.0

  private var beaconRandom = 1L
  private var beaconCountdown = 0.0
  private var beaconAge = -1.0
  private var beaconBaseHz = 88.0
  private var beaconPan = 0.0
  private var beaconPhase = 0.0
  private var beaconEcho = DoubleArray(24_000)
  private var beaconEchoIndex = 0
  private var beaconWet = 0.0
  private var beaconLeft = 0.0
  private var beaconRight = 0.0

  fun reset(seed: Long, sampleRate: Double) {
    random = (seed xor 0x510e527fL).let { if (it == 0L) 1L else it }
    rate = sampleRate
    phase = 0; phaseAge = 0.0; phaseDuration = rate * 2.0; wavesRemaining = 0
    waveAmplitude = 0.7; wavePan = 0.0; bodyLevel = 0.3; foamLevel = 0.05
    renderedPan = 0.0; renderedWidth = 0.3; mood = 0.5; moodTarget = 0.5; moodFrames = rate * 120
    low = 0.0; mid = 0.0; foamLeft = 0.0; foamRight = 0.0
    bubblePhases.fill(0.0); bubbleAges.fill(0.0); bubbleDurations.fill(0.0)
    bubbleFrequencies.fill(0.0); bubbleAmplitudes.fill(0.0); bubblePans.fill(0.0)
    bubbleCursor = 0; bubbleCountdown = 0.0; bubbleBurstRemaining = 0; bubbleSequenceAdmitted = false
    beaconRandom = (seed xor 0x626561636f6eL).let { if (it == 0L) 1L else it }
    beaconCountdown = rate * 16.0; beaconAge = -1.0; beaconBaseHz = 88.0; beaconPan = 0.0; beaconPhase = 0.0
    beaconEcho = DoubleArray(max(2, (rate * 0.5).toInt()))
    beaconEchoIndex = 0; beaconWet = 0.0; beaconLeft = 0.0; beaconRight = 0.0
    left = 0.0; right = 0.0
  }

  private fun unit(): Double {
    random = random xor (random shl 13)
    random = random xor (random ushr 7)
    random = random xor (random shl 17)
    return (random and 0x00ff_ffffL).toDouble() / 0x00ff_ffffL
  }

  private fun white(): Double = unit() * 2 - 1

  private fun beaconUnit(): Double {
    beaconRandom = beaconRandom xor (beaconRandom shl 13)
    beaconRandom = beaconRandom xor (beaconRandom ushr 7)
    beaconRandom = beaconRandom xor (beaconRandom shl 17)
    return (beaconRandom and 0x00ff_ffffL).toDouble() / 0x00ff_ffffL
  }

  private fun renderBeacon(salience: WorldSalienceScheduler, presence: Double) {
    if (beaconAge < 0.0) {
      beaconCountdown -= 1.0
      if (beaconCountdown <= 0.0) {
        if (presence > 0.0001 && salience.reserve(salience = 0.46, durationSeconds = 16.0, recoverySeconds = 5.0)) {
          beaconAge = 0.0
          beaconBaseHz = 82.0 + beaconUnit() * 14.0
          beaconPan = (beaconUnit() * 2.0 - 1.0) * 0.28
          beaconCountdown = rate * (105.0 + beaconUnit() * 55.0)
        } else {
          beaconCountdown = rate * 3.0
        }
      }
    }
    var dry = 0.0
    if (beaconAge >= 0.0) {
      val seconds = beaconAge / rate
      val attack = (seconds / 3.2).coerceIn(0.0, 1.0)
      val release = ((16.0 - seconds) / 8.0).coerceIn(0.0, 1.0)
      val envelope = (0.5 - 0.5 * cos(PI * attack)) * (release * release * (3.0 - 2.0 * release))
      val swell = 1.0 + 0.004 * sin(seconds * 2.0 * PI / 9.0)
      beaconPhase = (beaconPhase + 2.0 * PI * beaconBaseHz * swell / rate) % (2.0 * PI)
      val horn = sin(beaconPhase) * 0.56 + sin(beaconPhase * 2.0) * 0.28 + sin(beaconPhase * 3.0) * 0.12 + sin(beaconPhase * 4.0) * 0.04
      dry = horn * envelope * 0.25 * presence.coerceIn(0.0, 1.5)
      beaconAge += 1.0
      if (seconds >= 16.0) beaconAge = -1.0
    }
    val echoSize = beaconEcho.size
    val first = beaconEcho[(beaconEchoIndex - (rate * 0.19).toInt().coerceIn(1, echoSize - 1) + echoSize) % echoSize]
    val second = beaconEcho[(beaconEchoIndex - (rate * 0.37).toInt().coerceIn(1, echoSize - 1) + echoSize) % echoSize]
    beaconWet += ((first + second) * 0.5 - beaconWet) * 0.018
    beaconEcho[beaconEchoIndex] = dry + beaconWet * 0.35
    beaconEchoIndex = (beaconEchoIndex + 1) % echoSize
    val distant = dry * 0.72 + beaconWet * 0.46
    beaconLeft = distant * (1.0 - beaconPan)
    beaconRight = distant * (1.0 + beaconPan)
  }

  private fun enter(next: Int, intensity: Double, salience: WorldSalienceScheduler) {
    phase = next
    phaseAge = 0.0
    when (phase) {
      0 -> phaseDuration = rate * if (wavesRemaining > 0) (1.5 + unit() * 2.5) else (6.0 + unit() * 10.0)
      1 -> {
        if (wavesRemaining <= 0) wavesRemaining = 1 + (unit() * 3).toInt()
        wavesRemaining--
        waveAmplitude = (0.55 + unit() * 0.38) * (0.7 + intensity * 0.3) * (0.78 + mood * 0.3)
        wavePan = (unit() * 2 - 1) * 0.52
        phaseDuration = rate * (2.2 + unit() * 2.7)
      }
      2 -> phaseDuration = rate * (0.8 + unit() * 1.1)
      3 -> {
        phaseDuration = rate * (1.5 + unit() * 1.8)
        bubbleSequenceAdmitted = salience.reserve(salience = 0.28, durationSeconds = 7.0, recoverySeconds = 2.0)
        bubbleBurstRemaining = if (bubbleSequenceAdmitted) 3 + (unit() * (4 + intensity * 4)).toInt() else 0
        bubbleCountdown = rate * (0.08 + unit() * 0.18)
      }
      4 -> {
        phaseDuration = rate * (3.0 + unit() * 3.5)
        if (bubbleSequenceAdmitted) bubbleBurstRemaining += 2 + (unit() * 4).toInt()
      }
      else -> phaseDuration = rate * (4.0 + unit() * 5.0)
    }
  }

  private fun advance(intensity: Double, salience: WorldSalienceScheduler) {
    if (phaseAge < phaseDuration) return
    enter(if (phase == 5) 0 else phase + 1, intensity, salience)
  }

  private fun exciteBubble() {
    val slot = bubbleCursor
    bubbleCursor = (bubbleCursor + 1) % bubblePhases.size
    bubblePhases[slot] = 0.0
    bubbleAges[slot] = 0.0
    bubbleDurations[slot] = rate * (0.08 + unit() * 0.20)
    bubbleFrequencies[slot] = 320 + unit() * 1_180
    bubbleAmplitudes[slot] = 0.012 + unit() * 0.025
    bubblePans[slot] = (unit() * 2 - 1) * 0.8
  }

  private fun renderBubbles() {
    if (bubbleBurstRemaining > 0 && (phase == 3 || phase == 4)) {
      bubbleCountdown -= 1
      if (bubbleCountdown <= 0) {
        exciteBubble()
        bubbleBurstRemaining--
        bubbleCountdown = rate * (0.10 + unit() * 0.42)
      }
    }
    bubbleLeft = 0.0
    bubbleRight = 0.0
    for (slot in bubblePhases.indices) {
      val duration = bubbleDurations[slot]
      if (duration <= 0 || bubbleAges[slot] >= duration) continue
      val progress = bubbleAges[slot] / duration
      val attack = 0.5 - 0.5 * cos(PI * min(1.0, bubbleAges[slot] / max(1.0, rate * 0.006)))
      val envelope = attack * (1 - progress) * (1 - progress)
      val frequency = bubbleFrequencies[slot] * (1 + 0.22 * (1 - progress))
      val value = sin(bubblePhases[slot]) * envelope * bubbleAmplitudes[slot]
      bubblePhases[slot] = (bubblePhases[slot] + PI * 2 * frequency / rate) % (PI * 2)
      bubbleAges[slot] += 1
      bubbleLeft += value * (1 - bubblePans[slot]) * 0.6
      bubbleRight += value * (1 + bubblePans[slot]) * 0.6
    }
  }

  fun render(sampleRate: Double, intensity: Double, salience: WorldSalienceScheduler, identityPresence: Double) {
    if (rate != sampleRate) reset(random, sampleRate)
    advance(intensity, salience)
    moodFrames -= 1
    if (moodFrames <= 0) {
      moodTarget = 0.15 + unit() * 0.75
      moodFrames = rate * (120 + unit() * 180)
    }
    mood += (moodTarget - mood) / max(1.0, rate * 45.0)
    val progress = min(1.0, phaseAge / max(1.0, phaseDuration))
    val smooth = progress * progress * (3 - 2 * progress)
    val bodyTarget: Double
    val foamTarget: Double
    val widthTarget: Double
    when (phase) {
      0 -> { bodyTarget = 0.25 + mood * 0.1; foamTarget = 0.04 + mood * 0.04; widthTarget = 0.25 }
      1 -> { bodyTarget = 0.28 + waveAmplitude * 0.52 * smooth; foamTarget = 0.05 + waveAmplitude * 0.16 * smooth; widthTarget = 0.3 + smooth * 0.25 }
      2 -> { bodyTarget = 0.56 + waveAmplitude * 0.28; foamTarget = 0.24 + waveAmplitude * 0.25; widthTarget = 0.68 }
      3 -> { bodyTarget = 0.72 - smooth * 0.16; foamTarget = (0.66 + waveAmplitude * 0.25) * (1 - smooth * 0.18); widthTarget = 0.9 }
      4 -> { bodyTarget = 0.54 - smooth * 0.12; foamTarget = 0.58 * (1 - smooth * 0.5); widthTarget = 0.82 - smooth * 0.18 }
      else -> { bodyTarget = 0.42 - smooth * 0.15; foamTarget = 0.28 * (1 - smooth) + 0.05; widthTarget = 0.55 - smooth * 0.25 }
    }
    val slew = 1 / max(1.0, rate * 0.28)
    bodyLevel += (bodyTarget - bodyLevel) * slew
    foamLevel += (foamTarget - foamLevel) * slew
    renderedPan += (wavePan - renderedPan) * slew
    renderedWidth += (widthTarget - renderedWidth) * slew

    val shared = white()
    low += 0.0045 * (shared - low)
    mid += 0.022 * (shared - mid)
    val leftWhite = white()
    val rightWhite = white()
    foamLeft += 0.072 * (leftWhite - foamLeft)
    foamRight += 0.072 * (rightWhite - foamRight)
    val undertow = (low * 2.8 + mid * 0.78) * bodyLevel
    val brightLeft = (leftWhite - foamLeft * 0.66) * foamLevel * (0.72 + intensity * 0.38)
    val brightRight = (rightWhite - foamRight * 0.66) * foamLevel * (0.72 + intensity * 0.38)
    renderBubbles()
    renderBeacon(salience, identityPresence)
    left = undertow * (1 - renderedPan * 0.12) + brightLeft * (0.72 + renderedWidth * 0.35) * (1 - renderedPan * 0.3) + bubbleLeft + beaconLeft
    right = undertow * (1 + renderedPan * 0.12) + brightRight * (0.72 + renderedWidth * 0.35) * (1 + renderedPan * 0.3) + bubbleRight + beaconRight
    phaseAge += 1
  }
}
