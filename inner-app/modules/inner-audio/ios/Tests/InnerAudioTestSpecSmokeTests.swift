import XCTest
@testable import InnerAudio

/// Pod-native dependency/testability smoke test only. Proves that XCTest
/// launches inside InnerAudio's own CocoaPods test_spec, that
/// `@testable import InnerAudio` succeeds, and that the production
/// `ProceduralAudioEngine` and its Record types are visible from outside the
/// file that defines them. Deliberately does not instantiate
/// ProceduralAudioEngine (which owns a real AVAudioEngine) or configure/start
/// any audio -- compile-time symbol resolution is the whole point here.
final class InnerAudioTestSpecSmokeTests: XCTestCase {
  func testProductionTypesAreVisibleViaTestableImport() {
    typealias Engine = ProceduralAudioEngine
    typealias Config = AudioConfigRecord
    typealias Stage = TimelineStageRecord
    typealias SpatialEvent = SpatialEventRecord
    typealias Timeline = AudioTimelineRecord

    XCTAssertTrue(true, "compiled and ran with all five production types resolved via @testable import")
  }
}
