import { normalizeProceduralAudioConfig } from './config';
import type { ProceduralAudioConfig, ProceduralAudioPatch } from './types';

/**
 * Local preview allowance for the premium Overnight worlds in the mixers.
 *
 * This is not a membership flag. It is a per-install allowance that counts
 * only audible, user-selected playback time. Members never consume it.
 * Clearing app data or reinstalling resets it; there is no server record.
 */

export const PREVIEW_WORLDS = ['temple', 'abyssal', 'cosmic', 'fire'] as const;
export type PreviewWorld = (typeof PREVIEW_WORLDS)[number];

export const PREVIEW_ALLOWANCE_MS = 5 * 60_000;
export const PREVIEW_STORAGE_KEY = 'inner.audio.premium-preview.v1';
/** Usage is written at most this often while a preview is audible. */
export const PREVIEW_CHECKPOINT_TICKS = 30;
const AUDIBLE_GAIN = 0.001;

export type PreviewMembership = 'member' | 'not_member' | 'unknown';

export type PreviewUsage = {
  schemaVersion: 1;
  /** Completed charged time per world, excluding the open segment. */
  usedMs: Record<PreviewWorld, number>;
  /** Wall-clock start of the open charging segment, or null when nothing is charging. */
  openSince: number | null;
  openWorlds: PreviewWorld[];
};

export function isPreviewWorld(value: unknown): value is PreviewWorld {
  return typeof value === 'string' && (PREVIEW_WORLDS as readonly string[]).includes(value);
}

export function emptyUsage(): PreviewUsage {
  return {
    schemaVersion: 1,
    usedMs: { temple: 0, abyssal: 0, cosmic: 0, fire: 0 },
    openSince: null,
    openWorlds: [],
  };
}

/** Used when stored usage cannot be trusted: no fresh allowance is granted. */
export function exhaustedUsage(): PreviewUsage {
  return {
    schemaVersion: 1,
    usedMs: { temple: PREVIEW_ALLOWANCE_MS, abyssal: PREVIEW_ALLOWANCE_MS, cosmic: PREVIEW_ALLOWANCE_MS, fire: PREVIEW_ALLOWANCE_MS },
    openSince: null,
    openWorlds: [],
  };
}

export type ParsedUsage = {
  usage: PreviewUsage;
  malformed: boolean;
  /** True when the stored record ended mid-segment (for example, the app was killed). */
  hadOpenSegment: boolean;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function parseUsage(raw: string | null): ParsedUsage {
  if (raw === null) return { usage: emptyUsage(), malformed: false, hadOpenSegment: false };
  const malformed = { usage: exhaustedUsage(), malformed: true, hadOpenSegment: false };
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return malformed;
  }
  if (!isRecord(value) || value.schemaVersion !== 1 || !isRecord(value.usedMs)) return malformed;

  const usedMs = emptyUsage().usedMs;
  for (const world of PREVIEW_WORLDS) {
    const ms = value.usedMs[world];
    if (typeof ms !== 'number' || !Number.isFinite(ms) || ms < 0) return malformed;
    usedMs[world] = Math.min(PREVIEW_ALLOWANCE_MS, ms);
  }
  const openSince = value.openSince;
  if (openSince !== null && (typeof openSince !== 'number' || !Number.isFinite(openSince))) return malformed;
  if (!Array.isArray(value.openWorlds) || !value.openWorlds.every(isPreviewWorld)) return malformed;
  if ((openSince === null) !== (value.openWorlds.length === 0)) return malformed;

  return {
    usage: { schemaVersion: 1, usedMs, openSince, openWorlds: [...value.openWorlds] },
    malformed: false,
    hadOpenSegment: openSince !== null,
  };
}

export function serializeUsage(usage: PreviewUsage): string {
  return JSON.stringify(usage);
}

/** Charges elapsed time to the open worlds up to `nowMs`, then restarts the segment there. */
export function accrue(usage: PreviewUsage, nowMs: number): PreviewUsage {
  if (usage.openSince === null) return usage;
  const elapsed = Math.max(0, nowMs - usage.openSince);
  const usedMs = { ...usage.usedMs };
  for (const world of usage.openWorlds) {
    usedMs[world] = Math.min(PREVIEW_ALLOWANCE_MS, usedMs[world] + elapsed);
  }
  return { ...usage, usedMs, openSince: nowMs };
}

/** Accrues up to `nowMs`, then opens a segment for `worlds` (or closes it when empty). */
export function openSegment(usage: PreviewUsage, worlds: PreviewWorld[], nowMs: number): PreviewUsage {
  const settled = accrue(usage, nowMs);
  return {
    ...settled,
    openSince: worlds.length > 0 ? nowMs : null,
    openWorlds: [...worlds],
  };
}

export function remainingMs(usage: PreviewUsage, world: PreviewWorld, nowMs: number): number {
  const live = usage.openSince !== null && usage.openWorlds.includes(world)
    ? Math.max(0, nowMs - usage.openSince)
    : 0;
  return Math.max(0, PREVIEW_ALLOWANCE_MS - usage.usedMs[world] - live);
}

type AudibleSource = Pick<ProceduralAudioConfig, 'environment' | 'environmentGain' | 'templeGain'>;

/** Premium worlds currently audible in a config. Temple resonance counts as the Temple world. */
export function audibleWorlds(config: AudibleSource | null | undefined): PreviewWorld[] {
  if (!config) return [];
  const worlds: PreviewWorld[] = [];
  if (isPreviewWorld(config.environment) && config.environmentGain > AUDIBLE_GAIN) worlds.push(config.environment);
  if (config.templeGain > AUDIBLE_GAIN && !worlds.includes('temple')) worlds.push('temple');
  return worlds;
}

/**
 * Premium worlds a mixer patch explicitly selects. Slider moves on a world that
 * is already playing (for example, one from a factory stage) do not select it,
 * so timeline-driven worlds are never cut or charged by unrelated changes.
 */
export function selectedPreviewWorlds(current: ProceduralAudioConfig | null, patch: ProceduralAudioPatch): PreviewWorld[] {
  const worlds: PreviewWorld[] = [];
  if (isPreviewWorld(patch.environment)) worlds.push(patch.environment);
  const enablingTemple = patch.templeGain !== undefined
    && patch.templeGain > AUDIBLE_GAIN
    && (current?.templeGain ?? 0) <= AUDIBLE_GAIN;
  if (enablingTemple && !worlds.includes('temple')) worlds.push('temple');
  return worlds;
}

/** Removes the parts of a patch that would start a denied world. Other fields still apply. */
export function stripDeniedWorlds(patch: ProceduralAudioPatch, denied: PreviewWorld[]): ProceduralAudioPatch {
  const next: ProceduralAudioPatch = { ...patch };
  if (isPreviewWorld(next.environment) && denied.includes(next.environment)) {
    next.environment = 'none';
    next.environmentGain = 0;
  }
  if (denied.includes('temple') && next.templeGain !== undefined && next.templeGain > AUDIBLE_GAIN) {
    next.templeGain = 0;
  }
  return next;
}

export function normalizedTarget(current: ProceduralAudioConfig | null, patch: ProceduralAudioPatch): ProceduralAudioConfig {
  return normalizeProceduralAudioConfig({ ...(current ?? {}), ...patch } as ProceduralAudioPatch);
}

export function sameWorlds(a: PreviewWorld[], b: PreviewWorld[]): boolean {
  return a.length === b.length && a.every(world => b.includes(world));
}
