import { normalizeProceduralAudioConfig } from './config';
import type {
  CompiledAudioJourneyTimeline,
  InnerAudioEngine,
  NativeEngineDebugState,
  NativePlaybackState,
  ProceduralAudioConfig,
  ProceduralAudioPatch,
} from './types';

/**
 * The native engine is a process-wide singleton, but sessions are created per
 * screen. Without coordination a screen that is leaving can stop, reconfigure
 * or re-arm a timer on an engine that a newer screen has already started.
 * Every engine therefore has one lifecycle: operations run strictly in order,
 * and only the session that currently owns the engine may change it.
 */
type EngineLifecycle = {
  chain: Promise<unknown>;
  owner: ProceduralPlaybackSession | null;
};

const lifecycles = new WeakMap<InnerAudioEngine, EngineLifecycle>();

function lifecycleFor(engine: InnerAudioEngine): EngineLifecycle {
  let lifecycle = lifecycles.get(engine);
  if (!lifecycle) {
    lifecycle = { chain: Promise.resolve(), owner: null };
    lifecycles.set(engine, lifecycle);
  }
  return lifecycle;
}

export type StartHealth = {
  healthy: boolean;
  nativeState: NativePlaybackState;
  nativePositionMs: number | null;
};

/** How far the native timeline must advance before a start counts as audible. */
const MIN_HEALTHY_POSITION_MS = 250;

export class ProceduralPlaybackSession {
  private startedAtMs: number | null = null;
  private accumulatedMs = 0;
  private playing = false;
  private config: ProceduralAudioConfig | null = null;
  private readonly lifecycle: EngineLifecycle;

  constructor(
    private readonly engine: InnerAudioEngine,
    private readonly now: () => number = Date.now,
  ) {
    this.lifecycle = lifecycleFor(engine);
  }

  isAvailable() { return this.engine.isAvailable(); }
  isPlaying() { return this.playing; }
  getConfig() { return this.config; }

  /** True while this session, and no other, is the one driving the native engine. */
  ownsEngine() { return this.lifecycle.owner === this; }

  /**
   * Takes the engine and leaves it stopped and clean. Idempotent for the
   * current owner. Called implicitly by start/startTimeline; call it earlier
   * when native state (a recognition signal, a checkpoint id) must be written
   * before playback begins.
   */
  async acquire() {
    await this.exclusive(() => this.claimEngine());
  }

  async start(config: ProceduralAudioConfig, title = 'Inner') {
    await this.exclusive(async () => {
      await this.claimEngine();
      this.config = config;
      this.accumulatedMs = 0;
      await this.engine.configure(config);
      await this.engine.setNowPlaying(title);
      await this.playOwned();
    });
  }

  async startTimeline(
    initialConfig: ProceduralAudioConfig,
    timeline: CompiledAudioJourneyTimeline,
  ) {
    await this.exclusive(async () => {
      await this.claimEngine();
      this.config = initialConfig;
      this.accumulatedMs = 0;
      await this.engine.configure(initialConfig);
      await this.engine.setTimeline(timeline);
      await this.engine.setNowPlaying(timeline.title);
      if (this.playing) this.startedAtMs = this.now();
      await this.playOwned();
    });
  }

  async clearTimeline() {
    await this.exclusive(async () => {
      if (!this.ownsEngine()) return;
      await this.engine.setTimeline(null);
    });
  }

  async play() {
    await this.exclusive(async () => {
      this.assertOwner();
      await this.playOwned();
    });
  }

  async pause() {
    await this.exclusive(async () => {
      if (!this.ownsEngine() || !this.playing) return;
      this.captureElapsed();
      await this.engine.pause();
      this.playing = false;
    });
  }

  async stop() {
    await this.exclusive(async () => {
      if (!this.ownsEngine()) {
        // Displaced or never started: the engine now belongs to someone else
        // (or to no one), so there is nothing here to stop.
        this.markDisplaced();
        return;
      }
      if (this.playing) this.captureElapsed();
      try {
        await this.engine.stop();
      } finally {
        this.playing = false;
        this.startedAtMs = null;
        this.lifecycle.owner = null;
      }
    });
  }

