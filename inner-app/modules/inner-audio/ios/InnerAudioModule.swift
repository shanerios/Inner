import AVFoundation
import ExpoModulesCore
import MediaPlayer
import UIKit

private struct AudioConfigRecord: Record {
  @Field var carrierHz = 528.0
  @Field var binauralCarrierHz = 200.0
  @Field var binauralDeltaHz = 4.0
  @Field var toneGain = 0.22
  @Field var harmonicWarmth = 0.0
  @Field var binauralGain = 0.0
  @Field var noiseColor: String?
  @Field var noiseGain = 0.0
  @Field var environment = "none"
  @Field var environmentGain = 0.0
  @Field var environmentIntensity = 0.5
  @Field var thresholdShift = 0.0
  @Field var identityPresence = 1.0
  @Field var identityDensity = 1.0
  @Field var identityVariety = 0.0
  @Field var harmonicTranslation = 0.0
  @Field var templeGain = 0.0
  @Field var templeIntensity = 0.5
  @Field var masterGain = 0.8
  @Field var rampMs = 80.0
  @Field var spatialMode = "still"
  @Field var spatialTarget = "noise"
  @Field var spatialDepth = 0.0
  @Field var spatialRate = 0.3
}

private struct TimelineStageRecord: Record {
  @Field var id = ""
  @Field var label = ""
  @Field var durationMs = 1_000.0
  @Field var transitionMs = 0.0
  @Field var config = AudioConfigRecord()
  @Field var spatialEvents: [SpatialEventRecord] = []
}

private struct SpatialEventRecord: Record {
  @Field var id = ""
  @Field var atMs = 0.0
  @Field var type = "swoosh"
  @Field var direction = "right"
  @Field var durationMs = 1_200.0
  @Field var depth = 0.8
  @Field var recognitionSpace = false
}

private struct AudioTimelineRecord: Record {
  @Field var id = ""
  @Field var title = ""
  @Field var seed = 1.0
  @Field var loop = false
  @Field var fadeInMs = 0.0
  @Field var totalDurationMs = 0.0
  @Field var stages: [TimelineStageRecord] = []
}

public final class InnerAudioModule: Module {
  private let engine = ProceduralAudioEngine()

  public func definition() -> ModuleDefinition {
    Name("InnerAudio")
    Function("isAvailable") { true }
    AsyncFunction("configure") { (config: AudioConfigRecord) in self.engine.configure(config) }
    AsyncFunction("setTimeline") { (timeline: AudioTimelineRecord?) in self.engine.setTimeline(timeline) }
    AsyncFunction("seekTimeline") { (positionMs: Double) in self.engine.seekTimeline(positionMs) }
    AsyncFunction("setNowPlaying") { (title: String) in self.engine.setNowPlaying(title) }
    AsyncFunction("setSleepTimer") { (endAtMs: Double?) in self.engine.setSleepTimer(endAtMs) }
    Function("getLastTimerCompletionAtMs") { self.engine.getLastTimerCompletionAtMs() }
    Function("getPlaybackState") { self.engine.getPlaybackState() }
    Function("getTimelinePositionMs") { self.engine.getTimelinePositionMs() }
    Function("getEngineDebugState") { self.engine.debugState() }
    Function("drainDiagnosticEvents") { self.engine.drainDiagnosticEvents() }
    AsyncFunction("setRecognitionSignal") { (signalId: String?, uri: String?, gain: Double?) in try self.engine.setRecognitionSignal(signalId, uri, gain ?? 1) }
    AsyncFunction("triggerCue") { self.engine.triggerCue() }
    AsyncFunction("play") { try self.engine.play() }
    AsyncFunction("pause") { self.engine.pause() }
    AsyncFunction("stop") { self.engine.stop() }
    OnDestroy { self.engine.stop(reason: "module_destroyed") }
  }
}

private struct Parameters {
  var carrierHz = 528.0
  var binauralCarrierHz = 200.0
  var deltaHz = 4.0
  var toneGain = 0.22
  var harmonicWarmth = 0.0
  var binauralGain = 0.0
  var noiseColor: String?
  var noiseGain = 0.0
  var environment = "none"
  var environmentGain = 0.0
  var environmentIntensity = 0.5
  var thresholdShift = 0.0
  /// Level of a world's signature sounds (Aum, whale call, Cosmic voice) without touching its bed. 1 = unchanged.
  var identityPresence = 1.0
  /// How often those signature sounds appear, 1 = as designed, lower = sparser.
  var identityDensity = 1.0
  /// How much each appearance of an identity sound differs from the last: 0 = identical every time, 1 = fullest.
  var identityVariety = 0.0
  var harmonicTranslation = 0.0
  var templeGain = 0.0
  var templeIntensity = 0.5
  var masterGain = 0.8
  var rampSeconds = 0.08
  var spatialMode = "still"
  var spatialTarget = "noise"
  var spatialDepth = 0.0
  var spatialRate = 0.3
  var sleepEndMs: Double?
}

private struct TimelineStage {
  let durationMs: Double
  let transitionMs: Double
  let parameters: Parameters
  let spatialEvents: [SpatialEvent]
  let cueEvents: [CueEvent]
}

private struct CueEvent {
  let atMs: Double
  let recognitionSpace: Bool
}

private struct SpatialEvent {
  let atMs: Double
  let durationMs: Double
  let direction: String
  let depth: Double
}

private struct RainPocket {
  var pan = 0.0
  var targetPan = 0.0
  var level = 0.0
  var targetLevel = 0.0
  var framesRemaining = 0.0
  var filter = 0.0
  var previousFilter = 0.0
  var random: UInt64
}

// A short feedback comb filter -- one tap of a Schroeder-style reverb tank.
private final class CombFilter {
  private var buffer: [Double]
  private var index = 0
  private let feedback: Double
  init(delaySamples: Int, feedback: Double) {
    buffer = [Double](repeating: 0, count: max(1, delaySamples))
    self.feedback = feedback
  }
  func process(_ x: Double) -> Double {
    let y = buffer[index]
    buffer[index] = x + y * feedback
    index = (index + 1) % buffer.count
    return y
  }
}

private final class AllpassFilter {
  private var buffer: [Double]
  private var index = 0
  private let gain: Double
  init(delaySamples: Int, gain: Double = 0.7) {
    buffer = [Double](repeating: 0, count: max(1, delaySamples))
    self.gain = gain
  }
  func process(_ x: Double) -> Double {
    let buffered = buffer[index]
    let y = -gain * x + buffered
    buffer[index] = x + buffered * gain
    index = (index + 1) % buffer.count
    return y
  }
}

private struct AudioTimeline {
  let seed: UInt64
  let loop: Bool
  let fadeInMs: Double
  let totalDurationMs: Double
  let stages: [TimelineStage]
}

final class WorldSalienceScheduler {
  private var rate = 48_000.0
  private var frame: UInt64 = 0
  private var reservedUntil: UInt64 = 0
  private var clearUntil: UInt64 = 0
  private var suppressed = false

  func reset(sampleRate: Double) {
    rate = sampleRate
    frame = 0
    reservedUntil = 0
    clearUntil = 0
    suppressed = false
  }

  func beginFrame(suppressRareEvents: Bool) {
    if suppressed && !suppressRareEvents {
      clearUntil = max(clearUntil, frame + UInt64(rate * 2))
    }
    suppressed = suppressRareEvents
  }

  func reserve(salience: Double, durationSeconds: Double, recoverySeconds: Double) -> Bool {
    guard !suppressed, frame >= reservedUntil, frame >= clearUntil else { return false }
    reservedUntil = frame + UInt64(rate * durationSeconds)
    let recoveryScale = 0.75 + min(1, max(0, salience)) * 0.5
    clearUntil = reservedUntil + UInt64(rate * recoverySeconds * recoveryScale)
    return true
  }

  func advanceFrame() { frame &+= 1 }
}

private final class ProceduralAudioEngine: NSObject {
  private enum PauseReason { case user, routeLoss, interruption }
  private var engine = AVAudioEngine()
  private let lock = NSLock()
  private var parameters = Parameters()
  private var timeline: AudioTimeline?
  private var timelineElapsedFrames = 0.0
  private var timelineGeneration: UInt64 = 0
  private var renderedTimelineGeneration: UInt64 = .max
  private var source: AVAudioSourceNode?
  private var sampleRate = 48_000.0
  // carrier, binaural L/R, carrier harmonics, speaker carrier + pulse envelope
  private var phases = [Double](repeating: 0, count: 7)
  private var gains = [Double](repeating: 0, count: 4)
  private var thresholdShepardPhases = [Double](repeating: 0, count: 4)
  private var harmonicTranslationPhases = [Double](repeating: 0, count: 2)
  private var thresholdEnvironmentLowLeft = 0.0
  private var thresholdEnvironmentLowRight = 0.0
  private var thresholdNoiseLowLeft = 0.0
  private var thresholdNoiseLowRight = 0.0
  private var thresholdDelayLeft = [Double](repeating: 0, count: 4_096)
  private var thresholdDelayRight = [Double](repeating: 0, count: 4_096)
  private var thresholdDelayIndex = 0
  private var renderedTimelineStageIndex = 0
  private var renderedTimelineStageLocalMs = 0.0
  private var privateOutputTarget = 0.0
  private var privateOutputMix = 0.0
  private var random: UInt64 = 0x9e3779b97f4a7c15
  private var pink = [Double](repeating: 0, count: 7)
  private var brown = 0.0
  private var greyLow = 0.0
  private var rainPockets = (0..<5).map { RainPocket(random: 0x9e3779b97f4a7c15 &+ UInt64($0 + 1) * 0x100000001b3) }
  private var noiseEnvelope = 0.0
  private var renderedNoiseColor: String?
  private var pendingNoiseColor: String?
  private var isChangingNoiseColor = false
  private var rainMix = 0.0
  private var oceanEnvelope = 0.0
  private let oceanModel = OceanModel()
  private var abyssalEnvelope = 0.0
  private let abyssalModel = AbyssalModel()
  private var windEnvelope = 0.0
  private var windRandom: UInt64 = 0x9e3779b97f4a7c15 ^ 0x7f4a7c15
  private var windBody = 0.0
  private var windAirLeft = 0.0
  private var windAirRight = 0.0
  private var fireEnvelope = 0.0
  private var fireRandom: UInt64 = 0x9e3779b97f4a7c15 ^ 0x2c1b3c6d
  private var fireBody = 0.0
  private var fireHiss = 0.0
  private var firePopLeft = 0.0
  private var firePopRight = 0.0
  private let fireEmberModel = FireEmberModel()
  private var cosmicEnvelope = 0.0
  private let cosmicModel = CosmicModel()
  private let worldSalience = WorldSalienceScheduler()
  private var forestEnvelope = 0.0
  private let forestCallModel = ForestCallModel()
  private var forestRandom: UInt64 = 0x9e3779b97f4a7c15 ^ 0xc2b2ae35
  private var forestCanopy = 0.0
  private var forestLeafLeft = 0.0
  private var forestLeafRight = 0.0
  private var forestBirdActive = false
  private var forestBirdFramesRemaining = 0.0
  private var forestBirdDurationFrames = 0.0
  private var forestBirdPhase = 0.0
  private var forestBirdFreqStart = 0.0
  private var forestBirdFreqRange = 0.0
  private var forestBirdAmp = 0.0
  private var forestBirdPan = 0.0
  private var templeSpaceEnvelope = 0.0
  private let aumChant = AumChant()
  private var templeSpaceRandom: UInt64 = 0x9e3779b97f4a7c15 ^ 0x6a09e667
  private var templeSpaceAirLeft = 0.0
  private var templeSpaceAirRight = 0.0
  private var templeSpaceBreathLowLeft = 0.0
  private var templeSpaceBreathLowRight = 0.0
  private var templeSpaceBreathMidLeft = 0.0
  private var templeSpaceBreathMidRight = 0.0
  private var templeSpacePhases = [Double](repeating: 0, count: 3)
  private static let templeSpaceFreqs = [73.42, 110.0, 164.81]
  private static let templeSpaceWeights = [0.46, 0.25, 0.13]
  private var templeSpaceDropFramesRemaining = 0.0
  private var templeSpaceDropAgeFrames = 0.0
  private var templeSpaceDropDurationFrames = 0.0
  private var templeSpaceDropPhase = 0.0
  private var templeSpaceDropFrequency = 0.0
  private var templeSpaceDropAmplitude = 0.0
  private var templeSpaceDropPan = 0.0
  private var templeSpaceNextDropFrames = 0.0
  private var templeSpaceDropEcho = [Double](repeating: 0, count: 48_000)
  private var templeSpaceDropEchoIndex = 0
  private var templeSpaceDelay = [Double](repeating: 0, count: 48_000)
  private let templeAccents = TempleAccents()
  private var templeSpaceDelayIndex = 0
  private var templeEnvelope = 0.0
  private var templeRandom: UInt64 = 0x9e3779b97f4a7c15 ^ 0x9c2f5a31
  private var templePhases = [Double](repeating: 0, count: 4)
  private var templeAmps = [Double](repeating: 0, count: 4)
  private var templeFreqs = [Double](repeating: 0, count: 4)
  private var cuePending = false
  private var cueTimelineThresholdMs = -1.0
  private var cueActive = false
  private var cueElapsedFrames = 0.0
  private var cueTotalFrames = 0.0
  private var cueLeftCombs: [CombFilter] = []
  private var cueRightCombs: [CombFilter] = []
  private var cueLeftAllpasses: [AllpassFilter] = []
  private var cueRightAllpasses: [AllpassFilter] = []
  private var recognitionSignalSamples: [Float] = []
  private var recognitionSignalSampleRate = 0.0
  private var recognitionSignalId: String?
  /// Linear level trim for the selected signal, set from JS (see recognitionSignals.ts).
  private var recognitionSignalGain = 1.0
  private var activeCueSamples: [Float] = []
  private var activeCueGain = 1.0
  private var activeCueSampleRate = 0.0
  private var orbitMix = 0.0
  private var orbitNoiseFilter = 0.0
  private var renderedPan = 0.0
  private var renderedSpatialRoom = 1.0
  private var renderedSpatialDistance = 1.0
  private var renderElapsedFrames = 0.0
  private var nowPlayingTitle = "Inner"
  private var desiredPlaying = false
  private var pauseReason: PauseReason?
  private var resumeFadeGeneration = 0
  private var sleepStopScheduled = false
  private var pausedSleepRemainingMs: Double?
  private var lastTimerCompletionAtMs: Double?
  private var remoteTargets: [(MPRemoteCommand, Any)] = []
  private var nowPlayingRefreshTimer: DispatchSourceTimer?
  private var isSystemInterrupted = false
  /// Why the engine last stopped (user, sleep timer, ...). Diagnostics only.
  private var lastStopReason: String?
  /// Frames the render callback has produced since the last stop. Guarded by `lock`.
  private var totalRenderedFrames = 0.0
  private let diagnosticLock = NSLock()
  private var diagnosticEvents: [[String: Any]] = []

  override init() {
    super.init()
    NotificationCenter.default.addObserver(
      self,
      selector: #selector(handleInterruption(_:)),
      name: AVAudioSession.interruptionNotification,
      object: AVAudioSession.sharedInstance()
    )
    NotificationCenter.default.addObserver(
      self,
      selector: #selector(handleRouteChange(_:)),
      name: AVAudioSession.routeChangeNotification,
      object: AVAudioSession.sharedInstance()
    )
    NotificationCenter.default.addObserver(
      self,
      selector: #selector(handleMediaServicesLost(_:)),
      name: AVAudioSession.mediaServicesWereLostNotification,
      object: AVAudioSession.sharedInstance()
    )
    NotificationCenter.default.addObserver(
      self,
      selector: #selector(handleMediaServicesReset(_:)),
      name: AVAudioSession.mediaServicesWereResetNotification,
      object: AVAudioSession.sharedInstance()
    )
  }

  deinit { NotificationCenter.default.removeObserver(self) }

  func configure(_ raw: AudioConfigRecord) {
    lock.lock()
    defer { lock.unlock() }
    parameters = normalizedParameters(raw, sleepEndMs: parameters.sleepEndMs)
    timeline = nil
    timelineElapsedFrames = 0
    timelineGeneration &+= 1
  }

  func setTimeline(_ raw: AudioTimelineRecord?) {
    lock.lock()
    defer { lock.unlock() }
    guard let raw, !raw.stages.isEmpty else {
      timeline = nil
      timelineElapsedFrames = 0
      timelineGeneration &+= 1
      return
    }
    let stages = raw.stages.prefix(32).map { stage in
      TimelineStage(
        durationMs: clamp(stage.durationMs, 1_000, 14_400_000),
        transitionMs: clamp(stage.transitionMs, 0, stage.durationMs),
        parameters: normalizedParameters(stage.config, sleepEndMs: nil),
        spatialEvents: stage.spatialEvents.prefix(16).compactMap { event in
          guard event.type == "swoosh", event.atMs >= 0, event.durationMs >= 500 else { return nil }
          return SpatialEvent(
            atMs: event.atMs,
            durationMs: min(5_000, event.durationMs),
            direction: event.direction == "left" ? "left" : "right",
            depth: clamp(event.depth, 0, 0.8)
          )
        },
        cueEvents: stage.spatialEvents.prefix(16).compactMap { event in
          guard event.type == "cue", event.atMs >= 0 else { return nil }
          return CueEvent(atMs: event.atMs, recognitionSpace: event.recognitionSpace)
        }
      )
    }
    let total = stages.reduce(0) { $0 + $1.durationMs }
    timeline = AudioTimeline(seed: max(1, UInt64(raw.seed.rounded(.towardZero))), loop: raw.loop, fadeInMs: clamp(raw.fadeInMs, 0, 10_000), totalDurationMs: total, stages: stages)
    timelineElapsedFrames = 0
    timelineGeneration &+= 1
  }

  func seekTimeline(_ positionMs: Double) {
    lock.lock()
    defer { lock.unlock() }
    guard let timeline else { return }
    let boundedMs = timeline.loop
      ? max(0, positionMs).truncatingRemainder(dividingBy: timeline.totalDurationMs)
      : clamp(positionMs, 0, timeline.totalDurationMs)
    timelineElapsedFrames = boundedMs * sampleRate / 1_000
    timelineGeneration &+= 1
  }

  func play(reason: String = "play_request", gentleFadeIn: Bool = false) throws {
    desiredPlaying = true
    pauseReason = nil
    resumeSleepTimer()
    if engine.isRunning { updateNowPlaying(rate: 1); return }
    let session = AVAudioSession.sharedInstance()
    do {
      // Playback sessions route to A2DP/AirPlay automatically. Supplying the
      // A2DP option with `.playback` is rejected with paramErr (-50) on some
      // physical iOS versions even though the simulator accepts it.
      try session.setCategory(.playback, mode: .default, options: [])
    } catch {
      recordPlaybackError("play_setCategory_failed", error)
      throw stageError("setCategory", error)
    }
    do {
      try session.setActive(true)
    } catch {
      recordPlaybackError("play_setActive_failed", error)
      // Another app or a call holds the audio session: report it as such, with
      // the same code Android uses, so JS can answer in one voice.
      if let busy = AVAudioSession.ErrorCode(rawValue: (error as NSError).code),
         busy == .isBusy || busy == .cannotInterruptOthers || busy == .insufficientPriority {
        throw Exception(
          name: "AudioBusy",
          description: "Audio was not started because another app is holding the audio output.",
          code: "ERR_AUDIO_BUSY"
        )
      }
      throw stageError("setActive", error)
    }
    updatePrivateOutput(for: session.currentRoute)
    let hardwareFormat = engine.outputNode.inputFormat(forBus: 0)
    sampleRate = hardwareFormat.sampleRate > 0 ? hardwareFormat.sampleRate : 48_000
    if source == nil { installSource(channelCount: max(2, hardwareFormat.channelCount)) }
    engine.mainMixerNode.outputVolume = gentleFadeIn ? 0 : 1
    engine.prepare()
    do {
      try engine.start()
    } catch {
      recordPlaybackError("play_engine_start_failed", error)
      throw stageError("engine.start", error)
    }
    installRemoteCommandsIfNeeded()
    updateNowPlaying(rate: 1)
    startNowPlayingRefresh()
    if gentleFadeIn { startGentleResumeFade() }
    recordDiagnostic("playback_resumed", reason: reason)
  }

  // react-native-track-player's underlying SwiftAudioEx player reacts to its queue
  // becoming empty (exactly what TrackPlayer.reset() produces, which every screen
  // calls immediately before starting a procedural session) by both nil-ing the
  // shared MPNowPlayingInfoCenter *and* deactivating the shared AVAudioSession
  // (RNTrackPlayer.configureAudioSession() -> AudioSessionController.deactivateSession()
  // when player.currentItem == nil). Both of SwiftAudioEx's own event listeners fire
  // asynchronously on a private queue (see SwiftAudioEx's `Event.emit`), so neither
  // race is bounded by the time TrackPlayer.reset()'s JS promise resolves — the
  // deactivation in particular can land *after* our play() has already activated the
  // session and started engine rendering. AVAudioEngine keeps producing audio either
  // way (deactivating the session doesn't stop Core Audio I/O already in progress),
  // but iOS ties lock-screen/Control Center eligibility to the session being active,
  // so a stray deactivation silently hides every control with no error on our side —
  // republishing Now Playing info alone can't fix that. Keep re-asserting both, on
  // the same cadence RNTP uses for its own elapsed-time updates (1s), for as long as
  // we're the active engine, so either race — this one or a later one — self-heals
  // within a second instead of being permanent. setActive(true) on an already-active
  // session is a documented no-op, so this costs nothing when RNTP hasn't touched it.
  private func startNowPlayingRefresh() {
    guard nowPlayingRefreshTimer == nil else { return }
    let timer = DispatchSource.makeTimerSource(queue: .main)
    timer.schedule(deadline: .now() + 1, repeating: 1.0)
    timer.setEventHandler { [weak self] in
      guard let self else { return }
      // Never fight a genuine system interruption (phone call, Siri, alarm) for the
      // session — only RNTP's spurious deactivation, which happens outside of one.
      if !self.isSystemInterrupted {
        try? AVAudioSession.sharedInstance().setActive(true, options: [])
      }
      self.updateNowPlaying(rate: self.engine.isRunning ? 1 : 0)
    }
    timer.resume()
    nowPlayingRefreshTimer = timer
  }

  private func stopNowPlayingRefresh() {
    nowPlayingRefreshTimer?.cancel()
    nowPlayingRefreshTimer = nil
  }

  private func stageError(_ stage: String, _ error: Error) -> NSError {
    NSError(
      domain: "InnerAudio",
      code: (error as NSError).code,
      userInfo: [NSLocalizedDescriptionKey: "\(stage) failed: \(error.localizedDescription)"]
    )
  }

  func pause() {
    desiredPlaying = false
    pause(reason: .user)
  }

  private func pause(reason: PauseReason) {
    pauseReason = reason
    pauseSleepTimer()
    resumeFadeGeneration &+= 1
    engine.pause()
    updateNowPlaying(rate: 0)
    recordDiagnostic("playback_paused", reason: reason == .user ? "user_pause" : reason == .routeLoss ? "route_loss" : "interruption")
  }

  func stop(reason: String = "stop_request") {
    // Every session begins by stopping the engine; only a stop that actually
    // ended something is worth recording as the last stop.
    if engine.isRunning || source != nil {
      lastStopReason = reason
      recordDiagnostic("playback_stopped", reason: reason)
    }
    desiredPlaying = false
    pauseReason = nil
    resumeFadeGeneration &+= 1
    isSystemInterrupted = false
    stopNowPlayingRefresh()
    engine.stop()
    if let source { engine.detach(source); self.source = nil }
    phases = [Double](repeating: 0, count: 7)
    gains = [Double](repeating: 0, count: 4)
    resetThresholdShift()
    privateOutputMix = privateOutputTarget
    pink = [Double](repeating: 0, count: 7)
    brown = 0
    greyLow = 0
    rainPockets = (0..<5).map { RainPocket(random: 0x9e3779b97f4a7c15 &+ UInt64($0 + 1) * 0x100000001b3) }
    noiseEnvelope = 0
    renderedNoiseColor = nil
    pendingNoiseColor = nil
    isChangingNoiseColor = false
    rainMix = 0
    oceanEnvelope = 0
    oceanModel.reset(seed: 0x9e3779b97f4a7c15, sampleRate: sampleRate)
    abyssalEnvelope = 0
    abyssalModel.reset(seed: 0x9e3779b97f4a7c15, sampleRate: sampleRate)
    windEnvelope = 0
    windRandom = 0x9e3779b97f4a7c15 ^ 0x7f4a7c15
    windBody = 0
    windAirLeft = 0
    windAirRight = 0
    fireEnvelope = 0
    fireRandom = 0x9e3779b97f4a7c15 ^ 0x2c1b3c6d
    fireBody = 0
    fireHiss = 0
    firePopLeft = 0
    firePopRight = 0
    fireEmberModel.reset(seed: 0x9e3779b97f4a7c15, sampleRate: sampleRate)
    cosmicEnvelope = 0
    cosmicModel.reset(seed: 0x9e3779b97f4a7c15, sampleRate: sampleRate)
    worldSalience.reset(sampleRate: sampleRate)
    forestEnvelope = 0
    forestRandom = 0x9e3779b97f4a7c15 ^ 0xc2b2ae35
    forestCanopy = 0
    forestLeafLeft = 0
    forestLeafRight = 0
    forestBirdActive = false
    forestBirdFramesRemaining = 0
    forestBirdDurationFrames = 0
    forestBirdPhase = 0
    forestBirdFreqStart = 0
    forestBirdFreqRange = 0
    forestBirdAmp = 0
    forestBirdPan = 0
    forestCallModel.reset(seed: 0x9e3779b97f4a7c15, sampleRate: sampleRate)
    templeSpaceEnvelope = 0
    templeSpaceRandom = 0x9e3779b97f4a7c15 ^ 0x6a09e667
    templeSpaceAirLeft = 0
    templeSpaceAirRight = 0
    templeSpaceBreathLowLeft = 0
    templeSpaceBreathLowRight = 0
    templeSpaceBreathMidLeft = 0
    templeSpaceBreathMidRight = 0
    aumChant.reset(seed: 0x9e3779b97f4a7c15)
    templeSpacePhases = [Double](repeating: 0, count: 3)
    templeSpaceDropFramesRemaining = 0
    templeSpaceDropAgeFrames = 0
    templeSpaceDropDurationFrames = 0
    templeSpaceNextDropFrames = sampleRate * 3.2
    templeSpaceDropEcho = [Double](repeating: 0, count: 48_000)
    templeSpaceDropEchoIndex = 0
    templeAccents.reset(seed: 0x9e3779b97f4a7c15, sampleRate: sampleRate)
    templeSpaceDelay = [Double](repeating: 0, count: 48_000)
    templeSpaceDelayIndex = 0
    templeEnvelope = 0
    templeRandom = 0x9e3779b97f4a7c15 ^ 0x9c2f5a31
    templePhases = [Double](repeating: 0, count: 4)
    templeAmps = [Double](repeating: 0, count: 4)
    templeFreqs = [Double](repeating: 0, count: 4)
    cuePending = false
    cueTimelineThresholdMs = -1
    cueActive = false
    cueElapsedFrames = 0
    cueTotalFrames = 0
    cueLeftCombs = []
    cueRightCombs = []
    cueLeftAllpasses = []
    cueRightAllpasses = []
    orbitMix = 0
    orbitNoiseFilter = 0
    renderedPan = 0
    renderedSpatialRoom = 1
    renderedSpatialDistance = 1
    renderElapsedFrames = 0
    sleepStopScheduled = false
    pausedSleepRemainingMs = nil
    lock.lock()
    timeline = nil
    timelineElapsedFrames = 0
    totalRenderedFrames = 0
    // An armed timer belongs to the session that armed it. Left in place, a
    // timer that has already expired would mute and stop the next session in
    // its very first render buffer, before JS can arm a new one.
    parameters.sleepEndMs = nil
    timelineGeneration &+= 1
    lock.unlock()
    removeRemoteCommands()
    MPNowPlayingInfoCenter.default().nowPlayingInfo = nil
  }

