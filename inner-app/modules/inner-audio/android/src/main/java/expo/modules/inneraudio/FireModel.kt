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
import kotlin.math.tanh

/**
 * A hearth. A warm body, a breath of flame, and a hiss made of thousands of tiny crackles, with sharper pops
 * that arrive in bursts; none of it on a fixed rhythm. Every few dozen seconds a log settles (a low thump and a
 * cascade of crackle, sometimes with the soft steam of a damp log), and across the night the wind in the
 * chimney sings a hollow, pitched moan in gusts that the flames answer a moment later.
 *
 * The fire settles with the night: the engine's `intensity` is its liveliness, so a fire given less intensity
 * has fewer crackles, fewer gusts, and a quieter roar. `presence` scales the settling logs and the wind (the
 * fire's identity), `density` how often logs settle, and `variety` gives each settle its own gesture, lifts
 * the wind so it is heard in the fuller feels, and lets the window answer some gusts with a glass rattle. The
 * Swift engine mirrors this file.
 */
internal class FireModel {
  var left = 0.0
    private set
  var right = 0.0
    private set

  private companion object {
    const val VOICES = 128
    const val PENDING = 320
    const val RATTLE_MODES = 48
    const val RATTLE_PENDING = 12
    const val RATTLE_TICK_AGAIN = 0
    const val RATTLE_LATCH = 1
    const val RATTLE_LATCH_AGAIN = 2

    // The mix balance the fire was tuned to by ear, per component (already scaled to the engine's level).
    const val GAIN_BODY = 0.8377798946198128
    const val GAIN_ROAR = 0.33875847621449856
    const val GAIN_GRAIN = 0.03054438309889512
    const val GAIN_TICK = 1.0434365981072087
    const val GAIN_POP = 11.79235856228342
    const val GAIN_THUMP = 7.652996789451071
    const val GAIN_RUSTLE = 0.6880952886668884
    const val GAIN_SIZZLE = 1.0412697018660328
    const val GAIN_STEAM = 0.18976812425198972
    const val GAIN_WIND = 0.6626209401278369
    /** Ceilings that soften the sharpest ticks, pops and thumps so none stands out from the body. */
    const val LIMIT_TICK = 0.30
    const val LIMIT_POP = 0.75
    const val LIMIT_THUMP = 0.30
    /** A final lift of 1 dB, so the new fire sits close to the level of the one it replaces in every feel. */
    const val OUTPUT_TRIM = 1.1220184543019633

    /**
     * From variety 0 (Gentle, exactly as it was) to 1 (Immersive) the wind is lifted so it stays in the ear against
     * the fire and the bed: this much more at full variety (about 2 dB), and it follows the fire's liveliness less
     * steeply as the hearth burns down (exponent 0.85 at variety 0, this at full variety), never below its floor.
     */
    const val WIND_LIFT_AT_FULL_VARIETY = 0.26
    const val WIND_FOLLOW_AT_FULL_VARIETY = 0.2
    const val WIND_FLOOR_AT_FULL_VARIETY = 0.45
    /** Immersive alone (variety 0.6 to 1) adds another 2 dB to the wind; Gentle and Deep are untouched by it. */
    const val WIND_IMMERSIVE_BOOST = 1.2589254117941673
    const val WIND_IMMERSIVE_FROM = 0.6
    /** Overtones of the flue's moan: hollow, favouring the odd partials. */
    val WIND_PARTIALS = doubleArrayOf(1.0, 0.22, 0.5, 0.1, 0.24, 0.05)
    val WIND_ROOM_INPUT = doubleArrayOf(0.5, -0.6, 0.6, -0.5)
    val WIND_ROOM_SECONDS = doubleArrayOf(0.0257, 0.0331, 0.0413, 0.0509)
    val STEAM_ROOM_INPUT = doubleArrayOf(0.6, -0.5, 0.5, -0.6)
    val STEAM_ROOM_SECONDS = doubleArrayOf(0.0231, 0.0297, 0.0379, 0.0463)
    /** Both small rooms fade over this long: the steam and the wind sit in the same chimney-warm space. */
    const val ROOM_DECAY_SECONDS = 5.5

    /**
     * The window answers the wind (Deep and Immersive): about one gust in three of a busy hearth makes a loose pane
     * and latch chatter. The chance falls with the fire's liveliness, so it is rare once the hearth has burned down.
     */
    const val RATTLE_ANSWER = 0.4
    const val RATTLE_BUSY_EXPONENT = 1.5
    const val RATTLE_BUSY_FLOOR = 0.1
    /** The pane sits to the left, partly in the room: how far left, and how much of it is the room. */
    const val RATTLE_PAN = -0.55
    const val RATTLE_WET = 0.35
    /** A gust must have blown this long before the pane chatters, and it settles this long before the gust ends. */
    const val RATTLE_LEAD_SECONDS = 0.4
    const val RATTLE_GAIN = 0.5
    /** The latch clinks a little softer than the glass ticks. */
    const val RATTLE_LATCH_LEVEL = 0.7
    /** Balances the glass ticks and latch clinks against the buzz, as auditioned. */
    const val RATTLE_MODE_GAIN = 0.4
    /** Brings the pane's small room to the strength it was auditioned at. */
    const val RATTLE_ROOM_OUT = 3.359
    const val RATTLE_ROOM_DECAY_SECONDS = 1.1
    /** Turns the chatter's slow noise into one of unit strength. */
    const val CHATTER_SCALE = 40.65263386191886
    /** Where the pane sits: the dry share of its signal in each ear, and its room in the rest. */
    val RATTLE_DRY_LEFT = cos((RATTLE_PAN + 1.0) * PI / 4.0) * sqrt(2.0) * (1.0 - RATTLE_WET * 0.5)
    val RATTLE_DRY_RIGHT = sin((RATTLE_PAN + 1.0) * PI / 4.0) * sqrt(2.0) * (1.0 - RATTLE_WET * 0.5)
    const val RATTLE_SALT = 0x48757365L
    val RATTLE_ROOM_INPUT = doubleArrayOf(0.5, -0.6, 0.6, -0.5)
    val RATTLE_ROOM_SECONDS = doubleArrayOf(0.0197, 0.0281, 0.0353, 0.0449)

    const val TYPE_TICK = 0
    const val TYPE_POP = 1
    const val TYPE_KNOCK = 2
    const val TYPE_BRIGHT_TICK = 3
    const val TYPE_PING = 4
  }

