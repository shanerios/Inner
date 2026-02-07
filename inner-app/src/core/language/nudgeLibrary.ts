import { NudgeLibrary, IntentionId, NudgeStage } from './nudgeTypes';

export const NUDGE_LIBRARY: NudgeLibrary = {
  calm: {
    acknowledge: [
      'Calm has been steady lately.',
      'Stillness has been your dominant tone.',
    ],
    reflect: [
      'You’ve been resting in Calm for a while now.',
      'The noise has stayed quiet longer than usual.',
    ],
    invite: [
      'When stillness holds long enough, clarity sometimes follows.',
      'Calm often becomes the ground from which something sharper can emerge.',
    ],
  },

  clarity: {
    acknowledge: [
      'Clarity has been present recently.',
      'Your inner lens has been focused.',
    ],
    reflect: [
      'You’ve been moving with Clarity for some time.',
      'Patterns may be easier to see right now.',
    ],
    invite: [
      'After clarity comes grounding, if you feel the need to root what you see.',
      'Some choose to return to Calm once vision sharpens.',
    ],
  },

  grounding: {
    acknowledge: [
      'Grounding has been consistent.',
      'You’ve stayed close to the present.',
    ],
    reflect: [
      'You’ve been rooted here for a while now.',
      'Stability has been doing quiet work.',
    ],
    invite: [
      'From strong roots, expansion becomes safer.',
      'Grounding sometimes prepares the way for reawakening.',
    ],
  },

  healing: {
    acknowledge: [
      'Healing has been active.',
      'Restoration has been a recurring theme.',
    ],
    reflect: [
      'You’ve been tending unseen spaces for some time.',
      'Soft repair has been ongoing.',
    ],
    invite: [
      'When healing settles, grounding can help integrate what’s changed.',
      'Some find reawakening follows long periods of repair.',
    ],
  },

  reawakening: {
    acknowledge: [
      'Reawakening energy has been present.',
      'Something has been stirring.',
    ],
    reflect: [
      'You’ve been in a state of reawakening for a while.',
      'Momentum has been quietly building.',
    ],
    invite: [
      'After reawakening, clarity can help shape what’s returning.',
      'Expansion often follows renewed energy.',
    ],
  },

  expansion: {
    acknowledge: [
      'Expansion has been your prevailing tone.',
      'Openness has been active.',
    ],
    reflect: [
      'You’ve been exploring wider inner space.',
      'Growth has been unfolding steadily.',
    ],
    invite: [
      'After expansion, grounding can help anchor what’s grown.',
      'Some return to Calm to let integration catch up.',
    ],
  },

  mixed: {
    acknowledge: [
      'Your inner field has been balanced between tones.',
      'Multiple intentions have been shaping your experience.',
    ],
    reflect: [
      'You’ve been holding more than one state at once.',
      'This balance has been consistent.',
    ],
    invite: [
      'You don’t need to change anything — just notice.',
      'When one tone asks for more space, you’ll feel it.',
    ],
  },
};

// Convenience accessors
export const ALL_INTENTIONS: IntentionId[] = [
  'calm',
  'clarity',
  'grounding',
  'healing',
  'reawakening',
  'expansion',
  'mixed',
];

export const ALL_STAGES: NudgeStage[] = ['acknowledge', 'reflect', 'invite'];

// --- Nudge Engine (lightweight, deterministic selector) ---

export type NudgeContext = {
  intentions: IntentionId[];
  intentionSetAt: number; // unix ms
  now?: number; // unix ms
  lastNudgeShownAt?: number; // unix ms
  cooldownDays?: number; // default 7
  seed?: number; // stable variation key (optional)
};

export type NudgeResult = {
  intention: IntentionId; // 'mixed' if 2+ intentions
  stage: NudgeStage;
  text: string;
  key: string;
};

const DAY_MS = 24 * 60 * 60 * 1000;

function daysBetween(aMs: number, bMs: number) {
  return Math.max(0, Math.floor((bMs - aMs) / DAY_MS));
}

function stageForDays(days: number): NudgeStage | null {
  if (days >= 14) return 'invite';
  if (days >= 7) return 'reflect';
  if (days >= 3) return 'acknowledge';
  return null;
}

function hashToIndex(input: string, mod: number): number {
  let h = 0;
  for (let i = 0; i < input.length; i++) {
    h = (h * 31 + input.charCodeAt(i)) >>> 0;
  }
  return mod === 0 ? 0 : h % mod;
}

function normalizeIntentionsForNudge(intentions: IntentionId[]): IntentionId {
  const filtered = (intentions ?? []).filter(Boolean) as IntentionId[];
  if (filtered.length >= 2) return 'mixed';
  if (filtered.length === 1) return filtered[0];
  return 'mixed';
}

export function getNudge(ctx: NudgeContext): NudgeResult | null {
  const now = ctx.now ?? Date.now();
  const cooldownDays = ctx.cooldownDays ?? 7;

  if (ctx.lastNudgeShownAt != null) {
    const cd = daysBetween(ctx.lastNudgeShownAt, now);
    if (cd < cooldownDays) return null;
  }

  const intention = normalizeIntentionsForNudge(ctx.intentions);
  const daysInState = daysBetween(ctx.intentionSetAt, now);
  const stage = stageForDays(daysInState);
  if (!stage) return null;

  const options = (NUDGE_LIBRARY as any)[intention]?.[stage] ?? [];
  if (!options.length) return null;

  const weekBucket = Math.floor(now / (7 * DAY_MS));
  const seed = ctx.seed ?? weekBucket;

  const pickKey = `${intention}:${stage}:${seed}:${daysInState}`;
  const idx = hashToIndex(pickKey, options.length);

  return {
    intention,
    stage,
    text: options[idx],
    key: pickKey,
  };
}