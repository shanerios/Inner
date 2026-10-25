import {
  accrue,
  audibleWorlds,
  emptyUsage,
  exhaustedUsage,
  openSegment,
  parseUsage,
  PREVIEW_ALLOWANCE_MS,
  PREVIEW_CHECKPOINT_TICKS,
  PREVIEW_WORLDS,
  isPreviewWorld,
  remainingMs,
  selectedPreviewWorlds,
  sameWorlds,
  serializeUsage,
  stripDeniedWorlds,
  normalizedTarget,
  type PreviewMembership,
  type PreviewUsage,
  type PreviewWorld,
} from './premiumPreview';
import type { ProceduralAudioConfig, ProceduralAudioPatch } from './types';

/** The mixer's view of the engine. Only the session that owns the engine may be charged or faded. */
export type PreviewHost = {
  getConfig(): ProceduralAudioConfig | null;
  isPlaying(): boolean;
  ownsEngine(): boolean;
  update(patch: ProceduralAudioPatch): Promise<unknown>;
};

export type PreviewDeps = {
  readStored(): Promise<string | null>;
  writeStored(raw: string): Promise<void>;
  now(): number;
  setTimer(fn: () => void, ms: number): unknown;
  clearTimer(handle: unknown): void;
  /** Cached upstream; must never throw. Errors resolve to `unknown`. */
  membership(): Promise<PreviewMembership>;
};

export type PreviewReview = {
  /** The patch to apply. Denied worlds have been removed from it. */
  patch: ProceduralAudioPatch;
  denied: PreviewWorld[];
  /** Why a world was denied. Null when everything is allowed. */
  reason: 'exhausted' | 'verification_failed' | null;
};

export type PreviewSnapshot = {
  loaded: boolean;
  malformed: boolean;
  membership: PreviewMembership;
  remainingMs: Record<PreviewWorld, number>;
  usedMs: Record<PreviewWorld, number>;
  /** Worlds whose time is running right now. */
  charging: PreviewWorld[];
};

const CLOCK_MS = 1_000;
const MIN_TIMER_MS = 50;
/** Fade ramp beyond the engine's own ramp, so the layer is silent before it is switched off. */
const FADE_SETTLE_MS = 50;

type Listener = () => void;

export class PreviewService {
  private usage: PreviewUsage | null = null;
  private malformed = false;
  private loading: Promise<void> | null = null;
  private membership: PreviewMembership = 'unknown';
  /** Worlds the user explicitly selected in a mixer, and that are still audible. */
  private requested = new Set<PreviewWorld>();
  /** Worlds whose allowance has run out in the current audible run. */
  private expired = new Set<PreviewWorld>();
  private host: PreviewHost | null = null;
  private expiryHandle: unknown = null;
  private clockHandle: unknown = null;
  private ticks = 0;
  private listeners = new Set<Listener>();

  constructor(private readonly deps: PreviewDeps) {}

  /** Reads stored usage once. A restart mid-preview charges the time since the segment opened. */
  load(): Promise<void> {
    if (!this.loading) {
      this.loading = (async () => {
        let parsed: ReturnType<typeof parseUsage>;
        try {
          parsed = parseUsage(await this.deps.readStored());
        } catch {
          // Storage that cannot be read is treated like untrusted usage: no fresh allowance.
          parsed = { usage: exhaustedUsage(), malformed: true, hadOpenSegment: false };
        }
        this.malformed = parsed.malformed;
        const now = this.deps.now();
        this.usage = parsed.hadOpenSegment
          ? openSegment(accrue(parsed.usage, now), [], now)
          : parsed.usage;
        if (parsed.hadOpenSegment) this.persist();
        this.notify();
      })();
    }
    return this.loading;
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }

  snapshot(): PreviewSnapshot {
    const now = this.deps.now();
    const remaining = emptyRecord(PREVIEW_ALLOWANCE_MS);
    const used = emptyRecord(0);
    if (this.usage) {
      for (const world of PREVIEW_WORLDS) {
        remaining[world] = remainingMs(this.usage, world, now);
        used[world] = this.usage.usedMs[world];
      }
    }
    return {
      loaded: this.usage !== null,
      malformed: this.malformed,
      membership: this.membership,
      remainingMs: remaining,
      usedMs: used,
      charging: this.usage?.openWorlds ? [...this.usage.openWorlds] : [],
    };
  }