  async setVolume(volume: number) {
    await this.update({ masterGain: volume });
  }

  async update(patch: ProceduralAudioPatch) {
    await this.exclusive(async () => {
      if (!this.config || !this.ownsEngine()) return;
      const next = normalizeProceduralAudioConfig({ ...this.config, ...patch });
      this.config = next;
      await this.engine.update(next);
    });
  }

  async setSleepTimer(endAtMs: number | null) {
    await this.exclusive(async () => {
      // A timer armed by a session that has since ended would outlive it.
      if (!this.ownsEngine()) return;
      await this.engine.setSleepTimer(endAtMs);
    });
  }

  async getLastTimerCompletionAtMs() {
    return this.engine.getLastTimerCompletionAtMs();
  }

  async setCheckpointSessionId(sessionId: string | null) {
    await this.exclusive(async () => {
      if (!this.ownsEngine()) return;
      await this.engine.setCheckpointSessionId(sessionId);
    });
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

  /**
   * Whether playback has genuinely begun. `engine.play()` resolving proves
   * only that a start was requested, not that audio is being rendered, so the
   * evidence is progress: a timeline that has advanced (even if the user has
   * paused since), or, with no timeline, an engine that reports playing.
   */
  async checkStartHealth(): Promise<StartHealth> {
    const [nativeState, nativePositionMs] = await Promise.all([
      this.engine.getPlaybackState(),
      this.engine.getTimelinePositionMs(),
    ]);
    const healthy = nativePositionMs === null
      ? nativeState === 'playing'
      : nativePositionMs >= MIN_HEALTHY_POSITION_MS;
    return { healthy, nativeState, nativePositionMs };
  }

  async getDebugState(): Promise<NativeEngineDebugState | null> {
    return this.engine.getDebugState ? this.engine.getDebugState() : null;
  }

  async drainDiagnosticEvents() {
    return this.engine.drainDiagnosticEvents();
  }

  async setRecognitionSignal(signalId: string | null, uri: string | null) {
    await this.exclusive(async () => {
      this.assertOwner();
      await this.engine.setRecognitionSignal(signalId, uri);
    });
  }

  getPositionMs() {
    return this.accumulatedMs + (this.playing && this.startedAtMs !== null
      ? Math.max(0, this.now() - this.startedAtMs)
      : 0);
  }

  async seekToMs(positionMs: number) {
    this.accumulatedMs = Math.max(0, positionMs);
    if (this.playing) this.startedAtMs = this.now();
    await this.exclusive(async () => {
      if (!this.ownsEngine()) return;
      await this.engine.seekTimeline(this.accumulatedMs);
    });
  }

  private exclusive<T>(task: () => Promise<T>): Promise<T> {
    const run = this.lifecycle.chain.then(task);
    this.lifecycle.chain = run.then(() => undefined, () => undefined);
    return run;
  }

  private async claimEngine() {
    const lifecycle = this.lifecycle;
    if (lifecycle.owner === this) return;
    lifecycle.owner?.markDisplaced();
    lifecycle.owner = this;
    this.accumulatedMs = 0;
    this.startedAtMs = null;
    this.playing = false;
    try {
      // Whatever ran before -- including a session from a previous JS
      // context -- may have left the native engine running or holding an
      // armed sleep timer. Every session begins from a stopped engine.
      await this.engine.stop();
    } catch (error) {
      lifecycle.owner = null;
      throw error;
    }
  }

  private async playOwned() {
    if (this.playing) return;
    await this.engine.play();
    this.startedAtMs = this.now();
    this.playing = true;
  }

  private assertOwner() {
    if (!this.ownsEngine()) throw new Error('This playback session is no longer active.');
  }

  private markDisplaced() {
    this.playing = false;
    this.startedAtMs = null;
  }

  private captureElapsed() {
    if (this.startedAtMs !== null) this.accumulatedMs += Math.max(0, this.now() - this.startedAtMs);
    this.startedAtMs = null;
  }
}
