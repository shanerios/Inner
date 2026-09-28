import Foundation

/// Wall-clock source for the Overnight sleep-timer deadline and checkpoint
/// timestamps. Real by default; a test may inject another. Never read inside
/// per-sample DSP math -- only at the once-per-buffer sleep-timer check and
/// at pause/resume/checkpoint time. Mirrors Android's `ProceduralAudioEngine.wallClockMs`.
enum InnerAudioWallClock {
  static var nowMs: () -> Double = { Date().timeIntervalSince1970 * 1_000 }
}
