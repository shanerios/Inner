package expo.modules.inneraudio

import kotlin.math.PI
import kotlin.math.cos
import kotlin.math.exp
import kotlin.math.max
import kotlin.math.min
import kotlin.math.pow
import kotlin.math.sin

private fun clamp(value: Double, low: Double, high: Double) = min(high, max(low, value))

/**
 * The Temple world's chant: three imperfect virtual voices that move from an open "O" toward a closed nasal
 * hum, once every 31 seconds. Each appearance draws its own gesture (see [AumGesture]); at variety 0 every
 * appearance is the designed chant. The Swift engine mirrors this file.
 *
 * The chant is kept apart from the room: it returns its dry voice, its echo, and how much of it goes only to
 * the room's reverb, and the Temple world places them.
 */
internal class AumChant {
  companion object {
    private val FREQS = doubleArrayOf(104.0, 108.0, 111.5)
    private val WEIGHTS = doubleArrayOf(0.34, 0.28, 0.23)
    private const val ECHO_SECONDS = 2.75
  }

  /** The chant's dry voice for this sample, already scaled by its level. */
  var voiceLeft = 0.0
    private set
  var voiceRight = 0.0
    private set
  /** The chant's echo of itself. */
  var echoLeft = 0.0
    private set
  var echoRight = 0.0
    private set
  /** Level sent only to the room's reverb, so a far-off chant is mostly reverb. */
  var farWet = 0.0
    private set

  private var seed = 1L
  private var gate = 1.0
  private val phases = DoubleArray(3)
  private val formantIc1 = DoubleArray(4)
  private val formantIc2 = DoubleArray(4)
  private val gesture = AumGesture()
  private var gestureCycle = -1L
  private var gestureNeutral = true
  private val subPhases = DoubleArray(3)
  private var farLeft = 0.0
  private var farRight = 0.0
  private val echoBufferLeft = DoubleArray(200_000)
  private val echoBufferRight = DoubleArray(200_000)
  private var echoIndex = 0
  private var echoDampLeft = 0.0
  private var echoDampRight = 0.0

  /** Starts a night: clears every voice and reverb tail, and sets the seed its gestures are drawn from. */
  fun reset(nightSeed: Long) {
    seed = nightSeed xor 0x1d3f9a5bL
    gate = 1.0
    phases.fill(0.0)
    formantIc1.fill(0.0); formantIc2.fill(0.0)
    gesture.neutral(); gestureNeutral = true; gestureCycle = -1L
    subPhases.fill(0.0)
    farLeft = 0.0; farRight = 0.0
    echoBufferLeft.fill(0.0); echoBufferRight.fill(0.0)
    echoIndex = 0; echoDampLeft = 0.0; echoDampRight = 0.0
    voiceLeft = 0.0; voiceRight = 0.0; echoLeft = 0.0; echoRight = 0.0; farWet = 0.0
  }

