import { beforeEach, describe, expect, it } from '@jest/globals';
import { DEFAULT_PROCEDURAL_AUDIO_CONFIG, normalizeProceduralAudioConfig } from '../config';
import {
  audibleWorlds,
  exhaustedUsage,
  parseUsage,
  PREVIEW_ALLOWANCE_MS,
  PREVIEW_STORAGE_KEY,
  remainingMs,
  selectedPreviewWorlds,
  stripDeniedWorlds,
  type PreviewMembership,
  type PreviewWorld,
} from '../premiumPreview';
import { PreviewService, type PreviewHost, type PreviewDeps } from '../premiumPreviewService';
import type { ProceduralAudioConfig, ProceduralAudioPatch } from '../types';

const MIN = 60_000;

type Harness = ReturnType<typeof createHarness>;

function createHarness(options: { membership?: PreviewMembership; stored?: string | null } = {}) {
  const clock = { t: 1_700_000_000_000 };
  const timers = new Map<number, { at: number; fn: () => void }>();
  let nextTimer = 1;
  const storage = { value: options.stored ?? null };
  const membership = { value: options.membership ?? 'not_member' as PreviewMembership, calls: 0 };

  const deps: PreviewDeps = {
    readStored: async () => storage.value,
    writeStored: async value => { storage.value = value; },
    now: () => clock.t,
    setTimer: (fn, ms) => {
      const id = nextTimer++;
      timers.set(id, { at: clock.t + ms, fn });
      return id;
    },
    clearTimer: handle => { timers.delete(handle as number); },
    membership: async () => { membership.calls += 1; return membership.value; },
  };
  const service = new PreviewService(deps);

  const settle = async () => { for (let i = 0; i < 25; i += 1) await Promise.resolve(); };

  /** Advances the fake clock, firing due timers in order and letting async fades settle. */
  const advance = async (ms: number) => {
    const target = clock.t + ms;
    for (;;) {
      await settle();
      let next: [number, { at: number; fn: () => void }] | undefined;
      for (const entry of timers) {
        if (entry[1].at <= target && (!next || entry[1].at < next[1].at)) next = entry;
      }
      if (!next) break;
      timers.delete(next[0]);
      clock.t = Math.max(clock.t, next[1].at);
      next[1].fn();
    }
    clock.t = target;
    await settle();
  };

  const makeHost = (initial: Partial<ProceduralAudioConfig> = {}) => {
    const state = {
      config: normalizeProceduralAudioConfig({ ...DEFAULT_PROCEDURAL_AUDIO_CONFIG, ...initial }),
      playing: false,
      owned: true,
      updates: [] as ProceduralAudioPatch[],
    };
    const host: PreviewHost = {
      getConfig: () => state.config,
      isPlaying: () => state.playing,
      ownsEngine: () => state.owned,
      update: async patch => {
        state.updates.push(patch);
        state.config = normalizeProceduralAudioConfig({ ...state.config, ...patch });
      },
    };
    return { host, state };
  };

  /** What a screen does when the user picks a world: review, apply, then sync. */
  const select = async (host: PreviewHost, patch: ProceduralAudioPatch) => {
    const review = await service.review(host, patch);
    await host.update(review.patch);
    service.sync();
    return review;
  };

  return { clock, timers, storage, membership, service, deps, advance, settle, makeHost, select };
}

async function loaded(h: Harness) {
  await h.service.load();
  return h;
}

