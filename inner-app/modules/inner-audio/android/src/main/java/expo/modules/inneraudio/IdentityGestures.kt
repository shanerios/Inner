package expo.modules.inneraudio

import kotlin.math.min

/**
 * Per-appearance variation for a world's identity sound. Each time the sound appears it draws a small
 * gesture: how loud, how long, how deep, where it sits and moves, whether it doubles or echoes itself.
 *
 * Everything is a pure function of (night seed, sound, appearance number), with no state of its own. A seek
 * or a resume therefore lands on the same gesture, and no other random stream in the engine is disturbed.
 * Two appearances in a row are never the same kind. The Swift engine mirrors this file.
 */
internal object IdentityGestures {
  const val AUM_SALT = 0x41756d01L
  const val AUM_KINDS = 6
  const val WHALE_SALT = 0x5768616cL
  const val WHALE_KINDS = 7
  const val COSMIC_SALT = 0x436f736dL
  const val FIRE_SALT = 0x46697265L
  const val FIRE_KINDS = 8
  const val COSMIC_KINDS = 9
  const val OCEAN_SALT = 0x4f6365616eL
  const val OCEAN_KINDS = 6

  private val bagA = IntArray(10)
  private val bagB = IntArray(10)

  private fun splitmix(x: Long): Long {
    var z = x + -0x61c8864680b583ebL
    z = (z xor (z ushr 30)) * -0x40a7b892e31b1a47L
    z = (z xor (z ushr 27)) * -0x6b2fb644ecceee15L
    return z xor (z ushr 31)
  }

  /** A uniform draw in [0, 1) for one detail (`slot`) of one appearance. */
  fun draw(seed: Long, salt: Long, index: Long, slot: Int): Double {
    val bits = splitmix(splitmix(seed xor salt) + index * 32L + slot.toLong())
    return (bits ushr 11).toDouble() / 9007199254740992.0
  }

  private fun permutation(seed: Long, salt: Long, bag: Long, kinds: Int, out: IntArray) {
    for (i in 0 until kinds) out[i] = i
    for (i in kinds - 1 downTo 1) {
      val j = min(i, (draw(seed, salt xor 0x62616700L, bag, 16 + i) * (i + 1)).toInt())
      val held = out[i]; out[i] = out[j]; out[j] = held
    }
  }

  /**
   * The kind of appearance number `index`, of `kinds` in all. Kinds are dealt from a shuffled bag, so each
   * turns up once in every `kinds` appearances; a bag's first kind is swapped if it would repeat the previous
   * bag's last.
   */
  fun kind(seed: Long, salt: Long, index: Long, kinds: Int): Int {
    val bag = index / kinds
    val position = (index % kinds).toInt()
    permutation(seed, salt, bag, kinds, bagA)
    if (bag > 0L) {
      permutation(seed, salt, bag - 1L, kinds, bagB)
      if (bagA[0] == bagB[kinds - 1]) { val held = bagA[0]; bagA[0] = bagA[1]; bagA[1] = held }
    }
    return bagA[position]
  }
}

/** One appearance of the Aum. The neutral gesture is exactly the Aum as it has always sounded. */
internal class AumGesture {
  companion object {
    /** Consonant roots below the chant's own (A2): a whole tone, a fourth and a fifth below, and an octave down. */
    val DEEPER = doubleArrayOf(8.0 / 9.0, 3.0 / 4.0, 2.0 / 3.0, 1.0 / 2.0)
    const val KIND_PLAIN = 0
    const val KIND_DOUBLED = 1
    const val KIND_TRAVELLER = 2
    const val KIND_APPROACH = 3
    const val KIND_ECHO = 4
    const val KIND_DEEPENING = 5
  }

  var kind = KIND_PLAIN
  var level = 1.0
  /** Seconds after the start of its 31 s cycle before the chant begins. */
  var startDelay = 0.0
  /** 1 = the designed 9 s chant; above 1 it is longer. */
  var stretch = 1.0
  var rootRatio = 1.0
  /** Semitones the pitch falls over the chant. */
  var glide = 0.0
  /** Level of a doubled Aum an octave beneath. */
  var sub = 0.0
  var pans = false
  var panStart = 0.0
  var panEnd = 0.0
  var distant = false
  /** 0 = at the listener, 1 = far off. */
  var distStart = 0.0
  var distEnd = 0.0
  var echoSend = 0.0

  fun neutral() {
    kind = KIND_PLAIN; level = 1.0; startDelay = 0.0; stretch = 1.0; rootRatio = 1.0; glide = 0.0
    sub = 0.0; pans = false; panStart = 0.0; panEnd = 0.0; distant = false; distStart = 0.0; distEnd = 0.0; echoSend = 0.0
  }

