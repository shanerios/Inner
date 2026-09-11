import { requireOptionalNativeModule } from 'expo';
import { DEFAULT_PROCEDURAL_AUDIO_CONFIG, normalizeProceduralAudioConfig } from './config';
import type {
  AudioEngineListener,
  AudioEngineSnapshot,
  CompiledAudioJourneyTimeline,
  InnerAudioEngine,
  ProceduralAudioConfig,
  ProceduralAudioPatch,
  NativeAudioDiagnosticEvent,
} from './types';

type NativeInnerAudio = {
  isAvailable(): boolean;
  configure(config: ProceduralAudioConfig): Promise<void>;
  setTimeline(timeline: CompiledAudioJourneyTimeline | null): Promise<void>;
  seekTimeline(positionMs: number): Promise<void>;
  setNowPlaying(title: string): Promise<void>;
  setSleepTimer(endAtMs: number | null): Promise<void>;
  getLastTimerCompletionAtMs(): number | null;
  drainDiagnosticEvents(): NativeAudioDiagnosticEvent[];
  triggerCue(): Promise<void>;
  play(): Promise<void>;
  pause(): Promise<void>;
  stop(): Promise<void>;
};

const nativeModule = requireOptionalNativeModule<NativeInnerAudio>('InnerAudio');

class NativeProceduralAudioEngine implements InnerAudioEngine {
  readonly kind = 'procedural' as const;
  private listeners = new Set<AudioEngineListener>();
  private snapshot: AudioEngineSnapshot = {
    state: 'idle',
    config: DEFAULT_PROCEDURAL_AUDIO_CONFIG,
  };

  isAvailable() {
    try { return nativeModule?.isAvailable() === true; } catch { return false; }
  }

  getSnapshot() { return this.snapshot; }

  async configure(config: ProceduralAudioConfig) {
    const module = this.getNativeModule();
    const normalized = normalizeProceduralAudioConfig(config);
    await module.configure(normalized);
    this.setSnapshot({ ...this.snapshot, config: normalized, error: undefined });
  }

  async update(patch: ProceduralAudioPatch) {
    await this.configure({ ...this.snapshot.config, ...patch });
  }

  async setTimeline(timeline: CompiledAudioJourneyTimeline | null) {
    await this.getNativeModule().setTimeline(timeline);
  }

  async seekTimeline(positionMs: number) {
    await this.getNativeModule().seekTimeline(positionMs);
  }

  async setNowPlaying(title: string) {
    await this.getNativeModule().setNowPlaying(title);
  }

  async setSleepTimer(endAtMs: number | null) {
    await this.getNativeModule().setSleepTimer(endAtMs);
  }

  async getLastTimerCompletionAtMs() {
    return this.getNativeModule().getLastTimerCompletionAtMs();
  }

  async drainDiagnosticEvents() {
    return this.getNativeModule().drainDiagnosticEvents();
  }

  async triggerCue() {
    await this.getNativeModule().triggerCue();
  }

  async play() {
    const module = this.getNativeModule();
    this.setState('starting');
    try {
      await module.play();
      this.setState('playing');
    } catch (error) {
      this.setError(error);
      throw error;
    }
  }

  async pause() {
    const module = this.getNativeModule();
    await module.pause();
    this.setState('paused');
  }

  async stop() {
    if (!this.isAvailable()) return;
    this.setState('stopping');
    await this.getNativeModule().stop();
    this.setState('idle');
  }

  subscribe(listener: AudioEngineListener) {
    this.listeners.add(listener);
    listener(this.snapshot);
    return () => this.listeners.delete(listener);
  }

  private getNativeModule(): NativeInnerAudio {
    if (!this.isAvailable()) throw new Error('Inner procedural audio is unavailable in this build');
    return nativeModule!;
  }

  private setState(state: AudioEngineSnapshot['state']) {
    this.setSnapshot({ ...this.snapshot, state, error: undefined });
  }

  private setError(error: unknown) {
    this.setSnapshot({
      ...this.snapshot,
      state: 'error',
      error: error instanceof Error ? error.message : String(error),
    });
  }

  private setSnapshot(snapshot: AudioEngineSnapshot) {
    this.snapshot = snapshot;
    this.listeners.forEach(listener => listener(snapshot));
  }
}

export const proceduralAudioEngine: InnerAudioEngine = new NativeProceduralAudioEngine();