  func setNowPlaying(_ title: String) {
    nowPlayingTitle = title.isEmpty ? "Inner" : title
    updateNowPlaying(rate: engine.isRunning ? 1 : 0)
  }

  func setSleepTimer(_ endAtMs: Double?) {
    lock.lock()
    parameters.sleepEndMs = endAtMs
    pausedSleepRemainingMs = nil
    sleepStopScheduled = false
    lastTimerCompletionAtMs = nil
    lock.unlock()
  }

  func getLastTimerCompletionAtMs() -> Double? {
    lock.lock()
    defer { lock.unlock() }
    return lastTimerCompletionAtMs
  }

  func getPlaybackState() -> String {
    engine.isRunning ? "playing" : (source == nil ? "stopped" : "paused")
  }

  func getTimelinePositionMs() -> Double? {
    lock.lock()
    defer { lock.unlock() }
    guard timeline != nil else { return nil }
    return timelineElapsedFrames * 1_000 / sampleRate
  }

  /// A point-in-time read for diagnosing a session that looks alive but is not rendering.
  func debugState() -> [String: Any] {
    let playbackState = getPlaybackState()
    lock.lock()
    defer { lock.unlock() }
    var state: [String: Any] = [
      "playbackState": playbackState,
      "engineRunning": engine.isRunning,
      "timelineLoaded": timeline != nil,
      "renderedFrames": totalRenderedFrames,
      "sampleRate": sampleRate,
      "privateOutput": privateOutputTarget > 0.5,
    ]
    if timeline != nil { state["timelinePositionMs"] = timelineElapsedFrames * 1_000 / sampleRate }
    if let endMs = parameters.sleepEndMs { state["sleepEndMs"] = endMs }
    if let lastStopReason { state["lastStopReason"] = lastStopReason }
    return state
  }

  private func pauseSleepTimer() {
    lock.lock()
    if let endAtMs = parameters.sleepEndMs {
      pausedSleepRemainingMs = max(0, endAtMs - Date().timeIntervalSince1970 * 1_000)
      parameters.sleepEndMs = nil
    }
    lock.unlock()
  }

  private func resumeSleepTimer() {
    lock.lock()
    if let remainingMs = pausedSleepRemainingMs {
      parameters.sleepEndMs = Date().timeIntervalSince1970 * 1_000 + remainingMs
      pausedSleepRemainingMs = nil
    }
    lock.unlock()
  }

  private func startGentleResumeFade() {
    resumeFadeGeneration &+= 1
    let generation = resumeFadeGeneration
    for step in 1...10 {
      DispatchQueue.main.asyncAfter(deadline: .now() + Double(step) * 0.06) { [weak self] in
        guard let self, self.resumeFadeGeneration == generation, self.engine.isRunning else { return }
        self.engine.mainMixerNode.outputVolume = Float(step) / 10
      }
    }
  }

  func drainDiagnosticEvents() -> [[String: Any]] {
    diagnosticLock.lock()
    defer { diagnosticLock.unlock() }
    let events = diagnosticEvents
    diagnosticEvents.removeAll(keepingCapacity: true)
    return events
  }

  func setRecognitionSignal(_ signalId: String?, _ uri: String?, _ gain: Double) throws {
    // Bounded so a bad value can never turn a cue into something jarring: at most +6 dB.
    let signalGain = gain.isFinite ? min(2, max(0, gain)) : 1
    guard let uri, !uri.isEmpty else {
      lock.lock()
      recognitionSignalSamples = []
      recognitionSignalSampleRate = 0
      recognitionSignalId = signalId
      recognitionSignalGain = signalGain
      lock.unlock()
      return
    }
    guard let url = URL(string: uri), url.isFileURL else {
      throw NSError(domain: "InnerAudio", code: 1, userInfo: [NSLocalizedDescriptionKey: "Recognition signal requires a local file URL"])
    }
    let file = try AVAudioFile(forReading: url)
    guard let buffer = AVAudioPCMBuffer(pcmFormat: file.processingFormat, frameCapacity: AVAudioFrameCount(file.length)) else {
      throw NSError(domain: "InnerAudio", code: 2, userInfo: [NSLocalizedDescriptionKey: "Could not allocate recognition signal buffer"])
    }
    try file.read(into: buffer)
    guard let channels = buffer.floatChannelData, buffer.frameLength > 0 else {
      throw NSError(domain: "InnerAudio", code: 3, userInfo: [NSLocalizedDescriptionKey: "Recognition signal contains no PCM samples"])
    }
    let samples = Array(UnsafeBufferPointer(start: channels[0], count: Int(buffer.frameLength)))
    lock.lock()
    recognitionSignalSamples = samples
    recognitionSignalSampleRate = file.processingFormat.sampleRate
    recognitionSignalId = signalId
    recognitionSignalGain = signalGain
    lock.unlock()
  }

  private func recordDiagnostic(_ type: String, reason: String? = nil, route: String? = nil, extras: [String: Any] = [:]) {
    var event: [String: Any] = ["type": type, "atMs": Date().timeIntervalSince1970 * 1_000]
    if let reason { event["reason"] = reason }
    if let route { event["route"] = route }
    for (key, value) in extras { event[key] = value }
    diagnosticLock.lock()
    diagnosticEvents.append(event)
    if diagnosticEvents.count > 100 { diagnosticEvents.removeFirst(diagnosticEvents.count - 100) }
    diagnosticLock.unlock()
  }

  /// Fires the fixed lucidity cue once. Safe to call at any time; a call
  /// while the cue is already ringing restarts it cleanly rather than
  /// layering.
  func triggerCue() {
    cuePending = true
  }

  private func installSource(channelCount: AVAudioChannelCount) {
    // The simulator commonly runs at a fixed 48 kHz stereo format, while a
    // physical device's active route may advertise a different hardware
    // format. Build the source from the active route instead of assuming it.
    let format = AVAudioFormat(
      standardFormatWithSampleRate: sampleRate,
      channels: min(2, channelCount)
    )!
    let node = AVAudioSourceNode(format: format) { [weak self] _, _, frames, list in
      self?.render(frames, into: list)
      return noErr
    }
    engine.attach(node)
    engine.connect(node, to: engine.mainMixerNode, format: format)
    source = node
  }

  private func render(_ frameCount: AVAudioFrameCount, into list: UnsafeMutablePointer<AudioBufferList>) {
    lock.lock()
    let baseTarget = parameters
    let activeTimeline = timeline
    let timelineStartFrame = timelineElapsedFrames
    let renderStartFrame = renderElapsedFrames
    let generation = timelineGeneration
    let routeTarget = privateOutputTarget
    lock.unlock()
    if let activeTimeline, renderedTimelineGeneration != generation {
      random = activeTimeline.seed
      oceanModel.reset(seed: activeTimeline.seed, sampleRate: sampleRate)
      abyssalModel.reset(seed: activeTimeline.seed, sampleRate: sampleRate)
      windRandom = activeTimeline.seed ^ 0x7f4a7c15
      fireRandom = activeTimeline.seed ^ 0x2c1b3c6d
      fireEmberModel.reset(seed: activeTimeline.seed, sampleRate: sampleRate)
      cosmicModel.reset(seed: activeTimeline.seed, sampleRate: sampleRate)
      worldSalience.reset(sampleRate: sampleRate)
      resetThresholdShift()
      templeRandom = activeTimeline.seed ^ 0x9c2f5a31
      rainPockets = (0..<5).map { RainPocket(random: activeTimeline.seed &+ UInt64($0 + 1) * 0x100000001b3) }
      pink = [Double](repeating: 0, count: 7)
      brown = 0
      greyLow = 0
      forestRandom = activeTimeline.seed ^ 0xc2b2ae35
      forestBirdActive = false
      forestBirdFramesRemaining = 0
      forestCallModel.reset(seed: activeTimeline.seed, sampleRate: sampleRate)
      templeSpaceRandom = activeTimeline.seed ^ 0x6a09e667
      templeSpaceAirLeft = 0
      templeSpaceAirRight = 0
      templeSpaceBreathLowLeft = 0
      templeSpaceBreathLowRight = 0
      templeSpaceBreathMidLeft = 0
      templeSpaceBreathMidRight = 0
      aumChant.reset(seed: activeTimeline.seed)
      templeSpacePhases = [Double](repeating: 0, count: 3)
      templeSpaceDropFramesRemaining = 0
      templeSpaceDropAgeFrames = 0
      templeSpaceDropDurationFrames = 0
      templeSpaceNextDropFrames = sampleRate * 3.2
      templeSpaceDropEcho = [Double](repeating: 0, count: 48_000)
      templeSpaceDropEchoIndex = 0
      templeAccents.reset(seed: activeTimeline.seed, sampleRate: sampleRate)
      templeSpaceDelay = [Double](repeating: 0, count: 48_000)
      templeSpaceDelayIndex = 0
      // Anything at-or-before the timeline's current position counts as
      // already fired, so a fresh timeline or a seek doesn't replay past cues.
      cueTimelineThresholdMs = timelineStartFrame * 1_000 / sampleRate
      renderedTimelineGeneration = generation
    }
    if cuePending {
      cuePending = false
      startCue()
    }
    let buffers = UnsafeMutableAudioBufferListPointer(list)
    guard buffers.count >= 2,
          let left = buffers[0].mData?.assumingMemoryBound(to: Float.self),
          let right = buffers[1].mData?.assumingMemoryBound(to: Float.self) else { return }
    let tau = Double.pi * 2
    let bufferStartMs = Date().timeIntervalSince1970 * 1_000

    for frame in 0..<Int(frameCount) {
      let target = activeTimeline.map {
        timelineParameters($0, elapsedMs: (timelineStartFrame + Double(frame)) * 1_000 / sampleRate, base: baseTarget)
      } ?? baseTarget
      let spatialTime = (activeTimeline == nil ? renderStartFrame : timelineStartFrame) + Double(frame)
      let spatialSeconds = spatialTime / sampleRate
      let journeyFade = activeTimeline.map {
        $0.fadeInMs > 0 ? min(1, spatialTime * 1_000 / sampleRate / $0.fadeInMs) : 1
      } ?? 1
      let timelineElapsedMs = spatialTime * 1_000 / sampleRate
      let threshold = activeTimeline.map { timelineThresholdState($0, target: target) }
      let recognitionSpace = activeTimeline.flatMap { timelineRecognitionSpace($0, elapsedMs: timelineElapsedMs) }
      let event = activeTimeline.flatMap { timelineSpatialEvent($0, elapsedMs: timelineElapsedMs) }
      if let activeTimeline, let cueFireMs = timelineCueEventMs(activeTimeline, elapsedMs: timelineElapsedMs, afterMs: cueTimelineThresholdMs) {
        cueTimelineThresholdMs = cueFireMs
        startCue()
        recordDiagnostic("recognition_signal_fired", extras: [
          "signalId": recognitionSignalId ?? "ascending",
          "scheduledPositionMs": cueFireMs,
          "actualPositionMs": timelineElapsedMs,
          "driftMs": timelineElapsedMs - cueFireMs,
        ])
      }
      worldSalience.beginFrame(suppressRareEvents: recognitionSpace != nil || cueActive)
      let orbitPhase = spatialSeconds * target.spatialRate * Double.pi * 2 / 60
      let orbitNear = (cos(orbitPhase) + 1) / 2
      // Vortex reuses orbit's "pulled toward/away from center" distance-darkening
      // mechanic — a spiral is a kind of orbit whose radius and rate aren't constant.
      let orbitTarget = (target.spatialMode == "orbit" || target.spatialMode == "vortex") ? 1.0 : 0.0
      let orbitStep = 1 / max(1, sampleRate * 2.0)
      orbitMix += clamp(orbitTarget - orbitMix, -orbitStep, orbitStep)
      let requestedPan = event?.pan ?? spatialPan(target, elapsedSeconds: spatialSeconds)
      let requestedSpatialRoom = min(
        spatialCenterGain(target, elapsedSeconds: spatialSeconds),
        event.map { 1 - 0.62 * $0.crossing } ?? 1
      )
      // Orbit follows an ellipse around the listener. At the front it returns
      // near full presence; behind the listener it becomes quieter and darker.
      let orbitDistance = 1 - target.spatialDepth * 0.5 * (1 - orbitNear)
      let requestedSpatialDistance = 1 + (orbitDistance - 1) * orbitMix
      // Categorical movement changes happen at stage boundaries. Slew their
      // output briefly so a new mode can never snap between stereo positions.
      let spatialSlew = 1 / max(1, sampleRate * 0.12)
      renderedPan += clamp(requestedPan - renderedPan, -spatialSlew, spatialSlew)
      renderedSpatialRoom += clamp(requestedSpatialRoom - renderedSpatialRoom, -spatialSlew, spatialSlew)
      renderedSpatialDistance += clamp(requestedSpatialDistance - renderedSpatialDistance, -spatialSlew, spatialSlew)
      let pan = renderedPan
      let spatialRoom = renderedSpatialRoom
      let spatialDistance = renderedSpatialDistance
      // Constant-sum amplitude panning makes depth perceptually legible:
      // pan -0.8 = 90/10 left/right, 0 = 50/50, +0.8 = 10/90.
      // The sum remains constant through the movement, avoiding a center bump.
      let leftSpatial = 1 - pan
      let rightSpatial = 1 + pan
      let smoothing = min(1, 1 / max(1, target.rampSeconds * sampleRate))
      let leftHz = max(20, target.binauralCarrierHz - target.deltaHz / 2)
      let rightHz = min(2_000, target.binauralCarrierHz + target.deltaHz / 2)
      let routeStep = 1 / max(1, sampleRate * 5.0)
      privateOutputMix += clamp(routeTarget - privateOutputMix, -routeStep, routeStep)
      gains[0] += (target.toneGain - gains[0]) * smoothing
      gains[1] += (target.binauralGain - gains[1]) * smoothing
      gains[2] += (target.noiseGain - gains[2]) * smoothing
      gains[3] += (target.masterGain - gains[3]) * smoothing
      // Every noise entrance and exit uses the same long envelope. A color
      // change first fades the old generator fully out, swaps it at silence,
      // then fades the new generator in so stage transitions cannot click.
      if target.noiseColor != renderedNoiseColor && (!isChangingNoiseColor || pendingNoiseColor != target.noiseColor) {
        pendingNoiseColor = target.noiseColor
        isChangingNoiseColor = true
      }
      let noiseIsPresent = renderedNoiseColor != nil && target.noiseGain > 0.0001
      let noiseEnvelopeTarget = isChangingNoiseColor ? 0.0 : (noiseIsPresent ? 1.0 : 0.0)
      let noiseEnvelopeStep = 1 / max(1, sampleRate * 4.5)
      noiseEnvelope += clamp(noiseEnvelopeTarget - noiseEnvelope, -noiseEnvelopeStep, noiseEnvelopeStep)
      if isChangingNoiseColor && noiseEnvelope <= 0.0001 {
        renderedNoiseColor = pendingNoiseColor
        pendingNoiseColor = nil
        isChangingNoiseColor = false
        pink = [Double](repeating: 0, count: 7)
        brown = 0
        greyLow = 0
      }
      // Rain is a different generator, so blend into and out of it instead of
      // swapping textures at the midpoint of a stage transition.
      let rainTarget = target.spatialMode == "rain" ? 1.0 : 0.0
      let rainStep = 1 / max(1, sampleRate * 4.5)
      rainMix += clamp(rainTarget - rainMix, -rainStep, rainStep)
      let oceanTarget = target.environment == "ocean" && target.environmentGain > 0.0001 ? 1.0 : 0.0
      let oceanStep = 1 / max(1, sampleRate * 4.5)
      oceanEnvelope += clamp(oceanTarget - oceanEnvelope, -oceanStep, oceanStep)
      let abyssalTarget = target.environment == "abyssal" && target.environmentGain > 0.0001 ? 1.0 : 0.0
      let abyssalStep = 1 / max(1, sampleRate * 6.0)
      abyssalEnvelope += clamp(abyssalTarget - abyssalEnvelope, -abyssalStep, abyssalStep)
      let windTarget = target.environment == "wind" && target.environmentGain > 0.0001 ? 1.0 : 0.0
      let windStep = 1 / max(1, sampleRate * 4.5)
      windEnvelope += clamp(windTarget - windEnvelope, -windStep, windStep)
      let fireTarget = target.environment == "fire" && target.environmentGain > 0.0001 ? 1.0 : 0.0
      let fireStep = 1 / max(1, sampleRate * 4.5)
      fireEnvelope += clamp(fireTarget - fireEnvelope, -fireStep, fireStep)
      let cosmicTarget = target.environment == "cosmic" && target.environmentGain > 0.0001 ? 1.0 : 0.0
      let cosmicStep = 1 / max(1, sampleRate * 4.5)
      cosmicEnvelope += clamp(cosmicTarget - cosmicEnvelope, -cosmicStep, cosmicStep)
      let forestTarget = target.environment == "forest" && target.environmentGain > 0.0001 ? 1.0 : 0.0
      let forestStep = 1 / max(1, sampleRate * 4.5)
      forestEnvelope += clamp(forestTarget - forestEnvelope, -forestStep, forestStep)
      let templeSpaceTarget = target.environment == "temple" && target.environmentGain > 0.0001 ? 1.0 : 0.0
      let templeSpaceStep = 1 / max(1, sampleRate * 4.5)
      templeSpaceEnvelope += clamp(templeSpaceTarget - templeSpaceEnvelope, -templeSpaceStep, templeSpaceStep)
      // Temple is its own independent layer (like tone/binaural/noise), not tied
      // to the mutually-exclusive environment selector.
      let templeTarget = target.templeGain > 0.0001 ? 1.0 : 0.0
      let templeStep = 1 / max(1, sampleRate * 4.5)
      // Pick a fresh (seeded) fundamental and start from silence right as temple
      // fades in, so re-engaging it always begins cleanly rather than resuming
      // mid-swell from whatever partial amplitudes were left over.
      if templeTarget > 0 && templeEnvelope <= 0.0001 {
        let templeBase = 196 + abs(nextTempleWhite()) * 51
        for index in 0..<4 {
          templeFreqs[index] = templeBase * Self.templeRatios[index]
          templePhases[index] = 0
          templeAmps[index] = 0
        }
      }
      templeEnvelope += clamp(templeTarget - templeEnvelope, -templeStep, templeStep)
      // Preserve the selected fundamental while adding restrained octave and
      // fifth partials. Their combined level is compensated so warmth changes
      // timbre rather than producing an abrupt loudness jump.
      let warmth = target.harmonicWarmth
      let carrierBody = sin(phases[0]) + warmth * (sin(phases[3]) * 0.22 + sin(phases[4]) * 0.14)
      let carrier = carrierBody / (1 + warmth * 0.18) * gains[0]
      let rawNoise = nextNoise(renderedNoiseColor)
      let orbitShadow = orbitMix * target.spatialDepth * (1 - orbitNear)
      let orbitFilterCoefficient = 0.06 + 0.94 * (1 - orbitShadow)
      orbitNoiseFilter += orbitFilterCoefficient * (rawNoise - orbitNoiseFilter)
      let orbitShapedNoise = rawNoise * (1 - orbitShadow) + orbitNoiseFilter * orbitShadow
      let noise = orbitShapedNoise * gains[2] * noiseEnvelope
      let movesTone = target.spatialTarget == "tone" || target.spatialTarget == "both"
      let movesNoise = target.spatialTarget == "noise" || target.spatialTarget == "both"
      let leftCarrier = carrier * (movesTone ? leftSpatial * spatialDistance : spatialRoom)
      let rightCarrier = carrier * (movesTone ? rightSpatial * spatialDistance : spatialRoom)
      let baseLeftNoise = noise * (movesNoise ? leftSpatial : 1)
      let baseRightNoise = noise * (movesNoise ? rightSpatial : 1)
      let rainNoise = nextRainNoise(target)
      let rainGain = gains[2] * noiseEnvelope
      let leftNoise = (baseLeftNoise * (1 - rainMix) + rainNoise.left * rainGain * rainMix) * spatialDistance
      let rightNoise = (baseRightNoise * (1 - rainMix) + rainNoise.right * rainGain * rainMix) * spatialDistance
      let ocean = oceanEnvelope > 0.0001
        ? nextOcean(elapsedSeconds: spatialSeconds, intensity: target.environmentIntensity, presence: target.identityPresence, density: target.identityDensity, variety: target.identityVariety)
        : (left: 0.0, right: 0.0)
      let oceanGain = target.environmentGain * oceanEnvelope
      let abyssal = abyssalEnvelope > 0.0001
        ? nextAbyssal(elapsedSeconds: spatialSeconds, intensity: target.environmentIntensity, presence: target.identityPresence, density: target.identityDensity, variety: target.identityVariety)
        : (left: 0.0, right: 0.0)
      let abyssalGain = target.environmentGain * abyssalEnvelope
      let wind = windEnvelope > 0.0001
        ? nextWind(elapsedSeconds: spatialSeconds, intensity: target.environmentIntensity)
        : (left: 0.0, right: 0.0)
      let windGain = target.environmentGain * windEnvelope
      let fire = fireEnvelope > 0.0001
        ? nextFire(elapsedSeconds: spatialSeconds, intensity: target.environmentIntensity, presence: target.identityPresence, density: target.identityDensity, variety: target.identityVariety)
        : (left: 0.0, right: 0.0)
      let fireGain = target.environmentGain * fireEnvelope
      let cosmic = cosmicEnvelope > 0.0001
        ? nextCosmic(elapsedSeconds: spatialSeconds, intensity: target.environmentIntensity, presence: target.identityPresence, density: target.identityDensity, variety: target.identityVariety)
        : (left: 0.0, right: 0.0)
      let cosmicGain = target.environmentGain * cosmicEnvelope
      let forest = forestEnvelope > 0.0001
        ? nextForest(elapsedSeconds: spatialSeconds, intensity: target.environmentIntensity, presence: target.identityPresence, density: target.identityDensity, variety: target.identityVariety)
        : (left: 0.0, right: 0.0)
      let forestGain = target.environmentGain * forestEnvelope
      let templeSpace = templeSpaceEnvelope > 0.0001
        ? nextTempleSpace(elapsedSeconds: spatialSeconds, intensity: target.environmentIntensity, presence: target.identityPresence, density: target.identityDensity, variety: target.identityVariety)
        : (left: 0.0, right: 0.0)
      let templeSpaceGain = target.environmentGain * templeSpaceEnvelope
      let temple = templeEnvelope > 0.0001
        ? nextTemple(elapsedSeconds: spatialSeconds, intensity: target.templeIntensity)
        : (left: 0.0, right: 0.0)
      let templeLevel = target.templeGain * templeEnvelope
      let cue = nextCue()
      let sampleNowMs = bufferStartMs + Double(frame) * 1_000 / sampleRate
      let sleepGain = target.sleepEndMs.map { min(1, max(0, ($0 - sampleNowMs) / 6_000)) } ?? 1
      // Fixed staging keeps a single layer comfortably audible while leaving
      // room for all three layers. The final tanh stage is effectively unity
      // at normal levels and rounds only extreme peaks instead of hard-clipping.
      let pulseEnvelope = 0.12 + 0.88 * (0.5 - 0.5 * cos(phases[6]))
      let speakerPulse = sin(phases[5]) * pulseEnvelope * gains[1] * spatialRoom
      let leftEntrainment = sin(phases[1]) * gains[1] * spatialRoom * privateOutputMix + speakerPulse * (1 - privateOutputMix)
      let rightEntrainment = sin(phases[2]) * gains[1] * spatialRoom * privateOutputMix + speakerPulse * (1 - privateOutputMix)
      let thresholdDepth = threshold?.depth ?? 0
      let thresholdMotion = threshold?.motion ?? 0
      let harmonicTranslation = nextHarmonicTranslation(target)
      let shepardDescent = nextThresholdShepard(progress: thresholdDepth, motion: thresholdMotion) * target.environmentGain * 0.075
      let thresholdCenter = harmonicTranslation + shepardDescent
      let rawEnvironmentLeft = ocean.left * oceanGain + abyssal.left * abyssalGain + wind.left * windGain + fire.left * fireGain + cosmic.left * cosmicGain + forest.left * forestGain + templeSpace.left * templeSpaceGain + temple.left * templeLevel + thresholdCenter
      let rawEnvironmentRight = ocean.right * oceanGain + abyssal.right * abyssalGain + wind.right * windGain + fire.right * fireGain + cosmic.right * cosmicGain + forest.right * forestGain + templeSpace.right * templeSpaceGain + temple.right * templeLevel + thresholdCenter
      let thresholdCutoff = 5_500 / (1 + 2.928571 * thresholdDepth)
      let thresholdFilter = tau * thresholdCutoff / (sampleRate + tau * thresholdCutoff)
      thresholdEnvironmentLowLeft += thresholdFilter * (rawEnvironmentLeft - thresholdEnvironmentLowLeft)
      thresholdEnvironmentLowRight += thresholdFilter * (rawEnvironmentRight - thresholdEnvironmentLowRight)
      thresholdNoiseLowLeft += thresholdFilter * (leftNoise - thresholdNoiseLowLeft)
      thresholdNoiseLowRight += thresholdFilter * (rightNoise - thresholdNoiseLowRight)
      let darkEnvironmentLeft = rawEnvironmentLeft * (1 - thresholdDepth) + thresholdEnvironmentLowLeft * thresholdDepth
      let darkEnvironmentRight = rawEnvironmentRight * (1 - thresholdDepth) + thresholdEnvironmentLowRight * thresholdDepth
      let delayLeftFrames = min(thresholdDelayLeft.count - 1, max(1, Int(sampleRate * 0.031)))
      let delayRightFrames = min(thresholdDelayRight.count - 1, max(1, Int(sampleRate * 0.043)))
      let delayedLeft = thresholdDelayLeft[(thresholdDelayIndex - delayLeftFrames + thresholdDelayLeft.count) % thresholdDelayLeft.count]
      let delayedRight = thresholdDelayRight[(thresholdDelayIndex - delayRightFrames + thresholdDelayRight.count) % thresholdDelayRight.count]
      thresholdDelayLeft[thresholdDelayIndex] = darkEnvironmentLeft + delayedRight * 0.18
      thresholdDelayRight[thresholdDelayIndex] = darkEnvironmentRight + delayedLeft * 0.18
      thresholdDelayIndex = (thresholdDelayIndex + 1) % thresholdDelayLeft.count
      let thresholdWet = thresholdDepth * 0.08
      let expandedEnvironmentLeft = darkEnvironmentLeft * (1 - thresholdWet) + delayedLeft * thresholdWet
      let expandedEnvironmentRight = darkEnvironmentRight * (1 - thresholdWet) + delayedRight * thresholdWet
      let environmentMid = (expandedEnvironmentLeft + expandedEnvironmentRight) * 0.5
      let thresholdWidth = 1 + thresholdDepth * 0.12
      let environmentSide = (expandedEnvironmentLeft - expandedEnvironmentRight) * 0.5 * thresholdWidth * (recognitionSpace?.width ?? 1)
      let recognitionGain = recognitionSpace?.gain ?? 1
      let shapedEnvironmentLeft = (environmentMid + environmentSide) * recognitionGain
      let shapedEnvironmentRight = (environmentMid - environmentSide) * recognitionGain
      let recognitionNoiseGain = 0.7 + 0.3 * recognitionGain
      let thresholdNoiseMix = thresholdDepth * 0.72
      let shapedNoiseLeft = (leftNoise * (1 - thresholdNoiseMix) + thresholdNoiseLowLeft * thresholdNoiseMix) * recognitionNoiseGain
      let shapedNoiseRight = (rightNoise * (1 - thresholdNoiseMix) + thresholdNoiseLowRight * thresholdNoiseMix) * recognitionNoiseGain
      let leftMix = (leftCarrier + leftEntrainment + shapedNoiseLeft + shapedEnvironmentLeft + cue.left) * gains[3] * journeyFade * sleepGain * 0.32
      let rightMix = (rightCarrier + rightEntrainment + shapedNoiseRight + shapedEnvironmentRight + cue.right) * gains[3] * journeyFade * sleepGain * 0.32
      left[frame] = Float(softLimit(leftMix))
      right[frame] = Float(softLimit(rightMix))
      phases[0] = fmod(phases[0] + tau * target.carrierHz / sampleRate, tau)
      phases[1] = fmod(phases[1] + tau * leftHz / sampleRate, tau)
      phases[2] = fmod(phases[2] + tau * rightHz / sampleRate, tau)
      phases[3] = fmod(phases[3] + tau * target.carrierHz * 2 / sampleRate, tau)
      phases[4] = fmod(phases[4] + tau * target.carrierHz * 1.5 / sampleRate, tau)
      phases[5] = fmod(phases[5] + tau * target.binauralCarrierHz / sampleRate, tau)
      phases[6] = fmod(phases[6] + tau * target.deltaHz / sampleRate, tau)
      worldSalience.advanceFrame()
    }

    lock.lock()
    if activeTimeline != nil, generation == timelineGeneration { timelineElapsedFrames += Double(frameCount) }
    totalRenderedFrames += Double(frameCount)
    let renderedSoFar = totalRenderedFrames
    lock.unlock()
    renderElapsedFrames += Double(frameCount)

    if let endMs = baseTarget.sleepEndMs, bufferStartMs >= endMs, !sleepStopScheduled {
      lock.lock()
      sleepStopScheduled = true
      lastTimerCompletionAtMs = Date().timeIntervalSince1970 * 1_000
      lock.unlock()
      // Rendered frames and how long past its end the timer was when it fired
      // tell an ordinary ending (small age, many frames) from a stale timer
      // (large age, almost no frames).
      recordDiagnostic("sleep_timer_fired", extras: [
        "detail": "ageMs=\(Int64(bufferStartMs - endMs)) rendered=\(Int64(renderedSoFar))"
      ])
      DispatchQueue.main.async { [weak self] in self?.stop(reason: "sleep_timer") }
    }
  }