  private var rate = 48_000.0
  private var seed = 1L
  private var fireSeed = 1L
  private var random = 1L
  private var sample = 0L
  private var activityStarted = false

  // slow, non-periodic modulation and the fire's overall liveliness
  private var slow = 0.0
  private var mid = 0.0
  private var fast = 0.0
  private var activity = 0.5
  private var bodyLeft = 0.0
  private var bodyRight = 0.0
  private var roarHiLeft = 0.0
  private var roarLoLeft = 0.0
  private var roarHiRight = 0.0
  private var roarLoRight = 0.0
  private var hpLeft = 0.0
  private var hpRight = 0.0
  private var grain = 0.0
  private var crackleT = 0.0
  private var crackleP = 0.0
  private var rustle = 0.0
  private var rustleDecay = 0.0
  private var rustleLow = 0.0
  private var rustleHigh = 0.0
  private var sizzleAge = -1.0
  private var sizzleLength = 0.0
  private var sizzleHp = 0.0
  private var flare = 0.0
  private var flareLeft = 0.0
  private var flarePeak = 1.5
  private var flareUp = false

  // the chimney wind
  private var gustAt = 0L
  private var gustAge = -1.0
  private var gustDuration = 0.0
  private var gustAmplitude = 0.0
  private var gustVoice = 1.0
  private var gustEnvelope = 0.0
  private var gustDelayed = 0.0
  private var windJitter = 0.0
  private var flareAt = -1L
  private var flareAmplitude = 1.5
  private var windL = 0.0
  private var windR = 0.0
  private var breathLowLeft = 0.0
  private var breathHighLeft = 0.0
  private var breathLowRight = 0.0
  private var breathHighRight = 0.0
  private val windPhases = DoubleArray(6)

  // the window answering the wind: its own random stream, so nothing else in the fire is disturbed by it
  private var rattleRandom = 1L
  private var rattleGust = false
  private var rattleLive = false
  private var rattleMono = 0.0
  private var rattleLeft = 0.0
  private var rattleRight = 0.0
  private var chatterOne = 0.0
  private var chatterTwo = 0.0
  private var buzzHighOne = 0.0
  private var buzzHighTwo = 0.0
  private var buzzLowOne = 0.0
  private var buzzLowTwo = 0.0
  private var kChatter = 0.0
  private var kBuzzHigh = 0.0
  private var kBuzzLow = 0.0
  private val mRe = DoubleArray(RATTLE_MODES)
  private val mIm = DoubleArray(RATTLE_MODES)
  private val mCos = DoubleArray(RATTLE_MODES)
  private val mSin = DoubleArray(RATTLE_MODES)
  private val mAge = IntArray(RATTLE_MODES)
  private val mMaxAge = IntArray(RATTLE_MODES)
  private val mActive = IntArray(RATTLE_MODES)
  private var mActiveCount = 0
  private val mFree = IntArray(RATTLE_MODES)
  private var mFreeCount = 0
  private val rKind = IntArray(RATTLE_PENDING)
  private val rAmp = DoubleArray(RATTLE_PENDING)
  private val rFreq = DoubleArray(RATTLE_PENDING)
  private val rDue = LongArray(RATTLE_PENDING) { -1L }
  private var rNextDue = Long.MAX_VALUE
  private val rattleRoom = Room(RATTLE_ROOM_SECONDS, RATTLE_ROOM_DECAY_SECONDS)

  // settling logs and their steam
  private var settleAt = 0L
  private var settleCount = 0L
  private var steamAge = -1.0
  private var steamTau = 1.6
  private var steamAmplitude = 1.0
  private var steamRise = 1.0
  private var steamFall = 1.0
  private var steamFallStep = 0.0
  private var steamLow = 0.0
  private var steamHigh = 0.0
  private var spatter = 0.0

  // constants derived from the sample rate
  private var kSlow = 0.0
  private var kMid = 0.0
  private var kFast = 0.0
  private var nSlow = 1.0
  private var nMid = 1.0
  private var nFast = 1.0
  private var kRoarHigh = 0.0
  private var kRoarLow = 0.0
  private var kHp = 0.0
  private var grainDecay = 0.0
  private var crackleTDecay = 0.0
  private var crackleGDecay = 0.0
  private var kRustleHigh = 0.0
  private var kRustleLow = 0.0
  private var kSizzle = 0.0
  private var flareRiseStep = 0.0
  private var flareFallStep = 0.0
  private var kDelay = 0.0
  private var kBreathHigh = 0.0
  private var kBreathLow = 0.0
  private var kSteamLow = 0.0
  private var kSteamHigh = 0.0
  private var spatterDecay = 0.0
  private var steamRiseDecay = 0.0

  // the two small rooms
  private val steamRoom = Room(STEAM_ROOM_SECONDS)
  private val windRoom = Room(WIND_ROOM_SECONDS)

  // event voices: short damped resonators, each excited by a burst of noise
  private val vComp = IntArray(VOICES)
  private val vEnv = DoubleArray(VOICES)
  private val vEnvDecay = DoubleArray(VOICES)
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

  // events scheduled a little ahead: the ticks and pops of a cascade, a second knock, sparks and pings
  private val pType = IntArray(PENDING)
  private val pAmp = DoubleArray(PENDING)
  private val pMult = DoubleArray(PENDING)
  private val pDue = LongArray(PENDING) { -1L }
  private var nextDue = Long.MAX_VALUE

  private val sumLeft = DoubleArray(4)
  private val sumRight = DoubleArray(4)