  /** Points the meter at the session that owns the mixer's engine. */
  attach(host: PreviewHost): void {
    if (this.host !== host) {
      this.clearExpiry();
      this.host = host;
      this.requested.clear();
      this.expired.clear();
    }
    if (this.clockHandle === null) this.scheduleClock();
    this.sync();
  }

  /** Stops the clock and forgets selections. Called when the mixer's session is torn down. */
  detach(host: PreviewHost): void {
    if (this.host !== host) return;
    this.host = null;
    this.requested.clear();
    this.expired.clear();
    this.clearExpiry();
    this.clearClock();
    this.sync();
  }

  /**
   * Decides whether a mixer change may begin audible premium worlds. Only
   * worlds the patch explicitly selects are checked. Members pass without
   * consuming time. Worlds already granted in this run pass without a check.
   */
  async review(host: PreviewHost, patch: ProceduralAudioPatch): Promise<PreviewReview> {
    this.attach(host);
    await this.load();
    const current = host.ownsEngine() ? host.getConfig() : null;
    const selected = selectedPreviewWorlds(current, patch);
    const needsDecision = selected.filter(world => !this.requested.has(world));
    if (needsDecision.length === 0) return { patch, denied: [], reason: null };

    const membership = await this.refreshMembership();
    if (membership === 'member') {
      for (const world of needsDecision) this.requested.add(world);
      return { patch, denied: [], reason: null };
    }

    const now = this.deps.now();
    const usage = this.usage ?? emptyUsage();
    const denied = needsDecision.filter(world => remainingMs(usage, world, now) <= 0);
    if (denied.length > 0) {
      return {
        patch: stripDeniedWorlds(patch, denied),
        denied,
        reason: membership === 'unknown' ? 'verification_failed' : 'exhausted',
      };
    }
    for (const world of needsDecision) this.requested.add(world);
    return { patch, denied: [], reason: null };
  }

  /** Reviews a whole starting config. Premium worlds in a restored config are explicit selections. */
  /**
   * Reviews a config about to start. Every premium world it contains is treated
   * as selected: a restored Live Mix config cannot bring a world back for free.
   */
  async reviewStart(host: PreviewHost, config: ProceduralAudioConfig): Promise<PreviewReview & { config: ProceduralAudioConfig }> {
    this.attach(host);
    await this.load();
    const starting = audibleWorlds(normalizedTarget(null, config));
    if (starting.length === 0) {
      return { patch: config, denied: [], reason: null, config: normalizedTarget(null, config) };
    }
    const membership = await this.refreshMembership();
    if (membership === 'member') {
      for (const world of starting) this.requested.add(world);
      return { patch: config, denied: [], reason: null, config: normalizedTarget(null, config) };
    }
    const now = this.deps.now();
    const usage = this.usage ?? emptyUsage();
    const denied = starting.filter(world => remainingMs(usage, world, now) <= 0);
    for (const world of starting) if (!denied.includes(world)) this.requested.add(world);
    const patch = stripDeniedWorlds(config, denied);
    return {
      patch,
      denied,
      reason: denied.length === 0 ? null : (membership === 'unknown' ? 'verification_failed' : 'exhausted'),
      config: normalizedTarget(null, patch),
    };
  }