  private func nextNoise(_ color: String?) -> Double {
    guard let color else { return 0 }
    let white = nextWhite()
    switch color {
    case "pink":
      pink[0] = 0.99886 * pink[0] + white * 0.0555179
      pink[1] = 0.99332 * pink[1] + white * 0.0750759
      pink[2] = 0.96900 * pink[2] + white * 0.1538520
      pink[3] = 0.86650 * pink[3] + white * 0.3104856
      pink[4] = 0.55000 * pink[4] + white * 0.5329522
      pink[5] = -0.7616 * pink[5] - white * 0.0168980
      let value = pink[0] + pink[1] + pink[2] + pink[3] + pink[4] + pink[5] + pink[6] + white * 0.5362
      pink[6] = white * 0.115926
      return value * 0.11
    case "brown":
      brown = (brown + 0.02 * white) / 1.02
      return brown * 3.5
    case "grey":
      greyLow += 0.015 * (white - greyLow)
      return (white - greyLow) * 0.7
    default: return white
    }
  }

  private func spatialPan(_ target: Parameters, elapsedSeconds: Double) -> Double {
    guard target.spatialMode != "still", target.spatialDepth > 0 else { return 0 }
    let phase = elapsedSeconds * target.spatialRate * Double.pi * 2 / 60
    let movement: Double
    if target.spatialMode == "rain" {
      return 0
    } else if target.spatialMode == "orbit" {
      movement = sin(phase)
    } else if target.spatialMode == "vortex" {
      // A spiral's swing widens and narrows as it turns, rather than tracing
      // orbit's constant-radius circle — it reads as being pulled inward and
      // released rather than simply revolving.
      movement = sin(phase) * (0.75 + 0.25 * sin(phase * 0.33))
    } else if target.spatialMode == "channelTest" {
      // Four-second diagnostic cycle: hold left, cross smoothly, hold right,
      // then cross back. This deliberately ignores the creative rate control.
      let cycle = elapsedSeconds.truncatingRemainder(dividingBy: 4) / 4
      if cycle < 0.4 {
        movement = -1
      } else if cycle < 0.5 {
        let t = (cycle - 0.4) / 0.1
        movement = -1 + 2 * (t * t * (3 - 2 * t))
      } else if cycle < 0.9 {
        movement = 1
      } else {
        let t = (cycle - 0.9) / 0.1
        movement = 1 - 2 * (t * t * (3 - 2 * t))
      }
    } else if target.spatialMode == "pendulum" {
      movement = sin(phase)
    } else if target.spatialMode == "swoosh" {
      let cycle = phase.truncatingRemainder(dividingBy: Double.pi * 2) / (Double.pi * 2)
      if cycle < 0.38 {
        movement = 1
      } else if cycle < 0.5 {
        let t = (cycle - 0.38) / 0.12
        let smooth = t * t * (3 - 2 * t)
        movement = 1 - 2 * smooth
      } else if cycle < 0.88 {
        movement = -1
      } else {
        let t = (cycle - 0.88) / 0.12
        let smooth = t * t * (3 - 2 * t)
        movement = -1 + 2 * smooth
      }
    } else {
      // Related slow curves create an organic path while remaining continuous
      // and deterministic through pause, resume, and timeline seeking.
      movement = sin(phase) * 0.68 + sin(phase * 0.43 + 1.7) * 0.22 + sin(phase * 1.71 + 4.1) * 0.1
    }
    return clamp(movement * target.spatialDepth, -0.8, 0.8)
  }

  private func spatialCenterGain(_ target: Parameters, elapsedSeconds: Double) -> Double {
    guard target.spatialDepth > 0 else { return 1 }
    switch target.spatialMode {
    case "drift":
      return 1 - 0.14 * target.spatialDepth
    case "pendulum":
      return 1 - 0.24 * target.spatialDepth
    case "swoosh":
      let phase = elapsedSeconds * target.spatialRate * Double.pi * 2 / 60
      let cycle = phase.truncatingRemainder(dividingBy: Double.pi * 2) / (Double.pi * 2)
      let crossingProgress: Double?
      if cycle >= 0.38 && cycle < 0.5 {
        crossingProgress = (cycle - 0.38) / 0.12
      } else if cycle >= 0.88 {
        crossingProgress = (cycle - 0.88) / 0.12
      } else {
        crossingProgress = nil
      }
      // A sine window reaches its deepest point halfway through the crossing
      // and returns smoothly to the full mix as the noise settles.
      let crossing = crossingProgress.map { sin(Double.pi * $0) } ?? 0
      let maximumDuck = 0.58 * target.spatialDepth
      return 1 - maximumDuck * crossing
    case "rain":
      return 1 - 0.12 * target.spatialDepth
    case "orbit":
      return 1 - 0.2 * target.spatialDepth
    case "vortex":
      return 1 - 0.3 * target.spatialDepth
    default:
      return 1
    }
  }

  // Not loop-aware: a scheduled cue re-crossing the wrap boundary of a
  // looping timeline won't refire. None of today's journeys loop, so this
  // is left simple rather than tracking fired-state per lap.
  private func timelineCueEventMs(_ timeline: AudioTimeline, elapsedMs: Double, afterMs: Double) -> Double? {
    var cursor = 0.0
    for stage in timeline.stages {
      for event in stage.cueEvents {
        let globalAtMs = cursor + event.atMs
        if globalAtMs > afterMs && globalAtMs <= elapsedMs { return globalAtMs }
      }
      cursor += stage.durationMs
    }
    return nil
  }

  /// Opens a quiet field around overnight recognition cues. The curve comes
  /// from timeline position, keeping it sample-smooth through every callback.
  private func timelineRecognitionSpace(_ timeline: AudioTimeline, elapsedMs: Double) -> (gain: Double, width: Double)? {
    var cursor = 0.0
    var bestGain = 1.0
    var bestWidth = 1.0
    var active = false
    for stage in timeline.stages {
      for event in stage.cueEvents where event.recognitionSpace {
        let relativeMs = elapsedMs - (cursor + event.atMs)
        let progress: Double
        if relativeMs < -20_000 || relativeMs > 30_000 {
          continue
        } else if relativeMs < -10_000 {
          progress = smoothStep((relativeMs + 20_000) / 10_000) * 0.45
        } else if relativeMs < 0 {
          progress = 0.45 + smoothStep((relativeMs + 10_000) / 10_000) * 0.45
        } else if relativeMs <= 10_000 {
          progress = 0.9
        } else {
          progress = 0.9 * (1 - smoothStep((relativeMs - 10_000) / 20_000))
        }
        let gain = 1 - progress * 0.46
        if gain < bestGain {
          bestGain = gain
          bestWidth = 1 + progress * 0.18
          active = true
        }
      }
      cursor += stage.durationMs
    }
    return active ? (gain: bestGain, width: bestWidth) : nil
  }

  private func smoothStep(_ value: Double) -> Double {
    let bounded = clamp(value, 0, 1)
    return bounded * bounded * (3 - 2 * bounded)
  }

  private func startCue() {
    lock.lock()
    activeCueSamples = recognitionSignalSamples
    activeCueSampleRate = recognitionSignalSampleRate
    activeCueGain = recognitionSignalGain
    lock.unlock()
    cueActive = true
    cueElapsedFrames = 0
    cueTotalFrames = activeCueSamples.isEmpty
      ? sampleRate * Self.cueTotalSeconds
      : Double(activeCueSamples.count) / activeCueSampleRate * sampleRate
    cueLeftCombs = Self.cueLeftCombMs.map { ms in
      let delaySamples = max(1, Int(ms / 1_000 * sampleRate))
      return CombFilter(delaySamples: delaySamples, feedback: Self.combFeedback(forRt60: Self.cueReverbRt60, delaySamples: delaySamples, sampleRate: sampleRate))
    }
    cueRightCombs = Self.cueRightCombMs.map { ms in
      let delaySamples = max(1, Int(ms / 1_000 * sampleRate))
      return CombFilter(delaySamples: delaySamples, feedback: Self.combFeedback(forRt60: Self.cueReverbRt60, delaySamples: delaySamples, sampleRate: sampleRate))
    }
    cueLeftAllpasses = Self.cueLeftAllpassMs.map { ms in AllpassFilter(delaySamples: max(1, Int(ms / 1_000 * sampleRate))) }
    cueRightAllpasses = Self.cueRightAllpassMs.map { ms in AllpassFilter(delaySamples: max(1, Int(ms / 1_000 * sampleRate))) }
  }

  private func timelineSpatialEvent(_ timeline: AudioTimeline, elapsedMs rawElapsedMs: Double) -> (pan: Double, crossing: Double)? {
    guard timeline.totalDurationMs > 0 else { return nil }
    let elapsedMs = timeline.loop
      ? rawElapsedMs.truncatingRemainder(dividingBy: timeline.totalDurationMs)
      : min(rawElapsedMs, timeline.totalDurationMs)
    var cursor = 0.0
    for stage in timeline.stages {
      let localMs = elapsedMs - cursor
      if localMs >= 0 && localMs < stage.durationMs {
        for event in stage.spatialEvents where localMs >= event.atMs && localMs <= event.atMs + event.durationMs {
          let progress = clamp((localMs - event.atMs) / event.durationMs, 0, 1)
          let smooth = progress * progress * (3 - 2 * progress)
          let direction = event.direction == "left" ? -1.0 : 1.0
          return (pan: (-direction + 2 * direction * smooth) * event.depth, crossing: sin(Double.pi * progress))
        }
        return nil
      }
      cursor += stage.durationMs
    }
    return nil
  }

  private func nextRainNoise(_ target: Parameters) -> (left: Double, right: Double) {
    var left = 0.0
    var right = 0.0
    for index in rainPockets.indices {
      var pocket = rainPockets[index]
      if pocket.framesRemaining <= 0 {
        pocket.targetPan = clamp(nextPocketWhite(&pocket.random) * 0.8, -0.8, 0.8)
        pocket.targetLevel = 0.08 + abs(nextPocketWhite(&pocket.random)) * 0.34
        let speedScale = clamp(target.spatialRate / 1.2, 0.35, 2.5)
        pocket.framesRemaining = sampleRate * (0.45 + abs(nextPocketWhite(&pocket.random)) * 2.2) / speedScale
      }
      let step = min(1, 1 / max(1, pocket.framesRemaining))
      pocket.pan += (pocket.targetPan - pocket.pan) * step
      pocket.level += (pocket.targetLevel - pocket.level) * step
      pocket.framesRemaining -= 1
      let white = nextPocketWhite(&pocket.random)
      let value: Double
      switch target.noiseColor {
      case "brown":
        pocket.filter = (pocket.filter + 0.02 * white) / 1.02
        value = pocket.filter * 3.2
      case "grey":
        pocket.filter += 0.015 * (white - pocket.filter)
        value = (white - pocket.filter) * 0.65
      case "pink":
        pocket.filter += 0.075 * (white - pocket.filter)
        value = (pocket.filter * 0.8 + white * 0.2) * 1.6
      default:
        value = white
      }
      left += value * pocket.level * (1 - pocket.pan)
      right += value * pocket.level * (1 + pocket.pan)
      rainPockets[index] = pocket
    }
    return (left * 0.42, right * 0.42)
  }

  private func nextPocketWhite(_ state: inout UInt64) -> Double {
    state ^= state << 13; state ^= state >> 7; state ^= state << 17
    return Double(state & 0x00ff_ffff) / Double(0x007f_ffff) - 1
  }

  private func nextOcean(elapsedSeconds: Double, intensity: Double, presence: Double, density: Double, variety: Double) -> (left: Double, right: Double) {
    oceanModel.render(sampleRate: sampleRate, intensity: intensity, salience: worldSalience, identityPresence: presence, identityDensity: density, identityVariety: variety)
    return (oceanModel.left, oceanModel.right)
  }

  private func nextAbyssal(elapsedSeconds: Double, intensity: Double, presence: Double, density: Double, variety: Double) -> (left: Double, right: Double) {
    abyssalModel.render(sampleRate: sampleRate, intensity: intensity, elapsedSeconds: elapsedSeconds, salience: worldSalience, presence: presence, density: density, variety: variety)
    return (abyssalModel.left, abyssalModel.right)
  }

  private func nextWind(elapsedSeconds: Double, intensity: Double) -> (left: Double, right: Double) {
    let shared = nextWindWhite()
    windBody += 0.012 * (shared - windBody)
    let rawGust = clamp(
      0.52 + 0.3 * sin(elapsedSeconds * Double.pi * 2 / 6.3 + 0.6)
        + 0.2 * sin(elapsedSeconds * Double.pi * 2 / 17.8 + 2.4),
      0,
      1
    )
    let gust = rawGust * rawGust * (3 - 2 * rawGust)
    let leftWhite = nextWindWhite()
    let rightWhite = nextWindWhite()
    windAirLeft += 0.045 * (leftWhite - windAirLeft)
    windAirRight += 0.045 * (rightWhite - windAirRight)
    let pressure = windBody * (1.2 + intensity * 0.8 + gust * (1.3 + intensity * 2.2))
    let airLevel = 0.08 + intensity * 0.08 + gust * (0.3 + intensity * 0.44)
    let leftAir = (leftWhite - windAirLeft * 0.72) * airLevel
    let rightAir = (rightWhite - windAirRight * 0.72) * airLevel
    let pass = sin(elapsedSeconds * Double.pi * 2 / 11.5 + sin(elapsedSeconds / 19)) * 0.26
    return (pressure + leftAir * (1 - pass), pressure + rightAir * (1 + pass))
  }

  private func nextWindWhite() -> Double {
    windRandom ^= windRandom << 13; windRandom ^= windRandom >> 7; windRandom ^= windRandom << 17
    return Double(windRandom & 0x00ff_ffff) / Double(0x007f_ffff) - 1
  }

  private func nextFire(elapsedSeconds: Double, intensity: Double, presence: Double, density: Double, variety: Double) -> (left: Double, right: Double) {
    let shared = nextFireWhite()
    fireBody = (fireBody + 0.018 * shared) / 1.018
    fireHiss += 0.065 * (shared - fireHiss)
    let flicker = 0.72 + 0.18 * sin(elapsedSeconds * Double.pi * 2 / 1.7)
      + 0.1 * sin(elapsedSeconds * Double.pi * 2 / 0.43 + 1.2)
    let eventChance = (5 + intensity * 16) / sampleRate
    if (nextFireWhite() + 1) * 0.5 < eventChance {
      let strength = 0.14 + intensity * 0.18 + abs(nextFireWhite()) * (0.4 + intensity * 0.5)
      if nextFireWhite() < 0 { firePopLeft += strength } else { firePopRight += strength }
    }
    firePopLeft *= 0.99845
    firePopRight *= 0.99845
    let warmBody = fireBody * 4.2 * flicker
    let dryCrackle = (shared - fireHiss) * (0.08 + flicker * 0.08)
    fireEmberModel.render(sampleRate: sampleRate, salience: worldSalience, presence: presence, density: density, variety: variety)
    return (warmBody + dryCrackle + firePopLeft + fireEmberModel.left,
      warmBody + dryCrackle + firePopRight + fireEmberModel.right)
  }

  private func nextFireWhite() -> Double {
    fireRandom ^= fireRandom << 13; fireRandom ^= fireRandom >> 7; fireRandom ^= fireRandom << 17
    return Double(fireRandom & 0x00ff_ffff) / Double(0x007f_ffff) - 1
  }

  private static let forestNoiseMix = 0.3

  // The lucidity cue: a fixed, non-seeded ascending three-note motif (the
  // same 400/600/800 Hz contour used in published targeted-lucidity-
  // reactivation research) with a slow harmonic swell and a wide reverb
  // tail. Unlike every other generator in this file, nothing here may vary
  // between plays -- a listener trained on this exact sound needs to hear
  // the exact same sound again later, so it must render identically every
  // time.
  private static let cueNoteHz = [400.0, 600.0, 800.0]
  private static let cueNoteStarts = [0.0, 0.93, 1.86]
  private static let cueNoteSeconds = 0.75
  private static let cueAttackSeconds = 0.24
  private static let cueReleaseSeconds = 0.32
  private static let cueHarmonicRatios = [1.0, 2.0, 3.0, 4.0]
  private static let cueHarmonicWeights = [1.00, 0.35, 0.15, 0.06]
  private static let cueHarmonicWeightSum = cueHarmonicWeights.reduce(0, +)
  private static let cueTotalSeconds = 7.76
  private static let cueReverbRt60 = 3.6
  private static let cueDryGain = 0.48
  private static let cueWetGain = 1.15
  private static let cueStereoWidth = 1.7
  private static let cueOutputGain = 0.2925
  private static let cueLeftCombMs = [27.5, 33.9, 39.4, 46.1, 52.3]
  private static let cueRightCombMs = [30.9, 36.7, 43.8, 48.6, 55.9]
  private static let cueLeftAllpassMs = [5.0, 1.7]
  private static let cueRightAllpassMs = [5.6, 2.1]

  private static func combFeedback(forRt60 rt60: Double, delaySamples: Int, sampleRate: Double) -> Double {
    pow(10.0, -3.0 * Double(delaySamples) / (rt60 * sampleRate))
  }

  private func nextCosmic(elapsedSeconds: Double, intensity: Double, presence: Double, density: Double, variety: Double) -> (left: Double, right: Double) {
    cosmicModel.render(sampleRate: sampleRate, intensity: intensity, salience: worldSalience, identityPresence: presence, density: density, variety: variety)
    return (cosmicModel.left, cosmicModel.right)
  }

  // A canopy rustle bed (smoothed noise breathing on a light breeze cycle, plus a
  // crisper high-passed leaf shimmer) carries the space, while seeded bird calls —
  // frequency-sweeping tone bursts rather than noise transients, the way an actual
  // chirp reads as pitched motion instead of a click — punctuate it at random.
  private func nextForest(elapsedSeconds: Double, intensity: Double, presence: Double, density: Double, variety: Double) -> (left: Double, right: Double) {
    let shared = nextForestWhite()
    forestCanopy += 0.02 * (shared - forestCanopy)
    let sway = clamp(
      0.55 + 0.35 * sin(elapsedSeconds * Double.pi * 2 / 14.0)
        + 0.15 * sin(elapsedSeconds * Double.pi * 2 / 5.3 + 1.1),
      0,
      1
    )
    let canopyBody = forestCanopy * (1.4 + intensity * 1.6) * (0.5 + sway * 0.5)

    let leftWhite = nextForestWhite()
    let rightWhite = nextForestWhite()
    forestLeafLeft += 0.09 * (leftWhite - forestLeafLeft)
    forestLeafRight += 0.09 * (rightWhite - forestLeafRight)
    let leafLevel = 0.05 + intensity * 0.07 + sway * (0.08 + intensity * 0.14)
    let leftLeaf = (leftWhite - forestLeafLeft * 0.7) * leafLevel
    let rightLeaf = (rightWhite - forestLeafRight * 0.7) * leafLevel

    if !forestBirdActive {
      forestBirdFramesRemaining -= 1
      if forestBirdFramesRemaining <= 0 && worldSalience.reserve(salience: 0.38, durationSeconds: 0.3, recoverySeconds: 1.5) {
        forestBirdActive = true
        forestBirdDurationFrames = sampleRate * (0.12 + abs(nextForestWhite()) * 0.16)
        forestBirdFramesRemaining = forestBirdDurationFrames
        forestBirdFreqStart = 1_800 + abs(nextForestWhite()) * 1_600
        forestBirdFreqRange = (nextForestWhite() < 0 ? -1.0 : 1.0) * (400 + abs(nextForestWhite()) * 900)
        forestBirdAmp = 0.3 + abs(nextForestWhite()) * 0.34
        forestBirdPan = clamp(nextForestWhite() * 0.75, -0.75, 0.75)
        forestBirdPhase = 0
      }
    }
    var birdMono = 0.0
    if forestBirdActive {
      let progress = clamp(1 - forestBirdFramesRemaining / forestBirdDurationFrames, 0, 1)
      let envelope = sin(Double.pi * progress)
      let wobble = sin(progress * Double.pi * 5) * 90
      let freq = forestBirdFreqStart + forestBirdFreqRange * progress + wobble
      forestBirdPhase = fmod(forestBirdPhase + Double.pi * 2 * freq / sampleRate, Double.pi * 2)
      birdMono = sin(forestBirdPhase) * envelope * forestBirdAmp * (0.5 + intensity * 0.7) * max(0, min(1, presence))
      forestBirdFramesRemaining -= 1
      if forestBirdFramesRemaining <= 0 {
        forestBirdActive = false
        let gapSeconds = (7.0 - intensity * 4.5) * (0.4 + abs(nextForestWhite()) * 1.4)
        forestBirdFramesRemaining = sampleRate * max(0.6, gapSeconds) / max(0.2, min(1, density))
      }
    }
    let birdLeft = birdMono * (1 - forestBirdPan)
    let birdRight = birdMono * (1 + forestBirdPan)
    forestCallModel.render(sampleRate: sampleRate, salience: worldSalience, presence: presence, density: density, variety: variety)

    // The rustle bed is itself broadband noise, so it stacks directly with the
    // separate white/pink/brown/grey layer instead of sitting alongside it —
    // keep it as a quiet texture underneath the birds rather than a competing
    // noise floor.
    return (
      (canopyBody + leftLeaf) * Self.forestNoiseMix + birdLeft + forestCallModel.left,
      (canopyBody + rightLeaf) * Self.forestNoiseMix + birdRight + forestCallModel.right
    )
  }

  private func nextForestWhite() -> Double {
    forestRandom ^= forestRandom << 13; forestRandom ^= forestRandom >> 7; forestRandom ^= forestRandom << 17
    return Double(forestRandom & 0x00ff_ffff) / Double(0x007f_ffff) - 1
  }

  private func nextCue() -> (left: Double, right: Double) {
    guard cueActive else { return (0, 0) }
    if !activeCueSamples.isEmpty, activeCueSampleRate > 0 {
      let sourcePosition = cueElapsedFrames * activeCueSampleRate / sampleRate
      let lower = min(activeCueSamples.count - 1, Int(sourcePosition))
      let upper = min(activeCueSamples.count - 1, lower + 1)
      let fraction = sourcePosition - Double(lower)
      let sample = Double(activeCueSamples[lower]) * (1 - fraction) + Double(activeCueSamples[upper]) * fraction
      cueElapsedFrames += 1
      if cueElapsedFrames >= cueTotalFrames { cueActive = false }
      return (sample * 1.45 * activeCueGain, sample * 1.45 * activeCueGain)
    }
    let t = cueElapsedFrames / sampleRate
    var dry = 0.0
    for index in Self.cueNoteHz.indices {
      let localT = t - Self.cueNoteStarts[index]
      guard localT >= 0, localT <= Self.cueNoteSeconds else { continue }
      dry += cueNoteEnvelope(localT) * cueToneSample(localT, Self.cueNoteHz[index])
    }
    let leftWet = cueProcessReverb(dry, combs: cueLeftCombs, allpasses: cueLeftAllpasses)
    let rightWet = cueProcessReverb(dry, combs: cueRightCombs, allpasses: cueRightAllpasses)
    let mixedLeft = dry * Self.cueDryGain + leftWet * Self.cueWetGain
    let mixedRight = dry * Self.cueDryGain + rightWet * Self.cueWetGain
    let mid = (mixedLeft + mixedRight) / 2
    let side = (mixedLeft - mixedRight) / 2 * Self.cueStereoWidth
    cueElapsedFrames += 1
    if cueElapsedFrames >= cueTotalFrames { cueActive = false }
    return ((mid + side) * Self.cueOutputGain * activeCueGain, (mid - side) * Self.cueOutputGain * activeCueGain)
  }

