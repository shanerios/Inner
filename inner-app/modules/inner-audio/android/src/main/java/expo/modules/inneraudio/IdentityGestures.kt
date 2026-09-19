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

  private val bagA = IntArray(8)
  private val bagB = IntArray(8)

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