describe('premium preview usage model', () => {
  it('grants a full allowance when nothing has been stored', () => {
    const parsed = parseUsage(null);
    expect(parsed.malformed).toBe(false);
    expect(remainingMs(parsed.usage, 'cosmic', 0)).toBe(PREVIEW_ALLOWANCE_MS);
  });

  it('treats unreadable stored usage as exhausted rather than resetting it', () => {
    const parsed = parseUsage('{not json');
    expect(parsed.malformed).toBe(true);
    expect(remainingMs(parsed.usage, 'fire', 0)).toBe(0);
    expect(remainingMs(exhaustedUsage(), 'temple', 0)).toBe(0);
  });

  it('rejects structurally wrong stored usage', () => {
    expect(parseUsage(JSON.stringify({ schemaVersion: 2 })).malformed).toBe(true);
    expect(parseUsage(JSON.stringify({ schemaVersion: 1, usedMs: { cosmic: -5 } })).malformed).toBe(true);
  });

  it('identifies premium worlds from audible layers only', () => {
    const base = normalizeProceduralAudioConfig({ ...DEFAULT_PROCEDURAL_AUDIO_CONFIG });
    expect(audibleWorlds({ ...base, environment: 'ocean', environmentGain: 0.8 })).toEqual([]);
    expect(audibleWorlds({ ...base, environment: 'cosmic', environmentGain: 0 })).toEqual([]);
    expect(audibleWorlds({ ...base, environment: 'cosmic', environmentGain: 0.5 })).toEqual(['cosmic']);
    expect(audibleWorlds({ ...base, environment: 'none', templeGain: 0.4 })).toEqual(['temple']);
  });

  it('does not treat slider moves on a world as a selection of that world', () => {
    const base = normalizeProceduralAudioConfig({ ...DEFAULT_PROCEDURAL_AUDIO_CONFIG, environment: 'cosmic', environmentGain: 0.5 });
    expect(selectedPreviewWorlds(base, { environmentGain: 0.9 })).toEqual([]);
    expect(selectedPreviewWorlds(base, { environment: 'cosmic' })).toEqual(['cosmic']);
  });

  it('removes only the denied world from a patch', () => {
    const patch = stripDeniedWorlds({ environment: 'cosmic', environmentGain: 0.6, toneGain: 0.2 }, ['cosmic']);
    expect(patch).toEqual({ environment: 'none', environmentGain: 0, toneGain: 0.2 });
  });
});

describe('shared allowance across both mixers', () => {
  let h: Harness;
  beforeEach(async () => { h = await loaded(createHarness()); });

  it('charges one allowance to Live Mix and the chamber mixer together', async () => {
    const live = h.makeHost();
    live.state.playing = true;
    await h.select(live.host, { environment: 'cosmic', environmentGain: 0.6 });
    await h.advance(2 * MIN);
    live.state.owned = false;
    h.service.detach(live.host);

    const chamber = h.makeHost({ toneGain: 0.2 });
    chamber.state.playing = true;
    chamber.state.owned = true;
    h.service.attach(chamber.host);
    expect(h.service.snapshot().remainingMs.cosmic).toBe(3 * MIN);

    await h.select(chamber.host, { environment: 'cosmic', environmentGain: 0.6 });
    await h.advance(3 * MIN + 1_000);
    expect(chamber.state.config.environment).toBe('none');
    expect(chamber.state.config.environmentGain).toBe(0);
  });

  it('does not reset usage when switching screens or environments', async () => {
    const host = h.makeHost();
    host.state.playing = true;
    await h.select(host.host, { environment: 'fire', environmentGain: 0.5 });
    await h.advance(MIN);
    await h.select(host.host, { environment: 'ocean', environmentGain: 0.5 });
    await h.advance(MIN);
    await h.select(host.host, { environment: 'fire', environmentGain: 0.5 });
    expect(h.service.snapshot().remainingMs.fire).toBe(4 * MIN);
  });
});

