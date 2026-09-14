package expo.modules.inneraudio

import kotlin.math.*

/** Liminal harmonic environment with no fixed-period environmental motion. */
internal class CosmicModel {
  private companion object {
    const val PHI = 1.61803398875
    val FIELD_RATIOS = doubleArrayOf(1.0, 1.41421356237, PHI, 2.61803398875)
    val FIELD_WEIGHTS = doubleArrayOf(0.07, 0.035, 0.027, 0.016)
    val HORIZON_RATIOS = doubleArrayOf(1.0, PHI, PHI * PHI)
    val HORIZON_WEIGHTS = doubleArrayOf(0.058, 0.021, 0.009)
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

  private fun renderBlooms(intensity: Double): Double {
    if (state in 1..4) {
      bloomCountdown -= 1.0
      if (bloomCountdown <= 0.0) {
        exciteBloom(intensity)
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
    delay[delayIndex] = mono + (near * 0.34 + far * 0.24) * 0.28
    delayIndex = (delayIndex + 1) % delay.size
    left += bloomLeft + near * (0.26 - motion * 0.08) + far * (0.17 + motion * 0.07)
    right += bloomRight + near * (0.26 + motion * 0.08) + far * (0.17 - motion * 0.07)
    return mono
  }

  fun render(sampleRate: Double, intensity: Double) {
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

    left = voidBody + gravity + horizonLeft + fieldLeft + airLeft * airLevel * (1.0 - motion * width * 0.16)
    right = voidBody + gravity + horizonRight + fieldRight + airRight * airLevel * (1.0 + motion * width * 0.16)
    renderBlooms(intensity)
    stateAge += 1.0
  }
}
