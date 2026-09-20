package expo.modules.inneraudio

import kotlin.math.PI
import kotlin.math.cos
import kotlin.math.exp
import kotlin.math.ln
import kotlin.math.max
import kotlin.math.min
import kotlin.math.pow
import kotlin.math.sin
import kotlin.math.sqrt
import kotlin.math.tan

/**
 * A forest. The wind moves through the canopy in gusts that have no cycle, and leaves catch and let go in clusters as
 * each gust builds: a fine hiss made of tiny grains, individual crinkles, and a low swell of air in the branches. Every
 * so often the wind finds a hollow trunk and howls through it, a breath-driven, wavering tone whose pitch rises as the
 * gust builds and sags as it fades, and a smaller tree deeper in the forest answers. The birds are the engine's own.
 *
 * `intensity` is how much the canopy stirs, `presence` the level of the howl (the forest's identity), `density` how
 * often it comes, and `variety` shortens the wait between howls in the fuller feels. The Swift engine mirrors this file.
 */
internal class ForestModel {
  var left = 0.0
    private set
  var right = 0.0
    private set

  companion object {
    /** The leaves and the howl, at the levels they were auditioned at. */
    const val LEAF_GAIN = 0.0860993752184601
    const val HOWL_GAIN = 2.818382931264454
    /** Extra level of the low swell of air under the leaves. */
    const val LOW_BODY = 6.0
    /** The howl's level, before its gain, for a presence of 1. */
    const val HOWL_LEVEL = 0.34
    /** How much of each partial of the trunk's voice is heard: the fundamental, then the odd partials of a hollow tube. */
    const val PARTIAL_1 = 1.0
    const val PARTIAL_3 = 0.5
    const val PARTIAL_5 = 0.22
    const val PARTIAL_7 = 0.09
    val ROOM_SECONDS = doubleArrayOf(0.0371, 0.0493, 0.0611, 0.0787)
    val ROOM_INPUT = doubleArrayOf(0.55, -0.6, 0.6, -0.5)
    const val ROOM_DECAY_SECONDS = 2.6
    const val GUSTS = 12
    const val VOICES = 96
    const val PENDING = 64
    const val ECHO_SIZE_SECONDS = 1.2
    /** The howl and its answer take this long from the start of the call. */
    const val HOWL_SECONDS = 13.5
    const val ANSWER_DELAY_SECONDS = 7.0
  }

  private var rate = 48_000.0
  private var random = 1L
  private var sample = 0L

  // ---- the leaves
  private val gustStart = DoubleArray(GUSTS)
  private val gustRise = DoubleArray(GUSTS)
  private val gustFall = DoubleArray(GUSTS)
  private val gustAmplitude = DoubleArray(GUSTS)
  private var gustCount = 0
  private var nextGust = 3.0
  private var gustCached = 0.0
  private var slow = 0.0
  private var flutter = 0.0
  private var hpLeft = 0.0
  private var hpRight = 0.0
  private var lpLeft = 0.0
  private var lpRight = 0.0
  private var grainLeft = 0.0
  private var grainRight = 0.0
  private var bodyHighLeft = 0.0
  private var bodyLowLeft = 0.0
  private var bodyHighRight = 0.0
  private var bodyLowRight = 0.0
  private var lowHighLeft = 0.0
  private var lowLowLeft = 0.0
  private var lowHighRight = 0.0
  private var lowLowRight = 0.0
  private var kHp = 0.0
  private var kLp = 0.0
  private var kBodyHigh = 0.0
  private var kBodyLow = 0.0
  private var kLowHigh = 0.0
  private var kLowLow = 0.0
  private var grainDecay = 0.0

  // crinkle voices: short damped resonators, each excited by a burst of noise
  private val vEnv = DoubleArray(VOICES)
  private val vDecay = DoubleArray(VOICES)
  private val vAmp = DoubleArray(VOICES)
  private val vY1 = DoubleArray(VOICES)
  private val vY2 = DoubleArray(VOICES)
  private val vC1 = DoubleArray(VOICES)
  private val vC2 = DoubleArray(VOICES)
  private val vGain = DoubleArray(VOICES)
  private val vPanLeft = DoubleArray(VOICES)
  private val vPanRight = DoubleArray(VOICES)
  private val vAge = IntArray(VOICES)
  private val vMaxAge = IntArray(VOICES)
  private val active = IntArray(VOICES)
  private var activeCount = 0
  private val free = IntArray(VOICES)
  private var freeCount = 0
  // the second and later clicks of a crinkle, a moment after the first
  private val pOn = BooleanArray(PENDING)
  private val pDue = LongArray(PENDING)
  private val pAmp = DoubleArray(PENDING)
  private val pPan = DoubleArray(PENDING)
  private val pFreq = DoubleArray(PENDING)
  private val pQ = DoubleArray(PENDING)
  private val pTau = DoubleArray(PENDING)