  /** A four-line feedback delay network: orthogonal mixing, damped highs, a long low-frequency decay. */
  private class Room(private val seconds: DoubleArray, private val decaySeconds: Double = ROOM_DECAY_SECONDS) {
    private val lines = Array(4) { DoubleArray(4096) }
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
      for (line in lines) line.fill(0.0)
      index.fill(0); damp.fill(0.0); out.fill(0.0)
      for (q in 0 until 4) {
        length[q] = (seconds[q] * rate).toInt()
        gain[q] = 10.0.pow(-3.0 * seconds[q] / decaySeconds)
      }
      left = 0.0; right = 0.0
    }

    fun process(input: Double, weights: DoubleArray) {
      var sum = 0.0
      for (q in 0 until 4) {
        val size = lines[q].size
        val read = lines[q][(index[q] - length[q] + size) % size]
        damp[q] += 0.3 * (read - damp[q])
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
    this.seed = seed
    rate = sampleRate
    fireSeed = seed xor 0x46697265L
    random = (seed xor 0x46697265456d6265L).let { if (it == 0L) 1L else it }
    sample = 0L
    activityStarted = false
    slow = 0.0; mid = 0.0; fast = 0.0
    bodyLeft = 0.0; bodyRight = 0.0
    roarHiLeft = 0.0; roarLoLeft = 0.0; roarHiRight = 0.0; roarLoRight = 0.0
    hpLeft = 0.0; hpRight = 0.0
    grain = 0.0; crackleT = 0.0; crackleP = 0.0
    rustle = 0.0; rustleDecay = exp(-1.0 / (0.45 * rate)); rustleLow = 0.0; rustleHigh = 0.0
    sizzleAge = -1.0; sizzleLength = 0.0; sizzleHp = 0.0
    flare = 0.0; flareLeft = 0.0; flarePeak = 1.5; flareUp = false
    gustAge = -1.0; gustDuration = 0.0; gustAmplitude = 0.0; gustVoice = 1.0; gustEnvelope = 0.0; gustDelayed = 0.0
    windJitter = 0.0; flareAt = -1L; flareAmplitude = 1.5
    windL = 0.0; windR = 0.0
    breathLowLeft = 0.0; breathHighLeft = 0.0; breathLowRight = 0.0; breathHighRight = 0.0
    windPhases.fill(0.0)
    steamAge = -1.0; steamLow = 0.0; steamHigh = 0.0; spatter = 0.0
    steamRoom.reset(rate); windRoom.reset(rate); rattleRoom.reset(rate)
    rattleRandom = (fireSeed xor RATTLE_SALT).let { if (it == 0L) 1L else it }
    rattleGust = false; rattleLive = false
    rattleMono = 0.0; rattleLeft = 0.0; rattleRight = 0.0
    chatterOne = 0.0; chatterTwo = 0.0; buzzHighOne = 0.0; buzzHighTwo = 0.0; buzzLowOne = 0.0; buzzLowTwo = 0.0
    mActiveCount = 0; mFreeCount = RATTLE_MODES
    for (m in 0 until RATTLE_MODES) mFree[m] = RATTLE_MODES - 1 - m
    rDue.fill(-1L); rNextDue = Long.MAX_VALUE
    settleCount = 0L
    resetVoices()
    pDue.fill(-1L); nextDue = Long.MAX_VALUE
    sumLeft.fill(0.0); sumRight.fill(0.0)
    left = 0.0; right = 0.0

    kSlow = 1 - exp(-2 * PI * 0.11 / rate); kMid = 1 - exp(-2 * PI * 0.9 / rate); kFast = 1 - exp(-2 * PI * 3.5 / rate)
    nSlow = sqrt((kSlow / (2 - kSlow)) / 3); nMid = sqrt((kMid / (2 - kMid)) / 3); nFast = sqrt((kFast / (2 - kFast)) / 3)
    kRoarHigh = 1 - exp(-2 * PI * 900 / rate); kRoarLow = 1 - exp(-2 * PI * 250 / rate)
    kHp = 1 - exp(-2 * PI * 1500 / rate)
    grainDecay = exp(-1 / (0.0025 * rate))
    crackleTDecay = exp(-1 / (0.025 * rate)); crackleGDecay = exp(-1 / (0.15 * rate))
    kRustleHigh = 1 - exp(-2 * PI * 2500 / rate); kRustleLow = 1 - exp(-2 * PI * 400 / rate)
    kSizzle = 1 - exp(-2 * PI * 4000 / rate)
    flareRiseStep = 1 - exp(-1 / (0.7 * rate)); flareFallStep = exp(-1 / (2.0 * rate))
    kDelay = 1 - exp(-1 / (0.35 * rate))
    kBreathHigh = 1 - exp(-2 * PI * 1700 / rate); kBreathLow = 1 - exp(-2 * PI * 550 / rate)
    kSteamLow = 1 - exp(-2 * PI * 1800 / rate); kSteamHigh = 1 - exp(-2 * PI * 6500 / rate)
    spatterDecay = exp(-1 / (0.003 * rate))
    steamRiseDecay = exp(-1 / (0.2 * rate))
    kChatter = 1 - exp(-2 * PI * 55.0 / rate); kBuzzHigh = 1 - exp(-2 * PI * 4200.0 / rate); kBuzzLow = 1 - exp(-2 * PI * 1300.0 / rate)

    gustAt = (rate * (8.0 + 8.0 * unit())).toLong()
    settleAt = (rate * (25.0 + 20.0 * unit())).toLong()
  }

  private fun resetVoices() {
    activeCount = 0
    freeCount = VOICES
    for (i in 0 until VOICES) free[i] = VOICES - 1 - i
  }

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

  private fun clampPan(pan: Double, limit: Double): Double = max(-limit, min(limit, pan))

  private fun spawn(comp: Int, frequency: Double, q: Double, tauMs: Double, amplitude: Double, pan: Double, maxAge: Int) {
    if (freeCount == 0) return
    val v = free[--freeCount]
    val bandwidth = frequency / q
    val r = exp(-PI * bandwidth / rate)
    val theta = 2 * PI * frequency / rate
    vComp[v] = comp; vY1[v] = 0.0; vY2[v] = 0.0
    vC1[v] = 2 * r * cos(theta); vC2[v] = -r * r; vGain[v] = (1 - r) * 1.5
    vEnv[v] = 1.0; vEnvDecay[v] = exp(-1 / (tauMs / 1000.0 * rate)); vAmp[v] = amplitude
    vAge[v] = 0; vMaxAge[v] = maxAge
    val angle = (pan + 1) * PI / 4
    vPanLeft[v] = cos(angle) * sqrt(2.0); vPanRight[v] = sin(angle) * sqrt(2.0)
    active[activeCount++] = v
  }

  private fun schedule(seconds: Double, type: Int, amplitude: Double, mult: Double) {
    for (i in 0 until PENDING) {
      if (pDue[i] < 0L) {
        val due = sample + (rate * seconds).toLong()
        pDue[i] = due; pType[i] = type; pAmp[i] = amplitude; pMult[i] = mult
        if (due < nextDue) nextDue = due
        return
      }
    }
  }

  private fun spawnTick(scale: Double, mult: Double) {
    val f = logUniform(1500.0, 9000.0)
    val q = 1.5 + 2.5 * unit()
    val tau = 0.35 + 0.9 * unit()
    val amp = 0.5 * scale * min(3.0, exp(0.8 * gauss())) * mult
    spawn(0, f, q, tau, amp, clampPan(gauss() * 0.4, 0.7), (0.02 * rate).toInt())
  }

  private fun spawnPop(scale: Double, mult: Double) {
    val dull = unit() < 0.12                                       // a few duller pops; the rest are bright snaps
    val f = if (dull) logUniform(250.0, 700.0) else logUniform(900.0, 5500.0)
    val q = if (dull) 1.5 + unit() else 1.6 + 3.4 * unit()         // low Q: broadband, never a pitched knock
    val tau = if (dull) 1.8 + 1.5 * unit() else 0.5 + 1.1 * unit()
    val amp = 2.4 * scale * min(2.0, exp(0.5 * gauss())) * (if (dull) 0.8 else 1.0) * mult
    val pan = clampPan(gauss() * 0.4, 0.7)
    spawn(1, f, q, tau, amp, pan, (0.06 * rate).toInt())
    spawn(1, logUniform(2500.0, 8000.0), 0.9, 0.25 + 0.3 * unit(), amp * 0.9, pan, (0.01 * rate).toInt())   // the crack itself
  }

  private fun spawnThump(frequency: Double, amplitude: Double, mult: Double) {
    val q = 2.2 + 1.2 * unit()
    spawn(2, frequency, q, 7.0, amplitude * mult, clampPan(gauss() * 0.25, 0.4), (0.6 * rate).toInt())
  }

  private fun spawnBrightTick(scale: Double, mult: Double) {
    val f = logUniform(4000.0, 9500.0)
    val q = 1.5 + 2.0 * unit()
    val tau = 0.3 + 0.5 * unit()
    val amp = 0.5 * scale * min(2.5, exp(0.6 * gauss())) * mult
    spawn(0, f, q, tau, amp, clampPan(gauss() * 0.5, 0.8), (0.02 * rate).toInt())
  }

  private fun spawnPing(mult: Double) {
    spawn(1, logUniform(2200.0, 5200.0), 26.0, 0.6, 1.4 * mult, clampPan(gauss() * 0.4, 0.7), (0.25 * rate).toInt())
  }

  private fun spawnSpit(envelope: Double) {
    val f = logUniform(1200.0, 3600.0)
    val q = 1.8 + unit()
    val tau = 0.5 + 0.6 * unit()
    spawn(3, f, q, tau, 0.7 * min(1.0, 0.4 + envelope), clampPan(gauss() * 0.45, 0.7), (0.02 * rate).toInt())
  }

  private fun runPending() {
    var newDue = Long.MAX_VALUE
    for (i in 0 until PENDING) {
      val due = pDue[i]
      if (due < 0L) continue
      if (due <= sample) {
        pDue[i] = -1L
        val m = pMult[i]
        when (pType[i]) {
          TYPE_TICK -> spawnTick(pAmp[i], m)
          TYPE_POP -> spawnPop(pAmp[i], m)
          TYPE_KNOCK -> spawn(2, logUniform(150.0, 260.0), 3.5, 6.0, 3.6 * pAmp[i] * m, gauss() * 0.2, (0.3 * rate).toInt())
          TYPE_BRIGHT_TICK -> spawnBrightTick(pAmp[i], m)
          else -> spawnPing(m)
        }
      } else if (due < newDue) newDue = due
    }
    nextDue = newDue
  }

  /** Renders one sample of the fire into [left] and [right]. */
  fun render(sampleRate: Double, intensity: Double, presence: Double, density: Double, variety: Double, salience: WorldSalienceScheduler) {
    if (rate != sampleRate) reset(seed, sampleRate)
    val i = sample
    val t = i / rate
    val mu = max(0.08, min(1.0, intensity * 1.25))
    if (!activityStarted) { activity = mu; activityStarted = true }
    if (i % 480L == 0L) {   // the fire's liveliness wanders on its own, with no period, toward the level it is given
      activity += (mu - activity) * 0.012 + 0.03 * gauss()
      activity = max(0.08, min(1.0, activity))
    }
    val a = activity
    val mult = presence

    val wS = white()
    slow += kSlow * (wS - slow); mid += kMid * (white() - mid); fast += kFast * (white() - fast)
    val flame = max(0.35, 1 + 0.08 * (slow / nSlow) + 0.065 * (mid / nMid) + 0.03 * (fast / nFast))
    val wL = 0.6 * wS + 0.8 * white()
    val wR = 0.6 * wS + 0.8 * white()
    bodyLeft += 0.0177 * (wL - bodyLeft); bodyRight += 0.0177 * (wR - bodyRight)
    roarHiLeft += kRoarHigh * (wL - roarHiLeft); roarLoLeft += kRoarLow * (wL - roarLoLeft)
    roarHiRight += kRoarHigh * (wR - roarHiRight); roarLoRight += kRoarLow * (wR - roarLoRight)
    if (flareUp) {
      flare += (1 - flare) * flareRiseStep
      flareLeft -= 1.0
      if (flareLeft <= 0.0) flareUp = false
    } else flare *= flareFallStep
    val bodyGain = flame * (0.45 + 0.55 * a) * (1 + 0.12 * gustDelayed)
    val roarGain = flame * (0.2 + 0.8 * a) * (1 + flarePeak * flare) * (1 + 0.5 * gustDelayed)
    val outBodyL = bodyLeft * 4.2 * bodyGain
    val outBodyR = bodyRight * 4.2 * bodyGain
    val outRoarL = (roarHiLeft - roarLoLeft) * 2.2 * roarGain
    val outRoarR = (roarHiRight - roarLoRight) * 2.2 * roarGain

    // the hiss is made of crackle: high-passed noise that only sounds where tiny grains are firing
    hpLeft += kHp * (wL - hpLeft); hpRight += kHp * (wR - hpRight)
    if (unit() < (120 + 900 * a) / rate) grain += exp(0.6 * gauss())
    grain *= grainDecay
    val g = min(grain, 3.0)
    val outGrainL = (wL - hpLeft) * g
    val outGrainR = (wR - hpRight) * g
    crackleT *= crackleTDecay; crackleP *= crackleGDecay

    // ---- wind gusts: busy while the fire is lively, sparse and soft as it burns down
    if (i == gustAt) {
      if (salience.isSuppressed()) gustAt = i + (3.0 * rate).toLong()
      else {
        val amplitudeScale = max(0.15, min(1.0, (a / 0.85).pow(0.85)))
        gustAge = 0.0
        gustDuration = (4.5 + 4.5 * unit()) * rate
        gustAmplitude = (0.55 + 0.45 * unit()) * amplitudeScale
        // The flames still answer the gust as before; only how loudly the wind itself sounds is lifted.
        gustVoice = if (variety > 0.0) windVoice(a, variety, amplitudeScale) else 1.0
        rattleGust = false
        if (variety > 0.0) answerGust(a)
        var gap = (17.0 + 21.0 * unit()) * (0.85 / a).pow(1.15)
        if (unit() < 0.25) gap = gustDuration / rate * 0.85 + 1.0 + 2.5 * unit()      // sometimes a second gust follows on
        gustAt = i + (gap * rate).toLong()
        flareAt = i + (0.3 * rate).toLong()
        flareAmplitude = 0.7 + 1.5 * gustAmplitude
      }
    }
    if (gustAge >= 0.0) {
      val u = gustAge / gustDuration
      gustEnvelope = gustAmplitude * (if (u < 0.35) 0.5 - 0.5 * cos(PI * u / 0.35) else 0.5 + 0.5 * cos(PI * (u - 0.35) / 0.65))
      gustAge += 1.0
      if (gustAge >= gustDuration) { gustAge = -1.0; gustEnvelope = 0.0 }
    }
    gustDelayed += kDelay * (gustEnvelope - gustDelayed)
    if (i == flareAt && !flareUp && flare < 0.3) { flareUp = true; flareLeft = (0.5 * gustDuration / rate + 0.6) * rate; flarePeak = flareAmplitude }
    if (gustEnvelope > 0.0 || gustDelayed > 0.001) {
      windJitter += 0.00025 * gauss(); windJitter *= 0.9999
      val f0 = (165 + 115 * gustEnvelope) * (1 + windJitter)
      val amp = gustEnvelope.pow(1.25)
      var tone = 0.0
      for (p in 0 until 6) {
        windPhases[p] = (windPhases[p] + 2 * PI * f0 * (p + 1) / rate) % (2 * PI)
        tone += WIND_PARTIALS[p] * sin(windPhases[p])
      }
      val bnL = white()
      val bnR = white()
      breathLowLeft += kBreathLow * (bnL - breathLowLeft); breathHighLeft += kBreathHigh * (bnL - breathHighLeft)
      breathLowRight += kBreathLow * (bnR - breathLowRight); breathHighRight += kBreathHigh * (bnR - breathHighRight)
      val breath = gustEnvelope.pow(1.6)
      val windTone = tone * amp * 0.16
      windL = (windTone + (breathHighLeft - breathLowLeft) * 4.0 * breath * 0.5) * mult * gustVoice
      windR = (windTone + (breathHighRight - breathLowRight) * 4.0 * breath * 0.5) * mult * gustVoice
    } else { windL = 0.0; windR = 0.0 }

    // ---- the window answers the wind: a loose pane buzzing in its frame, with small glass ticks and a latch clink
    if (rattleLive) {
      var mono = 0.0
      if (rattleGust && gustAge >= 0.0) {
        val e = min(1.0, gustEnvelope)
        val age = gustAge / rate
        val remaining = (gustDuration - gustAge) / rate
        val mask = max(0.0, min(1.0, (age - (RATTLE_LEAD_SECONDS - 0.075)) / 0.15)) * max(0.0, min(1.0, (remaining - (RATTLE_LEAD_SECONDS - 0.075)) / 0.15))
        // the buzz: bursty band-limited noise, chattering at tens of hertz, following how hard the gust blows
        chatterOne += kChatter * (rattleWhite() - chatterOne); chatterTwo += kChatter * (chatterOne - chatterTwo)
        val slowNoise = max(0.0, chatterTwo * CHATTER_SCALE)
        val chatter = slowNoise * slowNoise
        val noise = rattleWhite() * 1.7320508075688772
        buzzHighOne += kBuzzHigh * (noise - buzzHighOne); buzzHighTwo += kBuzzHigh * (buzzHighOne - buzzHighTwo)
        buzzLowOne += kBuzzLow * (buzzHighTwo - buzzLowOne)
        val band = buzzHighTwo - buzzLowOne
        buzzLowTwo += kBuzzLow * (band - buzzLowTwo)
        mono += (band - buzzLowTwo) * chatter * e.pow(1.6) * mask * 0.55
        // the ticks: dry, short and high, more often as the gust builds
        if (age >= 0.8 && remaining >= 0.6 && rattleUnit() < (5.0 * e * e + 0.3) / rate) rattleTick(e)
      }
      if (rNextDue <= i) runRattlePending(i)
      var n = 0
      while (n < mActiveCount) {
        val m = mActive[n]
        mono += mIm[m]
        val re = mCos[m] * mRe[m] - mSin[m] * mIm[m]
        mIm[m] = mSin[m] * mRe[m] + mCos[m] * mIm[m]
        mRe[m] = re
        if (++mAge[m] > mMaxAge[m]) {
          mFree[mFreeCount++] = m
          mActive[n] = mActive[--mActiveCount]
        } else n++
      }
      rattleMono = mono
      rattleRoom.process(mono, RATTLE_ROOM_INPUT)
      rattleLeft = (mono * RATTLE_DRY_LEFT + rattleRoom.left * RATTLE_ROOM_OUT * RATTLE_WET) * mult * RATTLE_GAIN
      rattleRight = (mono * RATTLE_DRY_RIGHT + rattleRoom.right * RATTLE_ROOM_OUT * RATTLE_WET) * mult * RATTLE_GAIN
    }

    // ---- the bed's own crackle: ticks and pops, arriving in bursts
    if (unit() < (12 + 83 * a) * (1 + 2.0 * crackleT) * (1 + 0.9 * gustDelayed) / rate) { spawnTick(1.0, 1.0); crackleT += 0.08 }
    if (unit() < (0.10 + 1.15 * a * a) * (1 + 3.0 * crackleP) / rate) {
      spawnPop(1.0, 1.0); crackleP += 0.25
      if (unit() < 0.2) schedule(0.025 + 0.09 * unit(), TYPE_POP, 0.6, 1.0)
    }

    // ---- a log settles: every 51-72 s (longer when the density falls); Deep and Immersive give each its own gesture
    if (i == settleAt) {
      if (salience.isSuppressed()) settleAt = i + (3.0 * rate).toLong()
      else settle(i, presence, density, variety)
    }
    if (sizzleAge < 0.0 && unit() < (1.0 / 40.0) * (0.15 + a) / rate) { sizzleAge = 0.0; sizzleLength = (0.35 + 0.9 * unit()) * rate }
    if (unit() < (1.0 / 80.0) * (0.15 + a) / rate && !flareUp && flare < 0.05) { flareUp = true; flareLeft = (0.8 + 0.8 * unit()) * rate; flarePeak = 1.5 }
    if (nextDue <= i) runPending()

    // ---- the event voices
    sumLeft.fill(0.0); sumRight.fill(0.0)
    var n = 0
    while (n < activeCount) {
      val v = active[n]
      val x = white() * vEnv[v]
      vEnv[v] *= vEnvDecay[v]
      val y = vGain[v] * x + vC1[v] * vY1[v] + vC2[v] * vY2[v]
      vY2[v] = vY1[v]; vY1[v] = y
      sumLeft[vComp[v]] += y * vPanLeft[v] * vAmp[v]
      sumRight[vComp[v]] += y * vPanRight[v] * vAmp[v]
      if (++vAge[v] > vMaxAge[v]) {
        free[freeCount++] = v
        active[n] = active[--activeCount]
      } else n++
    }

    // ---- wet-log steam: a soft hiss that swells, sputters with tiny bubbling spits, and dies away into a small room
    var steamL = sumLeft[3]
    var steamR = sumRight[3]
    if (steamAge >= 0.0) {
      val envelope = (1 - steamRise) * steamFall * steamAmplitude
      steamRise *= steamRiseDecay; steamFall *= steamFallStep
      val sn = white()
      steamLow += kSteamLow * (sn - steamLow); steamHigh += kSteamHigh * (sn - steamHigh)
      if (unit() < 260.0 / rate) spatter += 1.0
      spatter *= spatterDecay
      val sputter = 0.55 + 0.45 * min(1.0, spatter)
      val hiss = (steamHigh - steamLow) * envelope * sputter * 5.0
      steamL += hiss
      steamR += hiss * 0.93 + white() * 0.01 * envelope
      if (unit() < (7.0 * envelope) / rate) spawnSpit(envelope)
      steamAge += 1.0
      if (steamAge > steamTau * rate * 4.5) steamAge = -1.0
    }
    steamRoom.process((steamL + steamR) * 0.5, STEAM_ROOM_INPUT)
    val outSteamL = steamL * 0.5 + steamRoom.left * 2.1
    val outSteamR = steamR * 0.5 + steamRoom.right * 2.1
    windRoom.process((windL + windR) * 0.5, WIND_ROOM_INPUT)
    val outWindL = windL * 0.55 + windRoom.left * 1.5
    val outWindR = windR * 0.55 + windRoom.right * 1.5

    rustle *= rustleDecay
    val rw = white()
    rustleLow += kRustleLow * (rw - rustleLow); rustleHigh += kRustleHigh * (rw - rustleHigh)
    val outRustle = (rustleHigh - rustleLow) * rustle * 1.6
    var outSizzleL = 0.0
    var outSizzleR = 0.0
    if (sizzleAge >= 0.0) {
      val u = sizzleAge / sizzleLength
      var env = sin(PI * min(1.0, u)); env *= env
      val sw = white()
      sizzleHp += kSizzle * (sw - sizzleHp)
      val sz = (sw - sizzleHp) * env * 0.5
      outSizzleL = sz; outSizzleR = sz * 0.9 + white() * 0.02 * env
      sizzleAge += 1.0
      if (sizzleAge >= sizzleLength) sizzleAge = -1.0
    }

    // ---- the mix, at the balance the fire was tuned to
    val tickL = LIMIT_TICK * tanh(GAIN_TICK * sumLeft[0] / LIMIT_TICK)
    val tickR = LIMIT_TICK * tanh(GAIN_TICK * sumRight[0] / LIMIT_TICK)
    val popL = LIMIT_POP * tanh(GAIN_POP * sumLeft[1] / LIMIT_POP)
    val popR = LIMIT_POP * tanh(GAIN_POP * sumRight[1] / LIMIT_POP)
    val thumpL = LIMIT_THUMP * tanh(GAIN_THUMP * sumLeft[2] / LIMIT_THUMP)
    val thumpR = LIMIT_THUMP * tanh(GAIN_THUMP * sumRight[2] / LIMIT_THUMP)
    left = outBodyL * GAIN_BODY + outRoarL * GAIN_ROAR + outGrainL * GAIN_GRAIN + tickL + popL + thumpL +
      outRustle * GAIN_RUSTLE + outSizzleL * GAIN_SIZZLE + outSteamL * GAIN_STEAM + outWindL * GAIN_WIND
    left *= OUTPUT_TRIM
    right = outBodyR * GAIN_BODY + outRoarR * GAIN_ROAR + outGrainR * GAIN_GRAIN + tickR + popR + thumpR +
      outRustle * GAIN_RUSTLE + outSizzleR * GAIN_SIZZLE + outSteamR * GAIN_STEAM + outWindR * GAIN_WIND
    right *= OUTPUT_TRIM
    if (rattleLive) { left += rattleLeft; right += rattleRight }
    sample = i + 1
  }

  private fun rattleUnit(): Double {
    rattleRandom = rattleRandom xor (rattleRandom shl 13)
    rattleRandom = rattleRandom xor (rattleRandom ushr 7)
    rattleRandom = rattleRandom xor (rattleRandom shl 17)
    return (rattleRandom ushr 11).toDouble() / 9007199254740992.0
  }

  private fun rattleWhite(): Double = rattleUnit() * 2.0 - 1.0

  private fun rattleGauss(): Double {
    val u1 = max(1e-12, rattleUnit())
    val u2 = rattleUnit()
    return sqrt(-2.0 * ln(u1)) * cos(2.0 * PI * u2)
  }

  /** Decides whether the window answers this gust, and if so when its latch clinks. */
  private fun answerGust(a: Double) {
    val busy = max(RATTLE_BUSY_FLOOR, min(1.0, (a / 0.85).pow(RATTLE_BUSY_EXPONENT)))
    if (rattleUnit() >= RATTLE_ANSWER * busy) return
    rattleGust = true; rattleLive = true
    val seconds = gustDuration / rate
    val clinks = 1 + (if (rattleUnit() < 0.5) 1 else 0)
    for (c in 0 until clinks) {
      val at = 1.0 + (max(1.1, seconds - 1.0) - 1.0) * rattleUnit()
      scheduleRattle(at, RATTLE_LATCH, 0.0, 3800.0 + 3200.0 * rattleUnit())
    }
  }

  private fun scheduleRattle(seconds: Double, kind: Int, amplitude: Double, frequency: Double) {
    for (q in 0 until RATTLE_PENDING) {
      if (rDue[q] < 0L) {
        val due = sample + (rate * seconds).toLong()
        rDue[q] = due; rKind[q] = kind; rAmp[q] = amplitude; rFreq[q] = frequency
        if (due < rNextDue) rNextDue = due
        return
      }
    }
  }

  private fun runRattlePending(i: Long) {
    var newDue = Long.MAX_VALUE
    for (q in 0 until RATTLE_PENDING) {
      val due = rDue[q]
      if (due < 0L) continue
      if (due <= i) {
        rDue[q] = -1L
        when (rKind[q]) {
          RATTLE_TICK_AGAIN -> rattleHit(rAmp[q])
          RATTLE_LATCH -> latchHit(rFreq[q], false)
          else -> latchHit(rFreq[q], true)
        }
      } else if (due < newDue) newDue = due
    }
    rNextDue = newDue
  }

  /** One glass tick: a few short, inharmonic modes that die within about ten milliseconds, so nothing rings or sounds like wood. */
  private fun rattleTick(e: Double) {
    val amp = (0.3 + 0.7 * e.pow(0.8)) * exp(0.35 * rattleGauss())
    rattleHit(amp)
    if (rattleUnit() < 0.4) scheduleRattle(0.025 + 0.045 * rattleUnit(), RATTLE_TICK_AGAIN, amp * 0.6, 0.0)
  }

  private fun rattleHit(amp: Double) {
    val f = 2200.0 + 3600.0 * rattleUnit()
    addMode(f, 0.004 + 0.007 * rattleUnit(), amp)
    addMode(f * (1.3 + 1.3 * rattleUnit()), 0.003 + 0.005 * rattleUnit(), 0.6 * amp)
    addMode(f * (2.7 + 1.3 * rattleUnit()), 0.003, 0.35 * amp)
  }

  /** The latch: a small metallic double clink. */
  private fun latchHit(f: Double, again: Boolean) {
    val s = if (again) 0.6 else 1.0
    addMode(if (again) f * 1.03 else f, 0.008 + 0.008 * rattleUnit(), 0.7 * s * RATTLE_LATCH_LEVEL)
    addMode(f * 1.47, 0.007, 0.4 * s * RATTLE_LATCH_LEVEL)
    if (!again) scheduleRattle(0.04 + 0.05 * rattleUnit(), RATTLE_LATCH_AGAIN, 0.0, f)
  }

  /** A damped sinusoid, run as a decaying phasor so it costs a few multiplies a sample. */
  private fun addMode(frequency: Double, tau: Double, amplitude: Double) {
    val phase = 2.0 * PI * rattleUnit()
    if (mFreeCount == 0) return
    val m = mFree[--mFreeCount]
    val r = exp(-1.0 / (tau * rate))
    val theta = 2.0 * PI * frequency / rate
    mRe[m] = amplitude * RATTLE_MODE_GAIN * cos(phase); mIm[m] = amplitude * RATTLE_MODE_GAIN * sin(phase)
    mCos[m] = r * cos(theta); mSin[m] = r * sin(theta)
    mAge[m] = 0; mMaxAge[m] = (min(0.4, 6.0 * tau) * rate).toInt()
    mActive[mActiveCount++] = m
  }

  /** How much louder a gust sounds than the fire's own liveliness alone would make it, for a feel with this [variety]. */
  private fun windVoice(a: Double, variety: Double, amplitudeScale: Double): Double {
    val v = min(1.0, variety)
    val exponent = 0.85 - (0.85 - WIND_FOLLOW_AT_FULL_VARIETY) * v
    val floor = 0.15 + (WIND_FLOOR_AT_FULL_VARIETY - 0.15) * v
    val followed = max(floor, min(1.0, (a / 0.85).pow(exponent)))
    val immersive = WIND_IMMERSIVE_BOOST.pow(max(0.0, min(1.0, (v - WIND_IMMERSIVE_FROM) / (1.0 - WIND_IMMERSIVE_FROM))))
    return (1.0 + WIND_LIFT_AT_FULL_VARIETY * v) * immersive * followed / amplitudeScale
  }

  /** One settling log: a thump and a cascade of crackle in one of eight gestures, with the steam of a damp log. */
  private fun settle(i: Long, presence: Double, density: Double, variety: Double) {
    val mult = presence
    val kind = if (variety > 0.0) IdentityGestures.kind(fireSeed, IdentityGestures.FIRE_SALT, settleCount, IdentityGestures.FIRE_KINDS) else 0
    settleCount++
    settleAt = i + (rate * (51.0 + 21.0 * unit()) / max(0.2, min(1.0, density))).toLong()
    val wetChance = if (kind == 3 || kind == 4) 0.25 else if (kind == 2) 0.4 else 0.6
    if (unit() < wetChance && steamAge < 0.0) {
      steamAge = 0.0
      steamTau = 1.1 + 1.3 * unit()
      steamAmplitude = (0.7 + 0.5 * unit()) * mult
      steamRise = 1.0; steamFall = 1.0
      steamFallStep = exp(-1 / (steamTau * rate))
    }
    val duration: Double
    val ticks: Int
    val pops: Int
    when (kind) {
      1 -> {   // a big collapse
        spawnThump(logUniform(42.0, 68.0), 7.5, mult)
        duration = 1.6 + 1.2 * unit(); ticks = 30 + (unit() * 30).toInt(); pops = 4 + (unit() * 4).toInt()
        setRustle(1.5 * mult, 0.7)
      }
      2 -> {   // a log is placed: a soft wooden knock, a second knock, then the fire takes it
        spawn(2, logUniform(150.0, 260.0), 3.5, 6.0, 3.6 * mult, gauss() * 0.2, (0.3 * rate).toInt())
        schedule(0.14 + 0.12 * unit(), TYPE_KNOCK, 0.6, mult)
        duration = 1.4; ticks = 6 + (unit() * 9).toInt(); pops = 1 + (unit() * 2).toInt()
        setRustle(1.0 * mult, 0.5)
        flareUp = true; flareLeft = (0.9 + 0.5 * unit()) * rate; flarePeak = 1.6
      }
      3 -> {   // the poker stirs the embers: a scrape, then a spray of sparks
        setRustle(1.6 * mult, 1.2); duration = 1.2; ticks = 0; pops = 1
        val sparks = 22 + (unit() * 22).toInt()
        for (k in 0 until sparks) { val u = unit(); schedule(0.25 + 1.3 * u, TYPE_BRIGHT_TICK, 1.6 * (1 - 0.5 * u), mult) }
        flareUp = true; flareLeft = (1.2 + 0.6 * unit()) * rate; flarePeak = 1.3
      }
      4 -> {   // a shower of bright sparks
        duration = 1.0; ticks = 0; pops = 0
        setRustle(0.4 * mult, 0.3)
        val sparks = 26 + (unit() * 26).toInt()
        for (k in 0 until sparks) { val u = unit(); schedule(0.02 + 1.2 * u * u, TYPE_BRIGHT_TICK, 1.8 * (1 - 0.6 * u), mult) }
        for (k in 0 until 3) schedule(0.1 + 1.0 * unit(), TYPE_PING, 1.0, mult)
      }
      5 -> {   // a hollow log rings
        spawnThump(logUniform(70.0, 105.0), 4.0, mult)
        spawn(2, logUniform(130.0, 190.0), 9.0, 4.0, 2.0 * mult, gauss() * 0.2, (0.6 * rate).toInt())
        duration = 0.9; ticks = 8 + (unit() * 8).toInt(); pops = 2
        setRustle(0.7 * mult, 0.4)
      }
      6 -> {   // the flame catches
        duration = 1.2; ticks = 20 + (unit() * 14).toInt(); pops = 3 + (unit() * 3).toInt()
        setRustle(0.5 * mult, 0.5)
        flareUp = true; flareLeft = (1.6 + 0.8 * unit()) * rate; flarePeak = 2.6
        if (sizzleAge < 0.0) { sizzleAge = 0.0; sizzleLength = 0.9 * rate }
      }
      7 -> {   // a slow crumble
        spawnThump(logUniform(60.0, 90.0), 5.0, mult)
        duration = 3.4 + 1.4 * unit(); ticks = 26 + (unit() * 16).toInt(); pops = 5 + (unit() * 3).toInt()
        setRustle(1.0 * mult, 1.4)
      }
      else -> {   // a plain settle
        spawnThump(logUniform(55.0, 100.0), 5.0, mult)
        duration = 0.5 + 1.3 * unit(); ticks = 12 + (unit() * 26).toInt(); pops = 2 + (unit() * 3).toInt()
        setRustle(1.0 * mult, 0.45)
      }
    }
    for (k in 0 until ticks) { val u = unit(); schedule(0.03 + duration * u * u, TYPE_TICK, 2.4 * (1 - 0.6 * u), mult) }
    for (k in 0 until pops) { val u = unit(); schedule(0.06 + duration * u, TYPE_POP, 1.3 * (1 - 0.5 * u), mult) }
  }

  private fun setRustle(level: Double, tau: Double) {
    rustle = level
    rustleDecay = exp(-1 / (tau * rate))
  }
}