describe('pause, switching, and persistence', () => {
  it('counts only audible, playing time', async () => {
    const h = await loaded(createHarness());
    const host = h.makeHost();
    host.state.playing = false;
    await h.select(host.host, { environment: 'cosmic', environmentGain: 0.6 });
    await h.advance(MIN);
    expect(h.service.snapshot().remainingMs.cosmic).toBe(PREVIEW_ALLOWANCE_MS);

    host.state.playing = true;
    h.service.sync();
    await h.advance(MIN);
    expect(h.service.snapshot().remainingMs.cosmic).toBe(4 * MIN);

    host.state.playing = false;
    h.service.sync();
    await h.advance(5 * MIN);
    expect(h.service.snapshot().remainingMs.cosmic).toBe(4 * MIN);
  });

  it('keeps remaining time across a restart and never grants a fresh allowance', async () => {
    const h = await loaded(createHarness());
    const host = h.makeHost();
    host.state.playing = true;
    await h.select(host.host, { environment: 'cosmic', environmentGain: 0.6 });
    await h.advance(2 * MIN);

    // Simulate the app being killed mid-preview: a new service reads the stored record.
    const restarted = new PreviewService(h.deps);
    await restarted.load();
    expect(restarted.snapshot().remainingMs.cosmic).toBe(3 * MIN);
  });

  it('stays exhausted after a restart', async () => {
    const h = await loaded(createHarness());
    const host = h.makeHost();
    host.state.playing = true;
    await h.select(host.host, { environment: 'cosmic', environmentGain: 0.6 });
    await h.advance(PREVIEW_ALLOWANCE_MS + 1_000);

    const restarted = new PreviewService(h.deps);
    await restarted.load();
    expect(restarted.snapshot().remainingMs.cosmic).toBe(0);
    const again = restarted;
    const review = await again.review(h.makeHost().host, { environment: 'cosmic', environmentGain: 0.6 });
    expect(review.reason).toBe('exhausted');
    expect(review.patch.environment).toBe('none');
  });

  it('does not reset malformed usage and never writes over it', async () => {
    const h = await loaded(createHarness({ stored: '{broken' }));
    expect(h.service.snapshot().malformed).toBe(true);
    const host = h.makeHost();
    host.state.playing = true;
    const review = await h.select(host.host, { environment: 'fire', environmentGain: 0.5 });
    expect(review.reason).toBe('exhausted');
    await h.advance(MIN);
    expect(h.storage.value).toBe('{broken');
  });

  it('writes usage at pause only when the open segment changes', async () => {
    const h = await loaded(createHarness());
    const host = h.makeHost();
    host.state.playing = true;
    await h.select(host.host, { environment: 'cosmic', environmentGain: 0.6 });
    await h.advance(MIN);
    host.state.playing = false;
    h.service.checkpoint();
    await h.settle();
    const stored = JSON.parse(h.storage.value ?? '{}');
    expect(stored.usedMs.cosmic).toBe(MIN);
    expect(stored.openSince).toBeNull();
  });
});

describe('exhaustion, expiry, and fading', () => {
  it('fades only the premium layer at expiry and keeps free layers and the chamber track playing', async () => {
    const h = await loaded(createHarness());
    const host = h.makeHost({ toneGain: 0.3, binauralGain: 0.25, noiseGain: 0.2, masterGain: 0.7 });
    host.state.playing = true;
    await h.select(host.host, { environment: 'cosmic', environmentGain: 0.6 });
    const beforeFade = host.state.updates.length;
    await h.advance(PREVIEW_ALLOWANCE_MS + 2_000);

    expect(host.state.config.environment).toBe('none');
    expect(host.state.config.toneGain).toBe(0.3);
    expect(host.state.config.binauralGain).toBe(0.25);
    expect(host.state.config.noiseGain).toBe(0.2);
    expect(host.state.config.masterGain).toBe(0.7);
    expect(host.state.playing).toBe(true);
    for (const patch of host.state.updates.slice(beforeFade)) {
      for (const key of Object.keys(patch)) {
        expect(['environment', 'environmentGain', 'templeGain']).toContain(key);
      }
    }
  });

  it('charges elapsed time when the state is reconciled late (resume after suspension)', async () => {
    const h = await loaded(createHarness());
    const host = h.makeHost();
    host.state.playing = true;
    await h.select(host.host, { environment: 'cosmic', environmentGain: 0.6 });
    h.clock.t += 4 * MIN;
    h.service.sync();
    await h.settle();
    expect(h.service.snapshot().remainingMs.cosmic).toBe(MIN);
  });

  it('does not let a stale expiry fade a world the user has since changed to', async () => {
    const h = await loaded(createHarness());
    const host = h.makeHost();
    host.state.playing = true;
    await h.select(host.host, { environment: 'cosmic', environmentGain: 0.6 });

    // Expiry fires here, and the fade is now waiting for its ramp.
    await h.advance(PREVIEW_ALLOWANCE_MS);
    await host.host.update({ environment: 'fire', environmentGain: 0.6 });
    await h.advance(2_000);

    expect(host.state.config.environment).toBe('fire');
    expect(host.state.config.environmentGain).toBe(0.6);
  });

  it('denies a temple resonance layer once temple time is used', async () => {
    const h = await loaded(createHarness());
    const host = h.makeHost({ environment: 'none' });
    host.state.playing = true;
    await h.select(host.host, { templeGain: 0.5 });
    await h.advance(PREVIEW_ALLOWANCE_MS + 1_000);
    expect(host.state.config.templeGain).toBe(0);
    const review = await h.service.review(host.host, { templeGain: 0.5 });
    expect(review.denied).toEqual(['temple']);
    expect(review.patch.templeGain).toBe(0);
  });
});