  private func cueNoteEnvelope(_ t: Double) -> Double {
    guard t >= 0, t <= Self.cueNoteSeconds else { return 0 }
    if t < Self.cueAttackSeconds {
      return 0.5 - 0.5 * cos(Double.pi * t / Self.cueAttackSeconds)
    }
    if t > Self.cueNoteSeconds - Self.cueReleaseSeconds {
      let releaseT = t - (Self.cueNoteSeconds - Self.cueReleaseSeconds)
      return 0.5 + 0.5 * cos(Double.pi * releaseT / Self.cueReleaseSeconds)
    }
    return 1
  }

  private func cueToneSample(_ t: Double, _ freq: Double) -> Double {
    var value = 0.0
    for index in Self.cueHarmonicRatios.indices {
      value += Self.cueHarmonicWeights[index] * sin(Double.pi * 2 * freq * Self.cueHarmonicRatios[index] * t)
    }
    return value / Self.cueHarmonicWeightSum
  }

  private func cueProcessReverb(_ x: Double, combs: [CombFilter], allpasses: [AllpassFilter]) -> Double {
    guard !combs.isEmpty else { return 0 }
    var combSum = 0.0
    for comb in combs { combSum += comb.process(x) }
    combSum /= Double(combs.count)
    var y = combSum
    for allpass in allpasses { y = allpass.process(y) }
    return y
  }

  // Four inharmonic partials (a fundamental plus three off-integer overtones, the
  // way a real bowl's wall modes aren't clean octaves) sustain continuously rather
  // than being struck — each swells and recedes on its own slow, independent cycle
  // so the resonance breathes without ever fully repeating or falling silent. This
  // is a hum, not a bell: there's no attack transient, and no noise floor either —
  // it's a pure tonal layer that stays out of the way of an independent noise bed.
  private static let templeRatios = [1.0, 2.76, 3.76, 5.4]
  private static let templeWeights = [1.0, 0.42, 0.24, 0.12]
  private static let templeSwellPeriods = [23.0, 17.0, 29.0, 13.0]
  private static let templeSwellPhases = [0.0, 1.7, 3.1, 4.6]

  private func nextTemple(elapsedSeconds: Double, intensity: Double) -> (left: Double, right: Double) {
    var body = 0.0
    let tau = Double.pi * 2
    for index in 0..<4 {
      let swell = 0.55 + 0.45 * sin(elapsedSeconds * tau / Self.templeSwellPeriods[index] + Self.templeSwellPhases[index])
      let ampTarget = Self.templeWeights[index] * (0.35 + intensity * 0.65) * swell
      // A slow ~2.5s glide keeps amplitude changes inaudible as movement rather
      // than as a discrete event, matching the "hum" rather than "ding" feel.
      templeAmps[index] += (ampTarget - templeAmps[index]) / max(1, sampleRate * 2.5)
      body += sin(templePhases[index]) * templeAmps[index]
      templePhases[index] = fmod(templePhases[index] + tau * templeFreqs[index] / sampleRate, tau)
    }
    body *= 0.5
    return (body, body)
  }

  /// A quiet stone chamber: modal body, filtered air, and long asymmetric reflections.
  private func nextTempleSpace(elapsedSeconds: Double, intensity: Double, presence: Double, density: Double, variety: Double) -> (left: Double, right: Double) {
    let tau = Double.pi * 2
    var body = 0.0
    for index in 0..<3 {
      let breathe = 0.52 + 0.48 * sin(elapsedSeconds * tau / (31.0 + Double(index) * 13.0) + Double(index) * 1.9)
      body += sin(templeSpacePhases[index]) * Self.templeSpaceWeights[index] * breathe
      templeSpacePhases[index] = fmod(templeSpacePhases[index] + tau * Self.templeSpaceFreqs[index] / sampleRate, tau)
    }
    let leftWhite = nextTempleSpaceWhite()
    let rightWhite = nextTempleSpaceWhite()
    let airRate = 0.004 + intensity * 0.006
    templeSpaceAirLeft += (leftWhite - templeSpaceAirLeft) * airRate
    templeSpaceAirRight += (rightWhite - templeSpaceAirRight) * airRate

    // A slowly opening noise band suggests shared breath without becoming a
    // literal close-miked inhale. It lives mostly in the chamber reflections.
    templeSpaceBreathLowLeft += (leftWhite - templeSpaceBreathLowLeft) * 0.0035
    templeSpaceBreathLowRight += (rightWhite - templeSpaceBreathLowRight) * 0.0035
    templeSpaceBreathMidLeft += (leftWhite - templeSpaceBreathMidLeft) * 0.028
    templeSpaceBreathMidRight += (rightWhite - templeSpaceBreathMidRight) * 0.028
    let breathCycle = 0.5 - 0.5 * cos(elapsedSeconds * tau / 12.7)
    let breathEnvelope = breathCycle * breathCycle * (0.32 + intensity * 0.28)
    let breathLeft = (templeSpaceBreathMidLeft - templeSpaceBreathLowLeft) * breathEnvelope
    let breathRight = (templeSpaceBreathMidRight - templeSpaceBreathLowRight) * breathEnvelope

    // The chant (three imperfect virtual voices, once every 31 s, each appearance its own gesture) lives in
    // AumChant. The room places its dry voice and echo, and sends a far-off chant to the reverb alone.
    aumChant.render(sampleRate: sampleRate, elapsedSeconds: elapsedSeconds, intensity: intensity, presence: presence, density: density, variety: variety)
    let drop = nextTempleSpaceDrop(intensity: intensity, salience: worldSalience)
    let dropEchoSize = templeSpaceDropEcho.count
    let dropEchoLeftA = templeSpaceDropEcho[(templeSpaceDropEchoIndex - min(dropEchoSize - 1, max(1, Int(sampleRate * 0.27))) + dropEchoSize) % dropEchoSize]
    let dropEchoRightA = templeSpaceDropEcho[(templeSpaceDropEchoIndex - min(dropEchoSize - 1, max(1, Int(sampleRate * 0.41))) + dropEchoSize) % dropEchoSize]
    let dropEchoTail = templeSpaceDropEcho[(templeSpaceDropEchoIndex - min(dropEchoSize - 1, max(1, Int(sampleRate * 0.63))) + dropEchoSize) % dropEchoSize]
    templeSpaceDropEcho[templeSpaceDropEchoIndex] = (drop.left + drop.right) * 0.42 + (dropEchoLeftA + dropEchoRightA) * 0.14
    templeSpaceDropEchoIndex = (templeSpaceDropEchoIndex + 1) % dropEchoSize
    let dropEchoLeft = dropEchoLeftA * 0.48 + dropEchoTail * 0.18
    let dropEchoRight = dropEchoRightA * 0.44 + dropEchoTail * 0.20
    templeAccents.render(sampleRate: sampleRate, intensity: intensity, elapsedSeconds: elapsedSeconds, salience: worldSalience)
    let dryLeft = body + templeSpaceAirLeft * (0.22 + intensity * 0.12) + breathLeft * 0.7 + aumChant.voiceLeft + aumChant.echoLeft + drop.left + dropEchoLeft + templeAccents.left
    let dryRight = body + templeSpaceAirRight * (0.22 + intensity * 0.12) + breathRight * 0.7 + aumChant.voiceRight + aumChant.echoRight + drop.right + dropEchoRight + templeAccents.right
    let size = templeSpaceDelay.count
    let tap71 = templeSpaceDelay[(templeSpaceDelayIndex - min(size - 1, max(1, Int(sampleRate * 0.071))) + size) % size]
    let tap89 = templeSpaceDelay[(templeSpaceDelayIndex - min(size - 1, max(1, Int(sampleRate * 0.089))) + size) % size]
    let tap113 = templeSpaceDelay[(templeSpaceDelayIndex - min(size - 1, max(1, Int(sampleRate * 0.113))) + size) % size]
    let tap137 = templeSpaceDelay[(templeSpaceDelayIndex - min(size - 1, max(1, Int(sampleRate * 0.137))) + size) % size]
    let wetLeft = tap71 * 0.58 + tap137 * 0.34
    let wetRight = tap89 * 0.56 + tap113 * 0.36
    templeSpaceDelay[templeSpaceDelayIndex] = (dryLeft + dryRight) * 0.5 + (wetLeft + wetRight) * 0.45 + aumChant.farWet
    templeSpaceDelayIndex = (templeSpaceDelayIndex + 1) % size
    return (dryLeft * 0.42 + wetLeft * 0.62, dryRight * 0.42 + wetRight * 0.62)
  }

  private func nextTempleSpaceWhite() -> Double {
    templeSpaceRandom ^= templeSpaceRandom << 13; templeSpaceRandom ^= templeSpaceRandom >> 7; templeSpaceRandom ^= templeSpaceRandom << 17
    return Double(templeSpaceRandom & 0x00ff_ffff) / Double(0x007f_ffff) - 1
  }

  private func nextTempleSpaceDrop(intensity: Double, salience: WorldSalienceScheduler) -> (left: Double, right: Double) {
    if templeSpaceDropFramesRemaining <= 0 {
      templeSpaceNextDropFrames -= 1
      if templeSpaceNextDropFrames <= 0 && salience.reserve(salience: 0.2, durationSeconds: 0.25, recoverySeconds: 1.2) {
        templeSpaceDropDurationFrames = sampleRate * (0.13 + abs(nextTempleSpaceWhite()) * 0.11)
        templeSpaceDropFramesRemaining = templeSpaceDropDurationFrames
        templeSpaceDropAgeFrames = 0
        templeSpaceDropPhase = 0
        templeSpaceDropFrequency = 820 + abs(nextTempleSpaceWhite()) * 1_050
        templeSpaceDropAmplitude = 0.02 + abs(nextTempleSpaceWhite()) * 0.02
        templeSpaceDropPan = clamp(nextTempleSpaceWhite() * 0.72, -0.72, 0.72)
        let pair = nextTempleSpaceWhite() > 0.78
        let gapSeconds = pair
          ? 0.32 + abs(nextTempleSpaceWhite()) * 0.28
          : (6.5 - intensity * 2.2) + abs(nextTempleSpaceWhite()) * 8.0
        templeSpaceNextDropFrames = sampleRate * gapSeconds
      }
    }
    guard templeSpaceDropFramesRemaining > 0, templeSpaceDropDurationFrames > 0 else { return (0, 0) }
    let progress = templeSpaceDropAgeFrames / templeSpaceDropDurationFrames
    let attackProgress = clamp(templeSpaceDropAgeFrames / max(1, sampleRate * 0.008), 0, 1)
    let attack = 0.5 - 0.5 * cos(Double.pi * attackProgress)
    let decay = (1 - progress) * (1 - progress) * (1 - progress)
    let frequency = templeSpaceDropFrequency * (1 - progress * 0.48)
    let tone = (sin(templeSpaceDropPhase) + sin(templeSpaceDropPhase * 2.0) * 0.24) * attack * decay * templeSpaceDropAmplitude
    templeSpaceDropPhase = fmod(templeSpaceDropPhase + Double.pi * 2 * frequency / sampleRate, Double.pi * 2)
    templeSpaceDropAgeFrames += 1
    templeSpaceDropFramesRemaining -= 1
    return (tone * (1 - templeSpaceDropPan) * 0.56, tone * (1 + templeSpaceDropPan) * 0.56)
  }

  private func nextTempleWhite() -> Double {
    templeRandom ^= templeRandom << 13; templeRandom ^= templeRandom >> 7; templeRandom ^= templeRandom << 17
    return Double(templeRandom & 0x00ff_ffff) / Double(0x007f_ffff) - 1
  }

  private func nextWhite() -> Double {
    random ^= random << 13; random ^= random >> 7; random ^= random << 17
    return Double(random & 0x00ff_ffff) / Double(0x007f_ffff) - 1
  }

  private func clamp(_ value: Double, _ low: Double, _ high: Double) -> Double {
    Swift.min(high, Swift.max(low, value))
  }

  private func normalizedParameters(_ raw: AudioConfigRecord, sleepEndMs: Double?) -> Parameters {
    Parameters(
      carrierHz: clamp(raw.carrierHz, 20, 2_000),
      binauralCarrierHz: clamp(raw.binauralCarrierHz, 100, 500),
      deltaHz: clamp(raw.binauralDeltaHz, 0.5, 40),
      toneGain: clamp(raw.toneGain, 0, 1),
      harmonicWarmth: clamp(raw.harmonicWarmth, 0, 1),
      binauralGain: clamp(raw.binauralGain, 0, 1),
      noiseColor: raw.noiseColor.flatMap { ["white", "pink", "brown", "grey"].contains($0) ? $0 : nil },
      noiseGain: clamp(raw.noiseGain, 0, 1),
      environment: raw.environment == "cave" ? "cosmic" : (["ocean", "wind", "fire", "cosmic", "forest", "temple", "abyssal"].contains(raw.environment) ? raw.environment : "none"),
      environmentGain: clamp(raw.environmentGain, 0, 1),
      environmentIntensity: clamp(raw.environmentIntensity, 0, 1),
      thresholdShift: clamp(raw.thresholdShift, 0, 1),
      identityPresence: clamp(raw.identityPresence, 0, 12),
      identityDensity: clamp(raw.identityDensity, 0.2, 1),
      identityVariety: clamp(raw.identityVariety, 0, 1),
      harmonicTranslation: clamp(raw.harmonicTranslation, 0, 1),
      templeGain: clamp(raw.templeGain, 0, 1),
      templeIntensity: clamp(raw.templeIntensity, 0, 1),
      masterGain: clamp(raw.masterGain, 0, 1),
      rampSeconds: clamp(raw.rampMs, 20, 5_000) / 1_000,
      spatialMode: ["still", "drift", "pendulum", "swoosh", "rain", "orbit", "vortex", "channelTest"].contains(raw.spatialMode) ? raw.spatialMode : "still",
      spatialTarget: ["noise", "tone", "both"].contains(raw.spatialTarget) ? raw.spatialTarget : "noise",
      spatialDepth: clamp(raw.spatialDepth, 0, 0.8),
      spatialRate: clamp(raw.spatialRate, 0.1, 3),
      sleepEndMs: sleepEndMs
    )
  }

  private func timelineParameters(_ timeline: AudioTimeline, elapsedMs rawElapsedMs: Double, base: Parameters) -> Parameters {
    guard let last = timeline.stages.last, timeline.totalDurationMs > 0 else { return base }
    let elapsedMs = timeline.loop
      ? rawElapsedMs.truncatingRemainder(dividingBy: timeline.totalDurationMs)
      : min(rawElapsedMs, timeline.totalDurationMs)
    var cursor = 0.0
    for (index, stage) in timeline.stages.enumerated() {
      let end = cursor + stage.durationMs
      if elapsedMs < end {
        let previous = index > 0
          ? timeline.stages[index - 1].parameters
          : (timeline.loop ? last.parameters : base)
        let localMs = max(0, elapsedMs - cursor)
        renderedTimelineStageIndex = index
        renderedTimelineStageLocalMs = localMs
        let progress = stage.transitionMs > 0 ? min(1, localMs / stage.transitionMs) : 1
        var result = interpolate(previous, stage.parameters, progress)
        result.sleepEndMs = base.sleepEndMs
        return result
      }
      cursor = end
    }
    var result = last.parameters
    renderedTimelineStageIndex = max(0, timeline.stages.count - 1)
    renderedTimelineStageLocalMs = last.durationMs
    result.sleepEndMs = base.sleepEndMs
    return result
  }

  private func timelineThresholdState(_ timeline: AudioTimeline, target: Parameters) -> (depth: Double, motion: Double) {
    let index = min(max(0, renderedTimelineStageIndex), timeline.stages.count - 1)
    let stage = timeline.stages[index]
    let previousShift = index > 0 ? timeline.stages[index - 1].parameters.thresholdShift : 0
    let beginsShift = stage.parameters.thresholdShift > 0.0001 && previousShift <= 0.0001
    guard beginsShift else { return (target.thresholdShift, 0) }
    let progress = smoothStep(renderedTimelineStageLocalMs / max(1, stage.durationMs))
    let edgeIn = smoothStep(progress / 0.08)
    let edgeOut = smoothStep((1 - progress) / 0.08)
    return (progress * stage.parameters.thresholdShift, min(edgeIn, edgeOut))
  }

  private func nextThresholdShepard(progress: Double, motion: Double) -> Double {
    guard motion > 0.0001 else { return 0 }
    var sum = 0.0
    let octaveSpan = Double(thresholdShepardPhases.count)
    let descendingScale = 1 / (1 + progress)
    for index in thresholdShepardPhases.indices {
      var position = Double(index) - progress
      while position < 0 { position += octaveSpan }
      while position >= octaveSpan { position -= octaveSpan }
      let octaveMultiplier = index == 0 && progress > 0 ? 16.0 : Double(1 << index)
      let frequency = 45 * octaveMultiplier * descendingScale
      let edgeValue = sin(Double.pi * position / octaveSpan)
      let edge = edgeValue * edgeValue
      sum += sin(thresholdShepardPhases[index]) * edge
      thresholdShepardPhases[index] = fmod(thresholdShepardPhases[index] + Double.pi * 2 * frequency / sampleRate, Double.pi * 2)
    }
    return sum * motion / 2.2
  }

  private func nextHarmonicTranslation(_ target: Parameters) -> Double {
    let impliedFundamental: Double
    switch target.environment {
    case "cosmic": impliedFundamental = 50
    case "ocean": impliedFundamental = 60
    case "abyssal": impliedFundamental = 42
    default: return 0
    }
    guard target.harmonicTranslation > 0.0001, target.environmentGain > 0.0001 else { return 0 }
    let first = sin(harmonicTranslationPhases[0]) * 0.58
    let second = sin(harmonicTranslationPhases[1]) * 0.34
    harmonicTranslationPhases[0] = fmod(harmonicTranslationPhases[0] + Double.pi * 2 * impliedFundamental * 2 / sampleRate, Double.pi * 2)
    harmonicTranslationPhases[1] = fmod(harmonicTranslationPhases[1] + Double.pi * 2 * impliedFundamental * 3 / sampleRate, Double.pi * 2)
    return (first + second) * target.harmonicTranslation * target.environmentGain * 0.1
  }

  private func resetThresholdShift() {
    thresholdShepardPhases = [Double](repeating: 0, count: 4)
    harmonicTranslationPhases = [Double](repeating: 0, count: 2)
    thresholdEnvironmentLowLeft = 0
    thresholdEnvironmentLowRight = 0
    thresholdNoiseLowLeft = 0
    thresholdNoiseLowRight = 0
    thresholdDelayLeft = [Double](repeating: 0, count: 4_096)
    thresholdDelayRight = [Double](repeating: 0, count: 4_096)
    thresholdDelayIndex = 0
    renderedTimelineStageIndex = 0
    renderedTimelineStageLocalMs = 0
  }

  private func interpolate(_ from: Parameters, _ to: Parameters, _ progress: Double) -> Parameters {
    let t = min(1, max(0, progress))
    let lerp: (Double, Double) -> Double = { start, end in start + (end - start) * t }
    return Parameters(
      carrierHz: lerp(from.carrierHz, to.carrierHz),
      binauralCarrierHz: lerp(from.binauralCarrierHz, to.binauralCarrierHz),
      deltaHz: lerp(from.deltaHz, to.deltaHz),
      toneGain: lerp(from.toneGain, to.toneGain),
      harmonicWarmth: lerp(from.harmonicWarmth, to.harmonicWarmth),
      binauralGain: lerp(from.binauralGain, to.binauralGain),
      noiseColor: t < 0.5 ? from.noiseColor : to.noiseColor,
      noiseGain: lerp(from.noiseGain, to.noiseGain),
      environment: t < 0.5 ? from.environment : to.environment,
      environmentGain: lerp(from.environmentGain, to.environmentGain),
      environmentIntensity: lerp(from.environmentIntensity, to.environmentIntensity),
      thresholdShift: lerp(from.thresholdShift, to.thresholdShift),
      identityPresence: lerp(from.identityPresence, to.identityPresence),
      identityDensity: lerp(from.identityDensity, to.identityDensity),
      identityVariety: lerp(from.identityVariety, to.identityVariety),
      harmonicTranslation: lerp(from.harmonicTranslation, to.harmonicTranslation),
      templeGain: lerp(from.templeGain, to.templeGain),
      templeIntensity: lerp(from.templeIntensity, to.templeIntensity),
      masterGain: lerp(from.masterGain, to.masterGain),
      rampSeconds: lerp(from.rampSeconds, to.rampSeconds),
      spatialMode: t < 0.5 ? from.spatialMode : to.spatialMode,
      spatialTarget: t < 0.5 ? from.spatialTarget : to.spatialTarget,
      spatialDepth: lerp(from.spatialDepth, to.spatialDepth),
      spatialRate: lerp(from.spatialRate, to.spatialRate),
      sleepEndMs: nil
    )
  }

  private func softLimit(_ sample: Double) -> Double {
    tanh(sample * 1.1) / 1.1
  }

  private func installRemoteCommandsIfNeeded() {
    let install = { [weak self] in
      guard let self, self.remoteTargets.isEmpty else { return }
      UIApplication.shared.beginReceivingRemoteControlEvents()
      let center = MPRemoteCommandCenter.shared()
      let playTarget = center.playCommand.addTarget { [weak self] _ in
        guard let self else { return .commandFailed }
        do { try self.play(); return .success } catch { return .commandFailed }
      }
      let pauseTarget = center.pauseCommand.addTarget { [weak self] _ in
        self?.pause()
        return self == nil ? .commandFailed : .success
      }
      let toggleTarget = center.togglePlayPauseCommand.addTarget { [weak self] _ in
        guard let self else { return .commandFailed }
        if self.engine.isRunning {
          self.pause()
          return .success
        }
        do { try self.play(); return .success } catch { return .commandFailed }
      }
      self.remoteTargets = [
        (center.playCommand, playTarget),
        (center.pauseCommand, pauseTarget),
        (center.togglePlayPauseCommand, toggleTarget),
      ]
      center.playCommand.isEnabled = true
      center.pauseCommand.isEnabled = true
      center.togglePlayPauseCommand.isEnabled = true
      center.changePlaybackPositionCommand.isEnabled = false
      center.nextTrackCommand.isEnabled = false
      center.previousTrackCommand.isEnabled = false
    }
    if Thread.isMainThread { install() } else { DispatchQueue.main.sync(execute: install) }
  }

  private func removeRemoteCommands() {
    let remove = { [weak self] in
      guard let self else { return }
      self.remoteTargets.forEach { command, target in command.removeTarget(target) }
      self.remoteTargets.removeAll()
      UIApplication.shared.endReceivingRemoteControlEvents()
    }
    if Thread.isMainThread { remove() } else { DispatchQueue.main.sync(execute: remove) }
  }

  private func updateNowPlaying(rate: Float) {
    let title = nowPlayingTitle
    lock.lock()
    let activeTimeline = timeline
    let elapsedSeconds = timelineElapsedFrames / max(1, sampleRate)
    lock.unlock()
    let publish = { [weak self] in
      guard let self else { return }
      let center = MPNowPlayingInfoCenter.default()
      var info: [String: Any] = [
        MPMediaItemPropertyTitle: title,
        MPMediaItemPropertyArtist: "Inner",
        MPMediaItemPropertyAlbumTitle: "Inner Soundscapes",
        MPNowPlayingInfoPropertyMediaType: MPNowPlayingInfoMediaType.audio.rawValue,
        MPNowPlayingInfoPropertyPlaybackRate: rate,
        MPNowPlayingInfoPropertyDefaultPlaybackRate: 1.0,
        MPNowPlayingInfoPropertyElapsedPlaybackTime: elapsedSeconds,
        MPNowPlayingInfoPropertyExternalContentIdentifier: "inner.procedural.\(title)",
        MPNowPlayingInfoPropertyServiceIdentifier: "Inner",
        MPNowPlayingInfoPropertyPlaybackQueueCount: 1,
        MPNowPlayingInfoPropertyPlaybackQueueIndex: 0,
      ]
      if let activeTimeline {
        info[MPMediaItemPropertyPlaybackDuration] = activeTimeline.totalDurationMs / 1_000
        info[MPNowPlayingInfoPropertyIsLiveStream] = false
      } else {
        info[MPNowPlayingInfoPropertyIsLiveStream] = true
      }
      center.nowPlayingInfo = info
    }
    if Thread.isMainThread { publish() } else { DispatchQueue.main.async(execute: publish) }
  }

  @objc private func handleInterruption(_ notification: Notification) {
    guard let raw = notification.userInfo?[AVAudioSessionInterruptionTypeKey] as? UInt,
          let type = AVAudioSession.InterruptionType(rawValue: raw) else { return }
    if type == .began {
      isSystemInterrupted = true
      recordDiagnostic("interruption_began", reason: "system")
      pause(reason: .interruption)
      return
    }
    isSystemInterrupted = false
    let optionsRaw = notification.userInfo?[AVAudioSessionInterruptionOptionKey] as? UInt ?? 0
    let options = AVAudioSession.InterruptionOptions(rawValue: optionsRaw)
    recordDiagnostic("interruption_ended", reason: options.contains(.shouldResume) ? "should_resume" : "no_resume")
    if desiredPlaying && options.contains(.shouldResume) {
      do {
        try play(reason: "interruption_recovered", gentleFadeIn: true)
      } catch {
        recordPlaybackError("interruption_recovery_failed", error)
      }
    }
  }

  @objc private func handleMediaServicesLost(_ notification: Notification) {
    let wasPlaying = desiredPlaying || engine.isRunning
    desiredPlaying = false
    isSystemInterrupted = true
    pauseReason = .interruption
    if wasPlaying { pauseSleepTimer() }
    stopNowPlayingRefresh()
    updateNowPlaying(rate: 0)
    recordDiagnostic("interruption_began", reason: "media_services_lost")
  }

  @objc private func handleMediaServicesReset(_ notification: Notification) {
    // Apple requires apps to discard every object connected to the old media
    // server. Keep the procedural/timeline state, but wait for an explicit Play
    // command before attaching it to this fresh engine.
    engine = AVAudioEngine()
    source = nil
    activeCueSamples = []
    cueActive = false
    isSystemInterrupted = false
    desiredPlaying = false
    pauseReason = .interruption
    do {
      try AVAudioSession.sharedInstance().setCategory(.playback, mode: .default, options: [])
      recordDiagnostic("interruption_ended", reason: "media_services_reset_manual_resume_required")
    } catch {
      recordPlaybackError("media_services_reset_failed", error)
    }
  }

  private func recordPlaybackError(_ context: String, _ error: Error) {
    let nsError = error as NSError
    recordDiagnostic("error", reason: "\(context):\(nsError.domain):\(nsError.code)")
  }

