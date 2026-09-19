package expo.modules.inneraudio

import kotlin.math.*

/** Liminal harmonic environment with no fixed-period environmental motion. */
internal class CosmicModel {
  private companion object {
    const val PHI = 1.61803398875
    val FIELD_RATIOS = doubleArrayOf(1.0, 1.41421356237, PHI, 2.61803398875)
    val FIELD_WEIGHTS = doubleArrayOf(0.07, 0.035, 0.027, 0.016)
    val HORIZON_RATIOS = doubleArrayOf(1.0, PHI, PHI * PHI)
    val HORIZON_WEIGHTS = doubleArrayOf(0.058, 0.02625, 0.01125)
    val MOAN_WEIGHTS = doubleArrayOf(0.05, 0.04, 0.06, 0.1, 0.28, 0.12, 0.05, 0.04, 0.08, 0.2)
    /** The two copies of each voice differ by this fraction, so they shimmer slowly rather than pulse. */
    const val MOAN_DETUNE = 0.0003
    /** The voice's own long reverb: four looped delays (seconds), unequal so the tail stays smooth. */
    val MOAN_SPACE_DELAYS = doubleArrayOf(0.0301, 0.0373, 0.0449, 0.0545)
    val MOAN_SPACE_INPUT = doubleArrayOf(0.6, -0.5, 0.5, -0.6)
    const val MOAN_SPACE_DECAY_SECONDS = 15.0
    /** Per-pass loop gain that gives every line the same decay time. */
    val MOAN_SPACE_GAINS = DoubleArray(4) { Math.pow(10.0, -3.0 * MOAN_SPACE_DELAYS[it] / MOAN_SPACE_DECAY_SECONDS) }
    const val MOAN_SPACE_DAMPING = 0.32
    const val MOAN_SPACE_SEND = 0.24
    const val MOAN_SPACE_WET = 1.0
  }
  var left = 0.0
    private set
  var right = 0.0
    private set

  private var random = 1L
  private var rate = 48_000.0
  private var state = 0
  private var stateAge = 0.0
  private var stateDuration = rate * 3.0
  private var firstPass = true
  private var mood = 0.5
  private var moodTarget = 0.5
  private var moodFrames = rate * 120.0
  private var motion = 0.0
  private var motionTarget = 0.0
  private var motionFrames = rate * 4.0
  private var pressure = 0.42
  private var width = 0.3
  private var brightness = 0.25
  private var presence = 0.4
  private var gravityLevel = 0.0
  private var gravityPhase = 0.0
  private var horizonLevel = 0.6
  private val horizonPhases = DoubleArray(3)
  private val moanPhases = DoubleArray(10)
  private val moanChoirPhases = DoubleArray(10)
  private var moanBreathPhase = 0.0
  private var moanCycle = 0L
  private var gestureSeed = 1L
  private val gesture = CosmicGesture()
  private var gestureCycle = -1L
  private var gestureNeutral = true
  private val secondPhases = DoubleArray(10)
  private val echoBufferLeft = DoubleArray(300_000)
  private val echoBufferRight = DoubleArray(300_000)
  private var echoIndex = 0
  private var echoDampLeft = 0.0
  private var echoDampRight = 0.0
  private var moanEchoLeft = 0.0
  private var moanEchoRight = 0.0
  private var moanGate = 1.0
  private var moanOrbitPhase = 0.0
  private var moanDistanceLeft = 0.0
  private var moanDistanceRight = 0.0
  private var moanReverbSend = 0.6
  private val moanSpaceLines = Array(4) { DoubleArray(8192) }
  private val moanSpaceIndex = IntArray(4)
  private val moanSpaceDamp = DoubleArray(4)
  private val moanSpaceOut = DoubleArray(4)
  private var moanSpaceLeft = 0.0
  private var moanSpaceRight = 0.0
  private var moanLeft = 0.0
  private var moanRight = 0.0
  private var moanMono = 0.0
  private var rumble = 0.0
  private var airLeft = 0.0
  private var airRight = 0.0
  private val fieldPhases = DoubleArray(4)
  private val bloomPhases = DoubleArray(6)
  private val bloomAges = DoubleArray(6)
  private val bloomDurations = DoubleArray(6)
  private val bloomFrequencies = DoubleArray(6)
  private val bloomAmplitudes = DoubleArray(6)
  private val bloomPans = DoubleArray(6)
  private var bloomCursor = 0
  private var bloomCountdown = rate * 5.0
  private val delay = DoubleArray(48_000)
  private var delayIndex = 0