describe('membership', () => {
  it('lets a member use premium worlds without consuming the allowance', async () => {
    const h = await loaded(createHarness({ membership: 'member' }));
    const host = h.makeHost();
    host.state.playing = true;
    await h.select(host.host, { environment: 'cosmic', environmentGain: 0.6 });
    await h.advance(10 * MIN);
    expect(host.state.config.environment).toBe('cosmic');
    expect(h.service.snapshot().remainingMs.cosmic).toBe(PREVIEW_ALLOWANCE_MS);
  });

  it('stops charging and cancels expiry on purchase, with no fade', async () => {
    const h = await loaded(createHarness({ membership: 'not_member' }));
    const host = h.makeHost();
    host.state.playing = true;
    await h.select(host.host, { environment: 'cosmic', environmentGain: 0.6 });
    await h.advance(2 * MIN);
    h.membership.value = 'member';
    await h.service.refreshMembership();
    await h.advance(10 * MIN);
    expect(host.state.config.environment).toBe('cosmic');
    expect(host.state.config.environmentGain).toBe(0.6);
    expect(h.service.snapshot().charging).toEqual([]);
  });

  it('lets an exhausted preview be used again after membership is granted', async () => {
    const h = await loaded(createHarness({ membership: 'not_member' }));
    const host = h.makeHost();
    host.state.playing = true;
    await h.select(host.host, { environment: 'cosmic', environmentGain: 0.6 });
    await h.advance(PREVIEW_ALLOWANCE_MS + 1_000);
    expect((await h.service.review(host.host, { environment: 'cosmic' })).reason).toBe('exhausted');

    h.membership.value = 'member';
    const review = await h.service.review(host.host, { environment: 'cosmic', environmentGain: 0.6 });
    expect(review.denied).toEqual([]);
  });

  it('treats a verification error as unknown: retry is offered and non-membership is never claimed', async () => {
    const h = await loaded(createHarness({ membership: 'unknown' }));
    const host = h.makeHost();
    host.state.playing = true;
    await h.select(host.host, { environment: 'fire', environmentGain: 0.5 });
    await h.advance(PREVIEW_ALLOWANCE_MS + 1_000);

    const review = await h.service.review(host.host, { environment: 'fire', environmentGain: 0.5 });
    expect(review.reason).toBe('verification_failed');
    expect(review.patch.environment).toBe('none');
  });

  it('still allows an unknown-membership user who has preview time left', async () => {
    const h = await loaded(createHarness({ membership: 'unknown' }));
    const review = await h.service.review(h.makeHost().host, { environment: 'fire', environmentGain: 0.5 });
    expect(review.reason).toBeNull();
  });

  it('keeps unknown membership from being cached as not_member', async () => {
    const h = await loaded(createHarness({ membership: 'unknown' }));
    await h.service.refreshMembership();
    expect(h.service.snapshot().membership).toBe('unknown');
    h.membership.value = 'member';
    await h.service.refreshMembership();
    expect(h.service.snapshot().membership).toBe('member');
  });
});