  // ---- the howl
  private var howlActive = false
  private var howlAge = 0L
  private var countdown = 0.0
  private var base = 0.0
  private var baseAnswer = 0.0
  private var pan = 0.0
  private var answerPan = 0.0
  private var rise = 0.0
  private var fall = 0.0
  private var riseAnswer = 0.0
  private var fallAnswer = 0.0
  private var excite = 0.0
  private var exciteAnswer = 0.0
  private var tremor = 0.0
  private var tremorAnswer = 0.0
  private var drift = 0.0
  private var airHigh = 0.0
  private var airLow = 0.0
  private var airAnswerHigh = 0.0
  private var airAnswerLow = 0.0
  private var distant = 0.0
  private var answerDistantOne = 0.0
  private var answerDistantTwo = 0.0
  private var echoIndex = 0
  private var echoInLeft = 0.0
  private var echoInRight = 0.0
  private var echoLeft = DoubleArray(1)
  private var echoRight = DoubleArray(1)
  private var kAirHigh = 0.0
  private var kAirLow = 0.0
  private var kAirAnswerHigh = 0.0
  private var kExcite = 0.0
  private var kDistant = 0.0
  private var kAnswerDistant = 0.0
  private var kEchoSmooth = 0.0
  private val trunk = Array(4) { Bandpass() }
  private val answerTrunk = Array(3) { Bandpass() }
  private val room = Room(ROOM_SECONDS)

  /** A state-variable bandpass with unit peak gain, stable while its center moves. */
  private class Bandpass {
    private var ic1 = 0.0
    private var ic2 = 0.0
    fun reset() { ic1 = 0.0; ic2 = 0.0 }
    fun next(x: Double, frequency: Double, q: Double, rate: Double): Double {
      val g = tan(PI * min(frequency, rate * 0.45) / rate)
      val k = 1.0 / q
      val v1 = (ic1 + g * (x - ic2)) / (1.0 + g * (g + k))
      val v2 = ic2 + g * v1
      ic1 = 2.0 * v1 - ic1
      ic2 = 2.0 * v2 - ic2
      return v1 * k
    }
  }

  /** A four-line feedback room: the small reverberant space of the forest. */
  private class Room(private val seconds: DoubleArray) {
    private var lines = Array(4) { DoubleArray(1) }
    private val index = IntArray(4)
    private val length = IntArray(4)
    private val damp = DoubleArray(4)
    private val gain = DoubleArray(4)
    private val out = DoubleArray(4)
    var left = 0.0
      private set
    var right = 0.0
      private set

    fun reset(rate: Double) {
      val size = max(16_384, (seconds.max() * rate).toInt() + 8)
      if (lines[0].size != size) lines = Array(4) { DoubleArray(size) } else for (line in lines) line.fill(0.0)
      index.fill(0); damp.fill(0.0); out.fill(0.0)
      for (q in 0 until 4) {
        length[q] = (seconds[q] * rate).toInt()
        gain[q] = 10.0.pow(-3.0 * seconds[q] / ROOM_DECAY_SECONDS)
      }
      left = 0.0; right = 0.0
    }

    fun process(input: Double, weights: DoubleArray, dampCoefficient: Double) {
      var sum = 0.0
      for (q in 0 until 4) {
        val size = lines[q].size
        val read = lines[q][(index[q] - length[q] + size) % size]
        damp[q] += dampCoefficient * (read - damp[q])
        out[q] = damp[q] * gain[q]
        sum += out[q]
      }
      for (q in 0 until 4) {
        lines[q][index[q]] = out[q] - sum * 0.5 + input * weights[q]
        index[q] = (index[q] + 1) % lines[q].size
      }
      left = (out[0] + out[1] - out[2] - out[3]) * 0.5
      right = (out[0] - out[1] - out[2] + out[3]) * 0.5
    }
  }