  fun render(sampleRate: Double, elapsedSeconds: Double, intensity: Double, presence: Double, density: Double, variety: Double) {
    val tau = PI * 2
    val chantPosition = elapsedSeconds + 26.0
    val cycle = (chantPosition / 31.0).toLong()
    // Each appearance of the Aum draws its own gesture; at variety 0 every one is the designed chant.
    if (variety <= 0.0) {
      if (!gestureNeutral) { gesture.neutral(); gestureNeutral = true; gestureCycle = -1L }
    } else if (gestureNeutral || cycle != gestureCycle) {
      gesture.draw(seed, cycle, variety)
      gestureNeutral = false
      gestureCycle = cycle
    }
    val chantTime = ((chantPosition % 31.0) - gesture.startDelay) / gesture.stretch
    // Sparser identity: the Aum sounds on every Nth 31 s cycle. The gate fades over a
    // quarter second, so a change of density mid-chant can never click.
    val chantEvery = max(1, Math.round(1.0 / density).toInt())
    val chantOpen = if (chantEvery == 1 || (chantPosition / 31.0).toLong() % chantEvery == 0L) 1.0 else 0.0
    gate += (chantOpen - gate) / max(1.0, sampleRate * 0.25)
    val chantEnvelope = when {
      chantTime < 0.0 || chantTime >= 9.0 -> 0.0
      chantTime < 2.2 -> 0.5 - 0.5 * cos(PI * chantTime / 2.2)
      chantTime > 6.0 -> 0.5 + 0.5 * cos(PI * (chantTime - 6.0) / 3.0)
      else -> 1.0
    } * gate
    val chantProgress = clamp(chantTime / 9.0, 0.0, 1.0)
    val firstTransition = clamp(chantProgress / 0.56, 0.0, 1.0)
    val finalTransition = clamp((chantProgress - 0.56) / 0.44, 0.0, 1.0)
    val formant1 = if (chantProgress < 0.56) 700.0 + (300.0 - 700.0) * firstTransition else 300.0 + (250.0 - 300.0) * finalTransition
    val formant2 = if (chantProgress < 0.56) 1_200.0 + (800.0 - 1_200.0) * firstTransition else 800.0 + (2_500.0 - 800.0) * finalTransition
    val formant2Presence = 1.0 - finalTransition * 0.82
    var sourceLeft = 0.0
    var sourceRight = 0.0
    var sub = 0.0
    // The group's pitch: a deeper root, and sometimes a settling glide over the chant.
    val pitchRatio = if (gesture.glide == 0.0) gesture.rootRatio else gesture.rootRatio * 2.0.pow(-gesture.glide * chantProgress / 12.0)
    for (index in 0 until 3) {
      val phase = phases[index]
      // A compact band-limited glottal source: richer than a sine but without
      // the high-frequency aliasing of a naive sawtooth.
      val glottal = sin(phase) + sin(phase * 2) * 0.42 + sin(phase * 3) * 0.18 + sin(phase * 4) * 0.08
      val shimmer = 0.96 + 0.04 * sin(elapsedSeconds * tau * (5.1 + index * 0.47) + index)
      val voice = glottal * WEIGHTS[index] * shimmer
      sourceLeft += voice * if (index == 2) 0.62 else 1.0
      sourceRight += voice * if (index == 0) 0.62 else 1.0
      sub += sin(phase) * WEIGHTS[index]
      val jitter = 1.0 + 0.0014 * sin(elapsedSeconds * tau * (6.0 + index * 0.31) + index * 1.7)
      phases[index] = (phase + tau * FREQS[index] * jitter * pitchRatio / sampleRate) % tau
    }
    val chantLeft = bandpass(sampleRate, sourceLeft, 0, formant1, 6.5) * 1.65 + bandpass(sampleRate, sourceLeft, 1, formant2, 7.5) * 1.25 * formant2Presence + sub * 0.08
    val chantRight = bandpass(sampleRate, sourceRight, 2, formant1 * 0.992, 6.5) * 1.65 + bandpass(sampleRate, sourceRight, 3, formant2 * 1.008, 7.5) * 1.25 * formant2Presence + sub * 0.08
    var left = chantLeft
    var right = chantRight
    if (gesture.sub > 0.0) {
      // A doubled Aum an octave beneath, for presence.
      var beneath = 0.0
      for (index in 0 until 3) {
        val phase = subPhases[index]
        beneath += (sin(phase) + sin(phase * 2) * 0.4) * WEIGHTS[index]
        subPhases[index] = (phase + tau * FREQS[index] * 0.5 * pitchRatio / sampleRate) % tau
      }
      left += beneath * gesture.sub * 0.9
      right += beneath * gesture.sub * 0.9
    }
    if (gesture.pans) {
      // It enters in one ear and crosses to the other over the chant (equal power). The move is
      // timed to the loud part of the chant, so it is heard rather than spent in the fades.
      val panProgress = clamp((chantTime - 1.2) / 6.6, 0.0, 1.0)
      val pan = gesture.panStart + (gesture.panEnd - gesture.panStart) * panProgress
      val angle = (pan + 1.0) * PI / 4.0
      left *= cos(angle) * 1.4142135623730951
      right *= sin(angle) * 1.4142135623730951
    }
    var dryMix = 1.0
    var farSend = 0.0
    if (gesture.distant) {
      // Far off it is quieter, darker and mostly reverb; it draws near as the chant goes on.
      val travel = chantProgress * chantProgress * (3.0 - 2.0 * chantProgress)
      val distance = gesture.distStart + (gesture.distEnd - gesture.distStart) * travel
      val farCoefficient = 1.0 - exp(-tau * (6_000.0 - 5_300.0 * distance) / sampleRate)
      farLeft += (left - farLeft) * farCoefficient
      farRight += (right - farRight) * farCoefficient
      val farGain = 1.0 - 0.7 * distance
      left = farLeft * farGain
      right = farRight * farGain
      dryMix = 1.0 - 0.65 * distance
      farSend = 0.6 * distance
    }
    val chantLevel = chantEnvelope * (0.18 + intensity * 0.12) * presence * gesture.level
    var echoOutLeft = 0.0
    var echoOutRight = 0.0
    if (variety > 0.0) {
      // The chant answers itself a few seconds later, ping-ponging between the ears.
      val size = echoBufferLeft.size
      val length = min(size - 1, max(1, (sampleRate * ECHO_SECONDS).toInt()))
      val readAt = (echoIndex - length + size) % size
      echoDampLeft += (echoBufferLeft[readAt] - echoDampLeft) * 0.3
      echoDampRight += (echoBufferRight[readAt] - echoDampRight) * 0.3
      echoBufferLeft[echoIndex] = left * chantLevel * gesture.echoSend + echoDampRight * 0.45
      echoBufferRight[echoIndex] = right * chantLevel * gesture.echoSend + echoDampLeft * 0.45
      echoIndex = (echoIndex + 1) % size
      echoOutLeft = echoDampLeft * 0.8
      echoOutRight = echoDampRight * 0.8
    }
    voiceLeft = left * chantLevel * dryMix
    voiceRight = right * chantLevel * dryMix
    echoLeft = echoOutLeft
    echoRight = echoOutRight
    farWet = if (farSend > 0.0) (left + right) * 0.5 * chantLevel * farSend else 0.0
  }

  /** Topology-preserving state-variable bandpass; stable while formants move. */
  private fun bandpass(sampleRate: Double, input: Double, index: Int, frequency: Double, q: Double): Double {
    val g = kotlin.math.tan(Math.PI * frequency / sampleRate)
    val k = 1.0 / q
    val v1 = (formantIc1[index] + g * (input - formantIc2[index])) / (1.0 + g * (g + k))
    val v2 = formantIc2[index] + g * v1
    formantIc1[index] = 2.0 * v1 - formantIc1[index]
    formantIc2[index] = 2.0 * v2 - formantIc2[index]
    return v1
  }
}