  private func isPrivateOutput(_ route: AVAudioSessionRouteDescription) -> Bool {
    route.outputs.contains { output in
      switch output.portType {
      case .headphones, .bluetoothA2DP, .bluetoothHFP, .bluetoothLE, .usbAudio:
        return true
      default:
        return false
      }
    }
  }

  private func updatePrivateOutput(for route: AVAudioSessionRouteDescription) {
    lock.lock()
    privateOutputTarget = isPrivateOutput(route) ? 1 : 0
    lock.unlock()
  }

  private func resumeAfterRouteLossIfPrivate() {
    guard pauseReason == .routeLoss else { return }
    let session = AVAudioSession.sharedInstance()
    guard isPrivateOutput(session.currentRoute) else { return }
    updatePrivateOutput(for: session.currentRoute)
    desiredPlaying = true
    do {
      try play(reason: "route_recovered", gentleFadeIn: true)
    } catch {
      recordPlaybackError("route_recovery_failed", error)
    }
  }

  @objc private func handleRouteChange(_ notification: Notification) {
    let session = AVAudioSession.sharedInstance()
    let previousRoute = notification.userInfo?[AVAudioSessionRouteChangePreviousRouteKey] as? AVAudioSessionRouteDescription
    let reasonRaw = notification.userInfo?[AVAudioSessionRouteChangeReasonKey] as? UInt ?? 0
    let reason = AVAudioSession.RouteChangeReason(rawValue: reasonRaw)
    let route = session.currentRoute.outputs.map { $0.portType.rawValue }.joined(separator: ",")
    recordDiagnostic("audio_route_changed", reason: String(reasonRaw), route: route.isEmpty ? "none" : route)
    let lostPrivateOutput = reason == .oldDeviceUnavailable
      && previousRoute.map(isPrivateOutput) == true
      && !isPrivateOutput(session.currentRoute)
    updatePrivateOutput(for: session.currentRoute)
    if lostPrivateOutput && desiredPlaying {
      desiredPlaying = false
      pause(reason: .routeLoss)
      return
    }

    if reason == .newDeviceAvailable, pauseReason == .routeLoss {
      DispatchQueue.main.asyncAfter(deadline: .now() + 0.35) { [weak self] in self?.resumeAfterRouteLossIfPrivate() }
      DispatchQueue.main.asyncAfter(deadline: .now() + 1.0) { [weak self] in self?.resumeAfterRouteLossIfPrivate() }
      DispatchQueue.main.asyncAfter(deadline: .now() + 3.0) { [weak self] in self?.resumeAfterRouteLossIfPrivate() }
      return
    }

    // A newly connected output can leave AVAudioEngine logically running while
    // its render path is still attached to the previous device. A manual
    // pause/play repairs that state; do the same automatically after iOS has had
    // a moment to finish selecting and configuring the new route.
    if reason == .newDeviceAvailable && desiredPlaying {
      DispatchQueue.main.asyncAfter(deadline: .now() + 0.35) { [weak self] in
        guard let self, self.desiredPlaying else { return }
        self.updatePrivateOutput(for: AVAudioSession.sharedInstance().currentRoute)
        self.engine.pause()
        do {
          try self.play(reason: "route_refreshed", gentleFadeIn: true)
        } catch {
          self.recordPlaybackError("route_refresh_failed", error)
        }
      }
    }
  }
}
import Foundation

/// Fixed voice pool: one bowl and three chimes, with no render-time allocation.
final class TempleAccents {
  private(set) var left = 0.0
  private(set) var right = 0.0
  private var random: UInt64 = 1
  private var rate = 48_000.0
  private var phases = [Double](repeating: 0, count: 24)
  private var frequencies = [Double](repeating: 0, count: 24)
  private var amplitudes = [Double](repeating: 0, count: 24)
  private var decays = [Double](repeating: 0, count: 24)
  private var ages = [Double](repeating: 0, count: 4)
  private var durations = [Double](repeating: 0, count: 4)
  private var attacks = [Double](repeating: 0, count: 4)
  private var pans = [Double](repeating: 0, count: 4)
  private var counts = [Int](repeating: 0, count: 4)
  private static let bowlRatios = [1.0, 1.006, 2.76, 2.772, 3.76, 5.4]
  private static let bowlWeights = [0.5, 0.25, 0.16, 0.08, 0.08, 0.04]
  private static let bowlTails = [7.0, 6.7, 4.3, 4.0, 3.0, 2.1]
  private static let chimeRatios = [1.0, 2.76, 3.76]
  private static let chimeWeights = [0.65, 0.22, 0.08]
  private static let chimeTails = [1.8, 1.2, 0.8]
  private var nextBowl = 48_000.0 * 18
  private var nextCluster = 48_000.0 * 10
  private var nextChime = 0.0
  private var pendingChimes = 0
  private var chimeCursor = 0

  func reset(seed: UInt64, sampleRate: Double) {
    random = seed ^ 0x3c6ef372
    if random == 0 { random = 1 }
    rate = sampleRate
    for i in phases.indices { phases[i] = 0; frequencies[i] = 0; amplitudes[i] = 0; decays[i] = 0 }
    for i in ages.indices { ages[i] = 0; durations[i] = 0; counts[i] = 0 }
    nextBowl = rate * 18; nextCluster = rate * 10; nextChime = 0
    pendingChimes = 0; chimeCursor = 0; left = 0; right = 0
  }

  private func unit() -> Double {
    random ^= random << 13; random ^= random >> 7; random ^= random << 17
    return Double(random & 0x00ff_ffff) / Double(0x00ff_ffff)
  }

  private func excite(slot: Int, bowl: Bool) {
    let base = bowl ? 174 + unit() * 14 : 980 + unit() * 850
    let level = bowl ? 0.12 : 0.055 + unit() * 0.025
    ages[slot] = 0
    durations[slot] = rate * (bowl ? 14.0 : 5.0)
    attacks[slot] = rate * (bowl ? 0.045 : 0.009)
    pans[slot] = (unit() * 2 - 1) * 0.65
    counts[slot] = bowl ? 6 : 3
    for mode in 0..<counts[slot] {
      let index = slot * 6 + mode
      phases[index] = 0
      frequencies[index] = base * (bowl ? Self.bowlRatios[mode] : Self.chimeRatios[mode])
      amplitudes[index] = level * (bowl ? Self.bowlWeights[mode] : Self.chimeWeights[mode])
      decays[index] = exp(-1 / (rate * (bowl ? Self.bowlTails[mode] : Self.chimeTails[mode])))
    }
  }

  func render(sampleRate: Double, intensity: Double, elapsedSeconds: Double, salience: WorldSalienceScheduler) {
    if rate != sampleRate { reset(seed: random, sampleRate: sampleRate) }
    nextBowl -= 1
    if nextBowl <= 0 {
      if salience.reserve(salience: 0.72, durationSeconds: 14, recoverySeconds: 4) {
        excite(slot: 0, bowl: true)
      }
      nextBowl = rate * (28 + unit() * 24)
    }
    nextCluster -= 1
    let gust = sin(elapsedSeconds * Double.pi * 2 / 19.3)
    if pendingChimes == 0 && nextCluster <= 0 && gust > -0.25 {
      if salience.reserve(salience: 0.42, durationSeconds: 6, recoverySeconds: 2) {
        pendingChimes = unit() > 0.45 ? 3 : 2
        nextChime = 0
      }
      nextCluster = rate * (23 - intensity * 5 + unit() * 22)
    }
    if pendingChimes > 0 {
      nextChime -= 1
      if nextChime <= 0 {
        excite(slot: 1 + chimeCursor % 3, bowl: false)
        chimeCursor = (chimeCursor + 1) % 3
        pendingChimes -= 1
        nextChime = rate * (0.35 + unit() * 0.8)
      }
    }
    left = 0; right = 0
    for slot in 0..<4 {
      if ages[slot] >= durations[slot] { continue }
      let attack = 0.5 - 0.5 * cos(Double.pi * min(1, ages[slot] / attacks[slot]))
      let release = min(1, (durations[slot] - ages[slot]) / (rate * 0.8))
      var value = 0.0
      for mode in 0..<counts[slot] {
        let index = slot * 6 + mode
        value += sin(phases[index]) * amplitudes[index]
        phases[index] = fmod(phases[index] + Double.pi * 2 * frequencies[index] / rate, Double.pi * 2)
        amplitudes[index] *= decays[index]
      }
      value *= attack * release
      left += value * (1 - pans[slot]) * 0.7
      right += value * (1 + pans[slot]) * 0.7
      ages[slot] += 1
    }
  }
}

/// A low ember glow and occasional short, dark resonance from settling wood.
final class FireEmberModel {
  private(set) var left = 0.0
  private(set) var right = 0.0
  private var rate = 48_000.0
  private var random: UInt64 = 1
  private var countdown = 0.0
  private var age = -1.0
  private var elapsed = 0.0
  private var emberPhase = 0.0
  private var woodPhase = 0.0
  private var woodHz = 110.0
  private var woodPan = 0.0
  private var woodAir = 0.0

  func reset(seed: UInt64, sampleRate: Double) {
    rate = sampleRate
    random = seed ^ 0x46697265456d6265
    if random == 0 { random = 1 }
    countdown = rate * 12; age = -1; elapsed = 0
    emberPhase = 0; woodPhase = 0; woodHz = 110; woodPan = 0; woodAir = 0
    left = 0; right = 0
  }

  private func unit() -> Double {
    random ^= random << 13; random ^= random >> 7; random ^= random << 17
    return Double(random & 0x00ff_ffff) / Double(0x00ff_ffff)
  }

  func render(sampleRate: Double, salience: WorldSalienceScheduler, presence: Double, density: Double, variety: Double) {
    if rate != sampleRate { reset(seed: random, sampleRate: sampleRate) }
    let safePresence = max(0, min(1.5, presence))
    let glow = 0.5 + 0.5 * sin(2 * Double.pi * elapsed / 13.1)
    let emberHz = 73 + 1.8 * sin(2 * Double.pi * elapsed / 29)
    elapsed += 1 / rate
    emberPhase = fmod(emberPhase + 2 * Double.pi * emberHz / rate, 2 * Double.pi)
    let ember = (sin(emberPhase) * 0.78 + sin(emberPhase * 2) * 0.22) *
      (0.35 + 0.65 * glow) * 0.065 * safePresence

    if age < 0 {
      countdown -= 1
      if countdown <= 0 {
        if safePresence > 0.0001 && salience.reserve(salience: 0.46, durationSeconds: 3.4, recoverySeconds: 3) {
          age = 0
          woodHz = 104 + unit() * 16
          woodPan = (unit() * 2 - 1) * 0.3
          let immersive = max(0, min(1, (variety - 0.6) / 0.4))
          countdown = rate * (70 - 25 * immersive + unit() * (40 - 15 * immersive)) /
            max(0.2, min(1, density))
        } else {
          countdown = rate * 3
        }
      }
    }

    var wood = 0.0
    if age >= 0 {
      let seconds = age / rate
      let attack = max(0, min(1, seconds / 0.045))
      let release = pow(max(0, min(1, 1 - seconds / 3.4)), 2)
      let bend = 1 + 0.14 * exp(-seconds * 3.2)
      woodPhase = fmod(woodPhase + 2 * Double.pi * woodHz * bend / rate, 2 * Double.pi)
      let air = unit() * 2 - 1
      woodAir += 0.045 * (air - woodAir)
      wood = (sin(woodPhase) * 0.72 + sin(woodPhase * 2) * 0.23 + woodAir * 0.28) *
        attack * release * 0.29 * safePresence
      age += 1
      if seconds >= 3.4 { age = -1 }
    }

    left = ember + wood * (1 - woodPan)
    right = ember + wood * (1 + woodPan)
  }
}

/// A slow wind-excited hollow trunk and a quieter answer deeper in the canopy.
final class ForestCallModel {
  private(set) var left = 0.0
  private(set) var right = 0.0
  private var rate = 48_000.0
  private var random: UInt64 = 1
  private var countdown = 0.0
  private var age = -1.0
  private var baseHz = 85.0
  private var pan = 0.0
  private var answerPan = 0.0
  private var phase = 0.0
  private var whistlePhase = 0.0
  private var answerPhase = 0.0
  private var airFast = 0.0
  private var airSlow = 0.0
  private var echoLeft = [Double](repeating: 0, count: 57_600)
  private var echoRight = [Double](repeating: 0, count: 57_600)
  private var echoIndex = 0
  private var echoWetLeft = 0.0
  private var echoWetRight = 0.0

  func reset(seed: UInt64, sampleRate: Double) {
    rate = sampleRate
    random = seed ^ 0x466f72657374
    if random == 0 { random = 1 }
    countdown = rate * 14; age = -1; baseHz = 85; pan = 0; answerPan = 0
    phase = 0; whistlePhase = 0; answerPhase = 0; airFast = 0; airSlow = 0
    echoLeft = [Double](repeating: 0, count: max(2, Int(rate * 1.2)))
    echoRight = [Double](repeating: 0, count: echoLeft.count)
    echoIndex = 0; echoWetLeft = 0; echoWetRight = 0
    left = 0; right = 0
  }

  private func unit() -> Double {
    random ^= random << 13; random ^= random >> 7; random ^= random << 17
    return Double(random & 0x00ff_ffff) / Double(0x00ff_ffff)
  }

  func render(sampleRate: Double, salience: WorldSalienceScheduler, presence: Double, density: Double, variety: Double) {
    if rate != sampleRate { reset(seed: random, sampleRate: sampleRate) }
    if age < 0 {
      countdown -= 1
      if countdown <= 0 {
        if presence > 0.0001 && salience.reserve(salience: 0.5, durationSeconds: 13.2, recoverySeconds: 4) {
          age = 0
          baseHz = 75 + unit() * 22.5
          pan = (unit() * 2 - 1) * 0.28
          answerPan = pan < 0 ? 0.52 : -0.52
          let immersive = max(0, min(1, (variety - 0.6) / 0.4))
          let gapSeconds = 110 - 84 * immersive + unit() * (70 - 58 * immersive)
          countdown = rate * gapSeconds / max(0.2, min(1, density))
        } else {
          countdown = rate * 3
        }
      }
    }

    var main = 0.0
    var answer = 0.0
    if age >= 0 {
      let seconds = age / rate
      let attack = max(0, min(1, seconds / 2))
      let release = max(0, min(1, (9 - seconds) / 4.5))
      let rise = attack * attack * (3 - 2 * attack)
      let fall = release * release * (3 - 2 * release)
      let sway = 1 + 0.003 * sin(seconds * Double.pi * 2 / 4.7)
      phase = fmod(phase + 2 * Double.pi * baseHz * sway / rate, 2 * Double.pi)
      let wood = sin(phase) * 0.52 + sin(phase * 3) * 0.19 + sin(phase * 5) * 0.03
      // The high hollow resonance rises with the gust, then recedes. Its independent phase keeps it
      // airy rather than turning the whole low trunk voice into a pitch sweep.
      let whistleArc = sin(Double.pi * max(0, min(1, seconds / 9)))
      let whistleHz = baseHz * 5 * (0.88 + 0.14 * whistleArc)
      whistlePhase = fmod(whistlePhase + 2 * Double.pi * whistleHz / rate, 2 * Double.pi)
      let whistle = sin(whistlePhase) * 0.21 * whistleArc * whistleArc
      let white = unit() * 2 - 1
      airFast += 0.06 * (white - airFast)
      airSlow += 0.008 * (white - airSlow)
      let breath = (airFast - airSlow) * 1.1
      let level = 0.34 * max(0, min(1.5, presence))
      main = (wood * rise + breath * attack + whistle) * fall * level

      if seconds >= 7.5 && seconds <= 13.2 {
        let responseProgress = (seconds - 7.5) / 5.7
        let responseEnvelope = pow(sin(Double.pi * responseProgress), 2)
        answerPhase = fmod(answerPhase + 2 * Double.pi * baseHz * 1.5 / rate, 2 * Double.pi)
        let distantWood = sin(answerPhase) * 0.6 + sin(answerPhase * 3) * 0.2
        answer = (distantWood + breath * 0.28) * responseEnvelope * level * 0.72
      }
      age += 1
      if seconds >= 13.2 { age = -1 }
    }

    let dryLeft = main * (1 - pan) + answer * (1 - answerPan)
    let dryRight = main * (1 + pan) + answer * (1 + answerPan)
    let echoSize = echoLeft.count
    let firstIndex = (echoIndex - min(echoSize - 1, max(1, Int(rate * 0.19))) + echoSize) % echoSize
    let secondIndex = (echoIndex - min(echoSize - 1, max(1, Int(rate * 0.43))) + echoSize) % echoSize
    let thirdIndex = (echoIndex - min(echoSize - 1, max(1, Int(rate * 0.79))) + echoSize) % echoSize
    let reflectionLeft = echoLeft[firstIndex] * 0.48 + echoLeft[secondIndex] * 0.31 + echoLeft[thirdIndex] * 0.21
    let reflectionRight = echoRight[firstIndex] * 0.48 + echoRight[secondIndex] * 0.31 + echoRight[thirdIndex] * 0.21
    echoWetLeft += (reflectionLeft - echoWetLeft) * 0.012
    echoWetRight += (reflectionRight - echoWetRight) * 0.012
    echoLeft[echoIndex] = dryLeft + echoWetRight * 0.52
    echoRight[echoIndex] = dryRight + echoWetLeft * 0.52
    echoIndex = (echoIndex + 1) % echoSize
    left = dryLeft + echoWetLeft * 0.52
    right = dryRight + echoWetRight * 0.52
  }
}

final class OceanModel {
  private(set) var left = 0.0
  private(set) var right = 0.0
  private var random: UInt64 = 1
  private var rate = 48_000.0
  private var phase = 0
  private var phaseAge = 0.0
  private var phaseDuration = 96_000.0
  private var wavesRemaining = 0
  private var waveAmplitude = 0.7
  private var wavePan = 0.0
  private var bodyLevel = 0.3
  private var foamLevel = 0.05
  private var renderedPan = 0.0
  private var renderedWidth = 0.3
  private var mood = 0.5
  private var moodTarget = 0.5
  private var moodFrames = 48_000.0 * 120
  private var low = 0.0
  private var mid = 0.0
  private var foamLeft = 0.0
  private var foamRight = 0.0
  private var bubblePhases = [Double](repeating: 0, count: 8)
  private var bubbleAges = [Double](repeating: 0, count: 8)
  private var bubbleDurations = [Double](repeating: 0, count: 8)
  private var bubbleFrequencies = [Double](repeating: 0, count: 8)
  private var bubbleAmplitudes = [Double](repeating: 0, count: 8)
  private var bubblePans = [Double](repeating: 0, count: 8)
  private var bubbleCursor = 0
  private var bubbleCountdown = 0.0
  private var bubbleBurstRemaining = 0
  private var bubbleSequenceAdmitted = false
  private var bubbleLeft = 0.0
  private var bubbleRight = 0.0
  private var beaconRandom: UInt64 = 1
  private var beaconCountdown = 0.0
  private var beaconAge = -1.0
  private var beaconBaseHz = 88.0
  private var beaconPan = 0.0
  private var beaconCurrentPan = 0.0
  private var beaconPhase = 0.0
  private var beaconEcho = [Double](repeating: 0, count: 24_000)
  private var beaconEchoIndex = 0
  private var beaconWet = 0.0
  private var beaconLeft = 0.0
  private var beaconRight = 0.0
  private var beaconGestureSeed: UInt64 = 1
  private var beaconAppearance: Int64 = 0
  private var beaconRootRatio = 1.0
  private var beaconGlide = 0.0
  private var beaconBrightness = 1.0
  private var beaconLevel = 1.0
  private var beaconTravel = 0.0
  private var beaconApproach = 0.0
  private var beaconAnswer = 0.0
  private var beaconAnswerPhase = 0.0
  private var beaconEchoBoost = 0.0

  func reset(seed: UInt64, sampleRate: Double) {
    random = seed ^ 0x510e527f
    if random == 0 { random = 1 }
    rate = sampleRate
    phase = 0; phaseAge = 0; phaseDuration = rate * 2; wavesRemaining = 0
    waveAmplitude = 0.7; wavePan = 0; bodyLevel = 0.3; foamLevel = 0.05
    renderedPan = 0; renderedWidth = 0.3; mood = 0.5; moodTarget = 0.5; moodFrames = rate * 120
    low = 0; mid = 0; foamLeft = 0; foamRight = 0
    for i in bubblePhases.indices {
      bubblePhases[i] = 0; bubbleAges[i] = 0; bubbleDurations[i] = 0
      bubbleFrequencies[i] = 0; bubbleAmplitudes[i] = 0; bubblePans[i] = 0
    }
    bubbleCursor = 0; bubbleCountdown = 0; bubbleBurstRemaining = 0; bubbleSequenceAdmitted = false
    beaconRandom = seed ^ 0x626561636f6e
    if beaconRandom == 0 { beaconRandom = 1 }
    beaconCountdown = rate * 16; beaconAge = -1; beaconBaseHz = 88; beaconPan = 0; beaconCurrentPan = 0; beaconPhase = 0
    beaconEcho = [Double](repeating: 0, count: max(2, Int(rate * 0.5)))
    beaconEchoIndex = 0; beaconWet = 0; beaconLeft = 0; beaconRight = 0
    beaconGestureSeed = seed; beaconAppearance = 0
    beaconRootRatio = 1; beaconGlide = 0; beaconBrightness = 1; beaconLevel = 1
    beaconTravel = 0; beaconApproach = 0; beaconAnswer = 0; beaconAnswerPhase = 0; beaconEchoBoost = 0
    bubbleLeft = 0; bubbleRight = 0; left = 0; right = 0
  }

  private func unit() -> Double {
    random ^= random << 13; random ^= random >> 7; random ^= random << 17
    return Double(random & 0x00ff_ffff) / Double(0x00ff_ffff)
  }

  private func white() -> Double { unit() * 2 - 1 }

  private func beaconUnit() -> Double {
    beaconRandom ^= beaconRandom << 13; beaconRandom ^= beaconRandom >> 7; beaconRandom ^= beaconRandom << 17
    return Double(beaconRandom & 0x00ff_ffff) / Double(0x00ff_ffff)
  }

  private func drawBeaconGesture(variety: Double) {
    beaconRootRatio = 1; beaconGlide = 0; beaconBrightness = 1; beaconLevel = 1
    beaconTravel = 0; beaconApproach = 0; beaconAnswer = 0; beaconAnswerPhase = 0; beaconEchoBoost = 0
    let index = beaconAppearance
    beaconAppearance += 1
    if variety <= 0 { return }
    let salt = IdentityGestures.oceanSalt
    func u(_ slot: Int) -> Double { IdentityGestures.draw(seed: beaconGestureSeed, salt: salt, index: index, slot: slot) }
    let kind = IdentityGestures.kind(seed: beaconGestureSeed, salt: salt, index: index, kinds: IdentityGestures.oceanKinds)
    beaconLevel = 1 + variety * (u(0) - 0.5) * 0.16
    // 0 plain; 1 darker; 2 falling; 3 crossing; 4 approaching; 5 answered; 6 longer echo.
    switch kind {
    case 1:
      beaconRootRatio = pow(2, -(1 + u(1) * 2) * variety / 12)
      beaconBrightness = 1 - 0.24 * variety
    case 2: beaconGlide = -(1 + u(2) * 1.5) * variety
    case 3: beaconTravel = (u(3) < 0.5 ? -1 : 1) * 0.3 * variety
    case 4: beaconApproach = 0.75 * variety
    case 5: beaconAnswer = 0.32 * variety
    case 6: beaconEchoBoost = 0.3 * variety
    default: break
    }
  }

  private func renderBeacon(salience: WorldSalienceScheduler, presence: Double, density: Double, variety: Double) {
    if beaconAge < 0 {
      beaconCountdown -= 1
      if beaconCountdown <= 0 {
        if presence > 0.0001 && salience.reserve(salience: 0.46, durationSeconds: 16, recoverySeconds: 5) {
          beaconAge = 0
          beaconBaseHz = 82 + beaconUnit() * 14
          beaconPan = (beaconUnit() * 2 - 1) * 0.28
          beaconCountdown = rate * (105 + beaconUnit() * 55) / max(0.2, min(1, density)) *
            (1 - 0.25 * max(0, min(1, (variety - 0.6) / 0.4)))
          drawBeaconGesture(variety: variety)
        } else {
          beaconCountdown = rate * 3
        }
      }
    }
    var dry = 0.0
    if beaconAge >= 0 {
      let seconds = beaconAge / rate
      let progress = max(0, min(1, seconds / 16))
      let attack = max(0, min(1, seconds / 3.2))
      let release = max(0, min(1, (16 - seconds) / 8))
      let envelope = (0.5 - 0.5 * cos(Double.pi * attack)) * (release * release * (3 - 2 * release))
      let swell = 1 + 0.004 * sin(seconds * 2 * Double.pi / 9)
      let glideRatio = beaconGlide == 0 ? 1 : pow(2, beaconGlide * progress / 12)
      beaconPhase = fmod(beaconPhase + 2 * Double.pi * beaconBaseHz * beaconRootRatio * glideRatio * swell / rate, 2 * Double.pi)
      let horn = sin(beaconPhase) * 0.56 + sin(beaconPhase * 2) * (0.28 * beaconBrightness) +
        sin(beaconPhase * 3) * (0.12 * beaconBrightness) + sin(beaconPhase * 4) * (0.04 * beaconBrightness)
      let distance = beaconApproach * abs(progress * 2 - 1)
      dry = horn * envelope * beaconLevel * (1 - 0.3 * distance) * 0.25 * max(0, min(1.5, presence))
      beaconCurrentPan = beaconPan + beaconTravel * (progress * 2 - 1)
      if beaconAnswer > 0 && seconds >= 6 && seconds <= 15 {
        let answerProgress = (seconds - 6) / 9
        let answerEnvelope = pow(sin(Double.pi * answerProgress), 2)
        beaconAnswerPhase = fmod(beaconAnswerPhase + 2 * Double.pi * beaconBaseHz * 0.75 / rate, 2 * Double.pi)
        let answerHorn = sin(beaconAnswerPhase) * 0.65 + sin(beaconAnswerPhase * 2) * 0.35
        dry += answerHorn * answerEnvelope * beaconAnswer * 0.25 * max(0, min(1.5, presence))
      }
      beaconAge += 1
      if seconds >= 16 { beaconAge = -1 }
    }
    let echoSize = beaconEcho.count
    let first = beaconEcho[(beaconEchoIndex - min(echoSize - 1, max(1, Int(rate * 0.19))) + echoSize) % echoSize]
    let second = beaconEcho[(beaconEchoIndex - min(echoSize - 1, max(1, Int(rate * 0.37))) + echoSize) % echoSize]
    beaconWet += ((first + second) * 0.5 - beaconWet) * 0.018
    beaconEcho[beaconEchoIndex] = dry + beaconWet * 0.35
    beaconEchoIndex = (beaconEchoIndex + 1) % echoSize
    let distant = dry * 0.72 + beaconWet * (0.46 + beaconEchoBoost)
    beaconLeft = distant * (1 - beaconCurrentPan)
    beaconRight = distant * (1 + beaconCurrentPan)
  }

