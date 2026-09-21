export type NoiseColor = 'white' | 'pink' | 'brown' | 'grey';
export type ProceduralEnvironment = 'none' | 'ocean' | 'wind' | 'fire' | 'cosmic' | 'forest' | 'temple' | 'abyssal';
export type SpatialMovementMode = 'still' | 'drift' | 'pendulum' | 'swoosh' | 'rain' | 'orbit' | 'vortex' | 'channelTest';
export type SpatialMovementTarget = 'noise' | 'tone' | 'both';
export type AudioSessionEndPolicy = 'fadeAndStop' | 'protocolControlled' | 'userControlled';

export type AudioSwooshEvent = {
  id: string;
  atMs: number;
  type: 'swoosh';
  direction: 'left' | 'right';
  durationMs: number;
  depth: number;
};

/** Fires the fixed lucidity cue at a scheduled point within a stage. */
export type AudioCueEvent = {
  id: string;
  atMs: number;
  type: 'cue';
  /** Opens a quieter native sound field around overnight recognition signals. */
  recognitionSpace?: boolean;
};

export type AudioSpatialEvent = AudioSwooshEvent | AudioCueEvent;

export type ProceduralAudioConfig = {
  carrierHz: number;
  binauralCarrierHz: number;
  binauralDeltaHz: number;
  toneGain: number;
  harmonicWarmth: number;
  binauralGain: number;
  noiseColor: NoiseColor | null;
  noiseGain: number;
  environment: ProceduralEnvironment;
  environmentGain: number;
  environmentIntensity: number;
  /** 0 outside the overnight arc; 1 from completed descent through protected sleep. */
  thresholdShift: number;
  /**
   * Level of the world's identity sound: the Aum (temple), whale call (abyssal) and Cosmic voice (cosmic).
   * 1 is the world's own level; other worlds ignore it. See identityArc.ts for how the overnight arc sets it.
   */
  identityPresence: number;
  /** How often the identity sound speaks, 1 = every occasion, 0.5 = about every other one. */
  identityDensity: number;
  /** How much each appearance differs from the last (level, pitch, ear to ear, distance, echo): 0 = identical every time. */
  identityVariety: number;
  /** Rolls the noise bed off above this frequency in Hz (12 dB per octave). 20000 leaves it untouched. */
  noiseHighCutHz: number;
  /** How different the noise is in the two ears: 0 = the same noise in both, 1 = independent noise in each. */
  noiseWidth: number;
  /** How far, in dB, each ear's bed swells either side of its average on its own irregular schedule, so the bed drifts from side to side. 0 = still. */
  noiseDriftDb: number;
  /** A typical length, in seconds, of one of those swells. */
  noiseDriftSeconds: number;
  /** How far, in dB, the binaural layer's level falls from the top of a slow breath to the bottom of it. 0 = it holds still. */
  binauralBreathDb: number;
  /** The lengths, in seconds, of the inhale (the level rising) and the exhale (it easing back). */
  binauralBreathInSeconds: number;
  binauralBreathOutSeconds: number;
  /** How much each breath differs from the last: 0 = exactly the same, 0.15 = each up to 15% longer or shorter. */
  binauralBreathVariation: number;
  /** Adds quiet upper harmonics that imply a lower environmental fundamental. */
  harmonicTranslation: number;
  templeGain: number;
  templeIntensity: number;
  masterGain: number;
  rampMs: number;
  spatialMode: SpatialMovementMode;
  spatialTarget: SpatialMovementTarget;
  spatialDepth: number;
  spatialRate: number;
};

export type ProceduralAudioPatch = Partial<ProceduralAudioConfig>;

export type AudioJourneyStage = {
  id: string;
  label: string;
  durationMs: number;
  transitionMs?: number;
  target: ProceduralAudioPatch;
  spatialEvents?: AudioSpatialEvent[];
};

export type AudioJourneyGuidanceCue = {
  id: string;
  atMs: number;
  heading: string;
  prompt: string;
};

export type AudioJourneyTimeline = {
  id: string;
  title: string;
  /** Replays the same procedural micro-variation across devices. */
  seed?: number;
  loop?: boolean;
  fadeInMs?: number;
  /** Describes who owns the endpoint; finite journeys default to fadeAndStop. */
  endPolicy?: Exclude<AudioSessionEndPolicy, 'userControlled'>;
  /** Increment when authored protocol behavior changes in a material way. */
  protocolVersion?: number;
  stages: AudioJourneyStage[];
  guidance?: AudioJourneyGuidanceCue[];
};

export type CompiledAudioJourneyStage = {
  id: string;
  label: string;
  durationMs: number;
  transitionMs: number;
  config: ProceduralAudioConfig;
  spatialEvents: AudioSpatialEvent[];
};

