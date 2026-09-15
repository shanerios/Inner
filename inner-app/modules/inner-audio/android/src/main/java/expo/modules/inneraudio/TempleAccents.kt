package expo.modules.inneraudio

import kotlin.math.*

/** Fixed voice pool: one bowl and three chimes, with no render-time allocation. */
internal class TempleAccents {
  var left = 0.0
    private set
  var right = 0.0
    private set
  private var random = 1L
  private var rate = 48_000.0
  private val phases = DoubleArray(24)
  private val frequencies = DoubleArray(24)
  private val amplitudes = DoubleArray(24)
  private val decays = DoubleArray(24)
  private val ages = DoubleArray(4)
  private val durations = DoubleArray(4)
  private val attacks = DoubleArray(4)
  private val pans = DoubleArray(4)
  private val counts = IntArray(4)
  private val bowlRatios = doubleArrayOf(1.0, 1.006, 2.76, 2.772, 3.76, 5.4)
  private val bowlWeights = doubleArrayOf(0.5, 0.25, 0.16, 0.08, 0.08, 0.04)
  private val bowlTails = doubleArrayOf(7.0, 6.7, 4.3, 4.0, 3.0, 2.1)
  private val chimeRatios = doubleArrayOf(1.0, 2.76, 3.76)
  private val chimeWeights = doubleArrayOf(0.65, 0.22, 0.08)
  private val chimeTails = doubleArrayOf(1.8, 1.2, 0.8)
  private var nextBowl = rate * 18
  private var nextCluster = rate * 10
  private var nextChime = 0.0
  private var pendingChimes = 0
  private var chimeCursor = 0

  fun reset(seed: Long, sampleRate: Double) {
    random = (seed xor 0x3c6ef372L).let { if (it == 0L) 1L else it }
    rate = sampleRate
    phases.fill(0.0); frequencies.fill(0.0); amplitudes.fill(0.0); decays.fill(0.0)
    ages.fill(0.0); durations.fill(0.0); counts.fill(0)
    nextBowl = rate * 18; nextCluster = rate * 10; nextChime = 0.0
    pendingChimes = 0; chimeCursor = 0; left = 0.0; right = 0.0
  }

  private fun unit(): Double {
    random = random xor (random shl 13)
    random = random xor (random ushr 7)
    random = random xor (random shl 17)
    return (random and 0x00ff_ffffL).toDouble() / 0x00ff_ffffL
  }

  private fun excite(slot: Int, bowl: Boolean) {
    val base = if (bowl) 174 + unit() * 14 else 980 + unit() * 850
    val level = if (bowl) 0.12 else 0.055 + unit() * 0.025
    ages[slot] = 0.0
    durations[slot] = rate * if (bowl) 14.0 else 5.0
    attacks[slot] = rate * if (bowl) 0.045 else 0.009
    pans[slot] = (unit() * 2 - 1) * 0.65
    counts[slot] = if (bowl) 6 else 3
    for (mode in 0 until counts[slot]) {
      val index = slot * 6 + mode
      phases[index] = 0.0
      frequencies[index] = base * if (bowl) bowlRatios[mode] else chimeRatios[mode]
      amplitudes[index] = level * if (bowl) bowlWeights[mode] else chimeWeights[mode]
      decays[index] = exp(-1 / (rate * if (bowl) bowlTails[mode] else chimeTails[mode]))
    }
  }

  fun render(sampleRate: Double, intensity: Double, elapsedSeconds: Double, salience: WorldSalienceScheduler) {
    if (rate != sampleRate) reset(random, sampleRate)
    nextBowl -= 1
    if (nextBowl <= 0) {
      if (salience.reserve(salience = 0.72, durationSeconds = 14.0, recoverySeconds = 4.0)) excite(0, true)
      nextBowl = rate * (28 + unit() * 24)
    }
    nextCluster -= 1
    val gust = sin(elapsedSeconds * PI * 2 / 19.3)
    if (pendingChimes == 0 && nextCluster <= 0 && gust > -0.25) {
      if (salience.reserve(salience = 0.42, durationSeconds = 6.0, recoverySeconds = 2.0)) {
        pendingChimes = if (unit() > 0.45) 3 else 2
        nextChime = 0.0
      }
      nextCluster = rate * (23 - intensity * 5 + unit() * 22)
    }
    if (pendingChimes > 0) {
      nextChime -= 1
      if (nextChime <= 0) {
        excite(1 + chimeCursor % 3, false)
        chimeCursor = (chimeCursor + 1) % 3
        pendingChimes -= 1
        nextChime = rate * (0.35 + unit() * 0.8)
      }
    }
    left = 0.0; right = 0.0
    for (slot in 0 until 4) {
      if (ages[slot] >= durations[slot]) continue
      val attack = 0.5 - 0.5 * cos(PI * min(1.0, ages[slot] / attacks[slot]))
      val release = min(1.0, (durations[slot] - ages[slot]) / (rate * 0.8))
      var value = 0.0
      for (mode in 0 until counts[slot]) {
        val index = slot * 6 + mode
        value += sin(phases[index]) * amplitudes[index]
        phases[index] = (phases[index] + PI * 2 * frequencies[index] / rate) % (PI * 2)
        amplitudes[index] *= decays[index]
      }
      value *= attack * release
      left += value * (1 - pans[slot]) * 0.7
      right += value * (1 + pans[slot]) * 0.7
      ages[slot] += 1
    }
  }
}