  /** Brings charging and expiry up to date. Call after any change to audibility or playback. */
  sync(): void {
    if (!this.usage) return;
    const host = this.host;
    const owned = !!host && host.ownsEngine();
    const config = owned ? host!.getConfig() : null;
    const audible = audibleWorlds(config);
    const playing = owned && host!.isPlaying();
    // While the engine is starting, the config is not yet known. Keep the
    // selections then; they are only dropped once the engine is stopped or
    // its config shows the world has gone.
    const settled = !owned || config !== null;
    if (settled) {
      for (const world of [...this.requested]) if (!audible.includes(world)) this.requested.delete(world);
      for (const world of [...this.expired]) if (!audible.includes(world)) this.expired.delete(world);
    }
    if (this.membership === 'member') this.expired.clear();

    const now = this.deps.now();
    let usage = accrue(this.usage, now);
    const candidates = playing && this.membership !== 'member'
      ? audible.filter(world => this.requested.has(world) && !this.expired.has(world))
      : [];
    const exhausted = candidates.filter(world => usage.usedMs[world] >= PREVIEW_ALLOWANCE_MS);
    for (const world of exhausted) this.expired.add(world);
    const active = candidates.filter(world => !exhausted.includes(world));

    const changed = !sameWorlds(usage.openWorlds, active) || exhausted.length > 0;
    usage = openSegment(usage, active, now);
    this.usage = usage;
    if (changed) this.persist();

    this.clearExpiry();
    if (active.length > 0 && host) {
      const soonest = Math.min(...active.map(world => PREVIEW_ALLOWANCE_MS - usage.usedMs[world]));
      this.expiryHandle = this.deps.setTimer(() => this.sync(), Math.max(MIN_TIMER_MS, soonest));
    }
    if (exhausted.length > 0 && host) void this.fade(host, exhausted);
    this.notify();
  }

  /** Writes the open segment so a killed app is charged at most up to this point. */
  checkpoint(): void {
    this.sync();
    this.persist();
  }

  async refreshMembership(): Promise<PreviewMembership> {
    let next: PreviewMembership;
    try {
      next = await this.deps.membership();
    } catch {
      next = 'unknown';
    }
    if (next !== this.membership) {
      this.membership = next;
      if (next === 'member') this.expired.clear();
      this.sync();
    }
    return next;
  }

  private async fade(host: PreviewHost, worlds: PreviewWorld[]): Promise<void> {
    const first = host.getConfig();
    if (!first || !host.ownsEngine()) return;
    const ramp: ProceduralAudioPatch = {};
    if (isPreviewWorld(first.environment) && worlds.includes(first.environment)) ramp.environmentGain = 0;
    if (worlds.includes('temple') && first.templeGain > 0.001) ramp.templeGain = 0;
    if (Object.keys(ramp).length === 0) return;
    await host.update(ramp).catch(() => undefined);

    await new Promise<void>(resolve => { this.deps.setTimer(resolve, first.rampMs + FADE_SETTLE_MS); });

    // Re-check after the ramp. Another selection may have changed the layer meanwhile.
    const after = host.getConfig();
    if (!after || !host.ownsEngine()) return;
    if (isPreviewWorld(after.environment) && worlds.includes(after.environment) && after.environmentGain <= 0.001) {
      await host.update({ environment: 'none', environmentGain: 0 }).catch(() => undefined);
    }
    this.sync();
  }

  private scheduleClock(): void {
    this.clockHandle = this.deps.setTimer(() => this.clockTick(), CLOCK_MS);
  }

  private clockTick(): void {
    this.clockHandle = null;
    if (!this.host) return;
    this.ticks += 1;
    if (this.ticks % PREVIEW_CHECKPOINT_TICKS === 0) {
      void this.refreshMembership();
      this.persist();
    }
    this.sync();
    this.scheduleClock();
  }

  private clearClock(): void {
    if (this.clockHandle !== null) this.deps.clearTimer(this.clockHandle);
    this.clockHandle = null;
  }

  private clearExpiry(): void {
    if (this.expiryHandle !== null) this.deps.clearTimer(this.expiryHandle);
    this.expiryHandle = null;
  }

  private persist(): void {
    if (!this.usage || this.malformed) return;
    try {
      void this.deps.writeStored(serializeUsage(this.usage)).catch(() => undefined);
    } catch {
      // Best effort. Open segments are recovered from the last successful write.
    }
  }

  private notify(): void {
    for (const listener of this.listeners) listener();
  }
}

function emptyRecord(value: number): Record<PreviewWorld, number> {
  return { temple: value, abyssal: value, cosmic: value, fire: value };
}