  fun reset(seed: Long, sampleRate: Double) {
    random = (seed xor 0x8f1bbcdcL).let { if (it == 0L) 1L else it }
    rate = sampleRate
    state = 0; stateAge = 0.0; stateDuration = rate * 3.0; firstPass = true
    mood = 0.5; moodTarget = 0.5; moodFrames = rate * 120.0
    motion = 0.0; motionTarget = 0.0; motionFrames = rate * 4.0
    pressure = 0.42; width = 0.3; brightness = 0.25; presence = 0.4
    gravityLevel = 0.0; gravityPhase = 0.0
    horizonLevel = 0.6; horizonPhases.fill(0.0)
    moanPhases.fill(0.0); moanChoirPhases.fill(0.0); moanBreathPhase = 0.0; moanOrbitPhase = 0.0
    moanCycle = 0L; moanGate = 1.0
    gestureSeed = seed xor 0x436f736dL
    gesture.neutral(); gestureCycle = -1L; gestureNeutral = true
    secondPhases.fill(0.0)
    echoBufferLeft.fill(0.0); echoBufferRight.fill(0.0); echoIndex = 0; echoDampLeft = 0.0; echoDampRight = 0.0
    moanEchoLeft = 0.0; moanEchoRight = 0.0
    moanDistanceLeft = 0.0; moanDistanceRight = 0.0; moanReverbSend = 0.6
    moanLeft = 0.0; moanRight = 0.0; moanMono = 0.0
    for (line in moanSpaceLines) line.fill(0.0)
    moanSpaceIndex.fill(0); moanSpaceDamp.fill(0.0); moanSpaceOut.fill(0.0)
    moanSpaceLeft = 0.0; moanSpaceRight = 0.0
    rumble = 0.0; airLeft = 0.0; airRight = 0.0
    fieldPhases.fill(0.0); bloomPhases.fill(0.0); bloomAges.fill(0.0)
    bloomDurations.fill(0.0); bloomFrequencies.fill(0.0)
    bloomAmplitudes.fill(0.0); bloomPans.fill(0.0)
    bloomCursor = 0; bloomCountdown = rate * 5.0
    delay.fill(0.0); delayIndex = 0
    left = 0.0; right = 0.0
  }

  private fun unit(): Double {
    random = random xor (random shl 13)
    random = random xor (random ushr 7)
    random = random xor (random shl 17)
    return (random and 0x00ff_ffffL).toDouble() / 0x00ff_ffffL
  }

  private fun white(): Double = unit() * 2.0 - 1.0

  private fun enter(next: Int) {
    state = next
    stateAge = 0.0
    stateDuration = rate * when (state) {
      0 -> if (firstPass) 3.0 else 18.0 + unit() * 34.0
      1 -> 9.0 + unit() * 13.0
      2 -> 10.0 + unit() * 10.0
      3 -> 8.0 + unit() * 12.0
      4 -> 16.0 + unit() * 34.0
      else -> 10.0 + unit() * 18.0
    }
    motionTarget = (unit() * 2.0 - 1.0) * if (state == 3) 0.9 else 0.55
    if (state == 1 || state == 4) bloomCountdown = rate * (2.0 + unit() * 4.0)
  }

  private fun advance() {
    if (stateAge < stateDuration) return
    if (state == 5) firstPass = false
    enter(if (state == 5) 0 else state + 1)
  }

