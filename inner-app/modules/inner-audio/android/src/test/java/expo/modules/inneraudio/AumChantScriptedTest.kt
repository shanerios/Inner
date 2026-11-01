package expo.modules.inneraudio

import org.junit.Assert.*
import org.junit.Test

/**
 * A chant the journey calls is exactly the shape it asks for: the designed chant stays at the listener, an approach
 * comes near from far off (mostly reverb at first), and a retreat starts close and goes away.
 */
class AumChantScriptedTest {
  private val sampleRate = 48_000.0

  /** Mean far-send level over each third of a nine-second chant, and whether anything sounded. */
  private fun farThirds(kind: Int): Triple<DoubleArray, Double, Boolean> {
    val chant = AumChant()
    chant.reset(7_340_033L)
    chant.trigger(kind)
    val far = DoubleArray(3)
    var dry = 0.0
    var sounded = false
    val frames = (9.0 * sampleRate).toInt()
    for (frame in 0 until frames) {
      chant.render(sampleRate, 20.0 + frame / sampleRate, 0.5, 1.0, 1.0, 0.0, scriptedOnly = true)
      far[minOf(2, frame * 3 / frames)] += Math.abs(chant.farWet)
      dry += Math.abs(chant.voiceLeft) + Math.abs(chant.voiceRight)
      if (Math.abs(chant.voiceLeft) > 1e-9 || Math.abs(chant.farWet) > 1e-9) sounded = true
    }
    return Triple(far, dry, sounded)
  }

  @Test fun theDesignedChantHasNoFarSendAndSounds() {
    val (far, _, sounded) = farThirds(AumGesture.KIND_PLAIN)
    assertTrue(sounded)
    assertEquals(0.0, far.sum(), 0.0)
  }

  @Test fun anApproachBeginsFarAndEndsNear() {
    val (far, _, sounded) = farThirds(AumGesture.KIND_APPROACH)
    assertTrue(sounded)
    assertTrue("far send ${far.toList()}", far[0] > 0.0 && far[2] < far[0])
  }

  @Test fun aRetreatBeginsNearAndEndsFar() {
    val (far, _, sounded) = farThirds(AumGesture.KIND_RETREAT)
    assertTrue(sounded)
    assertTrue("far send ${far.toList()}", far[2] > far[0])
  }

  @Test fun theRetreatIsTheApproachInReverseInHowFarItGoes() {
    val approach = farThirds(AumGesture.KIND_APPROACH).first
    val retreat = farThirds(AumGesture.KIND_RETREAT).first
    // The same distances, travelled the other way: the retreat's far send rises where the approach's falls.
    assertTrue(retreat[2] > retreat[0])
    assertTrue(approach[0] > approach[2])
  }
}