  fun reset(seed: Long, sampleRate: Double) {
    rate = sampleRate
    random = (seed xor 0x466f72657374L).let { if (it == 0L) 1L else it }
    sample = 0L
    gustCount = 0; nextGust = 3.0; gustCached = 0.0
    slow = 0.0; flutter = 0.0
    hpLeft = 0.0; hpRight = 0.0; lpLeft = 0.0; lpRight = 0.0; grainLeft = 0.0; grainRight = 0.0
    bodyHighLeft = 0.0; bodyLowLeft = 0.0; bodyHighRight = 0.0; bodyLowRight = 0.0
    lowHighLeft = 0.0; lowLowLeft = 0.0; lowHighRight = 0.0; lowLowRight = 0.0
    activeCount = 0; freeCount = VOICES
    for (i in 0 until VOICES) free[i] = VOICES - 1 - i
    pOn.fill(false)
    howlActive = false; howlAge = 0L; countdown = rate * 14.0
    tremor = 0.0; tremorAnswer = 0.0; drift = 0.0; excite = 0.0; exciteAnswer = 0.0
    airHigh = 0.0; airLow = 0.0; airAnswerHigh = 0.0; airAnswerLow = 0.0
    distant = 0.0; answerDistantOne = 0.0; answerDistantTwo = 0.0
    echoLeft = DoubleArray(max(2, (rate * ECHO_SIZE_SECONDS).toInt()))
    echoRight = DoubleArray(echoLeft.size)
    echoIndex = 0; echoInLeft = 0.0; echoInRight = 0.0
    for (b in trunk) b.reset()
    for (b in answerTrunk) b.reset()
    room.reset(rate)
    left = 0.0; right = 0.0

    kHp = pole(2600.0); kLp = pole(9000.0); kBodyHigh = pole(1500.0); kBodyLow = pole(250.0)
    kLowHigh = pole(600.0); kLowLow = pole(100.0)
    grainDecay = exp(-1.0 / (0.0022 * rate))
    kAirHigh = pole(1000.0); kAirLow = pole(200.0); kAirAnswerHigh = pole(1200.0)
    kExcite = 0.25; kDistant = pole(3600.0); kAnswerDistant = pole(1500.0); kEchoSmooth = 0.02
  }

  private fun pole(hz: Double): Double = 1.0 - exp(-2.0 * PI * hz / rate)

  private fun unit(): Double {
    random = random xor (random shl 13)
    random = random xor (random ushr 7)
    random = random xor (random shl 17)
    return (random ushr 11).toDouble() / 9007199254740992.0
  }

  private fun white(): Double = unit() * 2.0 - 1.0

  private fun gauss(): Double {
    val u1 = max(1e-12, unit())
    val u2 = unit()
    return sqrt(-2.0 * ln(u1)) * cos(2.0 * PI * u2)
  }

  private fun logUniform(low: Double, high: Double): Double = low * (high / low).pow(unit())

  private fun clamp(value: Double, low: Double, high: Double): Double = max(low, min(high, value))

  // ------------------------------------------------------------------ the leaves

  private fun gustLevel(time: Double): Double {
    var total = 0.0
    var i = 0
    while (i < gustCount) {
      val age = time - gustStart[i]
      val length = gustRise[i] + gustFall[i]
      if (age >= length) {
        val last = gustCount - 1
        gustStart[i] = gustStart[last]; gustRise[i] = gustRise[last]; gustFall[i] = gustFall[last]; gustAmplitude[i] = gustAmplitude[last]
        gustCount -= 1
        continue
      }
      val shape = if (age < gustRise[i]) 0.5 - 0.5 * cos(PI * age / gustRise[i]) else 0.5 + 0.5 * cos(PI * (age - gustRise[i]) / gustFall[i])
      total += gustAmplitude[i] * shape
      i += 1
    }
    return total
  }

  private fun spawn(frequency: Double, q: Double, tauMs: Double, amplitude: Double, pan: Double, maxAge: Int) {
    if (freeCount == 0) return
    val v = free[--freeCount]
    val r = exp(-PI * (frequency / q) / rate)
    val theta = 2.0 * PI * frequency / rate
    vC1[v] = 2.0 * r * cos(theta); vC2[v] = -r * r; vGain[v] = (1.0 - r) * 1.5
    vY1[v] = 0.0; vY2[v] = 0.0; vEnv[v] = 1.0; vDecay[v] = exp(-1.0 / (tauMs / 1000.0 * rate)); vAmp[v] = amplitude
    val angle = (pan + 1.0) * PI / 4.0
    vPanLeft[v] = cos(angle) * sqrt(2.0); vPanRight[v] = sin(angle) * sqrt(2.0)
    vAge[v] = 0; vMaxAge[v] = maxAge
    active[activeCount++] = v
  }