  private fun exciteBloom(intensity: Double) {
    val slot = bloomCursor
    bloomCursor = (bloomCursor + 1) % bloomPhases.size
    val root = 72.0 + unit() * 42.0
    val ratio = when ((unit() * 4.0).toInt()) {
      0 -> PHI
      1 -> 1.41421356237 * PHI
      2 -> PHI * PHI
      else -> 1.41421356237 * PHI * PHI
    }
    bloomPhases[slot] = unit() * PI * 2.0
    bloomAges[slot] = 0.0
    bloomDurations[slot] = rate * (4.5 + unit() * 7.5)
    bloomFrequencies[slot] = root * ratio
    bloomAmplitudes[slot] = (0.018 + unit() * 0.026) * (0.75 + intensity * 0.25)
    bloomPans[slot] = (unit() * 2.0 - 1.0) * 0.82
  }

  private fun renderBlooms(intensity: Double, salience: WorldSalienceScheduler): Double {
    if (state in 1..4) {
      bloomCountdown -= 1.0
      if (bloomCountdown <= 0.0) {
        if (salience.reserve(salience = 0.45, durationSeconds = 12.0, recoverySeconds = 4.0)) {
          exciteBloom(intensity)
        }
        bloomCountdown = rate * (4.0 + unit() * (10.0 - intensity * 3.0))
      }
    }
    var mono = 0.0
    var bloomLeft = 0.0
    var bloomRight = 0.0
    for (slot in bloomPhases.indices) {
      val duration = bloomDurations[slot]
      if (duration <= 0.0 || bloomAges[slot] >= duration) continue
      val progress = bloomAges[slot] / duration
      val attack = min(1.0, bloomAges[slot] / max(1.0, rate * 1.4))
      val envelope = sin(PI * progress).let { it * it } * attack
      val bend = 1.0 + (0.5 - progress) * 0.012 * motion
      val value = (sin(bloomPhases[slot]) + sin(bloomPhases[slot] * 0.5) * 0.14) * envelope * bloomAmplitudes[slot]
      bloomPhases[slot] = (bloomPhases[slot] + PI * 2.0 * bloomFrequencies[slot] * bend / rate) % (PI * 2.0)
      bloomAges[slot] += 1.0
      bloomLeft += value * (1.0 - bloomPans[slot]) * 0.58
      bloomRight += value * (1.0 + bloomPans[slot]) * 0.58
      mono += value * 0.35
    }

    val near = delay[(delayIndex - min(delay.size - 1, max(1, (rate * 0.23).toInt())) + delay.size) % delay.size]
    val far = delay[(delayIndex - min(delay.size - 1, max(1, (rate * 0.61).toInt())) + delay.size) % delay.size]
    delay[delayIndex] = mono + moanMono * moanReverbSend + (near * 0.34 + far * 0.24) * 0.28
    delayIndex = (delayIndex + 1) % delay.size
    left += bloomLeft + near * (0.26 - motion * 0.08) + far * (0.17 + motion * 0.07)
    right += bloomRight + near * (0.26 + motion * 0.08) + far * (0.17 - motion * 0.07)
    return mono
  }