  /** Draws appearance number `index` at the given variety (0 = none, 1 = full). */
  fun draw(seed: Long, index: Long, variety: Double) {
    neutral()
    val salt = IdentityGestures.AUM_SALT
    fun u(slot: Int) = IdentityGestures.draw(seed, salt, index, slot)
    kind = IdentityGestures.kind(seed, salt, index, IdentityGestures.AUM_KINDS)
    level = 1.0 + variety * (u(0) - 0.5) * 0.3
    startDelay = variety * u(1) * 9.0
    stretch = 1.0 + variety * (u(2) - 0.4) * 0.3
    // A different group, a different root: most appearances stay on the chant's own note.
    if (u(3) < 0.2 + 0.45 * variety) rootRatio = DEEPER[min(2, (u(4) * 3.0).toInt())]
    when (kind) {
      KIND_DOUBLED -> { level *= 1.0 + 0.4 * variety; sub = 0.6 * variety }
      KIND_TRAVELLER -> {
        pans = true
        panStart = (if (u(5) < 0.5) -1.0 else 1.0) * variety
        panEnd = -panStart
      }
      KIND_APPROACH -> { distant = true; distStart = 0.9 * variety; distEnd = 0.0 }
      KIND_ECHO -> echoSend = 0.55 * variety
      KIND_DEEPENING -> {
        // The group settles lower as it chants. The octave is kept for the fullest variety.
        rootRatio = DEEPER[min(if (variety > 0.7) 3 else 2, (u(6) * 4.0).toInt())]
        glide = (1.0 + u(7) * 2.0) * variety
      }
    }
  }
}

/** One appearance of the whale call: the call, its answer, and whatever else is in the water. */
internal class WhaleGesture {
  companion object {
    const val KIND_PLAIN = 0
    const val KIND_RISING = 1
    const val KIND_FALLING = 2
    const val KIND_COMPANIONS = 3
    const val KIND_FAR_NEAR = 4
    const val KIND_ANSWER_ONLY = 5
    const val KIND_LONG_ECHO = 6
    const val PITCH_STEADY = 0
    const val PITCH_RISING = 1
    const val PITCH_DEEP_FALL = 2
  }

  var kind = KIND_PLAIN
  /** Scales the call's level; 0 leaves only the answer. */
  var callLevel = 1.0
  /** 0 = at the listener, 1 = far off. */
  var callFar = 0.0
  var pitchMode = PITCH_STEADY
  var durationScale = 1.0
  var answerLevel = 1.0
  /** The answer comes from close by. */
  var answerNear = false
  /** Scales the answer's upper harmonics: above 1 it is brighter and closer. */
  var answerBright = 1.0
  /** How many other whales answer from the distance: 0, 1 or 2. */
  var companions = 0
  var echoSend = 0.0

  fun neutral() {
    kind = KIND_PLAIN; callLevel = 1.0; callFar = 0.0; pitchMode = PITCH_STEADY; durationScale = 1.0
    answerLevel = 1.0; answerNear = false; answerBright = 1.0; companions = 0; echoSend = 0.0
  }

  /** Draws appearance number `index` at the given variety (0 = none, 1 = full). */
  fun draw(seed: Long, index: Long, variety: Double) {
    neutral()
    val salt = IdentityGestures.WHALE_SALT
    fun u(slot: Int) = IdentityGestures.draw(seed, salt, index, slot)
    kind = IdentityGestures.kind(seed, salt, index, IdentityGestures.WHALE_KINDS)
    callLevel = 1.0 + variety * (u(0) - 0.5) * 0.24
    durationScale = 1.0 + variety * (u(1) - 0.5) * 0.2
    when (kind) {
      KIND_RISING -> pitchMode = PITCH_RISING
      KIND_FALLING -> { pitchMode = PITCH_DEEP_FALL; durationScale *= 1.0 + 0.3 * variety }
      // One more whale far off, and at the fullest variety often a second, smaller and farther still.
      KIND_COMPANIONS -> companions = if (u(2) < 0.25 + 0.5 * variety) 2 else 1
      KIND_FAR_NEAR -> {
        callFar = 0.95 * variety
        callLevel *= 1.0 - 0.4 * variety
        answerLevel = 1.0 + variety
        answerBright = 1.0 + 0.9 * variety
        answerNear = true
      }
      KIND_ANSWER_ONLY -> { callLevel = 0.0; answerLevel = 1.0 + 0.35 * variety }
      // Longer than it should be: up to twice the length, and it calls back to itself across the water.
      KIND_LONG_ECHO -> { durationScale *= 1.0 + variety; callLevel *= 0.9; echoSend = 0.6 * variety }
    }
  }
}

