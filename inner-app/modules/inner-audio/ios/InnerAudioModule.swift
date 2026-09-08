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
  private let engine = AVAudioEngine()
  private let lock = NSLock()
  private var parameters = Parameters()
  private var timeline: AudioTimeline?
  private var timelineElapsedFrames = 0.0
  private var timelineGeneration: UInt64 = 0
  private var renderedTimelineGeneration: UInt64 = .max
  private var source: AVAudioSourceNode?
  private var sampleRate = 48_000.0
  private var phases = [Double](repeating: 0, count: 5)
  private var gains = [Double](repeating: 0, count: 4)
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
  private var oceanRandom: UInt64 = 0x9e3779b97f4a7c15 ^ 0x51ed2705
  private var oceanLow = 0.0
  private var oceanMid = 0.0
  private var oceanFoamLeft = 0.0
  private var oceanFoamRight = 0.0
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
  private var caveEnvelope = 0.0
  private var caveRandom: UInt64 = 0x9e3779b97f4a7c15 ^ 0x8f1bbcdc
  private var caveRumble = 0.0
  private var caveDripFramesRemaining = 0.0
  private var caveDripPhase = 0.0
  private var caveDripFreq = 0.0
  private var caveDripAmp = 0.0
  private var caveDripPan = 0.0
  private var caveDripEnvelope = 0.0
  private var caveDripDecay = 0.0
  private var caveDelay = [Double](repeating: 0, count: 48_000)
  private var caveDelayIndex = 0
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
  private var orbitMix = 0.0
  private var orbitNoiseFilter = 0.0
  private var renderedPan = 0.0
  private var renderedSpatialRoom = 1.0
  private var renderedSpatialDistance = 1.0
  private var renderElapsedFrames = 0.0
  private var nowPlayingTitle = "Inner"
  private var desiredPlaying = false
  private var sleepStopScheduled = false
  private var remoteTargets: [(MPRemoteCommand, Any)] = []
  private var nowPlayingRefreshTimer: DispatchSourceTimer?
  private var isSystemInterrupted = false

  override init() {
    super.init()
    NotificationCenter.default.addObserver(
      self,
      selector: #selector(handleInterruption(_:)),
      name: AVAudioSession.interruptionNotification,
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

  func play() throws {
    desiredPlaying = true
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
    let hardwareFormat = engine.outputNode.inputFormat(forBus: 0)
    sampleRate = hardwareFormat.sampleRate > 0 ? hardwareFormat.sampleRate : 48_000
    if source == nil { installSource(channelCount: max(2, hardwareFormat.channelCount)) }
    engine.prepare()
    do {
      try engine.start()
    } catch {
      throw stageError("engine.start", error)
    }
    installRemoteCommandsIfNeeded()
    updateNowPlaying(rate: 1)
    startNowPlayingRefresh()
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
    engine.pause()
    updateNowPlaying(rate: 0)
  }

  func stop() {
    desiredPlaying = false
    isSystemInterrupted = false
    stopNowPlayingRefresh()
    engine.stop()
    if let source { engine.detach(source); self.source = nil }
    phases = [Double](repeating: 0, count: 5)
    gains = [Double](repeating: 0, count: 4)
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
    oceanRandom = 0x9e3779b97f4a7c15 ^ 0x51ed2705
    oceanLow = 0
    oceanMid = 0
    oceanFoamLeft = 0
    oceanFoamRight = 0
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
    caveEnvelope = 0
    caveRandom = 0x9e3779b97f4a7c15 ^ 0x8f1bbcdc
    caveRumble = 0
    caveDripFramesRemaining = 0
    caveDripPhase = 0
    caveDripFreq = 0
    caveDripAmp = 0
    caveDripPan = 0
    caveDripEnvelope = 0
    caveDripDecay = 0
    caveDelay = [Double](repeating: 0, count: 48_000)
    caveDelayIndex = 0
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
    sleepStopScheduled = false
    lock.unlock()
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
    lock.unlock()
    if let activeTimeline, renderedTimelineGeneration != generation {
      random = activeTimeline.seed
      oceanRandom = activeTimeline.seed ^ 0x51ed2705
      windRandom = activeTimeline.seed ^ 0x7f4a7c15
      fireRandom = activeTimeline.seed ^ 0x2c1b3c6d
      caveRandom = activeTimeline.seed ^ 0x8f1bbcdc
      templeRandom = activeTimeline.seed ^ 0x9c2f5a31
      rainPockets = (0..<5).map { RainPocket(random: activeTimeline.seed &+ UInt64($0 + 1) * 0x100000001b3) }
      pink = [Double](repeating: 0, count: 7)
      brown = 0
      greyLow = 0
      caveDelay.withUnsafeMutableBufferPointer { buffer in
        buffer.baseAddress?.update(repeating: 0, count: buffer.count)
      }
      caveDelayIndex = 0
      caveDripFramesRemaining = 0
      caveDripEnvelope = 0
      forestRandom = activeTimeline.seed ^ 0xc2b2ae35
      forestBirdActive = false
      forestBirdFramesRemaining = 0
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
      let caveTarget = target.environment == "cave" && target.environmentGain > 0.0001 ? 1.0 : 0.0
      let caveStep = 1 / max(1, sampleRate * 4.5)
      caveEnvelope += clamp(caveTarget - caveEnvelope, -caveStep, caveStep)
      let forestTarget = target.environment == "forest" && target.environmentGain > 0.0001 ? 1.0 : 0.0
      let forestStep = 1 / max(1, sampleRate * 4.5)
      forestEnvelope += clamp(forestTarget - forestEnvelope, -forestStep, forestStep)
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
      let cave = caveEnvelope > 0.0001
        ? nextCave(elapsedSeconds: spatialSeconds, intensity: target.environmentIntensity)
        : (left: 0.0, right: 0.0)
      let caveGain = target.environmentGain * caveEnvelope
      let forest = forestEnvelope > 0.0001
        ? nextForest(elapsedSeconds: spatialSeconds, intensity: target.environmentIntensity)
        : (left: 0.0, right: 0.0)
      let forestGain = target.environmentGain * forestEnvelope
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
      let leftMix = (leftCarrier + sin(phases[1]) * gains[1] * spatialRoom + leftNoise + ocean.left * oceanGain + wind.left * windGain + fire.left * fireGain + cave.left * caveGain + forest.left * forestGain + temple.left * templeLevel + cue.left) * gains[3] * journeyFade * sleepGain * 0.32
      let rightMix = (rightCarrier + sin(phases[2]) * gains[1] * spatialRoom + rightNoise + ocean.right * oceanGain + wind.right * windGain + fire.right * fireGain + cave.right * caveGain + forest.right * forestGain + temple.right * templeLevel + cue.right) * gains[3] * journeyFade * sleepGain * 0.32
      left[frame] = Float(softLimit(leftMix))
      right[frame] = Float(softLimit(rightMix))
      phases[0] = fmod(phases[0] + tau * target.carrierHz / sampleRate, tau)
      phases[1] = fmod(phases[1] + tau * leftHz / sampleRate, tau)
      phases[2] = fmod(phases[2] + tau * rightHz / sampleRate, tau)
      phases[3] = fmod(phases[3] + tau * target.carrierHz * 2 / sampleRate, tau)
      phases[4] = fmod(phases[4] + tau * target.carrierHz * 1.5 / sampleRate, tau)
    }

    if activeTimeline != nil {
      lock.lock()
      if generation == timelineGeneration { timelineElapsedFrames += Double(frameCount) }
      lock.unlock()
    }
    renderElapsedFrames += Double(frameCount)

    if let endMs = baseTarget.sleepEndMs, bufferStartMs >= endMs, !sleepStopScheduled {
      sleepStopScheduled = true
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
    cueActive = true
    cueElapsedFrames = 0
    cueTotalFrames = sampleRate * Self.cueTotalSeconds
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
    let shared = nextOceanWhite()
    oceanLow += 0.005 * (shared - oceanLow)
    oceanMid += 0.024 * (shared - oceanMid)
    let slowWave = clamp(
      0.5 + 0.32 * sin(elapsedSeconds * Double.pi * 2 / 9.7)
        + 0.18 * sin(elapsedSeconds * Double.pi * 2 / 13.9 + 1.8),
      0,
      1
    )
    let crest = slowWave * slowWave * (3 - 2 * slowWave)
    let leftWhite = nextOceanWhite()
    let rightWhite = nextOceanWhite()
    oceanFoamLeft += 0.075 * (leftWhite - oceanFoamLeft)
    oceanFoamRight += 0.075 * (rightWhite - oceanFoamRight)
    let undertow = (oceanLow * 2.7 + oceanMid * 0.8) * (0.45 + slowWave * 0.55)
    let foamLevel = 0.08 + intensity * 0.08 + crest * (0.34 + intensity * 0.48)
    let leftFoam = (leftWhite - oceanFoamLeft * 0.65) * foamLevel
    let rightFoam = (rightWhite - oceanFoamRight * 0.65) * foamLevel
    let sway = sin(elapsedSeconds * Double.pi * 2 / 17) * 0.12
    return (undertow + leftFoam * (1 - sway), undertow + rightFoam * (1 + sway))
  }

  private func nextOceanWhite() -> Double {
    oceanRandom ^= oceanRandom << 13; oceanRandom ^= oceanRandom >> 7; oceanRandom ^= oceanRandom << 17
    return Double(oceanRandom & 0x00ff_ffff) / Double(0x007f_ffff) - 1
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

  private static let caveDelaySeconds = 0.3
  private static let caveFeedback = 0.42
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

  // A deep, heavily smoothed noise floor stands in for a cavern's vast air mass,
  // while sparse seeded water drips feed a feedback delay line — the same "echo
  // of itself, decaying" structure a real hollow space produces — so the drips
  // trail off into the rumble instead of ending abruptly.
  private func nextCave(elapsedSeconds: Double, intensity: Double) -> (left: Double, right: Double) {
    let shared = nextCaveWhite()
    caveRumble += 0.0025 * (shared - caveRumble)
    let breathe = 0.6 + 0.4 * sin(elapsedSeconds * Double.pi * 2 / 26.0 + 0.9 * sin(elapsedSeconds * Double.pi * 2 / 41.0))
    let rumbleBody = caveRumble * (2.6 + intensity * 2.2) * breathe

    if caveDripFramesRemaining <= 0 {
      let gapSeconds = (8.5 - intensity * 6.0) * (0.4 + abs(nextCaveWhite()) * 1.3)
      caveDripFramesRemaining = sampleRate * max(0.9, gapSeconds)
      caveDripFreq = 620 + abs(nextCaveWhite()) * 780
      caveDripAmp = 0.4 + abs(nextCaveWhite()) * 0.5
      caveDripPan = clamp(nextCaveWhite() * 0.7, -0.7, 0.7)
      caveDripPhase = 0
      caveDripEnvelope = 1
      caveDripDecay = exp(-1.0 / (sampleRate * (0.16 + abs(nextCaveWhite()) * 0.16)))
    }
    caveDripFramesRemaining -= 1
    let dripMono = sin(caveDripPhase) * caveDripEnvelope * caveDripAmp * (0.5 + intensity * 0.6)
    caveDripEnvelope *= caveDripDecay
    caveDripFreq *= 0.99992
    caveDripPhase = fmod(caveDripPhase + Double.pi * 2 * caveDripFreq / sampleRate, Double.pi * 2)

    let delayFrames = min(caveDelay.count - 1, max(1, Int(Self.caveDelaySeconds * sampleRate)))
    let readIndex = (caveDelayIndex - delayFrames + caveDelay.count) % caveDelay.count
    let delayed = caveDelay[readIndex]
    caveDelay[caveDelayIndex] = dripMono + delayed * Self.caveFeedback
    caveDelayIndex = (caveDelayIndex + 1) % caveDelay.count

    // Rotating the echo tail's pan (independently of the drip's own fixed
    // position) reads as reflections arriving from many directions at once.
    let echoPan = sin(elapsedSeconds * Double.pi * 2 / 6.7) * 0.55
    let dripLeft = dripMono * (1 - caveDripPan)
    let dripRight = dripMono * (1 + caveDripPan)
    let echoLeft = delayed * (1 - echoPan) * 0.6
    let echoRight = delayed * (1 + echoPan) * 0.6

    return (rumbleBody + dripLeft * 0.55 + echoLeft, rumbleBody + dripRight * 0.55 + echoRight)
  }

  private func nextCaveWhite() -> Double {
    caveRandom ^= caveRandom << 13; caveRandom ^= caveRandom >> 7; caveRandom ^= caveRandom << 17
    return Double(caveRandom & 0x00ff_ffff) / Double(0x007f_ffff) - 1
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
      environment: ["ocean", "wind", "fire", "cave", "forest"].contains(raw.environment) ? raw.environment : "none",
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
      engine.pause()
      updateNowPlaying(rate: 0)
      return
    }
    isSystemInterrupted = false
    let optionsRaw = notification.userInfo?[AVAudioSessionInterruptionOptionKey] as? UInt ?? 0
    let options = AVAudioSession.InterruptionOptions(rawValue: optionsRaw)
    if desiredPlaying && options.contains(.shouldResume) { try? play() }
  }
}