describe('exceptions: factory, saved, and timeline playback', () => {
  it('does not charge or cut a premium stage that a timeline drives', async () => {
    const h = await loaded(createHarness());
    // A factory stage sets cosmic natively. The mixer only opens; nothing is selected.
    const host = h.makeHost({ environment: 'cosmic', environmentGain: 0.5 });
    host.state.playing = true;
    h.service.attach(host.host);
    await h.advance(PREVIEW_ALLOWANCE_MS + 2 * MIN);
    expect(host.state.config.environment).toBe('cosmic');
    expect(host.state.config.environmentGain).toBe(0.5);
    expect(h.service.snapshot().remainingMs.cosmic).toBe(PREVIEW_ALLOWANCE_MS);
  });

  it('does not charge a slider move on a timeline-driven premium stage', async () => {
    const h = await loaded(createHarness());
    const host = h.makeHost({ environment: 'cosmic', environmentGain: 0.5 });
    host.state.playing = true;
    await h.select(host.host, { environmentGain: 0.8 });
    await h.advance(PREVIEW_ALLOWANCE_MS + MIN);
    expect(host.state.config.environment).toBe('cosmic');
    expect(h.service.snapshot().remainingMs.cosmic).toBe(PREVIEW_ALLOWANCE_MS);
  });

  it('starts a restored premium Live Mix config only if the allowance or membership allows it', async () => {
    const h = await loaded(createHarness({ stored: JSON.stringify({ schemaVersion: 1, usedMs: { temple: 0, abyssal: 0, cosmic: PREVIEW_ALLOWANCE_MS, fire: 0 }, openSince: null, openWorlds: [] }) }));
    const host = h.makeHost();
    const start = normalizeProceduralAudioConfig({ ...DEFAULT_PROCEDURAL_AUDIO_CONFIG, environment: 'cosmic', environmentGain: 0.5 });
    const review = await h.service.reviewStart(host.host, start);
    expect(review.reason).toBe('exhausted');
    expect(review.config.environment).toBe('none');
  });

  it('does not charge before the engine is running', async () => {
    const h = await loaded(createHarness());
    const host = h.makeHost();
    host.state.owned = false;
    host.state.playing = false;
    await h.select(host.host, { environment: 'fire', environmentGain: 0.5 });
    expect(h.service.snapshot().remainingMs.fire).toBe(PREVIEW_ALLOWANCE_MS);
  });

  it('keeps Abyssal Glass gated in the same way as the other premium worlds', async () => {
    const h = await loaded(createHarness({ stored: JSON.stringify({ schemaVersion: 1, usedMs: { temple: 0, abyssal: PREVIEW_ALLOWANCE_MS, cosmic: 0, fire: 0 }, openSince: null, openWorlds: [] }) }));
    const review = await h.service.review(h.makeHost().host, { environment: 'abyssal', environmentGain: 0.5 });
    expect(review.denied).toEqual(['abyssal' as PreviewWorld]);
  });
});

describe('preview clock', () => {
  it('detaching stops charging and clears the selection', async () => {
    const h = await loaded(createHarness());
    const host = h.makeHost();
    host.state.playing = true;
    await h.select(host.host, { environment: 'cosmic', environmentGain: 0.6 });
    await h.advance(MIN);
    h.service.detach(host.host);
    await h.advance(5 * MIN);
    expect(h.service.snapshot().remainingMs.cosmic).toBe(4 * MIN);
    expect(h.service.snapshot().charging).toEqual([]);
  });

  it('a stopped engine is not charged', async () => {
    const h = await loaded(createHarness());
    const host = h.makeHost();
    host.state.playing = true;
    await h.select(host.host, { environment: 'cosmic', environmentGain: 0.6 });
    host.state.owned = false;
    h.service.sync();
    await h.advance(2 * MIN);
    expect(h.service.snapshot().remainingMs.cosmic).toBe(PREVIEW_ALLOWANCE_MS);
  });

  it('checks membership about every 30 seconds while attached, not every tick', async () => {
    const h = await loaded(createHarness());
    const host = h.makeHost();
    host.state.playing = true;
    await h.select(host.host, { environment: 'cosmic', environmentGain: 0.6 });
    await h.advance(2 * MIN);
    expect(h.membership.calls).toBeLessThanOrEqual(6);
  });
});