export type CompiledAudioJourneyTimeline = {
  id: string;
  title: string;
  seed: number;
  loop: boolean;
  fadeInMs: number;
  endPolicy: Exclude<AudioSessionEndPolicy, 'userControlled'>;
  protocolVersion: number;
  totalDurationMs: number;
  stages: CompiledAudioJourneyStage[];
};

export type AudioEngineState =
  | 'idle'
  | 'starting'
  | 'playing'
  | 'paused'
  | 'stopping'
  | 'error';

export type AudioEngineSnapshot = {
  state: AudioEngineState;
  config: ProceduralAudioConfig;
  error?: string;
};

export type AudioEngineListener = (snapshot: AudioEngineSnapshot) => void;
export type NativePlaybackState = 'playing' | 'paused' | 'stopped';

export type NativeAudioDiagnosticEvent = {
  type: 'playback_resumed' | 'playback_paused' | 'playback_stopped' | 'audio_route_changed' | 'interruption_began' | 'interruption_ended' | 'recognition_signal_fired' | 'sleep_timer_fired' | 'audio_underrun' | 'error';
  atMs: number;
  reason?: string;
  /** Short machine-readable context. Never user content. */
  detail?: string;
  route?: string;
  signalId?: string;
  scheduledPositionMs?: number;
  actualPositionMs?: number;
  driftMs?: number;
  underrunCount?: number;
};

/**
 * A point-in-time read of the native engine, for explaining a session that
 * looks alive to JavaScript but is not rendering. Numbers and flags only.
 */
export type NativeEngineDebugState = {
  playbackState: NativePlaybackState;
  /** Android: whether the foreground service exists. iOS: whether AVAudioEngine is running. */
  engineRunning: boolean;
  timelineLoaded: boolean;
  timelinePositionMs?: number;
  /** The armed sleep-timer end, if any. A value in the past at session start is the stale-timer signature. */
  sleepEndMs?: number;
  /** Frames the render callback has produced since the last stop. Zero while "playing" means no audio is being rendered. */
  renderedFrames: number;
  sampleRate: number;
  privateOutput?: boolean;
  lastStopReason?: string;
};

/**
 * A durable checkpoint the native side persisted to disk (Android only, so
 * far -- see `journeyMemory.ts` for why iOS's background-audio model doesn't
 * carry the same process-death risk). Present only when a prior session's
 * clean stop/finish never ran.
 */
export type NativeCheckpoint = {
  sessionId: string;
  positionMs: number;
  lastUpdatedAt: number;
  firedSignalIds: string[];
  plannedSignalCount?: number;
  /** Diagnostics the native ring buffer hadn't handed to JS yet at last write -- see `peekDiagnosticEvents` on Android. */
  pendingDiagnostics: NativeAudioDiagnosticEvent[];
};

export interface InnerAudioEngine {
  readonly kind: 'procedural';
  isAvailable(): boolean;
  getSnapshot(): AudioEngineSnapshot;
  configure(config: ProceduralAudioConfig): Promise<void>;
  update(patch: ProceduralAudioPatch): Promise<void>;
  setTimeline(timeline: CompiledAudioJourneyTimeline | null): Promise<void>;
  seekTimeline(positionMs: number): Promise<void>;
  setNowPlaying(title: string): Promise<void>;
  setSleepTimer(endAtMs: number | null): Promise<void>;
  getLastTimerCompletionAtMs(): Promise<number | null>;
  getPlaybackState(): Promise<NativePlaybackState>;
  getTimelinePositionMs(): Promise<number | null>;
  drainDiagnosticEvents(): Promise<NativeAudioDiagnosticEvent[]>;
  /** Null when the native build predates the debug-state call. */
  getDebugState?(): Promise<NativeEngineDebugState | null>;
  /** `gain` is a linear level trim for the signal (1 = unchanged). */
  setRecognitionSignal(signalId: string | null, uri: string | null, gain?: number): Promise<void>;
  triggerCue(): Promise<void>;
  /** No-op where the native side has no checkpoint concept (iOS). */
  setCheckpointSessionId(sessionId: string | null): Promise<void>;
  /** Always null where the native side has no checkpoint concept (iOS). */
  getCheckpoint(): Promise<NativeCheckpoint | null>;
  /** Call once a checkpoint has been reconciled into a real outcome. No-op on iOS. */
  clearCheckpoint(): Promise<void>;
  play(): Promise<void>;
  pause(): Promise<void>;
  stop(): Promise<void>;
  subscribe(listener: AudioEngineListener): () => void;
}
