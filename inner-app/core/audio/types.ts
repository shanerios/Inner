export type NoiseColor = 'white' | 'pink' | 'brown' | 'grey';
export type ProceduralEnvironment = 'none' | 'ocean' | 'wind' | 'fire' | 'cosmic' | 'forest';
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
  type: 'playback_resumed' | 'playback_paused' | 'audio_route_changed' | 'interruption_began' | 'interruption_ended' | 'recognition_signal_fired' | 'audio_underrun' | 'error';
  atMs: number;
  reason?: string;
  route?: string;
  signalId?: string;
  scheduledPositionMs?: number;
  actualPositionMs?: number;
  driftMs?: number;
  underrunCount?: number;
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
  setRecognitionSignal(signalId: string | null, uri: string | null): Promise<void>;
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
