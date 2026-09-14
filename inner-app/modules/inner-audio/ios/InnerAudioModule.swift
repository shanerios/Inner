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
    Function("drainDiagnosticEvents") { self.engine.drainDiagnosticEvents() }
    AsyncFunction("setRecognitionSignal") { (signalId: String?, uri: String?) in try self.engine.setRecognitionSignal(signalId, uri) }
    AsyncFunction("triggerCue") { self.engine.triggerCue() }
    AsyncFunction("play") { try self.engine.play() }
    AsyncFunction("pause") { self.engine.pause() }
    AsyncFunction("stop") { self.engine.stop() }
    OnDestroy { self.engine.stop() }
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
  private var cosmicEnvelope = 0.0
  private let cosmicModel = CosmicModel()
  private var forestEnvelope = 0.0
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
  private var templeSpaceChantPhases = [Double](repeating: 0, count: 3)
  private static let templeSpaceChantFreqs = [104.0, 108.0, 111.5]
  private static let templeSpaceChantWeights = [0.34, 0.28, 0.23]
  private var templeSpaceFormantIc1 = [Double](repeating: 0, count: 4)
  private var templeSpaceFormantIc2 = [Double](repeating: 0, count: 4)
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
  private var activeCueSamples: [Float] = []
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
          return CueEvent(atMs: event.atMs)
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
      throw stageError("setCategory", error)
    }
    do {
      try session.setActive(true)
    } catch {
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

  func stop() {
    desiredPlaying = false
    pauseReason = nil
    resumeFadeGeneration &+= 1
    isSystemInterrupted = false
    stopNowPlayingRefresh()
    engine.stop()
    if let source { engine.detach(source); self.source = nil }
    phases = [Double](repeating: 0, count: 7)
    gains = [Double](repeating: 0, count: 4)
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
    cosmicEnvelope = 0
    cosmicModel.reset(seed: 0x9e3779b97f4a7c15, sampleRate: sampleRate)
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
    templeSpaceEnvelope = 0
    templeSpaceRandom = 0x9e3779b97f4a7c15 ^ 0x6a09e667
    templeSpaceAirLeft = 0
    templeSpaceAirRight = 0
    templeSpaceBreathLowLeft = 0
    templeSpaceBreathLowRight = 0
    templeSpaceBreathMidLeft = 0
    templeSpaceBreathMidRight = 0
    templeSpacePhases = [Double](repeating: 0, count: 3)
    templeSpaceChantPhases = [Double](repeating: 0, count: 3)
    templeSpaceFormantIc1 = [Double](repeating: 0, count: 4)
    templeSpaceFormantIc2 = [Double](repeating: 0, count: 4)
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

  func setRecognitionSignal(_ signalId: String?, _ uri: String?) throws {
    guard let uri, !uri.isEmpty else {
      lock.lock()
      recognitionSignalSamples = []
      recognitionSignalSampleRate = 0
      recognitionSignalId = signalId
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
      windRandom = activeTimeline.seed ^ 0x7f4a7c15
      fireRandom = activeTimeline.seed ^ 0x2c1b3c6d
      cosmicModel.reset(seed: activeTimeline.seed, sampleRate: sampleRate)
      templeRandom = activeTimeline.seed ^ 0x9c2f5a31
      rainPockets = (0..<5).map { RainPocket(random: activeTimeline.seed &+ UInt64($0 + 1) * 0x100000001b3) }
      pink = [Double](repeating: 0, count: 7)
      brown = 0
      greyLow = 0
      forestRandom = activeTimeline.seed ^ 0xc2b2ae35
      forestBirdActive = false
      forestBirdFramesRemaining = 0
      templeSpaceRandom = activeTimeline.seed ^ 0x6a09e667
      templeSpaceAirLeft = 0
      templeSpaceAirRight = 0
      templeSpaceBreathLowLeft = 0
      templeSpaceBreathLowRight = 0
      templeSpaceBreathMidLeft = 0
      templeSpaceBreathMidRight = 0
      templeSpacePhases = [Double](repeating: 0, count: 3)
      templeSpaceChantPhases = [Double](repeating: 0, count: 3)
      templeSpaceFormantIc1 = [Double](repeating: 0, count: 4)
      templeSpaceFormantIc2 = [Double](repeating: 0, count: 4)
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
        ? nextOcean(elapsedSeconds: spatialSeconds, intensity: target.environmentIntensity)
        : (left: 0.0, right: 0.0)
      let oceanGain = target.environmentGain * oceanEnvelope
      let wind = windEnvelope > 0.0001
        ? nextWind(elapsedSeconds: spatialSeconds, intensity: target.environmentIntensity)
        : (left: 0.0, right: 0.0)
      let windGain = target.environmentGain * windEnvelope
      let fire = fireEnvelope > 0.0001
        ? nextFire(elapsedSeconds: spatialSeconds, intensity: target.environmentIntensity)
        : (left: 0.0, right: 0.0)
      let fireGain = target.environmentGain * fireEnvelope
      let cosmic = cosmicEnvelope > 0.0001
        ? nextCosmic(elapsedSeconds: spatialSeconds, intensity: target.environmentIntensity)
        : (left: 0.0, right: 0.0)
      let cosmicGain = target.environmentGain * cosmicEnvelope
      let forest = forestEnvelope > 0.0001
        ? nextForest(elapsedSeconds: spatialSeconds, intensity: target.environmentIntensity)
        : (left: 0.0, right: 0.0)
      let forestGain = target.environmentGain * forestEnvelope
      let templeSpace = templeSpaceEnvelope > 0.0001
        ? nextTempleSpace(elapsedSeconds: spatialSeconds, intensity: target.environmentIntensity)
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
      let leftMix = (leftCarrier + leftEntrainment + leftNoise + ocean.left * oceanGain + wind.left * windGain + fire.left * fireGain + cosmic.left * cosmicGain + forest.left * forestGain + templeSpace.left * templeSpaceGain + temple.left * templeLevel + cue.left) * gains[3] * journeyFade * sleepGain * 0.32
      let rightMix = (rightCarrier + rightEntrainment + rightNoise + ocean.right * oceanGain + wind.right * windGain + fire.right * fireGain + cosmic.right * cosmicGain + forest.right * forestGain + templeSpace.right * templeSpaceGain + temple.right * templeLevel + cue.right) * gains[3] * journeyFade * sleepGain * 0.32
      left[frame] = Float(softLimit(leftMix))
      right[frame] = Float(softLimit(rightMix))
      phases[0] = fmod(phases[0] + tau * target.carrierHz / sampleRate, tau)
      phases[1] = fmod(phases[1] + tau * leftHz / sampleRate, tau)
      phases[2] = fmod(phases[2] + tau * rightHz / sampleRate, tau)
      phases[3] = fmod(phases[3] + tau * target.carrierHz * 2 / sampleRate, tau)
      phases[4] = fmod(phases[4] + tau * target.carrierHz * 1.5 / sampleRate, tau)
      phases[5] = fmod(phases[5] + tau * target.binauralCarrierHz / sampleRate, tau)
      phases[6] = fmod(phases[6] + tau * target.deltaHz / sampleRate, tau)
    }

    if activeTimeline != nil {
      lock.lock()
      if generation == timelineGeneration { timelineElapsedFrames += Double(frameCount) }
      lock.unlock()
    }
    renderElapsedFrames += Double(frameCount)

    if let endMs = baseTarget.sleepEndMs, bufferStartMs >= endMs, !sleepStopScheduled {
      lock.lock()
      sleepStopScheduled = true
      lastTimerCompletionAtMs = Date().timeIntervalSince1970 * 1_000
      lock.unlock()
      DispatchQueue.main.async { [weak self] in self?.stop() }
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

  private func startCue() {
    lock.lock()
    activeCueSamples = recognitionSignalSamples
    activeCueSampleRate = recognitionSignalSampleRate
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

  private func nextOcean(elapsedSeconds: Double, intensity: Double) -> (left: Double, right: Double) {
    oceanModel.render(sampleRate: sampleRate, intensity: intensity)
    return (oceanModel.left, oceanModel.right)
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

  private func nextFire(elapsedSeconds: Double, intensity: Double) -> (left: Double, right: Double) {
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
    return (warmBody + dryCrackle + firePopLeft, warmBody + dryCrackle + firePopRight)
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

  private func nextCosmic(elapsedSeconds: Double, intensity: Double) -> (left: Double, right: Double) {
    cosmicModel.render(sampleRate: sampleRate, intensity: intensity)
    return (cosmicModel.left, cosmicModel.right)
  }

  // A canopy rustle bed (smoothed noise breathing on a light breeze cycle, plus a
  // crisper high-passed leaf shimmer) carries the space, while seeded bird calls —
  // frequency-sweeping tone bursts rather than noise transients, the way an actual
  // chirp reads as pitched motion instead of a click — punctuate it at random.
  private func nextForest(elapsedSeconds: Double, intensity: Double) -> (left: Double, right: Double) {
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
      if forestBirdFramesRemaining <= 0 {
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
      birdMono = sin(forestBirdPhase) * envelope * forestBirdAmp * (0.5 + intensity * 0.7)
      forestBirdFramesRemaining -= 1
      if forestBirdFramesRemaining <= 0 {
        forestBirdActive = false
        let gapSeconds = (7.0 - intensity * 4.5) * (0.4 + abs(nextForestWhite()) * 1.4)
        forestBirdFramesRemaining = sampleRate * max(0.6, gapSeconds)
      }
    }
    let birdLeft = birdMono * (1 - forestBirdPan)
    let birdRight = birdMono * (1 + forestBirdPan)

    // The rustle bed is itself broadband noise, so it stacks directly with the
    // separate white/pink/brown/grey layer instead of sitting alongside it —
    // keep it as a quiet texture underneath the birds rather than a competing
    // noise floor.
    return (
      (canopyBody + leftLeaf) * Self.forestNoiseMix + birdLeft,
      (canopyBody + rightLeaf) * Self.forestNoiseMix + birdRight
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
      return (sample * 1.45, sample * 1.45)
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
    return ((mid + side) * Self.cueOutputGain, (mid - side) * Self.cueOutputGain)
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
  private func nextTempleSpace(elapsedSeconds: Double, intensity: Double) -> (left: Double, right: Double) {
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

    // Three imperfect virtual voices move from an open "O" spectrum toward a
    // closed nasal hum. The sound stays distant because its dry level is low and
    // most of it reaches the listener through the room taps below.
    let chantTime = fmod(elapsedSeconds + 26.0, 31.0)
    let chantEnvelope: Double
    if chantTime >= 9.0 {
      chantEnvelope = 0
    } else if chantTime < 2.2 {
      chantEnvelope = 0.5 - 0.5 * cos(Double.pi * chantTime / 2.2)
    } else if chantTime > 6.0 {
      chantEnvelope = 0.5 + 0.5 * cos(Double.pi * (chantTime - 6.0) / 3.0)
    } else {
      chantEnvelope = 1
    }
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
    for index in 0..<3 {
      let phase = templeSpaceChantPhases[index]
      // A compact band-limited glottal source: richer than a sine but without
      // the high-frequency aliasing of a naive sawtooth.
      let glottal = sin(phase) + sin(phase * 2) * 0.42 + sin(phase * 3) * 0.18 + sin(phase * 4) * 0.08
      let shimmer = 0.96 + 0.04 * sin(elapsedSeconds * tau * (5.1 + Double(index) * 0.47) + Double(index))
      let voice = glottal * Self.templeSpaceChantWeights[index] * shimmer
      sourceLeft += voice * (index == 2 ? 0.62 : 1)
      sourceRight += voice * (index == 0 ? 0.62 : 1)
      sub += sin(phase) * Self.templeSpaceChantWeights[index]
      let jitter = 1.0 + 0.0014 * sin(elapsedSeconds * tau * (6.0 + Double(index) * 0.31) + Double(index) * 1.7)
      templeSpaceChantPhases[index] = fmod(phase + tau * Self.templeSpaceChantFreqs[index] * jitter / sampleRate, tau)
    }
    let chantLeft = templeSpaceBandpass(sourceLeft, index: 0, frequency: formant1, q: 6.5) * 1.65
      + templeSpaceBandpass(sourceLeft, index: 1, frequency: formant2, q: 7.5) * 1.25 * formant2Presence
      + sub * 0.08
    let chantRight = templeSpaceBandpass(sourceRight, index: 2, frequency: formant1 * 0.992, q: 6.5) * 1.65
      + templeSpaceBandpass(sourceRight, index: 3, frequency: formant2 * 1.008, q: 7.5) * 1.25 * formant2Presence
      + sub * 0.08
    let chantLevel = chantEnvelope * (0.18 + intensity * 0.12)
    let drop = nextTempleSpaceDrop(intensity: intensity)
    let dropEchoSize = templeSpaceDropEcho.count
    let dropEchoLeftA = templeSpaceDropEcho[(templeSpaceDropEchoIndex - min(dropEchoSize - 1, max(1, Int(sampleRate * 0.27))) + dropEchoSize) % dropEchoSize]
    let dropEchoRightA = templeSpaceDropEcho[(templeSpaceDropEchoIndex - min(dropEchoSize - 1, max(1, Int(sampleRate * 0.41))) + dropEchoSize) % dropEchoSize]
    let dropEchoTail = templeSpaceDropEcho[(templeSpaceDropEchoIndex - min(dropEchoSize - 1, max(1, Int(sampleRate * 0.63))) + dropEchoSize) % dropEchoSize]
    templeSpaceDropEcho[templeSpaceDropEchoIndex] = (drop.left + drop.right) * 0.42 + (dropEchoLeftA + dropEchoRightA) * 0.14
    templeSpaceDropEchoIndex = (templeSpaceDropEchoIndex + 1) % dropEchoSize
    let dropEchoLeft = dropEchoLeftA * 0.48 + dropEchoTail * 0.18
    let dropEchoRight = dropEchoRightA * 0.44 + dropEchoTail * 0.20
    templeAccents.render(sampleRate: sampleRate, intensity: intensity, elapsedSeconds: elapsedSeconds)
    let dryLeft = body + templeSpaceAirLeft * (0.22 + intensity * 0.12) + breathLeft * 0.7 + chantLeft * chantLevel + drop.left + dropEchoLeft + templeAccents.left
    let dryRight = body + templeSpaceAirRight * (0.22 + intensity * 0.12) + breathRight * 0.7 + chantRight * chantLevel + drop.right + dropEchoRight + templeAccents.right
    let size = templeSpaceDelay.count
    let tap71 = templeSpaceDelay[(templeSpaceDelayIndex - min(size - 1, max(1, Int(sampleRate * 0.071))) + size) % size]
    let tap89 = templeSpaceDelay[(templeSpaceDelayIndex - min(size - 1, max(1, Int(sampleRate * 0.089))) + size) % size]
    let tap113 = templeSpaceDelay[(templeSpaceDelayIndex - min(size - 1, max(1, Int(sampleRate * 0.113))) + size) % size]
    let tap137 = templeSpaceDelay[(templeSpaceDelayIndex - min(size - 1, max(1, Int(sampleRate * 0.137))) + size) % size]
    let wetLeft = tap71 * 0.58 + tap137 * 0.34
    let wetRight = tap89 * 0.56 + tap113 * 0.36
    templeSpaceDelay[templeSpaceDelayIndex] = (dryLeft + dryRight) * 0.5 + (wetLeft + wetRight) * 0.45
    templeSpaceDelayIndex = (templeSpaceDelayIndex + 1) % size
    return (dryLeft * 0.42 + wetLeft * 0.62, dryRight * 0.42 + wetRight * 0.62)
  }

  private func nextTempleSpaceWhite() -> Double {
    templeSpaceRandom ^= templeSpaceRandom << 13; templeSpaceRandom ^= templeSpaceRandom >> 7; templeSpaceRandom ^= templeSpaceRandom << 17
    return Double(templeSpaceRandom & 0x00ff_ffff) / Double(0x007f_ffff) - 1
  }

  /// Topology-preserving state-variable bandpass; stable while formants move.
  private func templeSpaceBandpass(_ input: Double, index: Int, frequency: Double, q: Double) -> Double {
    let g = tan(Double.pi * frequency / sampleRate)
    let k = 1 / q
    let v1 = (templeSpaceFormantIc1[index] + g * (input - templeSpaceFormantIc2[index])) / (1 + g * (g + k))
    let v2 = templeSpaceFormantIc2[index] + g * v1
    templeSpaceFormantIc1[index] = 2 * v1 - templeSpaceFormantIc1[index]
    templeSpaceFormantIc2[index] = 2 * v2 - templeSpaceFormantIc2[index]
    return v1
  }

  private func nextTempleSpaceDrop(intensity: Double) -> (left: Double, right: Double) {
    if templeSpaceDropFramesRemaining <= 0 {
      templeSpaceNextDropFrames -= 1
      if templeSpaceNextDropFrames <= 0 {
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
      environment: raw.environment == "cave" ? "cosmic" : (["ocean", "wind", "fire", "cosmic", "forest", "temple"].contains(raw.environment) ? raw.environment : "none"),
      environmentGain: clamp(raw.environmentGain, 0, 1),
      environmentIntensity: clamp(raw.environmentIntensity, 0, 1),
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
        let progress = stage.transitionMs > 0 ? min(1, localMs / stage.transitionMs) : 1
        var result = interpolate(previous, stage.parameters, progress)
        result.sleepEndMs = base.sleepEndMs
        return result
      }
      cursor = end
    }
    var result = last.parameters
    result.sleepEndMs = base.sleepEndMs
    return result
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

  func render(sampleRate: Double, intensity: Double, elapsedSeconds: Double) {
    if rate != sampleRate { reset(seed: random, sampleRate: sampleRate) }
    nextBowl -= 1
    if nextBowl <= 0 {
      excite(slot: 0, bowl: true)
      nextBowl = rate * (28 + unit() * 24)
    }
    nextCluster -= 1
    let gust = sin(elapsedSeconds * Double.pi * 2 / 19.3)
    if pendingChimes == 0 && nextCluster <= 0 && gust > -0.25 {
      pendingChimes = unit() > 0.45 ? 3 : 2
      nextChime = 0
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

/// Probabilistic surf model with a fixed micro-water voice pool.
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
  private var bubbleLeft = 0.0
  private var bubbleRight = 0.0

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
    bubbleCursor = 0; bubbleCountdown = 0; bubbleBurstRemaining = 0
    bubbleLeft = 0; bubbleRight = 0; left = 0; right = 0
  }

  private func unit() -> Double {
    random ^= random << 13; random ^= random >> 7; random ^= random << 17
    return Double(random & 0x00ff_ffff) / Double(0x00ff_ffff)
  }

  private func white() -> Double { unit() * 2 - 1 }

  private func enter(_ next: Int, intensity: Double) {
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
      bubbleBurstRemaining = 3 + Int(unit() * (4 + intensity * 4))
      bubbleCountdown = rate * (0.08 + unit() * 0.18)
    case 4:
      phaseDuration = rate * (3 + unit() * 3.5)
      bubbleBurstRemaining += 2 + Int(unit() * 4)
    default:
      phaseDuration = rate * (4 + unit() * 5)
    }
  }

  private func advance(intensity: Double) {
    if phaseAge >= phaseDuration { enter(phase == 5 ? 0 : phase + 1, intensity: intensity) }
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

  func render(sampleRate: Double, intensity: Double) {
    if rate != sampleRate { reset(seed: random, sampleRate: sampleRate) }
    advance(intensity: intensity)
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
    left = undertow * (1 - renderedPan * 0.12) + brightLeft * (0.72 + renderedWidth * 0.35) * (1 - renderedPan * 0.3) + bubbleLeft
    right = undertow * (1 + renderedPan * 0.12) + brightRight * (0.72 + renderedWidth * 0.35) * (1 + renderedPan * 0.3) + bubbleRight
    phaseAge += 1
  }
}

/// Liminal harmonic environment with no fixed-period environmental motion.
final class CosmicModel {
  private static let phi = 1.61803398875
  private static let fieldRatios = [1.0, 1.41421356237, phi, 2.61803398875]
  private static let fieldWeights = [0.07, 0.035, 0.027, 0.016]
  private static let horizonRatios = [1.0, phi, phi * phi]
  private static let horizonWeights = [0.058, 0.021, 0.009]
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

  private func renderBlooms(_ intensity: Double) {
    if (1...4).contains(state) {
      bloomCountdown -= 1
      if bloomCountdown <= 0 {
        exciteBloom(intensity)
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
    delay[delayIndex] = mono + (near * 0.34 + far * 0.24) * 0.28
    delayIndex = (delayIndex + 1) % delay.count
    left += bloomLeft + near * (0.26 - motion * 0.08) + far * (0.17 + motion * 0.07)
    right += bloomRight + near * (0.26 + motion * 0.08) + far * (0.17 - motion * 0.07)
  }

  func render(sampleRate: Double, intensity: Double) {
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
    left = voidBody + gravity + horizonLeft + fieldLeft + airLeft * airLevel * (1 - motion * width * 0.16)
    right = voidBody + gravity + horizonRight + fieldRight + airRight * airLevel * (1 + motion * width * 0.16)
    renderBlooms(intensity)
    stateAge += 1
  }
}
