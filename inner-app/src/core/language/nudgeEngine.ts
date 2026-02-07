import { NUDGE_LIBRARY } from './nudgeLibrary';
import type { IntentionId, NudgeStage } from './nudgeTypes';

export type NudgeContext = {
  intentions: IntentionId[]; // current selected intentions (0–2 usually)
  // When the user last *changed* intentions (or when this current intention state began)
  intentionSetAt: number; // unix ms
  now?: number; // unix ms (defaults to Date.now())

  // Cooldown so we don’t show this too often
  lastNudgeShownAt?: number; // unix ms
  cooldownDays?: number; // default 7

  // Optional: if you want stable variation per week/day
  // Use the weekly reset timestamp or similar
  seed?: number;
};

export type NudgeResult = {
  intention: IntentionId; // 'mixed' if 2 intentions
  stage: NudgeStage;
  text: string;
  key: string; // stable key you can store for “last shown”
};

const DAY_MS = 24 * 60 * 60 * 1000;

function daysBetween(aMs: number, bMs: number) {
  return Math.max(0, Math.floor((bMs - aMs) / DAY_MS));
}

function stageForDays(days: number): NudgeStage | null {
  // You can tweak these thresholds anytime
  if (days >= 14) return 'invite';
  if (days >= 7) return 'reflect';
  if (days >= 3) return 'acknowledge';
  return null;
}

// Small deterministic hash → stable variant selection
function hashToIndex(input: string, mod: number): number {
  let h = 0;
  for (let i = 0; i < input.length; i++) {
    h = (h * 31 + input.charCodeAt(i)) >>> 0;
  }
  return mod === 0 ? 0 : h % mod;
}

function normalizeIntentions(intentions: IntentionId[]): IntentionId {
  const filtered = (intentions ?? []).filter(Boolean) as IntentionId[];
  if (filtered.length >= 2) return 'mixed';
  if (filtered.length === 1) return filtered[0];
  // If user somehow has none selected, treat as mixed/neutral
  return 'mixed';
}

export function getNudge(ctx: NudgeContext): NudgeResult | null {
  const now = ctx.now ?? Date.now();
  const cooldownDays = ctx.cooldownDays ?? 7;

  // Cooldown gate
  if (ctx.lastNudgeShownAt != null) {
    const cd = daysBetween(ctx.lastNudgeShownAt, now);
    if (cd < cooldownDays) return null;
  }

  const intention = normalizeIntentions(ctx.intentions);
  const daysInState = daysBetween(ctx.intentionSetAt, now);

  const stage = stageForDays(daysInState);
  if (!stage) return null;

  const options = NUDGE_LIBRARY[intention]?.[stage] ?? [];
  if (!options.length) return null;

  // Stable selection: intention + stage + (optional seed or the current week bucket)
  const weekBucket = Math.floor(now / (7 * DAY_MS));
  const seed = ctx.seed ?? weekBucket;

  const pickKey = `${intention}:${stage}:${seed}:${daysInState}`;
  const idx = hashToIndex(pickKey, options.length);

  const text = options[idx];

  return {
    intention,
    stage,
    text,
    key: pickKey,
  };
}