  private fun renderMoan(intensity: Double, identityPresence: Double, density: Double, variety: Double) {
    // Each breath draws its own gesture; at variety 0 every one is the voice as designed. A breath begins at
    // the quietest point of the last, so the change is never heard as a step.
    if (variety <= 0.0) {
      if (!gestureNeutral) { gesture.neutral(); gestureNeutral = true; gestureCycle = -1L }
    } else if (gestureNeutral || moanCycle != gestureCycle) {
      gesture.draw(gestureSeed, moanCycle, variety)
      gestureNeutral = false
      gestureCycle = moanCycle
    }
    val progress = moanBreathPhase / (PI * 2.0)
    val breath = 0.5 - 0.5 * cos(moanBreathPhase)
    val swell = if (gesture.plateau == 1.0) breath else Math.pow(breath, gesture.plateau)
    val envelope = if (gesture.floor == CosmicGesture.DEFAULT_FLOOR && gesture.plateau == 1.0) 0.1 + breath * 0.9 else gesture.floor + (1.0 - gesture.floor) * swell
    val distancePresence = 0.72 + breath * 0.28
    var fundamental = 72.0 + mood * 7.0 + sin(moanBreathPhase) * 0.45
    // The pitch: a lowered root, a settling glide, or a slow wander around the root.
    if (gesture.rootRatio != 1.0 || gesture.glide != 0.0 || gesture.drift != 0.0) {
      fundamental *= gesture.rootRatio * Math.pow(2.0, (-gesture.glide * progress + gesture.drift * sin(PI * 2.0 * progress)) / 12.0)
    }
    var primary = 0.0
    var choir = 0.0
    for (index in moanPhases.indices) {
      val harmonic = (index + 1).toDouble()
      val weight = MOAN_WEIGHTS[index]
      primary += sin(moanPhases[index]) * weight
      choir += sin(moanChoirPhases[index]) * weight
      moanPhases[index] = (moanPhases[index] + PI * 2.0 * fundamental * harmonic * (1.0 - MOAN_DETUNE) / rate) % (PI * 2.0)
      moanChoirPhases[index] = (moanChoirPhases[index] + PI * 2.0 * fundamental * harmonic * (1.0 + MOAN_DETUNE) / rate) % (PI * 2.0)
    }
    val choirSpread = 0.08 + (1.0 - breath) * 0.1
    var rawLeft = primary * (0.5 + choirSpread) + choir * (0.5 - choirSpread)
    var rawRight = primary * (0.5 - choirSpread) + choir * (0.5 + choirSpread)
    if (gesture.second > 0.0) {
      // A second voice singing with the first: an octave beneath, or a harmony above.
      var singing = 0.0
      for (index in secondPhases.indices) {
        val harmonic = (index + 1).toDouble()
        singing += sin(secondPhases[index]) * MOAN_WEIGHTS[index]
        secondPhases[index] = (secondPhases[index] + PI * 2.0 * fundamental * gesture.secondRatio * harmonic / rate) % (PI * 2.0)
      }
      rawLeft += singing * gesture.second * (1.0 - gesture.secondPan)
      rawRight += singing * gesture.second * (1.0 + gesture.secondPan)
    }
    // Approaching: far off it is darker and quieter and sits more in the reverb; it draws near over the breath.
    var distance = 0.0
    if (gesture.distant) {
      val travel = progress * progress * (3.0 - 2.0 * progress)
      distance = gesture.distStart * (1.0 - travel)
    }
    val distanceCutoff = (340.0 + breath * 960.0) * (1.0 - 0.6 * distance)
    val distanceFilter = PI * 2.0 * distanceCutoff / (rate + PI * 2.0 * distanceCutoff)
    moanDistanceLeft += distanceFilter * (rawLeft - moanDistanceLeft)
    moanDistanceRight += distanceFilter * (rawRight - moanDistanceRight)
    // Circling: it sweeps across the ears once over the breath, one way or the other.
    val orbit = if (gesture.circles) gesture.circleDirection * sin(PI * 2.0 * progress) * 0.8 else sin(moanOrbitPhase) * (0.1 + breath * 0.18)
    // Sparser identity: the voice sounds on every Nth breath, fading over 1.5 s at the seams.
    val every = max(1, Math.round(1.0 / density).toInt())
    val open = if (every == 1 || moanCycle % every == 0L) 1.0 else 0.0
    moanGate += (open - moanGate) / max(1.0, rate * 1.5)
    val baseLevel = (0.11 + intensity * 0.055) * identityPresence * moanGate
    val level = envelope * distancePresence * baseLevel * gesture.level * (1.0 - 0.55 * distance)
    // The voice feeds its own reverb at a steady level, so as the voice itself recedes the room keeps ringing.
    renderMoanSpace((moanDistanceLeft + moanDistanceRight) * 0.5 * baseLevel * gesture.level * MOAN_SPACE_SEND * (1.0 + 1.2 * distance))
    moanLeft = moanDistanceLeft * (1.0 - orbit) * level
    moanRight = moanDistanceRight * (1.0 + orbit) * level
    moanMono = (moanLeft + moanRight) * 0.5
    if (variety > 0.0) {
      // The voice calls back to itself across the void, ping-ponging between the ears, each time darker.
      val size = echoBufferLeft.size
      val length = min(size - 1, max(1, (rate * 5.5).toInt()))
      val readAt = (echoIndex - length + size) % size
      echoDampLeft += (echoBufferLeft[readAt] - echoDampLeft) * 0.3
      echoDampRight += (echoBufferRight[readAt] - echoDampRight) * 0.3
      echoBufferLeft[echoIndex] = moanLeft * gesture.echoSend + echoDampRight * 0.62
      echoBufferRight[echoIndex] = moanRight * gesture.echoSend + echoDampLeft * 0.62
      echoIndex = (echoIndex + 1) % size
      moanEchoLeft = echoDampLeft * 0.9
      moanEchoRight = echoDampRight * 0.9
    }
    moanReverbSend = 0.22 + (1.0 - breath) * 0.38
    val nextBreath = moanBreathPhase + PI * 2.0 / (rate * 31.0)
    if (nextBreath >= PI * 2.0) moanCycle++
    moanBreathPhase = nextBreath % (PI * 2.0)
    moanOrbitPhase = (moanOrbitPhase + PI * 2.0 / (rate * 79.0)) % (PI * 2.0)
  }