  /** One leaf letting go: a few short, bright clicks in a row, each a different leaf. */
  private fun crinkle() {
    var clicks = 1
    if (unit() < 0.55) clicks += 1
    if (unit() < 0.3) clicks += 1
    if (unit() < 0.12) clicks += 2
    val pan = clamp(gauss() * 0.45, -0.85, 0.85)
    var later = 0.0
    for (k in 0 until clicks) {
      val amplitude = 0.9 * min(2.5, exp(0.6 * gauss())) * (if (k == 0) 1.0 else 0.7)
      val frequency = logUniform(1800.0, 7500.0)
      val q = 1.5 + 3.5 * unit()
      val tau = 3.0 + 9.0 * unit()
      if (k == 0) spawn(frequency, q, tau, amplitude, pan, (0.05 * rate).toInt())
      else {
        val ear = pan + gauss() * 0.1
        for (i in 0 until PENDING) {
          if (!pOn[i]) {
            pOn[i] = true; pDue[i] = sample + (rate * later).toLong(); pAmp[i] = amplitude; pPan[i] = ear
            pFreq[i] = frequency; pQ[i] = q; pTau[i] = tau
            break
          }
        }
      }
      later += 0.012 + 0.05 * unit()
    }
  }

  // ------------------------------------------------------------------ the howl

  private fun gust(seconds: Double, rise: Double, fall: Double): Double {
    if (seconds < 0.0 || seconds >= rise + fall) return 0.0
    return if (seconds < rise) 0.5 - 0.5 * cos(PI * seconds / rise) else 0.5 + 0.5 * cos(PI * (seconds - rise) / fall)
  }

  private fun beginHowl() {
    howlActive = true; howlAge = 0L
    base = logUniform(112.0, 168.0)
    baseAnswer = base * (1.28 + 0.24 * unit())
    rise = 2.6 + 1.5 * unit(); fall = 4.2 + 2.2 * unit(); riseAnswer = 2.2 + 1.2 * unit(); fallAnswer = 3.0 + 1.5 * unit()
    pan = (unit() * 2.0 - 1.0) * 0.3
    answerPan = if (pan < 0.0) 0.5 else -0.5
    tremor = 0.0; tremorAnswer = 0.0
  }

