import Foundation

/// Host executable test of the wall-clock seam used by the sleep timer and
/// checkpoint timestamps. Confirms the default is real time, that an injected
/// clock is honored and isolated from real time, and that real wall-clock
/// time passing has no effect on it -- without depending on
/// AVFoundation/ExpoModulesCore.
///
/// This covers the seam itself only. The render-loop integration (sleep
/// deadline firing, pause/resume re-anchoring, checkpoint timestamps, and
/// the relationship between wall time and rendered/protocol position) lives
/// in `InnerAudioModule`, which requires the full AVFoundation/ExpoModulesCore
/// stack to instantiate and has no lightweight harness -- exactly like
/// `JourneyCheckpointStore`'s split from the rest of the module. That
/// integration coverage belongs to the upcoming offline/manual-rendering
/// harness, which will drive `InnerAudioModule`'s real render callback anyway.
@main struct InnerAudioWallClockTests {
  static func main() throws {
    defer { InnerAudioWallClock.nowMs = { Date().timeIntervalSince1970 * 1_000 } }

    let before = Date().timeIntervalSince1970 * 1_000
    let sampled = InnerAudioWallClock.nowMs()
    let after = Date().timeIntervalSince1970 * 1_000
    precondition(sampled >= before && sampled <= after, "default clock must be real wall time")

    var fakeNowMs = 1_000_000.0
    InnerAudioWallClock.nowMs = { fakeNowMs }
    precondition(InnerAudioWallClock.nowMs() == 1_000_000.0, "injected clock must be honored")
    fakeNowMs += 60_000
    precondition(InnerAudioWallClock.nowMs() == 1_060_000.0, "advancing the injected clock must not touch real time")

    // Real wall-clock time passes here; the injected clock does not move.
    let fixedNowMs = 2_000_000.0
    InnerAudioWallClock.nowMs = { fixedNowMs }
    Thread.sleep(forTimeInterval: 0.05)
    precondition(InnerAudioWallClock.nowMs() == fixedNowMs, "real elapsed time must not move the injected clock")

    print("InnerAudioWallClock: default is real time, injection is honored and isolated from real time PASS")
  }
}