  /** A four-line feedback delay network: orthogonal mixing, damped highs, long low-frequency decay. */
  private fun renderMoanSpace(input: Double) {
    val size = moanSpaceLines[0].size
    var sum = 0.0
    for (line in 0 until 4) {
      val length = min(size - 1, max(1, (rate * MOAN_SPACE_DELAYS[line]).toInt()))
      val read = moanSpaceLines[line][(moanSpaceIndex[line] - length + size) % size]
      moanSpaceDamp[line] += (read - moanSpaceDamp[line]) * MOAN_SPACE_DAMPING
      val value = moanSpaceDamp[line] * MOAN_SPACE_GAINS[line]
      moanSpaceOut[line] = value
      sum += value
    }
    val half = sum * 0.5
    for (line in 0 until 4) {
      moanSpaceLines[line][moanSpaceIndex[line]] = moanSpaceOut[line] - half + input * MOAN_SPACE_INPUT[line]
      moanSpaceIndex[line] = (moanSpaceIndex[line] + 1) % size
    }
    moanSpaceLeft = (moanSpaceOut[0] + moanSpaceOut[1] - moanSpaceOut[2] - moanSpaceOut[3]) * 0.5 * MOAN_SPACE_WET
    moanSpaceRight = (moanSpaceOut[0] - moanSpaceOut[1] - moanSpaceOut[2] + moanSpaceOut[3]) * 0.5 * MOAN_SPACE_WET
  }