/** One breath of the Cosmic voice. The neutral gesture is exactly the voice as it has always sounded. */
internal class CosmicGesture {
  companion object {
    /** A fifth, a major third and a minor third above: voices that sing with the drone. */
    val HARMONY = doubleArrayOf(3.0 / 2.0, 5.0 / 4.0, 6.0 / 5.0)
    const val KIND_PLAIN = 0
    const val KIND_DEEP_SWELL = 1
    const val KIND_OCTAVE_BENEATH = 2
    const val KIND_SINKING = 3
    const val KIND_HARMONY = 4
    const val KIND_DRIFT = 5
    const val KIND_CIRCLING = 6
    const val KIND_APPROACH = 7
    const val KIND_DEEP_ECHO = 8
    /**
     * How far below the drone's own note the long deep voice sings: two octaves, a fundamental of about 19 Hz
     * that is felt as a slow rumble while its harmonics carry the voice. Chosen by ear over 4, 7 and 12.
     */
    const val DEEP_ECHO_SEMITONES = 24.0
    /** The quietest point of a breath, as a share of its peak, in the voice as it has always been. */
    const val DEFAULT_FLOOR = 0.1
  }

  var kind = KIND_PLAIN
  var level = 1.0
  var floor = DEFAULT_FLOOR
  /** Shapes the swell: 1 = as designed; below 1 it holds nearer its peak for longer. */
  var plateau = 1.0
  var echoSend = 0.0
  var rootRatio = 1.0
  /** Semitones the pitch falls over the breath. */
  var glide = 0.0
  /** Semitones the pitch wanders either side of its root over the breath. */
  var drift = 0.0
  /** Level of a second voice singing with the first; 0 = none. */
  var second = 0.0
  var secondRatio = 1.0
  var secondPan = 0.0
  var circles = false
  /** +1 or -1: which way it circles. */
  var circleDirection = 1.0
  var distant = false
  /** 0 = at the listener, 1 = far off. */
  var distStart = 0.0

  fun neutral() {
    kind = KIND_PLAIN; level = 1.0; floor = DEFAULT_FLOOR; plateau = 1.0; echoSend = 0.0; rootRatio = 1.0; glide = 0.0; drift = 0.0
    second = 0.0; secondRatio = 1.0; secondPan = 0.0; circles = false; circleDirection = 1.0; distant = false; distStart = 0.0
  }

  /** Draws breath number `index` at the given variety (0 = none, 1 = full). */
  fun draw(seed: Long, index: Long, variety: Double) {
    neutral()
    val salt = IdentityGestures.COSMIC_SALT
    fun u(slot: Int) = IdentityGestures.draw(seed, salt, index, slot)
    kind = IdentityGestures.kind(seed, salt, index, IdentityGestures.COSMIC_KINDS)
    level = 1.0 + variety * (u(0) - 0.5) * 0.24
    // Lower is the most prominent turn: a semitone, a whole tone or a minor third below, in most breaths.
    if (u(3) < 0.35 + 0.5 * variety) rootRatio = Math.pow(2.0, -(1.0 + Math.floor(u(4) * 3.0)) / 12.0)
    when (kind) {
      KIND_DEEP_SWELL -> { floor = DEFAULT_FLOOR - 0.07 * variety; level *= 1.0 + 0.3 * variety }
      // A second voice an octave beneath: the deepest, most present kind.
      KIND_OCTAVE_BENEATH -> { second = 0.7 * variety; secondRatio = 0.5; secondPan = 0.0 }
      KIND_SINKING -> glide = (1.0 + u(5) * 2.0) * variety
      KIND_HARMONY -> {
        second = 0.55 * variety
        secondRatio = HARMONY[min(2, (u(6) * 3.0).toInt())]
        secondPan = (if (u(7) < 0.5) -1.0 else 1.0) * 0.6
      }
      KIND_DRIFT -> drift = (0.6 + 0.8 * u(8)) * variety * (if (u(9) < 0.5) -1.0 else 1.0)
      KIND_CIRCLING -> { circles = true; circleDirection = if (u(10) < 0.5) -1.0 else 1.0 }
      KIND_APPROACH -> { distant = true; distStart = 0.85 * variety }
      // A long, very deep voice that holds near its peak and calls back to itself across the void.
      KIND_DEEP_ECHO -> {
        rootRatio = Math.pow(2.0, -DEEP_ECHO_SEMITONES / 12.0)
        floor = 0.03
        plateau = 1.0 - 0.5 * variety
        level *= 0.78
        echoSend = 0.4 * variety
      }
    }
  }
}