  private func enter(_ next: Int, intensity: Double, salience: WorldSalienceScheduler) {
    phase = next
    phaseAge = 0
    switch phase {
    case 0:
      phaseDuration = rate * (wavesRemaining > 0 ? 1.5 + unit() * 2.5 : 6 + unit() * 10)
    case 1:
      if wavesRemaining <= 0 { wavesRemaining = 1 + Int(unit() * 3) }
      wavesRemaining -= 1
      waveAmplitude = (0.55 + unit() * 0.38) * (0.7 + intensity * 0.3) * (0.78 + mood * 0.3)
      wavePan = (unit() * 2 - 1) * 0.52
      phaseDuration = rate * (2.2 + unit() * 2.7)
    case 2:
      phaseDuration = rate * (0.8 + unit() * 1.1)
    case 3:
      phaseDuration = rate * (1.5 + unit() * 1.8)
      bubbleSequenceAdmitted = salience.reserve(salience: 0.28, durationSeconds: 7, recoverySeconds: 2)
      bubbleBurstRemaining = bubbleSequenceAdmitted ? 3 + Int(unit() * (4 + intensity * 4)) : 0
      bubbleCountdown = rate * (0.08 + unit() * 0.18)
    case 4:
      phaseDuration = rate * (3 + unit() * 3.5)
      if bubbleSequenceAdmitted { bubbleBurstRemaining += 2 + Int(unit() * 4) }
    default:
      phaseDuration = rate * (4 + unit() * 5)
    }
  }

  private func advance(intensity: Double, salience: WorldSalienceScheduler) {
    if phaseAge >= phaseDuration { enter(phase == 5 ? 0 : phase + 1, intensity: intensity, salience: salience) }
  }

  private func exciteBubble() {
    let slot = bubbleCursor
    bubbleCursor = (bubbleCursor + 1) % bubblePhases.count
    bubblePhases[slot] = 0
    bubbleAges[slot] = 0
    bubbleDurations[slot] = rate * (0.08 + unit() * 0.20)
    bubbleFrequencies[slot] = 320 + unit() * 1_180
    bubbleAmplitudes[slot] = 0.012 + unit() * 0.025
    bubblePans[slot] = (unit() * 2 - 1) * 0.8
  }

  private func renderBubbles() {
    if bubbleBurstRemaining > 0 && (phase == 3 || phase == 4) {
      bubbleCountdown -= 1
      if bubbleCountdown <= 0 {
        exciteBubble()
        bubbleBurstRemaining -= 1
        bubbleCountdown = rate * (0.10 + unit() * 0.42)
      }
    }
    bubbleLeft = 0; bubbleRight = 0
    for slot in bubblePhases.indices {
      let duration = bubbleDurations[slot]
      if duration <= 0 || bubbleAges[slot] >= duration { continue }
      let progress = bubbleAges[slot] / duration
      let attack = 0.5 - 0.5 * cos(Double.pi * min(1, bubbleAges[slot] / max(1, rate * 0.006)))
      let envelope = attack * (1 - progress) * (1 - progress)
      let frequency = bubbleFrequencies[slot] * (1 + 0.22 * (1 - progress))
      let value = sin(bubblePhases[slot]) * envelope * bubbleAmplitudes[slot]
      bubblePhases[slot] = fmod(bubblePhases[slot] + Double.pi * 2 * frequency / rate, Double.pi * 2)
      bubbleAges[slot] += 1
      bubbleLeft += value * (1 - bubblePans[slot]) * 0.6
      bubbleRight += value * (1 + bubblePans[slot]) * 0.6
    }
  }

  func render(sampleRate: Double, intensity: Double, salience: WorldSalienceScheduler, identityPresence: Double, identityDensity: Double, identityVariety: Double) {
    if rate != sampleRate { reset(seed: random, sampleRate: sampleRate) }
    advance(intensity: intensity, salience: salience)
    moodFrames -= 1
    if moodFrames <= 0 {
      moodTarget = 0.15 + unit() * 0.75
      moodFrames = rate * (120 + unit() * 180)
    }
    mood += (moodTarget - mood) / max(1, rate * 45)
    let progress = min(1, phaseAge / max(1, phaseDuration))
    let smooth = progress * progress * (3 - 2 * progress)
    let bodyTarget: Double
    let foamTarget: Double
    let widthTarget: Double
    switch phase {
    case 0: bodyTarget = 0.25 + mood * 0.1; foamTarget = 0.04 + mood * 0.04; widthTarget = 0.25
    case 1: bodyTarget = 0.28 + waveAmplitude * 0.52 * smooth; foamTarget = 0.05 + waveAmplitude * 0.16 * smooth; widthTarget = 0.3 + smooth * 0.25
    case 2: bodyTarget = 0.56 + waveAmplitude * 0.28; foamTarget = 0.24 + waveAmplitude * 0.25; widthTarget = 0.68
    case 3: bodyTarget = 0.72 - smooth * 0.16; foamTarget = (0.66 + waveAmplitude * 0.25) * (1 - smooth * 0.18); widthTarget = 0.9
    case 4: bodyTarget = 0.54 - smooth * 0.12; foamTarget = 0.58 * (1 - smooth * 0.5); widthTarget = 0.82 - smooth * 0.18
    default: bodyTarget = 0.42 - smooth * 0.15; foamTarget = 0.28 * (1 - smooth) + 0.05; widthTarget = 0.55 - smooth * 0.25
    }
    let slew = 1 / max(1, rate * 0.28)
    bodyLevel += (bodyTarget - bodyLevel) * slew
    foamLevel += (foamTarget - foamLevel) * slew
    renderedPan += (wavePan - renderedPan) * slew
    renderedWidth += (widthTarget - renderedWidth) * slew
    let shared = white()
    low += 0.0045 * (shared - low)
    mid += 0.022 * (shared - mid)
    let leftWhite = white()
    let rightWhite = white()
    foamLeft += 0.072 * (leftWhite - foamLeft)
    foamRight += 0.072 * (rightWhite - foamRight)
    let undertow = (low * 2.8 + mid * 0.78) * bodyLevel
    let brightLeft = (leftWhite - foamLeft * 0.66) * foamLevel * (0.72 + intensity * 0.38)
    let brightRight = (rightWhite - foamRight * 0.66) * foamLevel * (0.72 + intensity * 0.38)
    renderBubbles()
    renderBeacon(salience: salience, presence: identityPresence, density: identityDensity, variety: identityVariety)
    left = undertow * (1 - renderedPan * 0.12) + brightLeft * (0.72 + renderedWidth * 0.35) * (1 - renderedPan * 0.3) + bubbleLeft + beaconLeft
    right = undertow * (1 + renderedPan * 0.12) + brightRight * (0.72 + renderedWidth * 0.35) * (1 + renderedPan * 0.3) + bubbleRight + beaconRight
    phaseAge += 1
  }
}

/// Liminal harmonic environment with no fixed-period environmental motion.
// Per-appearance variation for a world's identity sound. Each time the sound appears it draws a small
// gesture: how loud, how long, how deep, where it sits and moves, whether it doubles or echoes itself.
//
// Everything is a pure function of (night seed, sound, appearance number), with no state of its own. A seek
// or a resume therefore lands on the same gesture, and no other random stream in the engine is disturbed.
// Two appearances in a row are never the same kind. The Kotlin engine mirrors this.
enum IdentityGestures {
  static let aumSalt: UInt64 = 0x41756d01
  static let aumKinds = 6
  static let whaleSalt: UInt64 = 0x5768616c
  static let whaleKinds = 7
  static let cosmicSalt: UInt64 = 0x436f736d
  static let cosmicKinds = 9
  static let oceanSalt: UInt64 = 0x4f6365616e
  static let oceanKinds = 6
  private static var bagA = [Int](repeating: 0, count: 10)
  private static var bagB = [Int](repeating: 0, count: 10)

  private static func splitmix(_ x: UInt64) -> UInt64 {
    var z = x &+ 0x9E3779B97F4A7C15
    z = (z ^ (z >> 30)) &* 0xBF58476D1CE4E5B9
    z = (z ^ (z >> 27)) &* 0x94D049BB133111EB
    return z ^ (z >> 31)
  }

  /// A uniform draw in [0, 1) for one detail (`slot`) of one appearance.
  static func draw(seed: UInt64, salt: UInt64, index: Int64, slot: Int) -> Double {
    let bits = splitmix(splitmix(seed ^ salt) &+ UInt64(index) &* 32 &+ UInt64(slot))
    return Double(bits >> 11) / 9007199254740992.0
  }

  private static func permutation(seed: UInt64, salt: UInt64, bag: Int64, kinds: Int, into out: inout [Int]) {
    for i in 0..<kinds { out[i] = i }
    for i in stride(from: kinds - 1, through: 1, by: -1) {
      let j = min(i, Int(draw(seed: seed, salt: salt ^ 0x62616700, index: bag, slot: 16 + i) * Double(i + 1)))
      out.swapAt(i, j)
    }
  }

  /// The kind of appearance number `index`, of `kinds` in all. Kinds are dealt from a shuffled bag, so each
  /// turns up once in every `kinds` appearances; a bag's first kind is swapped if it would repeat the
  /// previous bag's last.
  static func kind(seed: UInt64, salt: UInt64, index: Int64, kinds: Int) -> Int {
    let bag = index / Int64(kinds)
    let position = Int(index % Int64(kinds))
    permutation(seed: seed, salt: salt, bag: bag, kinds: kinds, into: &bagA)
    if bag > 0 {
      permutation(seed: seed, salt: salt, bag: bag - 1, kinds: kinds, into: &bagB)
      if bagA[0] == bagB[kinds - 1] { bagA.swapAt(0, 1) }
    }
    return bagA[position]
  }
}

/// One appearance of the Aum. The neutral gesture is exactly the Aum as it has always sounded.
final class AumGesture {
  /// Consonant roots below the chant's own (A2): a whole tone, a fourth and a fifth below, and an octave down.
  static let deeper = [8.0 / 9.0, 3.0 / 4.0, 2.0 / 3.0, 1.0 / 2.0]
  static let kindPlain = 0, kindDoubled = 1, kindTraveller = 2, kindApproach = 3, kindEcho = 4, kindDeepening = 5

  var kind = AumGesture.kindPlain
  var level = 1.0
  /// Seconds after the start of its 31 s cycle before the chant begins.
  var startDelay = 0.0
  /// 1 = the designed 9 s chant; above 1 it is longer.
  var stretch = 1.0
  var rootRatio = 1.0
  /// Semitones the pitch falls over the chant.
  var glide = 0.0
  /// Level of a doubled Aum an octave beneath.
  var sub = 0.0
  var pans = false
  var panStart = 0.0
  var panEnd = 0.0
  var distant = false
  /// 0 = at the listener, 1 = far off.
  var distStart = 0.0
  var distEnd = 0.0
  var echoSend = 0.0

  func neutral() {
    kind = Self.kindPlain; level = 1; startDelay = 0; stretch = 1; rootRatio = 1; glide = 0
    sub = 0; pans = false; panStart = 0; panEnd = 0; distant = false; distStart = 0; distEnd = 0; echoSend = 0
  }

  /// Draws appearance number `index` at the given variety (0 = none, 1 = full).
  func draw(seed: UInt64, index: Int64, variety: Double) {
    neutral()
    let salt = IdentityGestures.aumSalt
    func u(_ slot: Int) -> Double { IdentityGestures.draw(seed: seed, salt: salt, index: index, slot: slot) }
    kind = IdentityGestures.kind(seed: seed, salt: salt, index: index, kinds: IdentityGestures.aumKinds)
    level = 1.0 + variety * (u(0) - 0.5) * 0.3
    startDelay = variety * u(1) * 9.0
    stretch = 1.0 + variety * (u(2) - 0.4) * 0.3
    // A different group, a different root: most appearances stay on the chant's own note.
    if u(3) < 0.2 + 0.45 * variety { rootRatio = Self.deeper[min(2, Int(u(4) * 3.0))] }
    switch kind {
    case Self.kindDoubled:
      level *= 1.0 + 0.4 * variety
      sub = 0.6 * variety
    case Self.kindTraveller:
      pans = true
      panStart = (u(5) < 0.5 ? -1.0 : 1.0) * variety
      panEnd = -panStart
    case Self.kindApproach:
      distant = true
      distStart = 0.9 * variety
      distEnd = 0.0
    case Self.kindEcho:
      echoSend = 0.55 * variety
    case Self.kindDeepening:
      // The group settles lower as it chants. The octave is kept for the fullest variety.
      rootRatio = Self.deeper[min(variety > 0.7 ? 3 : 2, Int(u(6) * 4.0))]
      glide = (1.0 + u(7) * 2.0) * variety
    default:
      break
    }
  }
}

/// One appearance of the whale call: the call, its answer, and whatever else is in the water.
final class WhaleGesture {
  static let kindPlain = 0, kindRising = 1, kindFalling = 2, kindCompanions = 3, kindFarNear = 4, kindAnswerOnly = 5, kindLongEcho = 6
  static let pitchSteady = 0, pitchRising = 1, pitchDeepFall = 2

  var kind = WhaleGesture.kindPlain
  /// Scales the call's level; 0 leaves only the answer.
  var callLevel = 1.0
  /// 0 = at the listener, 1 = far off.
  var callFar = 0.0
  var pitchMode = WhaleGesture.pitchSteady
  var durationScale = 1.0
  var answerLevel = 1.0
  /// The answer comes from close by.
  var answerNear = false
  /// Scales the answer's upper harmonics: above 1 it is brighter and closer.
  var answerBright = 1.0
  /// How many other whales answer from the distance: 0, 1 or 2.
  var companions = 0
  var echoSend = 0.0

  func neutral() {
    kind = Self.kindPlain; callLevel = 1; callFar = 0; pitchMode = Self.pitchSteady; durationScale = 1
    answerLevel = 1; answerNear = false; answerBright = 1; companions = 0; echoSend = 0
  }

  /// Draws appearance number `index` at the given variety (0 = none, 1 = full).
  func draw(seed: UInt64, index: Int64, variety: Double) {
    neutral()
    let salt = IdentityGestures.whaleSalt
    func u(_ slot: Int) -> Double { IdentityGestures.draw(seed: seed, salt: salt, index: index, slot: slot) }
    kind = IdentityGestures.kind(seed: seed, salt: salt, index: index, kinds: IdentityGestures.whaleKinds)
    callLevel = 1.0 + variety * (u(0) - 0.5) * 0.24
    durationScale = 1.0 + variety * (u(1) - 0.5) * 0.2
    switch kind {
    case Self.kindRising:
      pitchMode = Self.pitchRising
    case Self.kindFalling:
      pitchMode = Self.pitchDeepFall
      durationScale *= 1.0 + 0.3 * variety
    case Self.kindCompanions:
      // One more whale far off, and at the fullest variety often a second, smaller and farther still.
      companions = u(2) < 0.25 + 0.5 * variety ? 2 : 1
    case Self.kindFarNear:
      callFar = 0.95 * variety
      callLevel *= 1.0 - 0.4 * variety
      answerLevel = 1.0 + variety
      answerBright = 1.0 + 0.9 * variety
      answerNear = true
    case Self.kindAnswerOnly:
      callLevel = 0.0
      answerLevel = 1.0 + 0.35 * variety
    case Self.kindLongEcho:
      // Longer than it should be: up to twice the length, and it calls back to itself across the water.
      durationScale *= 1.0 + variety
      callLevel *= 0.9
      echoSend = 0.6 * variety
    default:
      break
    }
  }
}

/// One breath of the Cosmic voice. The neutral gesture is exactly the voice as it has always sounded.
final class CosmicGesture {
  /// A fifth, a major third and a minor third above: voices that sing with the drone.
  static let harmony = [3.0 / 2.0, 5.0 / 4.0, 6.0 / 5.0]
  static let kindPlain = 0, kindDeepSwell = 1, kindOctaveBeneath = 2, kindSinking = 3, kindHarmony = 4
  static let kindDrift = 5, kindCircling = 6, kindApproach = 7, kindDeepEcho = 8
  /// How far below the drone's own note the long deep voice sings: two octaves, a fundamental of about 19 Hz
  /// that is felt as a slow rumble while its harmonics carry the voice. Chosen by ear over 4, 7 and 12.
  static let deepEchoSemitones = 24.0
  /// The quietest point of a breath, as a share of its peak, in the voice as it has always been.
  static let defaultFloor = 0.1

  var kind = CosmicGesture.kindPlain
  var level = 1.0
  var floor = CosmicGesture.defaultFloor
  /// Shapes the swell: 1 = as designed; below 1 it holds nearer its peak for longer.
  var plateau = 1.0
  var echoSend = 0.0
  var rootRatio = 1.0
  /// Semitones the pitch falls over the breath.
  var glide = 0.0
  /// Semitones the pitch wanders either side of its root over the breath.
  var drift = 0.0
  /// Level of a second voice singing with the first; 0 = none.
  var second = 0.0
  var secondRatio = 1.0
  var secondPan = 0.0
  var circles = false
  /// +1 or -1: which way it circles.
  var circleDirection = 1.0
  var distant = false
  /// 0 = at the listener, 1 = far off.
  var distStart = 0.0

  func neutral() {
    kind = Self.kindPlain; level = 1; floor = Self.defaultFloor; plateau = 1; echoSend = 0; rootRatio = 1; glide = 0; drift = 0
    second = 0; secondRatio = 1; secondPan = 0; circles = false; circleDirection = 1; distant = false; distStart = 0
  }

  /// Draws breath number `index` at the given variety (0 = none, 1 = full).
  func draw(seed: UInt64, index: Int64, variety: Double) {
    neutral()
    let salt = IdentityGestures.cosmicSalt
    func u(_ slot: Int) -> Double { IdentityGestures.draw(seed: seed, salt: salt, index: index, slot: slot) }
    kind = IdentityGestures.kind(seed: seed, salt: salt, index: index, kinds: IdentityGestures.cosmicKinds)
    level = 1.0 + variety * (u(0) - 0.5) * 0.24
    // Lower is the most prominent turn: a semitone, a whole tone or a minor third below, in most breaths.
    if u(3) < 0.35 + 0.5 * variety { rootRatio = pow(2.0, -(1.0 + (u(4) * 3.0).rounded(.down)) / 12.0) }
    switch kind {
    case Self.kindDeepSwell:
      floor = Self.defaultFloor - 0.07 * variety
      level *= 1.0 + 0.3 * variety
    case Self.kindOctaveBeneath:
      // A second voice an octave beneath: the deepest, most present kind.
      second = 0.7 * variety
      secondRatio = 0.5
      secondPan = 0.0
    case Self.kindSinking:
      glide = (1.0 + u(5) * 2.0) * variety
    case Self.kindHarmony:
      second = 0.55 * variety
      secondRatio = Self.harmony[min(2, Int(u(6) * 3.0))]
      secondPan = (u(7) < 0.5 ? -1.0 : 1.0) * 0.6
    case Self.kindDrift:
      drift = (0.6 + 0.8 * u(8)) * variety * (u(9) < 0.5 ? -1.0 : 1.0)
    case Self.kindCircling:
      circles = true
      circleDirection = u(10) < 0.5 ? -1.0 : 1.0
    case Self.kindApproach:
      distant = true
      distStart = 0.85 * variety
    case Self.kindDeepEcho:
      // A long, very deep voice that holds near its peak and calls back to itself across the void.
      rootRatio = pow(2.0, -Self.deepEchoSemitones / 12.0)
      floor = 0.03
      plateau = 1.0 - 0.5 * variety
      level *= 0.78
      echoSend = 0.4 * variety
    default:
      break
    }
  }
}

/// The Temple world's chant: three imperfect virtual voices that move from an open "O" toward a closed nasal
/// hum, once every 31 seconds. Each appearance draws its own gesture (see AumGesture); at variety 0 every
/// appearance is the designed chant. The Kotlin engine mirrors this.
///
/// The chant is kept apart from the room: it returns its dry voice, its echo, and how much of it goes only to
/// the room's reverb, and the Temple world places them.
final class AumChant {
  private static let freqs = [104.0, 108.0, 111.5]
  private static let weights = [0.34, 0.28, 0.23]
  private static let echoSeconds = 2.75
  /// Seconds between appearances up to variety 0.6 (Gentle and Deep).
  private static let periodSeconds = 31.0
  /// Seconds between appearances at the fullest variety (Immersive): about a quarter more often.
  private static let periodFullSeconds = 25.0
  private static let periodShortensFrom = 0.6

  /// The chant's dry voice for this sample, already scaled by its level.
  private(set) var voiceLeft = 0.0
  private(set) var voiceRight = 0.0
  /// The chant's echo of itself.
  private(set) var echoLeft = 0.0
  private(set) var echoRight = 0.0
  /// Level sent only to the room's reverb, so a far-off chant is mostly reverb.
  private(set) var farWet = 0.0

  private var seed: UInt64 = 1
  private var gate = 1.0
  private var phases = [Double](repeating: 0, count: 3)
  private var formantIc1 = [Double](repeating: 0, count: 4)
  private var formantIc2 = [Double](repeating: 0, count: 4)
  private let gesture = AumGesture()
  private var gestureCycle: Int64 = -1
  private var gestureNeutral = true
  private var subPhases = [Double](repeating: 0, count: 3)
  private var farLeft = 0.0
  private var farRight = 0.0
  private var echoBufferLeft = [Double](repeating: 0, count: 200_000)
  private var echoBufferRight = [Double](repeating: 0, count: 200_000)
  private var echoIndex = 0
  private var echoDampLeft = 0.0
  private var echoDampRight = 0.0

  /// Starts a night: clears every voice and reverb tail, and sets the seed its gestures are drawn from.
  func reset(seed nightSeed: UInt64) {
    seed = nightSeed ^ 0x1d3f9a5b
    gate = 1
    phases = [Double](repeating: 0, count: 3)
    formantIc1 = [Double](repeating: 0, count: 4)
    formantIc2 = [Double](repeating: 0, count: 4)
    gesture.neutral(); gestureNeutral = true; gestureCycle = -1
    subPhases = [Double](repeating: 0, count: 3)
    farLeft = 0; farRight = 0
    for i in echoBufferLeft.indices { echoBufferLeft[i] = 0; echoBufferRight[i] = 0 }
    echoIndex = 0; echoDampLeft = 0; echoDampRight = 0
    voiceLeft = 0; voiceRight = 0; echoLeft = 0; echoRight = 0; farWet = 0
  }

  private func clamp(_ value: Double, _ low: Double, _ high: Double) -> Double { min(high, max(low, value)) }