  fun render(sampleRate: Double, intensity: Double, salience: WorldSalienceScheduler, identityPresence: Double, density: Double, variety: Double) {
    if (rate != sampleRate) reset(random, sampleRate)
    advance()
    moodFrames -= 1.0
    if (moodFrames <= 0.0) {
      moodTarget = 0.12 + unit() * 0.78
      moodFrames = rate * (90.0 + unit() * 180.0)
    }
    mood += (moodTarget - mood) / max(1.0, rate * 55.0)
    motionFrames -= 1.0
    if (motionFrames <= 0.0) {
      motionTarget = (unit() * 2.0 - 1.0) * if (state == 3) 0.92 else 0.56
      motionFrames = rate * (3.0 + unit() * 10.0)
    }
    motion += (motionTarget - motion) / max(1.0, rate * 3.2)

    val progress = min(1.0, stateAge / max(1.0, stateDuration))
    val arc = sin(PI * progress).let { it * it }
    val targetPressure: Double
    val targetWidth: Double
    val targetBrightness: Double
    val targetPresence: Double
    when (state) {
      0 -> { targetPressure = 0.48 + mood * 0.12; targetWidth = 0.24; targetBrightness = 0.14; targetPresence = 0.3 }
      1 -> { targetPressure = 0.5 + arc * 0.13; targetWidth = 0.32 + arc * 0.2; targetBrightness = 0.2 + arc * 0.18; targetPresence = 0.38 + arc * 0.22 }
      2 -> { targetPressure = 0.56 + arc * 0.2; targetWidth = 0.38; targetBrightness = 0.22 + arc * 0.08; targetPresence = 0.5 + arc * 0.12 }
      3 -> { targetPressure = 0.56 - arc * 0.18; targetWidth = 0.52 + arc * 0.45; targetBrightness = 0.35 + arc * 0.3; targetPresence = 0.58 + arc * 0.18 }
      4 -> { targetPressure = 0.27 - arc * 0.1; targetWidth = 0.9; targetBrightness = 0.48 + mood * 0.16; targetPresence = 0.68 }
      else -> { targetPressure = 0.34 + progress * 0.13; targetWidth = 0.78 - progress * 0.48; targetBrightness = 0.42 - progress * 0.24; targetPresence = 0.58 - progress * 0.24 }
    }
    val slew = 1.0 / max(1.0, rate * 1.8)
    pressure += (targetPressure - pressure) * slew
    width += (targetWidth - width) * slew
    brightness += (targetBrightness - brightness) * slew
    presence += (targetPresence - presence) * slew

    val shared = white()
    rumble += (shared - rumble) * (0.0007 + brightness * 0.0012)
    airLeft += (white() - airLeft) * (0.006 + brightness * 0.018)
    airRight += (white() - airRight) * (0.006 + brightness * 0.018)
    val voidBody = rumble * (2.0 + intensity * 1.15) * pressure
    val airLevel = (0.06 + intensity * 0.055) * (0.55 + brightness)

    val gravityTarget = if (state == 2) arc else 0.0
    gravityLevel += (gravityTarget - gravityLevel) / max(1.0, rate * if (gravityTarget > gravityLevel) 2.8 else 4.2)
    val gravityFrequency = 40.0 + intensity * 9.0 + mood * 3.0
    val gravity = (sin(gravityPhase) + sin(gravityPhase * 2.0) * 0.16) * gravityLevel * (0.07 + intensity * 0.035)
    gravityPhase = (gravityPhase + PI * 2.0 * gravityFrequency / rate) % (PI * 2.0)

    val horizonTarget = 0.56 + mood * 0.16 + if (state == 3 || state == 4) 0.08 else 0.0
    horizonLevel += (horizonTarget - horizonLevel) / max(1.0, rate * 24.0)
    val horizonBase = 36.0 + intensity * 5.0 + mood * 2.0
    var horizonLeft = 0.0
    var horizonRight = 0.0
    for (index in horizonPhases.indices) {
      val voice = sin(horizonPhases[index]) * HORIZON_WEIGHTS[index] * horizonLevel
      val spread = if (index == 0) 0.0 else motion * width * (0.1 + index * 0.07)
      horizonLeft += voice * (1.0 - spread)
      horizonRight += voice * (1.0 + spread)
      horizonPhases[index] = (horizonPhases[index] + PI * 2.0 * horizonBase * HORIZON_RATIOS[index] / rate) % (PI * 2.0)
    }

    val base = 34.0 + intensity * 8.0 + mood * 3.0
    var fieldLeft = 0.0
    var fieldRight = 0.0
    for (index in fieldPhases.indices) {
      val sample = sin(fieldPhases[index]) * FIELD_WEIGHTS[index] * presence
      val pan = motion * (0.22 + index * 0.11) * if (index % 2 == 0) 1.0 else -1.0
      fieldLeft += sample * (1.0 - pan * width)
      fieldRight += sample * (1.0 + pan * width)
      val lensBend = 1.0 + motion * (index - 1.5) * 0.00045 * (0.3 + width)
      fieldPhases[index] = (fieldPhases[index] + PI * 2.0 * base * FIELD_RATIOS[index] * lensBend / rate) % (PI * 2.0)
    }

    renderMoan(intensity, identityPresence, density, variety)
    left = voidBody + gravity + horizonLeft + fieldLeft + moanLeft + moanSpaceLeft + moanEchoLeft + airLeft * airLevel * (1.0 - motion * width * 0.16)
    right = voidBody + gravity + horizonRight + fieldRight + moanRight + moanSpaceRight + moanEchoRight + airRight * airLevel * (1.0 + motion * width * 0.16)
    renderBlooms(intensity, salience)
    stateAge += 1.0
  }
}
