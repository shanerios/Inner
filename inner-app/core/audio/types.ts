export type NoiseColor = 'white' | 'pink' | 'brown' | 'grey';
export type ProceduralEnvironment = 'none' | 'ocean' | 'wind' | 'fire' | 'cosmic' | 'forest';
export type SpatialMovementMode = 'still' | 'drift' | 'pendulum' | 'swoosh' | 'rain' | 'orbit' | 'vortex' | 'channelTest';
export type SpatialMovementTarget = 'noise' | 'tone' | 'both';

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
  triggerCue(): Promise<void>;
  play(): Promise<void>;
  pause(): Promise<void>;
  stop(): Promise<void>;
  subscribe(listener: AudioEngineListener): () => void;
}