  func render(sampleRate: Double, elapsedSeconds: Double, intensity: Double, presence: Double, density: Double, variety: Double) {
    let tau = Double.pi * 2
    // The period is fixed for a night (a feel's variety does not change during it); from variety 0.6 it
    // shortens, so a fuller feel hears the chant more often. The first chant stays 5 s in.
    let period = Self.periodSeconds - (Self.periodSeconds - Self.periodFullSeconds) * clamp((variety - Self.periodShortensFrom) / (1.0 - Self.periodShortensFrom), 0, 1)
    let chantPosition = elapsedSeconds + (period - 5.0)
    let cycle = Int64(chantPosition / period)
    // Each appearance of the Aum draws its own gesture; at variety 0 every one is the designed chant.
    if variety <= 0 {
      if !gestureNeutral { gesture.neutral(); gestureNeutral = true; gestureCycle = -1 }
    } else if gestureNeutral || cycle != gestureCycle {
      gesture.draw(seed: seed, index: cycle, variety: variety)
      gestureNeutral = false
      gestureCycle = cycle
    }
    let chantTime = (fmod(chantPosition, period) - gesture.startDelay) / gesture.stretch
    // Sparser identity: the Aum sounds on every Nth 31 s cycle. The gate fades over a
    // quarter second, so a change of density mid-chant can never click.
    let chantEvery = max(1, Int((1.0 / density).rounded()))
    let chantOpen = (chantEvery == 1 || cycle % Int64(chantEvery) == 0) ? 1.0 : 0.0
    gate += (chantOpen - gate) / max(1, sampleRate * 0.25)
    let chantEnvelope: Double
    if chantTime < 0 || chantTime >= 9.0 {
      chantEnvelope = 0
    } else if chantTime < 2.2 {
      chantEnvelope = 0.5 - 0.5 * cos(Double.pi * chantTime / 2.2)
    } else if chantTime > 6.0 {
      chantEnvelope = 0.5 + 0.5 * cos(Double.pi * (chantTime - 6.0) / 3.0)
    } else {
      chantEnvelope = 1
    }
    let chantGated = chantEnvelope * gate
    let chantProgress = clamp(chantTime / 9.0, 0, 1)
    let firstTransition = clamp(chantProgress / 0.56, 0, 1)
    let finalTransition = clamp((chantProgress - 0.56) / 0.44, 0, 1)
    let formant1 = chantProgress < 0.56
      ? 700.0 + (300.0 - 700.0) * firstTransition
      : 300.0 + (250.0 - 300.0) * finalTransition
    let formant2 = chantProgress < 0.56
      ? 1_200.0 + (800.0 - 1_200.0) * firstTransition
      : 800.0 + (2_500.0 - 800.0) * finalTransition
    let formant2Presence = 1.0 - finalTransition * 0.82
    var sourceLeft = 0.0
    var sourceRight = 0.0
    var sub = 0.0
    // The group's pitch: a deeper root, and sometimes a settling glide over the chant.
    let pitchRatio = gesture.glide == 0 ? gesture.rootRatio : gesture.rootRatio * pow(2.0, -gesture.glide * chantProgress / 12.0)
    for index in 0..<3 {
      let phase = phases[index]
      // A compact band-limited glottal source: richer than a sine but without
      // the high-frequency aliasing of a naive sawtooth.
      let glottal = sin(phase) + sin(phase * 2) * 0.42 + sin(phase * 3) * 0.18 + sin(phase * 4) * 0.08
      let shimmer = 0.96 + 0.04 * sin(elapsedSeconds * tau * (5.1 + Double(index) * 0.47) + Double(index))
      let voice = glottal * Self.weights[index] * shimmer
      sourceLeft += voice * (index == 2 ? 0.62 : 1.0)
      sourceRight += voice * (index == 0 ? 0.62 : 1.0)
      sub += sin(phase) * Self.weights[index]
      let jitter = 1.0 + 0.0014 * sin(elapsedSeconds * tau * (6.0 + Double(index) * 0.31) + Double(index) * 1.7)
      phases[index] = fmod(phase + tau * Self.freqs[index] * jitter * pitchRatio / sampleRate, tau)
    }
    let chantLeft = bandpass(sampleRate, sourceLeft, index: 0, frequency: formant1, q: 6.5) * 1.65
      + bandpass(sampleRate, sourceLeft, index: 1, frequency: formant2, q: 7.5) * 1.25 * formant2Presence
      + sub * 0.08
    let chantRight = bandpass(sampleRate, sourceRight, index: 2, frequency: formant1 * 0.992, q: 6.5) * 1.65
      + bandpass(sampleRate, sourceRight, index: 3, frequency: formant2 * 1.008, q: 7.5) * 1.25 * formant2Presence
      + sub * 0.08
    var left = chantLeft
    var right = chantRight
    if gesture.sub > 0 {
      // A doubled Aum an octave beneath, for presence.
      var beneath = 0.0
      for index in 0..<3 {
        let phase = subPhases[index]
        beneath += (sin(phase) + sin(phase * 2) * 0.4) * Self.weights[index]
        subPhases[index] = fmod(phase + tau * Self.freqs[index] * 0.5 * pitchRatio / sampleRate, tau)
      }
      left += beneath * gesture.sub * 0.9
      right += beneath * gesture.sub * 0.9
    }
    if gesture.pans {
      // It enters in one ear and crosses to the other over the chant (equal power). The move is
      // timed to the loud part of the chant, so it is heard rather than spent in the fades.
      let panProgress = clamp((chantTime - 1.2) / 6.6, 0, 1)
      let pan = gesture.panStart + (gesture.panEnd - gesture.panStart) * panProgress
      let angle = (pan + 1.0) * Double.pi / 4.0
      left *= cos(angle) * 1.4142135623730951
      right *= sin(angle) * 1.4142135623730951
    }
    var dryMix = 1.0
    var farSend = 0.0
    if gesture.distant {
      // Far off it is quieter, darker and mostly reverb; it draws near as the chant goes on.
      let travel = chantProgress * chantProgress * (3.0 - 2.0 * chantProgress)
      let distance = gesture.distStart + (gesture.distEnd - gesture.distStart) * travel
      let farCoefficient = 1.0 - exp(-tau * (6_000.0 - 5_300.0 * distance) / sampleRate)
      farLeft += (left - farLeft) * farCoefficient
      farRight += (right - farRight) * farCoefficient
      let farGain = 1.0 - 0.7 * distance
      left = farLeft * farGain
      right = farRight * farGain
      dryMix = 1.0 - 0.65 * distance
      farSend = 0.6 * distance
    }
    let chantLevel = chantGated * (0.18 + intensity * 0.12) * presence * gesture.level
    var echoOutLeft = 0.0
    var echoOutRight = 0.0
    if variety > 0 {
      // The chant answers itself a few seconds later, ping-ponging between the ears.
      let size = echoBufferLeft.count
      let length = min(size - 1, max(1, Int(sampleRate * Self.echoSeconds)))
      let readAt = (echoIndex - length + size) % size
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
    farWet = farSend > 0 ? (left + right) * 0.5 * chantLevel * farSend : 0
  }

  /// Topology-preserving state-variable bandpass; stable while formants move.
  private func bandpass(_ sampleRate: Double, _ input: Double, index: Int, frequency: Double, q: Double) -> Double {
    let g = tan(Double.pi * frequency / sampleRate)
    let k = 1 / q
    let v1 = (formantIc1[index] + g * (input - formantIc2[index])) / (1 + g * (g + k))
    let v2 = formantIc2[index] + g * v1
    formantIc1[index] = 2 * v1 - formantIc1[index]
    formantIc2[index] = 2 * v2 - formantIc2[index]
    return v1
  }
}

final class CosmicModel {
  private static let phi = 1.61803398875
  private static let fieldRatios = [1.0, 1.41421356237, phi, 2.61803398875]
  private static let fieldWeights = [0.07, 0.035, 0.027, 0.016]
  private static let horizonRatios = [1.0, phi, phi * phi]
  private static let horizonWeights = [0.058, 0.02625, 0.01125]
  private static let moanWeights = [0.05, 0.04, 0.06, 0.1, 0.28, 0.12, 0.05, 0.04, 0.08, 0.2]
  /// The two copies of each voice differ by this fraction, so they shimmer slowly rather than pulse.
  private static let moanDetune = 0.0003
  /// The voice's own long reverb: four looped delays (seconds), unequal so the tail stays smooth.
  private static let moanSpaceDelays = [0.0301, 0.0373, 0.0449, 0.0545]
  private static let moanSpaceInput = [0.6, -0.5, 0.5, -0.6]
  private static let moanSpaceDecaySeconds = 15.0
  /// Per-pass loop gain that gives every line the same decay time.
  private static let moanSpaceGains = moanSpaceDelays.map { pow(10.0, -3.0 * $0 / moanSpaceDecaySeconds) }
  private static let moanSpaceDamping = 0.32
  private static let moanSpaceSend = 0.24
  private static let moanSpaceWet = 1.0
  private(set) var left = 0.0
  private(set) var right = 0.0
  private var random: UInt64 = 1
  private var rate = 48_000.0
  private var state = 0
  private var stateAge = 0.0
  private var stateDuration = 144_000.0
  private var firstPass = true
  private var mood = 0.5
  private var moodTarget = 0.5
  private var moodFrames = 48_000.0 * 120
  private var motion = 0.0
  private var motionTarget = 0.0
  private var motionFrames = 48_000.0 * 4
  private var pressure = 0.42
  private var width = 0.3
  private var brightness = 0.25
  private var presence = 0.4
  private var gravityLevel = 0.0
  private var gravityPhase = 0.0
  private var horizonLevel = 0.6
  private var horizonPhases = [Double](repeating: 0, count: 3)
  private var moanPhases = [Double](repeating: 0, count: 10)
  private var moanChoirPhases = [Double](repeating: 0, count: 10)
  private var moanBreathPhase = 0.0
  private var moanCycle: Int64 = 0
  private var gestureSeed: UInt64 = 1
  private let gesture = CosmicGesture()
  private var gestureCycle: Int64 = -1
  private var gestureNeutral = true
  private var secondPhases = [Double](repeating: 0, count: 10)
  private var echoBufferLeft = [Double](repeating: 0, count: 300_000)
  private var echoBufferRight = [Double](repeating: 0, count: 300_000)
  private var echoIndex = 0
  private var echoDampLeft = 0.0
  private var echoDampRight = 0.0
  private var moanEchoLeft = 0.0
  private var moanEchoRight = 0.0
  private var moanGate = 1.0
  private var moanOrbitPhase = 0.0
  private var moanDistanceLeft = 0.0
  private var moanDistanceRight = 0.0
  private var moanReverbSend = 0.6
  private var moanSpaceLines = [[Double]](repeating: [Double](repeating: 0, count: 8192), count: 4)
  private var moanSpaceIndex = [Int](repeating: 0, count: 4)
  private var moanSpaceDamp = [Double](repeating: 0, count: 4)
  private var moanSpaceOut = [Double](repeating: 0, count: 4)
  private var moanSpaceLeft = 0.0
  private var moanSpaceRight = 0.0
  private var moanLeft = 0.0
  private var moanRight = 0.0
  private var moanMono = 0.0
  private var rumble = 0.0
  private var airLeft = 0.0
  private var airRight = 0.0
  private var fieldPhases = [Double](repeating: 0, count: 4)
  private var bloomPhases = [Double](repeating: 0, count: 6)
  private var bloomAges = [Double](repeating: 0, count: 6)
  private var bloomDurations = [Double](repeating: 0, count: 6)
  private var bloomFrequencies = [Double](repeating: 0, count: 6)
  private var bloomAmplitudes = [Double](repeating: 0, count: 6)
  private var bloomPans = [Double](repeating: 0, count: 6)
  private var bloomCursor = 0
  private var bloomCountdown = 48_000.0 * 5
  private var delay = [Double](repeating: 0, count: 48_000)
  private var delayIndex = 0

  func reset(seed: UInt64, sampleRate: Double) {
    random = seed ^ 0x8f1bbcdc
    if random == 0 { random = 1 }
    rate = sampleRate
    state = 0; stateAge = 0; stateDuration = rate * 3; firstPass = true
    mood = 0.5; moodTarget = 0.5; moodFrames = rate * 120
    motion = 0; motionTarget = 0; motionFrames = rate * 4
    pressure = 0.42; width = 0.3; brightness = 0.25; presence = 0.4
    gravityLevel = 0; gravityPhase = 0
    horizonLevel = 0.6
    for index in horizonPhases.indices { horizonPhases[index] = 0 }
    for index in moanPhases.indices { moanPhases[index] = 0; moanChoirPhases[index] = 0 }
    moanBreathPhase = 0; moanOrbitPhase = 0
    moanCycle = 0; moanGate = 1
    gestureSeed = seed ^ 0x436f736d
    gesture.neutral(); gestureCycle = -1; gestureNeutral = true
    secondPhases = [Double](repeating: 0, count: 10)
    for i in echoBufferLeft.indices { echoBufferLeft[i] = 0; echoBufferRight[i] = 0 }
    echoIndex = 0; echoDampLeft = 0; echoDampRight = 0
    moanEchoLeft = 0; moanEchoRight = 0
    for line in moanSpaceLines.indices { for i in moanSpaceLines[line].indices { moanSpaceLines[line][i] = 0 } }
    for line in 0..<4 { moanSpaceIndex[line] = 0; moanSpaceDamp[line] = 0; moanSpaceOut[line] = 0 }
    moanSpaceLeft = 0; moanSpaceRight = 0
    moanDistanceLeft = 0; moanDistanceRight = 0; moanReverbSend = 0.6
    moanLeft = 0; moanRight = 0; moanMono = 0
    rumble = 0; airLeft = 0; airRight = 0
    for index in fieldPhases.indices { fieldPhases[index] = 0 }
    for index in bloomPhases.indices {
      bloomPhases[index] = 0; bloomAges[index] = 0; bloomDurations[index] = 0
      bloomFrequencies[index] = 0; bloomAmplitudes[index] = 0; bloomPans[index] = 0
    }
    bloomCursor = 0; bloomCountdown = rate * 5
    delay.withUnsafeMutableBufferPointer { buffer in
      buffer.baseAddress?.update(repeating: 0, count: buffer.count)
    }
    delayIndex = 0; left = 0; right = 0
  }

  private func unit() -> Double {
    random ^= random << 13; random ^= random >> 7; random ^= random << 17
    return Double(random & 0x00ff_ffff) / Double(0x00ff_ffff)
  }

  private func white() -> Double { unit() * 2 - 1 }

  private func enter(_ next: Int) {
    state = next
    stateAge = 0
    switch state {
    case 0: stateDuration = rate * (firstPass ? 3 : 18 + unit() * 34)
    case 1: stateDuration = rate * (9 + unit() * 13)
    case 2: stateDuration = rate * (10 + unit() * 10)
    case 3: stateDuration = rate * (8 + unit() * 12)
    case 4: stateDuration = rate * (16 + unit() * 34)
    default: stateDuration = rate * (10 + unit() * 18)
    }
    motionTarget = (unit() * 2 - 1) * (state == 3 ? 0.9 : 0.55)
    if state == 1 || state == 4 { bloomCountdown = rate * (2 + unit() * 4) }
  }

  private func advance() {
    guard stateAge >= stateDuration else { return }
    if state == 5 { firstPass = false }
    enter(state == 5 ? 0 : state + 1)
  }

  private func exciteBloom(_ intensity: Double) {
    let slot = bloomCursor
    bloomCursor = (bloomCursor + 1) % bloomPhases.count
    let root = 72 + unit() * 42
    let selector = Int(unit() * 4)
    let ratio: Double
    switch selector {
    case 0: ratio = Self.phi
    case 1: ratio = 1.41421356237 * Self.phi
    case 2: ratio = Self.phi * Self.phi
    default: ratio = 1.41421356237 * Self.phi * Self.phi
    }
    bloomPhases[slot] = unit() * Double.pi * 2
    bloomAges[slot] = 0
    bloomDurations[slot] = rate * (4.5 + unit() * 7.5)
    bloomFrequencies[slot] = root * ratio
    bloomAmplitudes[slot] = (0.018 + unit() * 0.026) * (0.75 + intensity * 0.25)
    bloomPans[slot] = (unit() * 2 - 1) * 0.82
  }

  private func renderBlooms(_ intensity: Double, salience: WorldSalienceScheduler) {
    if (1...4).contains(state) {
      bloomCountdown -= 1
      if bloomCountdown <= 0 {
        if salience.reserve(salience: 0.45, durationSeconds: 12, recoverySeconds: 4) {
          exciteBloom(intensity)
        }
        bloomCountdown = rate * (4 + unit() * (10 - intensity * 3))
      }
    }
    var mono = 0.0
    var bloomLeft = 0.0
    var bloomRight = 0.0
    for slot in bloomPhases.indices {
      let duration = bloomDurations[slot]
      if duration <= 0 || bloomAges[slot] >= duration { continue }
      let progress = bloomAges[slot] / duration
      let attack = min(1, bloomAges[slot] / max(1, rate * 1.4))
      let curve = sin(Double.pi * progress)
      let envelope = curve * curve * attack
      let bend = 1 + (0.5 - progress) * 0.012 * motion
      let value = (sin(bloomPhases[slot]) + sin(bloomPhases[slot] * 0.5) * 0.14) * envelope * bloomAmplitudes[slot]
      bloomPhases[slot] = fmod(bloomPhases[slot] + Double.pi * 2 * bloomFrequencies[slot] * bend / rate, Double.pi * 2)
      bloomAges[slot] += 1
      bloomLeft += value * (1 - bloomPans[slot]) * 0.58
      bloomRight += value * (1 + bloomPans[slot]) * 0.58
      mono += value * 0.35
    }
    let nearFrames = min(delay.count - 1, max(1, Int(rate * 0.23)))
    let farFrames = min(delay.count - 1, max(1, Int(rate * 0.61)))
    let near = delay[(delayIndex - nearFrames + delay.count) % delay.count]
    let far = delay[(delayIndex - farFrames + delay.count) % delay.count]
    delay[delayIndex] = mono + moanMono * moanReverbSend + (near * 0.34 + far * 0.24) * 0.28
    delayIndex = (delayIndex + 1) % delay.count
    left += bloomLeft + near * (0.26 - motion * 0.08) + far * (0.17 + motion * 0.07)
    right += bloomRight + near * (0.26 + motion * 0.08) + far * (0.17 - motion * 0.07)
  }

  private func renderMoan(_ intensity: Double, identityPresence: Double, density: Double, variety: Double) {
    // Each breath draws its own gesture; at variety 0 every one is the voice as designed. A breath begins at
    // the quietest point of the last, so the change is never heard as a step.
    if variety <= 0 {
      if !gestureNeutral { gesture.neutral(); gestureNeutral = true; gestureCycle = -1 }
    } else if gestureNeutral || moanCycle != gestureCycle {
      gesture.draw(seed: gestureSeed, index: moanCycle, variety: variety)
      gestureNeutral = false
      gestureCycle = moanCycle
    }
    let progress = moanBreathPhase / (Double.pi * 2)
    let breath = 0.5 - 0.5 * cos(moanBreathPhase)
    let swell = gesture.plateau == 1.0 ? breath : pow(breath, gesture.plateau)
    let envelope = (gesture.floor == CosmicGesture.defaultFloor && gesture.plateau == 1.0) ? 0.1 + breath * 0.9 : gesture.floor + (1.0 - gesture.floor) * swell
    let distancePresence = 0.72 + breath * 0.28
    var fundamental = 72 + mood * 7 + sin(moanBreathPhase) * 0.45
    // The pitch: a lowered root, a settling glide, or a slow wander around the root.
    if gesture.rootRatio != 1.0 || gesture.glide != 0.0 || gesture.drift != 0.0 {
      fundamental *= gesture.rootRatio * pow(2.0, (-gesture.glide * progress + gesture.drift * sin(Double.pi * 2 * progress)) / 12.0)
    }
    var primary = 0.0
    var choir = 0.0
    for index in moanPhases.indices {
      let harmonic = Double(index + 1)
      let weight = Self.moanWeights[index]
      primary += sin(moanPhases[index]) * weight
      choir += sin(moanChoirPhases[index]) * weight
      moanPhases[index] = fmod(moanPhases[index] + Double.pi * 2 * fundamental * harmonic * (1.0 - Self.moanDetune) / rate, Double.pi * 2)
      moanChoirPhases[index] = fmod(moanChoirPhases[index] + Double.pi * 2 * fundamental * harmonic * (1.0 + Self.moanDetune) / rate, Double.pi * 2)
    }
    let choirSpread = 0.08 + (1 - breath) * 0.1
    var rawLeft = primary * (0.5 + choirSpread) + choir * (0.5 - choirSpread)
    var rawRight = primary * (0.5 - choirSpread) + choir * (0.5 + choirSpread)
    if gesture.second > 0 {
      // A second voice singing with the first: an octave beneath, or a harmony above.
      var singing = 0.0
      for index in secondPhases.indices {
        let harmonic = Double(index + 1)
        singing += sin(secondPhases[index]) * Self.moanWeights[index]
        secondPhases[index] = fmod(secondPhases[index] + Double.pi * 2 * fundamental * gesture.secondRatio * harmonic / rate, Double.pi * 2)
      }
      rawLeft += singing * gesture.second * (1.0 - gesture.secondPan)
      rawRight += singing * gesture.second * (1.0 + gesture.secondPan)
    }
    // Approaching: far off it is darker and quieter and sits more in the reverb; it draws near over the breath.
    var distance = 0.0
    if gesture.distant {
      let travel = progress * progress * (3.0 - 2.0 * progress)
      distance = gesture.distStart * (1.0 - travel)
    }
    let distanceCutoff = (340 + breath * 960) * (1.0 - 0.6 * distance)
    let distanceFilter = Double.pi * 2 * distanceCutoff / (rate + Double.pi * 2 * distanceCutoff)
    moanDistanceLeft += distanceFilter * (rawLeft - moanDistanceLeft)
    moanDistanceRight += distanceFilter * (rawRight - moanDistanceRight)
    // Circling: it sweeps across the ears once over the breath, one way or the other.
    let orbit = gesture.circles ? gesture.circleDirection * sin(Double.pi * 2 * progress) * 0.8 : sin(moanOrbitPhase) * (0.1 + breath * 0.18)
    // Sparser identity: the voice sounds on every Nth breath, fading over 1.5 s at the seams.
    let every = max(1, Int((1.0 / density).rounded()))
    let open = (every == 1 || moanCycle % Int64(every) == 0) ? 1.0 : 0.0
    moanGate += (open - moanGate) / max(1, rate * 1.5)
    let baseLevel = (0.11 + intensity * 0.055) * identityPresence * moanGate
    let level = envelope * distancePresence * baseLevel * gesture.level * (1.0 - 0.55 * distance)
    // The voice feeds its own reverb at a steady level, so as the voice itself recedes the room keeps ringing.
    renderMoanSpace((moanDistanceLeft + moanDistanceRight) * 0.5 * baseLevel * gesture.level * Self.moanSpaceSend * (1.0 + 1.2 * distance))
    moanLeft = moanDistanceLeft * (1 - orbit) * level
    moanRight = moanDistanceRight * (1 + orbit) * level
    moanMono = (moanLeft + moanRight) * 0.5
    if variety > 0 {
      // The voice calls back to itself across the void, ping-ponging between the ears, each time darker.
      let size = echoBufferLeft.count
      let length = min(size - 1, max(1, Int(rate * 5.5)))
      let readAt = (echoIndex - length + size) % size
      echoDampLeft += (echoBufferLeft[readAt] - echoDampLeft) * 0.3
      echoDampRight += (echoBufferRight[readAt] - echoDampRight) * 0.3
      echoBufferLeft[echoIndex] = moanLeft * gesture.echoSend + echoDampRight * 0.62
      echoBufferRight[echoIndex] = moanRight * gesture.echoSend + echoDampLeft * 0.62
      echoIndex = (echoIndex + 1) % size
      moanEchoLeft = echoDampLeft * 0.9
      moanEchoRight = echoDampRight * 0.9
    }
    moanReverbSend = 0.22 + (1 - breath) * 0.38
    let nextBreath = moanBreathPhase + Double.pi * 2 / (rate * 31)
    if nextBreath >= Double.pi * 2 { moanCycle += 1 }
    moanBreathPhase = fmod(nextBreath, Double.pi * 2)
    moanOrbitPhase = fmod(moanOrbitPhase + Double.pi * 2 / (rate * 79), Double.pi * 2)
  }

  /// A four-line feedback delay network: orthogonal mixing, damped highs, long low-frequency decay.
  private func renderMoanSpace(_ input: Double) {
    let size = moanSpaceLines[0].count
    var sum = 0.0
    for line in 0..<4 {
      let length = min(size - 1, max(1, Int(rate * Self.moanSpaceDelays[line])))
      let read = moanSpaceLines[line][(moanSpaceIndex[line] - length + size) % size]
      moanSpaceDamp[line] += (read - moanSpaceDamp[line]) * Self.moanSpaceDamping
      let value = moanSpaceDamp[line] * Self.moanSpaceGains[line]
      moanSpaceOut[line] = value
      sum += value
    }
    let half = sum * 0.5
    for line in 0..<4 {
      moanSpaceLines[line][moanSpaceIndex[line]] = moanSpaceOut[line] - half + input * Self.moanSpaceInput[line]
      moanSpaceIndex[line] = (moanSpaceIndex[line] + 1) % size
    }
    moanSpaceLeft = (moanSpaceOut[0] + moanSpaceOut[1] - moanSpaceOut[2] - moanSpaceOut[3]) * 0.5 * Self.moanSpaceWet
    moanSpaceRight = (moanSpaceOut[0] - moanSpaceOut[1] - moanSpaceOut[2] + moanSpaceOut[3]) * 0.5 * Self.moanSpaceWet
  }

  func render(sampleRate: Double, intensity: Double, salience: WorldSalienceScheduler, identityPresence: Double, density: Double, variety: Double) {
    if rate != sampleRate { reset(seed: random, sampleRate: sampleRate) }
    advance()
    moodFrames -= 1
    if moodFrames <= 0 {
      moodTarget = 0.12 + unit() * 0.78
      moodFrames = rate * (90 + unit() * 180)
    }
    mood += (moodTarget - mood) / max(1, rate * 55)
    motionFrames -= 1
    if motionFrames <= 0 {
      motionTarget = (unit() * 2 - 1) * (state == 3 ? 0.92 : 0.56)
      motionFrames = rate * (3 + unit() * 10)
    }
    motion += (motionTarget - motion) / max(1, rate * 3.2)

    let progress = min(1, stateAge / max(1, stateDuration))
    let arcValue = sin(Double.pi * progress)
    let arc = arcValue * arcValue
    let targetPressure: Double
    let targetWidth: Double
    let targetBrightness: Double
    let targetPresence: Double
    switch state {
    case 0: targetPressure = 0.48 + mood * 0.12; targetWidth = 0.24; targetBrightness = 0.14; targetPresence = 0.3
    case 1: targetPressure = 0.5 + arc * 0.13; targetWidth = 0.32 + arc * 0.2; targetBrightness = 0.2 + arc * 0.18; targetPresence = 0.38 + arc * 0.22
    case 2: targetPressure = 0.56 + arc * 0.2; targetWidth = 0.38; targetBrightness = 0.22 + arc * 0.08; targetPresence = 0.5 + arc * 0.12
    case 3: targetPressure = 0.56 - arc * 0.18; targetWidth = 0.52 + arc * 0.45; targetBrightness = 0.35 + arc * 0.3; targetPresence = 0.58 + arc * 0.18
    case 4: targetPressure = 0.27 - arc * 0.1; targetWidth = 0.9; targetBrightness = 0.48 + mood * 0.16; targetPresence = 0.68
    default: targetPressure = 0.34 + progress * 0.13; targetWidth = 0.78 - progress * 0.48; targetBrightness = 0.42 - progress * 0.24; targetPresence = 0.58 - progress * 0.24
    }
    let slew = 1 / max(1, rate * 1.8)
    pressure += (targetPressure - pressure) * slew
    width += (targetWidth - width) * slew
    brightness += (targetBrightness - brightness) * slew
    presence += (targetPresence - presence) * slew

    let shared = white()
    rumble += (shared - rumble) * (0.0007 + brightness * 0.0012)
    airLeft += (white() - airLeft) * (0.006 + brightness * 0.018)
    airRight += (white() - airRight) * (0.006 + brightness * 0.018)
    let voidBody = rumble * (2 + intensity * 1.15) * pressure
    let airLevel = (0.06 + intensity * 0.055) * (0.55 + brightness)
    let gravityTarget = state == 2 ? arc : 0
    gravityLevel += (gravityTarget - gravityLevel) / max(1, rate * (gravityTarget > gravityLevel ? 2.8 : 4.2))
    let gravityFrequency = 40 + intensity * 9 + mood * 3
    let gravity = (sin(gravityPhase) + sin(gravityPhase * 2) * 0.16) * gravityLevel * (0.07 + intensity * 0.035)
    gravityPhase = fmod(gravityPhase + Double.pi * 2 * gravityFrequency / rate, Double.pi * 2)
    let horizonTarget = 0.56 + mood * 0.16 + ((state == 3 || state == 4) ? 0.08 : 0)
    horizonLevel += (horizonTarget - horizonLevel) / max(1, rate * 24)
    let horizonBase = 36 + intensity * 5 + mood * 2
    var horizonLeft = 0.0
    var horizonRight = 0.0
    for index in horizonPhases.indices {
      let voice = sin(horizonPhases[index]) * Self.horizonWeights[index] * horizonLevel
      let spread = index == 0 ? 0 : motion * width * (0.1 + Double(index) * 0.07)
      horizonLeft += voice * (1 - spread)
      horizonRight += voice * (1 + spread)
      horizonPhases[index] = fmod(horizonPhases[index] + Double.pi * 2 * horizonBase * Self.horizonRatios[index] / rate, Double.pi * 2)
    }
    let base = 34 + intensity * 8 + mood * 3
    var fieldLeft = 0.0
    var fieldRight = 0.0
    for index in fieldPhases.indices {
      let sample = sin(fieldPhases[index]) * Self.fieldWeights[index] * presence
      let pan = motion * (0.22 + Double(index) * 0.11) * (index % 2 == 0 ? 1 : -1)
      fieldLeft += sample * (1 - pan * width)
      fieldRight += sample * (1 + pan * width)
      let lensBend = 1 + motion * (Double(index) - 1.5) * 0.00045 * (0.3 + width)
      fieldPhases[index] = fmod(fieldPhases[index] + Double.pi * 2 * base * Self.fieldRatios[index] * lensBend / rate, Double.pi * 2)
    }
    renderMoan(intensity, identityPresence: identityPresence, density: density, variety: variety)
    left = voidBody + gravity + horizonLeft + fieldLeft + moanLeft + moanSpaceLeft + moanEchoLeft + airLeft * airLevel * (1 - motion * width * 0.16)
    right = voidBody + gravity + horizonRight + fieldRight + moanRight + moanSpaceRight + moanEchoRight + airRight * airLevel * (1 + motion * width * 0.16)
    renderBlooms(intensity, salience: salience)
    stateAge += 1
  }
}

/// Enclosed deep-water world: pressure, hydrophone motion, glass, and sparse life.
final class AbyssalModel {
  private(set) var left = 0.0
  private(set) var right = 0.0
  private var random: UInt64 = 1
  private var rate = 48_000.0
  private var pressurePhase = 0.0
  private var pressureUpperPhase = 0.0
  private var pressureNoise = 0.0
  private var hydroMid = 0.0
  private var hydroLeft = 0.0
  private var hydroRight = 0.0
  private var glassPhases = [Double](repeating: 0, count: 4)
  private static let glassFrequencies = [146.8, 233.1, 379.9, 612.4]
  private static let glassWeights = [0.019, 0.0125, 0.007, 0.0035]
  private var chamberLeft = [Double](repeating: 0, count: 48_000)
  private var chamberRight = [Double](repeating: 0, count: 48_000)
  private var chamberIndex = 0

