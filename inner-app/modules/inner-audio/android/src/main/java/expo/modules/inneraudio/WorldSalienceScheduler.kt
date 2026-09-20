package expo.modules.inneraudio

import kotlin.math.max

/**
 * Coordinates perceptually distinct world events on the audio render thread.
 * Continuous foundations never pass through this gate. Rare details reserve a
 * bounded window, then leave clear space for the sound field to settle. New
 * reservations are suppressed around recognition cues and for two seconds after.
 */
internal class WorldSalienceScheduler {
  private var rate = 48_000.0
  private var frame = 0L
  private var reservedUntil = 0L
  private var clearUntil = 0L
  private var suppressed = false

  fun reset(sampleRate: Double) {
    rate = sampleRate
    frame = 0L
    reservedUntil = 0L
    clearUntil = 0L
    suppressed = false
  }

  fun beginFrame(suppressRareEvents: Boolean) {
    if (suppressed && !suppressRareEvents) {
      clearUntil = max(clearUntil, frame + (rate * 2.0).toLong())
    }
    suppressed = suppressRareEvents
  }

  /** True around a recognition cue and for two seconds after it: a world holds its own rare events until then. */
  fun isSuppressed(): Boolean = suppressed || frame < clearUntil

  fun reserve(salience: Double, durationSeconds: Double, recoverySeconds: Double): Boolean {
    if (suppressed || frame < reservedUntil || frame < clearUntil) return false
    reservedUntil = frame + (rate * durationSeconds).toLong()
    val recoveryScale = 0.75 + salience.coerceIn(0.0, 1.0) * 0.5
    clearUntil = reservedUntil + (rate * recoverySeconds * recoveryScale).toLong()
    return true
  }

  fun advanceFrame() { frame++ }
}