  fun render(sampleRate: Double, intensity: Double, presence: Double, density: Double, variety: Double, salience: WorldSalienceScheduler) {
    if (rate != sampleRate) reset(random, sampleRate)
    val i = sample
    val time = i / rate

    // ---- the wind in the canopy: gusts of irregular size and spacing, with no cycle
    if (time >= nextGust && gustCount < GUSTS) {
      gustStart[gustCount] = time
      gustRise[gustCount] = 1.5 + 3.0 * unit()
      gustFall[gustCount] = 2.5 + 4.0 * unit()
      gustAmplitude[gustCount] = 0.5 + 0.5 * unit()
      gustCount += 1
      nextGust = time + (4.0 + 13.0 * unit()) / (0.6 + 0.8 * intensity)
    }
    if (i % 32L == 0L) gustCached = gustLevel(time)
    if (i % 480L == 0L) {
      slow += (0.0 - slow) * 0.006 + 0.05 * gauss(); slow = clamp(slow, -1.0, 1.0)
      flutter += (0.0 - flutter) * 0.05 + 0.25 * gauss(); flutter = clamp(flutter, -1.5, 1.5)
    }
    val activity = clamp(0.10 + 0.05 * slow + gustCached, 0.03, 1.6) * (0.75 + 0.25 * flutter * 0.5) * (0.6 + 0.8 * intensity)

    // dense hiss made of tiny grains
    val whiteLeft = white()
    val whiteRight = white()
    hpLeft += kHp * (whiteLeft - hpLeft); hpRight += kHp * (whiteRight - hpRight)
    lpLeft += kLp * ((whiteLeft - hpLeft) - lpLeft); lpRight += kLp * ((whiteRight - hpRight) - lpRight)
    val grainRate = (120.0 + 2600.0 * activity.pow(1.3)) / rate
    if (unit() < grainRate) grainLeft += exp(0.6 * gauss())
    if (unit() < grainRate) grainRight += exp(0.6 * gauss())
    grainLeft *= grainDecay; grainRight *= grainDecay
    val hissLeft = lpLeft * min(grainLeft, 3.0) * 0.55
    val hissRight = lpRight * min(grainRight, 3.0) * 0.55

    // sparse crinkles, in clusters, more of them as the gust builds
    if (unit() < (0.4 + 11.0 * activity.pow(1.5)) / rate) crinkle()
    for (p in 0 until PENDING) {
      if (pOn[p] && pDue[p] <= i) {
        pOn[p] = false
        spawn(pFreq[p], pQ[p], pTau[p], pAmp[p], pPan[p], (0.05 * rate).toInt())
      }
    }
    var crinkleLeft = 0.0
    var crinkleRight = 0.0
    var n = 0
    while (n < activeCount) {
      val v = active[n]
      val x = white() * vEnv[v]
      vEnv[v] *= vDecay[v]
      val y = vGain[v] * x + vC1[v] * vY1[v] + vC2[v] * vY2[v]
      vY2[v] = vY1[v]; vY1[v] = y
      crinkleLeft += y * vPanLeft[v] * vAmp[v]
      crinkleRight += y * vPanRight[v] * vAmp[v]
      if (++vAge[v] > vMaxAge[v]) {
        free[freeCount++] = v
        active[n] = active[--activeCount]
      } else n++
    }

    // air in the branches, and the low swell of the whole canopy
    val bodyNoiseLeft = white()
    val bodyNoiseRight = white()
    bodyHighLeft += kBodyHigh * (bodyNoiseLeft - bodyHighLeft); bodyLowLeft += kBodyLow * (bodyNoiseLeft - bodyLowLeft)
    bodyHighRight += kBodyHigh * (bodyNoiseRight - bodyHighRight); bodyLowRight += kBodyLow * (bodyNoiseRight - bodyLowRight)
    val bodyGain = 1.6 * activity.pow(1.1)
    val bodyLeft = (bodyHighLeft - bodyLowLeft) * bodyGain
    val bodyRight = (bodyHighRight - bodyLowRight) * bodyGain
    lowHighLeft += kLowHigh * (bodyNoiseLeft - lowHighLeft); lowLowLeft += kLowLow * (bodyNoiseLeft - lowLowLeft)
    lowHighRight += kLowHigh * (bodyNoiseRight - lowHighRight); lowLowRight += kLowLow * (bodyNoiseRight - lowLowRight)
    val lowGain = LOW_BODY * activity.pow(1.2)
    val lowLeft = (lowHighLeft - lowLowLeft) * lowGain
    val lowRight = (lowHighRight - lowLowRight) * lowGain
    val leavesLeft = hissLeft * 0.9 + crinkleLeft * 0.30 + bodyLeft * 0.55 + lowLeft
    val leavesRight = hissRight * 0.9 + crinkleRight * 0.30 + bodyRight * 0.55 + lowRight

    // ---- the howl: wind through a hollow trunk, and a second tree answering
    val fullness = clamp((variety - 0.6) / 0.4, 0.0, 1.0)
    if (!howlActive) {
      countdown -= 1.0
      if (countdown <= 0.0) {
        if (presence > 0.0001 && salience.reserve(salience = 0.5, durationSeconds = 13.2, recoverySeconds = 4.0)) {
          beginHowl()
          countdown = rate * (110.0 - 84.0 * fullness + unit() * (70.0 - 58.0 * fullness)) / clamp(density, 0.2, 1.0)
        } else {
          countdown = rate * 3.0
        }
      }
    }
    var main = 0.0
    var answer = 0.0
    if (howlActive) {
      val seconds = howlAge / rate
      if (howlAge % 240L == 0L) {
        tremor += (0.0 - tremor) * 0.08 + 0.22 * gauss(); tremor = clamp(tremor, -1.0, 1.0)
        tremorAnswer += (0.0 - tremorAnswer) * 0.08 + 0.22 * gauss(); tremorAnswer = clamp(tremorAnswer, -1.0, 1.0)
        drift += (0.0 - drift) * 0.02 + 0.12 * gauss(); drift = clamp(drift, -1.0, 1.0)
      }
      val wind = gust(seconds, rise, fall)
      val pitch = base * (0.90 + 0.30 * wind.pow(0.8)) * (1.0 + 0.004 * drift)
      excite += kExcite * (white() - excite)
      val jet = excite * wind.pow(1.25) * (1.0 + 0.32 * tremor)
      val voice = trunk[0].next(jet, pitch, 26.0, rate) * sqrt(26.0) * PARTIAL_1 +
        trunk[1].next(jet, pitch * 3.0, 30.0, rate) * sqrt(30.0 / 3.0) * PARTIAL_3 +
        trunk[2].next(jet, pitch * 5.0, 24.0, rate) * sqrt(24.0 / 5.0) * PARTIAL_5 +
        trunk[3].next(jet, pitch * 7.0, 16.0, rate) * sqrt(16.0 / 7.0) * PARTIAL_7
      val airNoise = white()
      airHigh += kAirHigh * (airNoise - airHigh); airLow += kAirLow * (airNoise - airLow)
      val whoosh = (airHigh - airLow) * wind.pow(1.8) * 0.7
      main = voice * 0.55 + whoosh
      val answerSeconds = seconds - ANSWER_DELAY_SECONDS
      val answerWind = gust(answerSeconds, riseAnswer, fallAnswer)
      if (answerWind > 0.0) {
        val answerPitch = baseAnswer * (0.9 + 0.3 * answerWind.pow(0.8)) * (1.0 + 0.004 * drift)
        exciteAnswer += kExcite * (white() - exciteAnswer)
        val answerJet = exciteAnswer * answerWind.pow(1.25) * (1.0 + 0.32 * tremorAnswer)
        val answerVoice = answerTrunk[0].next(answerJet, answerPitch, 26.0, rate) * sqrt(26.0) * PARTIAL_1 +
          answerTrunk[1].next(answerJet, answerPitch * 3.0, 30.0, rate) * sqrt(30.0 / 3.0) * PARTIAL_3 * 0.9 +
          answerTrunk[2].next(answerJet, answerPitch * 5.0, 24.0, rate) * sqrt(24.0 / 5.0) * PARTIAL_5 * 0.7
        val answerAir = white()
        airAnswerHigh += kAirAnswerHigh * (answerAir - airAnswerHigh); airAnswerLow += kAirLow * (answerAir - airAnswerLow)
        answer = (answerVoice * 0.55 + (airAnswerHigh - airAnswerLow) * answerWind.pow(1.8) * 0.6) * 0.5
        answerDistantOne += kAnswerDistant * (answer - answerDistantOne)
        answerDistantTwo += kAnswerDistant * (answerDistantOne - answerDistantTwo)
        answer = answerDistantTwo
      }
      howlAge += 1
      if (seconds > HOWL_SECONDS) howlActive = false
    }
    // distance: the trees are not next to you, so their highs are soft
    distant += kDistant * (main - distant)
    val dryLeft = distant * (1.0 - pan) + answer * (1.0 - answerPan)
    val dryRight = distant * (1.0 + pan) + answer * (1.0 + answerPan)
    val size = echoLeft.size
    val first = (echoIndex - (rate * 0.19).toInt() + size) % size
    val second = (echoIndex - (rate * 0.43).toInt() + size) % size
    val third = (echoIndex - (rate * 0.79).toInt() + size) % size
    val reflectionLeft = echoLeft[first] * 0.42 + echoLeft[second] * 0.28 + echoLeft[third] * 0.18
    val reflectionRight = echoRight[first] * 0.42 + echoRight[second] * 0.28 + echoRight[third] * 0.18
    echoInLeft += kEchoSmooth * (reflectionLeft - echoInLeft)
    echoInRight += kEchoSmooth * (reflectionRight - echoInRight)
    echoLeft[echoIndex] = dryLeft + echoInRight * 0.45
    echoRight[echoIndex] = dryRight + echoInLeft * 0.45
    echoIndex = (echoIndex + 1) % size
    room.process((dryLeft + dryRight) * 0.5, ROOM_INPUT, 0.25)
    val level = HOWL_LEVEL * clamp(presence, 0.0, 1.5)
    val howlLeft = (dryLeft + echoInLeft * 0.5 + room.left * 1.4) * level
    val howlRight = (dryRight + echoInRight * 0.5 + room.right * 1.4) * level

    left = leavesLeft * LEAF_GAIN + howlLeft * HOWL_GAIN
    right = leavesRight * LEAF_GAIN + howlRight * HOWL_GAIN
    sample = i + 1
  }
}
