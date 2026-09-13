import { normalizeProceduralAudioConfig } from './config';
import type {
  CompiledAudioJourneyTimeline,
  InnerAudioEngine,
  ProceduralAudioConfig,
  ProceduralAudioPatch,
} from './types';

export class ProceduralPlaybackSession {
  private startedAtMs: number | null = null;
  private accumulatedMs = 0;
  private playing = false;
  private config: ProceduralAudioConfig | null = null;

  constructor(
    private readonly engine: InnerAudioEngine,
    private readonly now: () => number = Date.now,
  ) {}

  isAvailable() { return this.engine.isAvailable(); }
  isPlaying() { return this.playing; }
  getConfig() { return this.config; }

  async start(config: ProceduralAudioConfig, title = 'Inner') {
    this.config = config;
    this.accumulatedMs = 0;
    await this.engine.configure(config);
    await this.engine.setNowPlaying(title);
    await this.play();
  }

  async startTimeline(
    initialConfig: ProceduralAudioConfig,
    timeline: CompiledAudioJourneyTimeline,
  ) {
    this.config = initialConfig;
    this.accumulatedMs = 0;
    await this.engine.configure(initialConfig);
    await this.engine.setTimeline(timeline);
    await this.engine.setNowPlaying(timeline.title);
    if (this.playing) this.startedAtMs = this.now();
    await this.play();
  }

  async clearTimeline() {
    await this.engine.setTimeline(null);
  }

  async play() {
    if (this.playing) return;
    await this.engine.play();
    this.startedAtMs = this.now();
    this.playing = true;
  }

  async pause() {
    if (!this.playing) return;
    this.captureElapsed();
    await this.engine.pause();
    this.playing = false;
  }

  async stop() {
    if (this.playing) this.captureElapsed();
    await this.engine.stop();
    this.playing = false;
    this.startedAtMs = null;
  }

  async setVolume(volume: number) {
    await this.update({ masterGain: volume });
  }

  async update(patch: ProceduralAudioPatch) {
    if (!this.config) return;
    const next = normalizeProceduralAudioConfig({ ...this.config, ...patch });
    this.config = next;
    await this.engine.update(next);
  }

  async setSleepTimer(endAtMs: number | null) {
    await this.engine.setSleepTimer(endAtMs);
  }

  async getLastTimerCompletionAtMs() {
    return this.engine.getLastTimerCompletionAtMs();
  }

  async reconcilePlaybackState() {
    const [nativeState, nativePositionMs] = await Promise.all([
      this.engine.getPlaybackState(),
      this.engine.getTimelinePositionMs(),
    ]);
    const nativePlaying = nativeState === 'playing';
    if (nativePositionMs !== null) {
      this.accumulatedMs = Math.max(0, nativePositionMs);
      this.startedAtMs = nativePlaying ? this.now() : null;
    } else {
      if (this.playing && !nativePlaying) this.captureElapsed();
      if (!this.playing && nativePlaying) this.startedAtMs = this.now();
    }
    this.playing = nativePlaying;
    return nativeState;
  }

  async drainDiagnosticEvents() {
    return this.engine.drainDiagnosticEvents();
  }

  async setRecognitionSignal(signalId: string | null, uri: string | null) {
    await this.engine.setRecognitionSignal(signalId, uri);
  }

  getPositionMs() {
    return this.accumulatedMs + (this.playing && this.startedAtMs !== null
      ? Math.max(0, this.now() - this.startedAtMs)
      : 0);
  }

  async seekToMs(positionMs: number) {
    this.accumulatedMs = Math.max(0, positionMs);
    if (this.playing) this.startedAtMs = this.now();
    await this.engine.seekTimeline(this.accumulatedMs);
  }

  private captureElapsed() {
    if (this.startedAtMs !== null) this.accumulatedMs += Math.max(0, this.now() - this.startedAtMs);
    this.startedAtMs = null;
  }
}