  private var creatureCountdown = 48_000.0 * 14
  private var creatureActive = false
  private var creatureAge = 0.0
  private var creatureDuration = 0.0
  private var creaturePhase = 0.0
  private var creatureStartHz = 94.0
  private var creatureEndHz = 58.0
  private var creaturePan = 0.0
  private var creatureLevel = 0.0
  private var responseCountdown = -1.0
  private var responseActive = false
  private var responseAge = 0.0
  private var responseDuration = 0.0
  private var responsePhase = 0.0
  private var responseStartHz = 0.0
  private var responseEndHz = 0.0
  private var responsePan = 0.0
  private var responseLevel = 0.0
  // Per-appearance gestures (see WhaleGesture). All idle at variety 0.
  private var gestureSeed: UInt64 = 1
  private let gesture = WhaleGesture()
  private var callCount: Int64 = 0
  private var gestureIndex: Int64 = 0
  private var callFarLeft = 0.0
  private var callFarRight = 0.0
  private var companionCountdown = [Double](repeating: 0, count: 2)
  private var companionActive = [Bool](repeating: false, count: 2)
  private var companionAge = [Double](repeating: 0, count: 2)
  private var companionDuration = [Double](repeating: 0, count: 2)
  private var companionPhase = [Double](repeating: 0, count: 2)
  private var companionStartHz = [Double](repeating: 0, count: 2)
  private var companionEndHz = [Double](repeating: 0, count: 2)
  private var companionPan = [Double](repeating: 0, count: 2)
  private var companionLevel = [Double](repeating: 0, count: 2)
  private var companionFar = [Double](repeating: 0, count: 2)
  private var companionFarLeft = [Double](repeating: 0, count: 2)
  private var companionFarRight = [Double](repeating: 0, count: 2)
  private var callEchoLeft = [Double](repeating: 0, count: 300_000)
  private var callEchoRight = [Double](repeating: 0, count: 300_000)
  private var callEchoIndex = 0
  private var callEchoDampLeft = 0.0
  private var callEchoDampRight = 0.0
  private var farRoom = [Double](repeating: 0, count: 48_000)
  private var farRoomIndex = 0
  private var responseLag = 0.0
  private var responseWaiting = false
  private var responseBright = 1.0
  private var gestureExtraLeft = 0.0
  private var gestureExtraRight = 0.0
  private var shapedLeft = 0.0
  private var shapedRight = 0.0

  private var bubbleCountdown = 48_000.0 * 9.5
  private var bubbleActive = false
  private var bubbleAge = 0.0
  private var bubbleDuration = 0.0
  private var bubblePhase = 0.0
  private var bubbleBaseHz = 0.0
  private var bubbleCount = 0
  private var bubblePanStart = 0.0
  private var bubblePanEnd = 0.0
  private var bubbleLevel = 0.0

  private var dropCountdown = 48_000.0 * 5.5
  private var dropAge = 0.0
  private var dropDuration = 0.0
  private var dropPhase = 0.0
  private var dropFrequency = 0.0
  private var dropPan = 0.0
  private var dropLevel = 0.0
  private var dropDelay = [Double](repeating: 0, count: 48_000)
  private var dropDelayIndex = 0

  func reset(seed: UInt64, sampleRate: Double) {
    random = seed ^ 0xbb67ae85
    if random == 0 { random = 1 }
    rate = sampleRate
    pressurePhase = 0; pressureUpperPhase = 0
    pressureNoise = 0; hydroMid = 0; hydroLeft = 0; hydroRight = 0
    glassPhases = [Double](repeating: 0, count: 4)
    chamberLeft.withUnsafeMutableBufferPointer { $0.baseAddress?.update(repeating: 0, count: $0.count) }
    chamberRight.withUnsafeMutableBufferPointer { $0.baseAddress?.update(repeating: 0, count: $0.count) }
    chamberIndex = 0
    creatureCountdown = rate * 14; creatureActive = false; creatureAge = 0
    creatureDuration = 0; creaturePhase = 0; creaturePan = 0; creatureLevel = 0
    gestureSeed = seed ^ 0x57484c45
    gesture.neutral(); callCount = 0; gestureIndex = 0
    gestureExtraLeft = 0; gestureExtraRight = 0; shapedLeft = 0; shapedRight = 0
    callFarLeft = 0; callFarRight = 0
    companionCountdown = [Double](repeating: 0, count: 2); companionActive = [Bool](repeating: false, count: 2)
    companionAge = [Double](repeating: 0, count: 2); companionDuration = [Double](repeating: 0, count: 2)
    companionPhase = [Double](repeating: 0, count: 2)
    companionFarLeft = [Double](repeating: 0, count: 2); companionFarRight = [Double](repeating: 0, count: 2)
    for i in callEchoLeft.indices { callEchoLeft[i] = 0; callEchoRight[i] = 0 }
    callEchoIndex = 0; callEchoDampLeft = 0; callEchoDampRight = 0
    for i in farRoom.indices { farRoom[i] = 0 }
    farRoomIndex = 0
    responseBright = 1
    responseCountdown = -1; responseLag = 0; responseWaiting = false; responseActive = false; responseAge = 0; responseDuration = 0
    responsePhase = 0; responseStartHz = 0; responseEndHz = 0; responsePan = 0; responseLevel = 0
    bubbleCountdown = rate * 9.5; bubbleActive = false; bubbleAge = 0; bubbleDuration = 0
    bubblePhase = 0; bubbleBaseHz = 0; bubbleCount = 0; bubblePanStart = 0; bubblePanEnd = 0; bubbleLevel = 0
    dropCountdown = rate * 5.5; dropAge = 0; dropDuration = 0
    dropPhase = 0; dropFrequency = 0; dropPan = 0; dropLevel = 0
    dropDelay.withUnsafeMutableBufferPointer { buffer in
      buffer.baseAddress?.update(repeating: 0, count: buffer.count)
    }
    dropDelayIndex = 0; left = 0; right = 0
  }

  private func unit() -> Double {
    random ^= random << 13; random ^= random >> 7; random ^= random << 17
    return Double(random & 0x00ff_ffff) / Double(0x00ff_ffff)
  }

  private func white() -> Double { unit() * 2 - 1 }
  private func smooth(_ value: Double) -> Double {
    let x = min(1, max(0, value))
    return x * x * (3 - 2 * x)
  }

  private func nextCreature(_ intensity: Double, salience: WorldSalienceScheduler, presence: Double, density: Double, variety: Double) -> (left: Double, right: Double) {
    if !creatureActive {
      creatureCountdown -= 1
      if creatureCountdown <= 0 {
        if salience.reserve(salience: 0.58, durationSeconds: 25, recoverySeconds: 5) {
          creatureActive = true
          creatureAge = 0
          creatureDuration = rate * (8.5 + unit() * 3.5)
          creaturePhase = unit() * Double.pi * 2
          creatureStartHz = 88 + unit() * 24
          creatureEndHz = 48 + unit() * 15
          creaturePan = (unit() * 2 - 1) * 0.48
          let baseCreatureLevel = (0.09 + unit() * 0.035) * (0.78 + intensity * 0.22)
          creatureLevel = baseCreatureLevel * 1.95
          responseCountdown = creatureDuration + rate * (3.5 + unit() * 2.5)
          responseStartHz = 145 + unit() * 45
          responseEndHz = 92 + unit() * 32
          responsePan = -creaturePan * 0.9
          responseLevel = baseCreatureLevel * (0.4 + unit() * 0.12) * 1.75
          // Sparser identity: longer silences between calls. From variety 0.6 the silences shorten, down to
          // half at the fullest feel, so Immersive is populated rather than sparse (Gentle and Deep are unchanged).
          creatureCountdown = rate * (42 + unit() * 58) / density * (1.0 - 0.5 * min(1, max(0, (variety - 0.6) / 0.4)))
          beginGesture(variety)
        } else {
          creatureCountdown = rate * (3 + unit() * 3)
        }
      }
    }
    if responseCountdown > 0, !responseActive {
      responseCountdown -= 1
      if responseCountdown <= 0 {
        // The draws happen at the answer's original moment whatever the gesture, so the water's other random
        // details keep to their own schedule; a longer call only delays when the answer is heard.
        responseAge = 0
        responseDuration = rate * (5 + unit() * 2)
        responsePhase = unit() * Double.pi * 2
        if responseLag > 0 { responseWaiting = true } else { responseActive = true }
      }
    }
    if responseWaiting {
      responseLag -= 1
      if responseLag <= 0 { responseWaiting = false; responseActive = true }
    }
    var answerLeft = 0.0
    var answerRight = 0.0
    if responseActive, responseDuration > 0 {
      let progress = min(1, max(0, responseAge / responseDuration))
      let envelope = smooth(responseAge / max(1, rate * 1.6)) * (1 - smooth((progress - 0.58) / 0.42))
      let frequency = responseStartHz + (responseEndHz - responseStartHz) * smooth(progress)
      let voice = (sin(responsePhase) + sin(responsePhase * 1.51) * 0.18 * responseBright + sin(responsePhase * 2.03) * 0.12 * responseBright) * envelope * responseLevel
      responsePhase = fmod(responsePhase + Double.pi * 2 * frequency / rate, Double.pi * 2)
      responseAge += 1
      if responseAge >= responseDuration { responseActive = false }
      answerLeft = voice * (1 - responsePan) * 0.64
      answerRight = voice * (1 + responsePan) * 0.64
    }
    var callLeft = 0.0
    var callRight = 0.0
    if creatureActive, creatureDuration > 0 {
      let progress = min(1, max(0, creatureAge / creatureDuration))
      let attack = smooth(creatureAge / max(1, rate * 2.4))
      let release = 1 - smooth((progress - 0.62) / 0.38)
      let bend = smooth(progress)
      let frequency = (creatureStartHz + (creatureEndHz - creatureStartHz) * bend)
        * (1 + sin(progress * Double.pi * 9) * 0.006)
      let voice = (sin(creaturePhase) + sin(creaturePhase * 2) * 0.23 + sin(creaturePhase * 3) * 0.07)
        * attack * release * creatureLevel
      creaturePhase = fmod(creaturePhase + Double.pi * 2 * frequency / rate, Double.pi * 2)
      creatureAge += 1
      if creatureAge >= creatureDuration { creatureActive = false }
      let travel = creaturePan + sin(progress * Double.pi) * 0.12 * (creaturePan < 0 ? 1 : -1)
      callLeft = voice * (1 - travel) * 0.68
      callRight = voice * (1 + travel) * 0.68
    }
    if variety <= 0 {
      return ((callLeft + answerLeft) * presence, (callRight + answerRight) * presence)
    }
    shapeGestures(callLeft, callRight)
    return ((shapedLeft + answerLeft + gestureExtraLeft) * presence, (shapedRight + answerRight + gestureExtraRight) * presence)
  }

  /// Draws this call's gesture and bends the call, its answer and what is around them to it. It only moves
  /// things the scheduler has already drawn, and takes its own randomness from the night's seed, so the
  /// whale calls at exactly the same moments at any variety.
  private func beginGesture(_ variety: Double) {
    responseLag = 0
    responseBright = 1
    if variety <= 0 { gesture.neutral(); return }
    let index = callCount
    callCount += 1
    gestureIndex = index
    gesture.draw(seed: gestureSeed, index: index, variety: variety)
    let g = gesture
    let oldDuration = creatureDuration
    creatureDuration = oldDuration * g.durationScale
    responseLag = max(0, creatureDuration - oldDuration)
    // The next call's countdown only runs while nothing is sounding, so a longer or shorter call would move
    // every later call. Take the difference off it, and the whale calls at the same moments at any variety.
    creatureCountdown -= creatureDuration - oldDuration
    creatureLevel *= g.callLevel
    switch g.pitchMode {
    case WhaleGesture.pitchRising:
      // Up from the bottom of its range instead of down from the top.
      let low = creatureEndHz
      creatureEndHz = creatureStartHz * 1.05
      creatureStartHz = low
    case WhaleGesture.pitchDeepFall:
      creatureStartHz *= 1.25
      creatureEndHz = max(38, creatureEndHz * 0.72)
    default:
      break
    }
    responseLevel *= g.answerLevel
    // Answered from close by: nearer the middle of the room, and brighter.
    responseBright = g.answerBright
    if g.answerNear { responsePan *= 0.3 }
    for slot in 0..<2 { companionActive[slot] = false }
    companionCountdown = [Double](repeating: 0, count: 2)
    func draw(_ slot: Int) -> Double { IdentityGestures.draw(seed: gestureSeed, salt: IdentityGestures.whaleSalt, index: index, slot: slot) }
    if g.companions >= 1 {
      // A second whale, farther off, on the other side, joining a moment after.
      companionCountdown[0] = rate * (1.5 + 2.0 * draw(10))
      companionDuration[0] = creatureDuration * (0.8 + 0.3 * draw(11))
      companionStartHz[0] = 62.0 + 30.0 * draw(12)
      companionEndHz[0] = 40.0 + 14.0 * draw(13)
      companionPan[0] = (creaturePan < 0 ? 1.0 : -1.0) * (0.35 + 0.35 * draw(14))
      companionLevel[0] = creatureLevel * (0.55 + 0.25 * variety) / max(g.callLevel, 0.05)
      companionFar[0] = 0.75
    }
    if g.companions >= 2 {
      // And a third, smaller, higher and farther still.
      companionCountdown[1] = rate * (4.0 + 3.0 * draw(15))
      companionDuration[1] = creatureDuration * (0.7 + 0.3 * draw(16))
      companionStartHz[1] = 110.0 + 30.0 * draw(17)
      companionEndHz[1] = 70.0 + 20.0 * draw(18)
      companionPan[1] = (draw(19) < 0.5 ? -1.0 : 1.0) * (0.5 + 0.4 * draw(20))
      companionLevel[1] = creatureLevel * 0.4 / max(g.callLevel, 0.05)
      companionFar[1] = 0.92
    }
  }

  /// One-pole low-pass coefficient for a distance: the farther, the darker.
  private func farCoefficient(_ distance: Double) -> Double { 1.0 - exp(-Double.pi * 2 * (1_200.0 - 850.0 * distance) / rate) }

  /// Adds the gestures' far-off voices, echo and room to the call: sets the shaped call and the extras.
  private func shapeGestures(_ callLeft: Double, _ callRight: Double) {
    let g = gesture
    var left = callLeft
    var right = callRight
    var extraLeft = 0.0
    var extraRight = 0.0
    var roomIn = 0.0
    if g.callFar > 0 {
      // A far call is darker, quieter, and mostly reverb.
      let coefficient = farCoefficient(g.callFar)
      callFarLeft += (left - callFarLeft) * coefficient
      callFarRight += (right - callFarRight) * coefficient
      let gain = 1.0 - 0.7 * g.callFar
      left = callFarLeft * gain * (1.0 - 0.65 * g.callFar)
      right = callFarRight * gain * (1.0 - 0.65 * g.callFar)
      roomIn += (callFarLeft + callFarRight) * 0.5 * gain * 0.6 * g.callFar
    }
    for slot in 0..<2 {
      if !companionActive[slot] && companionCountdown[slot] > 0 {
        companionCountdown[slot] -= 1
        if companionCountdown[slot] <= 0 {
          companionActive[slot] = true
          companionAge[slot] = 0
          companionPhase[slot] = IdentityGestures.draw(seed: gestureSeed, salt: IdentityGestures.whaleSalt, index: gestureIndex, slot: 21 + slot) * Double.pi * 2
        }
      }
      if !companionActive[slot] { continue }
      let duration = companionDuration[slot]
      let progress = min(1, max(0, companionAge[slot] / duration))
      let attack = smooth(companionAge[slot] / max(1, rate * 2.4))
      let release = 1.0 - smooth((progress - 0.62) / 0.38)
      let bend = smooth(progress)
      let frequency = (companionStartHz[slot] + (companionEndHz[slot] - companionStartHz[slot]) * bend)
        * (1.0 + sin(progress * Double.pi * 9.0 + Double(slot)) * 0.006)
      let phase = companionPhase[slot]
      let voice = (sin(phase) + sin(phase * 2.0) * 0.23 + sin(phase * 3.0) * 0.07) * attack * release * companionLevel[slot]
      companionPhase[slot] = fmod(phase + Double.pi * 2 * frequency / rate, Double.pi * 2)
      companionAge[slot] += 1
      if companionAge[slot] >= duration { companionActive[slot] = false }
      let coefficient = farCoefficient(companionFar[slot])
      let gain = 1.0 - 0.7 * companionFar[slot]
      companionFarLeft[slot] += (voice * (1.0 - companionPan[slot]) * 0.68 - companionFarLeft[slot]) * coefficient
      companionFarRight[slot] += (voice * (1.0 + companionPan[slot]) * 0.68 - companionFarRight[slot]) * coefficient
      extraLeft += companionFarLeft[slot] * gain * (1.0 - 0.65 * companionFar[slot])
      extraRight += companionFarRight[slot] * gain * (1.0 - 0.65 * companionFar[slot])
      roomIn += (companionFarLeft[slot] + companionFarRight[slot]) * 0.5 * gain * 0.6 * companionFar[slot]
    }
    // The call calls back to itself, ping-ponging across the water, each time a little darker.
    let echoSize = callEchoLeft.count
    let echoLength = min(echoSize - 1, max(1, Int(rate * 4.6)))
    let echoAt = (callEchoIndex - echoLength + echoSize) % echoSize
    callEchoDampLeft += (callEchoLeft[echoAt] - callEchoDampLeft) * 0.3
    callEchoDampRight += (callEchoRight[echoAt] - callEchoDampRight) * 0.3
    callEchoLeft[callEchoIndex] = left * g.echoSend + callEchoDampRight * 0.62
    callEchoRight[callEchoIndex] = right * g.echoSend + callEchoDampLeft * 0.62
    callEchoIndex = (callEchoIndex + 1) % echoSize
    extraLeft += callEchoDampLeft * 0.9
    extraRight += callEchoDampRight * 0.9
    // Far voices sit in a room of their own.
    let roomSize = farRoom.count
    let tapLeft = farRoom[(farRoomIndex - min(roomSize - 1, max(1, Int(rate * 0.29))) + roomSize) % roomSize]
    let tapRight = farRoom[(farRoomIndex - min(roomSize - 1, max(1, Int(rate * 0.47))) + roomSize) % roomSize]
    let tapLong = farRoom[(farRoomIndex - min(roomSize - 1, max(1, Int(rate * 0.71))) + roomSize) % roomSize]
    farRoom[farRoomIndex] = roomIn + (tapLeft + tapRight) * 0.28
    farRoomIndex = (farRoomIndex + 1) % roomSize
    extraLeft += tapLeft * 0.8 + tapLong * 0.4
    extraRight += tapRight * 0.8 + tapLong * 0.4
    gestureExtraLeft = extraLeft
    gestureExtraRight = extraRight
    shapedLeft = left
    shapedRight = right
  }

  private func nextBubbleTrail(_ intensity: Double, salience: WorldSalienceScheduler) -> (left: Double, right: Double) {
    if !bubbleActive {
      bubbleCountdown -= 1
      if bubbleCountdown <= 0 {
        if salience.reserve(salience: 0.18, durationSeconds: 3.2, recoverySeconds: 1.5) {
          bubbleActive = true
          bubbleAge = 0
          bubbleDuration = rate * (2.1 + unit() * 1.1)
          bubblePhase = unit() * Double.pi * 2
          bubbleBaseHz = 310 + unit() * 210
          bubbleCount = 5 + Int(unit() * 4)
          bubblePanStart = (unit() * 2 - 1) * 0.58
          bubblePanEnd = (unit() * 2 - 1) * 0.42
          bubbleLevel = (0.026 + unit() * 0.014) * (0.8 + intensity * 0.2)
          bubbleCountdown = rate * (22 + unit() * 28)
        } else {
          bubbleCountdown = rate * (2 + unit() * 2)
        }
      }
    }
    guard bubbleActive, bubbleDuration > 0 else { return (0, 0) }
    let progress = min(1, max(0, bubbleAge / bubbleDuration))
    let position = progress * Double(bubbleCount)
    let pulsePosition = position - floor(position)
    let pulseEnvelope = pow(max(0, sin(Double.pi * pulsePosition)), 5) * (1 - smooth((progress - 0.82) / 0.18))
    let frequency = bubbleBaseHz * (1 + progress * 1.15)
    let tone = (sin(bubblePhase) + sin(bubblePhase * 1.97) * 0.28) * pulseEnvelope * bubbleLevel
    bubblePhase = fmod(bubblePhase + Double.pi * 2 * frequency / rate, Double.pi * 2)
    bubbleAge += 1
    if bubbleAge >= bubbleDuration { bubbleActive = false }
    let pan = bubblePanStart + (bubblePanEnd - bubblePanStart) * smooth(progress)
    return (tone * (1 - pan) * 0.62, tone * (1 + pan) * 0.62)
  }

  private func nextCondensation(_ intensity: Double, salience: WorldSalienceScheduler) -> (left: Double, right: Double) {
    if dropAge >= dropDuration {
      dropCountdown -= 1
      if dropCountdown <= 0 {
        if salience.reserve(salience: 0.22, durationSeconds: 1.4, recoverySeconds: 1.5) {
          dropAge = 0
          dropDuration = rate * (0.16 + unit() * 0.12)
          dropPhase = 0
          dropFrequency = 480 + unit() * 700
          dropPan = (unit() * 2 - 1) * 0.6
          dropLevel = (0.018 + unit() * 0.015) * (0.75 + intensity * 0.25)
          dropCountdown = rate * (8 + unit() * 12)
        } else {
          dropCountdown = rate * (2 + unit() * 2)
        }
      }
    }
    var dryLeft = 0.0
    var dryRight = 0.0
    if dropAge < dropDuration && dropDuration > 0 {
      let progress = dropAge / dropDuration
      let attack = smooth(dropAge / max(1, rate * 0.006))
      let decay = pow(1 - progress, 3)
      let frequency = dropFrequency * (1 - progress * 0.55)
      let tone = (sin(dropPhase) + sin(dropPhase * 2.07) * 0.2) * attack * decay * dropLevel
      dropPhase = fmod(dropPhase + Double.pi * 2 * frequency / rate, Double.pi * 2)
      dropAge += 1
      dryLeft = tone * (1 - dropPan) * 0.58
      dryRight = tone * (1 + dropPan) * 0.58
    }
    let size = dropDelay.count
    let near = dropDelay[(dropDelayIndex - min(size - 1, max(1, Int(rate * 0.23))) + size) % size]
    let far = dropDelay[(dropDelayIndex - min(size - 1, max(1, Int(rate * 0.57))) + size) % size]
    dropDelay[dropDelayIndex] = (dryLeft + dryRight) * 0.5 + (near * 0.38 + far * 0.24) * 0.42
    dropDelayIndex = (dropDelayIndex + 1) % size
    return (dryLeft + near * 0.26 + far * 0.16, dryRight + near * 0.17 + far * 0.24)
  }

  func render(sampleRate: Double, intensity: Double, elapsedSeconds: Double, salience: WorldSalienceScheduler, presence: Double, density: Double, variety: Double) {
    if rate != sampleRate { reset(seed: random, sampleRate: sampleRate) }
    let tau = Double.pi * 2
    let shared = white()
    pressureNoise += (shared - pressureNoise) * (0.00055 + intensity * 0.00035)
    hydroMid += (shared - hydroMid) * (0.004 + intensity * 0.002)
    hydroLeft += (white() - hydroLeft) * 0.0028
    hydroRight += (white() - hydroRight) * 0.0028

    let pressureBreath = 0.72 + 0.28 * (0.5 - 0.5 * cos(elapsedSeconds * tau / 27))
    let pressure = (sin(pressurePhase) * 0.17 + sin(pressureUpperPhase) * 0.055 + pressureNoise * 2.05)
      * pressureBreath * (0.82 + intensity * 0.28)
    pressurePhase = fmod(pressurePhase + tau * (39 + intensity * 4) / rate, tau)
    pressureUpperPhase = fmod(pressureUpperPhase + tau * (78 + intensity * 8) / rate, tau)

    let drift = sin(elapsedSeconds * tau / 41 + sin(elapsedSeconds / 23) * 0.5) * 0.28
    let currentPass = smooth(0.5 - 0.5 * cos(elapsedSeconds * tau / 33 + 1.1))
    let currentPan = sin(elapsedSeconds * tau / 24 + 0.7) * currentPass * 0.34
    let hydroBody = (hydroMid - pressureNoise * 0.6) * (0.55 + intensity * 0.4) * (0.84 + currentPass * 0.32)
    let waterLeft = (hydroBody + hydroLeft * (0.45 + currentPass * 0.2)) * (1 - drift - currentPan)
    let waterRight = (hydroBody + hydroRight * (0.45 + currentPass * 0.2)) * (1 + drift + currentPan)

    let flex = pow(0.5 - 0.5 * cos(elapsedSeconds * tau / 53), 2)
    var glassLeft = 0.0
    var glassRight = 0.0
    for index in glassPhases.indices {
      let value = sin(glassPhases[index]) * Self.glassWeights[index] * (0.38 + flex * 0.62)
      let spread = index % 2 == 0 ? -0.3 : 0.3
      glassLeft += value * (1 - spread)
      glassRight += value * (1 + spread)
      let bend = 1 + sin(elapsedSeconds / (17 + Double(index) * 4) + Double(index)) * 0.0015
      glassPhases[index] = fmod(glassPhases[index] + tau * Self.glassFrequencies[index] * bend / rate, tau)
    }

    let creature = nextCreature(intensity, salience: salience, presence: presence, density: density, variety: variety)
    let bubbles = nextBubbleTrail(intensity, salience: salience)
    let drop = nextCondensation(intensity, salience: salience)
    let roomLeft = chamberLeft[(chamberIndex - min(chamberLeft.count - 1, max(1, Int(rate * 0.37))) + chamberLeft.count) % chamberLeft.count]
    let roomRight = chamberRight[(chamberIndex - min(chamberRight.count - 1, max(1, Int(rate * 0.61))) + chamberRight.count) % chamberRight.count]
    let resonantLeft = waterLeft + glassLeft + creature.left + bubbles.left + drop.left
    let resonantRight = waterRight + glassRight + creature.right + bubbles.right + drop.right
    chamberLeft[chamberIndex] = resonantLeft + roomRight * 0.2
    chamberRight[chamberIndex] = resonantRight + roomLeft * 0.2
    chamberIndex = (chamberIndex + 1) % chamberLeft.count
    left = pressure + resonantLeft + roomLeft * 0.13
    right = pressure + resonantRight + roomRight * 0.13
  }
}
