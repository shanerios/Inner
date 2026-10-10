import { DREAM_SIGNS } from '../dreamSigns';
import type { FactoryAudioJourney } from './factoryJourneys';

/**
 * Spoken guidance for the 7-minute waking preparation of an Overnight Journey. Three short lines are
 * played by the native engine at fixed points, so the practitioner hears them with their eyes closed.
 * Sleep audio is never touched: voice events exist only in the preparation stages.
 *
 * Clips are recorded per sign (full sentences) plus a generic set, and hosted publicly like the other
 * Inner audio. A missing clip never blocks a night; the on-screen text still carries the guidance.
 */
export const VOICE_BASE_URL = 'https://f005.backblazeb2.com/file/inner-audio/OvernightVoice/';

/** Where each line plays, measured from the start of the preparation. */
export const VOICE_SLOT_TIMES_MS = [20_000, 105_000, 335_000] as const;

export type VoiceSlot = 1 | 2 | 3;

const SIGN_SLUGS: Record<string, string> = {
  Flying: 'flying',
  Falling: 'falling',
  Water: 'water',
  Chased: 'chased',
  Lost: 'lost',
  Mirror: 'mirror',
  Teeth: 'teeth',
  'Familiar Person': 'familiar-person',
  'Unknown Place': 'unknown-place',
  'Shadow Presence': 'shadow-presence',
};

export const GENERIC_VOICE_SLUG = 'generic';

/**
 * Per-clip level trim in dB, applied on top of the recorded loudness. Set by ear on a device, the way
 * the recognition signal trims are. Keyed by `${slug}-${slot}`; an absent key means no trim.
 * `npm run voice:measure -- <folder> --write` fills the block between the markers from measured clips.
 */
export const VOICE_TRIM_DB: Record<string, number> = {
  // voice-trim:begin
  // voice-trim:end
};

export type VoiceClipPlan = {
  clipId: string;
  fileName: string;
  url: string;
  /** Position within the preparation, in milliseconds. */
  atMs: number;
  /** Linear gain handed to the native engine. */
  gain: number;
  /** Which revision of the recording is on the device; set when a night's plan is chosen from the device. */
  revision?: number;
};

export type VoicePlan = {
  slug: string;
  clips: VoiceClipPlan[];
};

/** The recorded slug for a sign, or null when the sign has no recording. Matching ignores case and spacing. */
export function voiceSlugForSign(sign: string | null | undefined): string | null {
  const wanted = sign?.trim().toLocaleLowerCase();
  if (!wanted) return null;
  const match = DREAM_SIGNS.find(candidate => candidate.toLocaleLowerCase() === wanted);
  return match ? SIGN_SLUGS[match] ?? null : null;
}

function trimGain(slug: string, slot: VoiceSlot): number {
  const db = VOICE_TRIM_DB[`${slug}-${slot}`] ?? 0;
  return Math.min(2, Math.max(0, 10 ** (db / 20)));
}

/** Lines for a sign when it has a recording, otherwise the generic set everyone hears. */
export function voicePlanForSign(sign: string | null | undefined): VoicePlan {
  const slug = voiceSlugForSign(sign) ?? GENERIC_VOICE_SLUG;
  return {
    slug,
    clips: VOICE_SLOT_TIMES_MS.map((atMs, index) => {
      const slot = (index + 1) as VoiceSlot;
      const clipId = `voice-prep-${slug}-${slot}`;
      return { clipId, fileName: `${clipId}.wav`, url: `${VOICE_BASE_URL}${clipId}.wav`, atMs, gain: trimGain(slug, slot) };
    }),
  };
}

/**
 * Every plan there is: the generic set first, then one per recorded sign. The app downloads all of
 * them, whatever the practitioner's sign, so a request for one sign's file never reveals which sign
 * they are working with.
 */
export function voicePackPlans(): VoicePlan[] {
  return [GENERIC_VOICE_SLUG, ...Object.values(SIGN_SLUGS)].map(slug => {
    const sign = Object.keys(SIGN_SLUGS).find(key => SIGN_SLUGS[key] === slug);
    return voicePlanForSign(slug === GENERIC_VOICE_SLUG ? null : sign);
  });
}

const PREPARATION_STAGE_IDS = new Set(['learn', 'rehearse', 'drift', 'release']);

/**
 * Adds the plan's voice events to the preparation stages and remembers which clips tonight needs.
 * Only stages that belong to the waking preparation are touched.
 */
export function withPreparationVoice(journey: FactoryAudioJourney, plan: VoicePlan): FactoryAudioJourney {
  let cursor = 0;
  const additions = new Map<number, Array<{ id: string; atMs: number; type: 'voice'; clipId: string }>>();
  journey.timeline.stages.forEach((stage, index) => {
    if (!PREPARATION_STAGE_IDS.has(stage.id)) return;
    const start = cursor;
    const end = start + stage.durationMs;
    cursor = end;
    for (const clip of plan.clips) {
      if (clip.atMs >= start && clip.atMs < end) {
        additions.set(index, [
          ...(additions.get(index) ?? []),
          { id: clip.clipId, atMs: clip.atMs - start, type: 'voice', clipId: clip.clipId },
        ]);
      }
    }
  });
  if (!additions.size) return journey;
  return {
    ...journey,
    voiceClips: plan.clips,
    timeline: {
      ...journey.timeline,
      stages: journey.timeline.stages.map((stage, index) => additions.has(index)
        ? { ...stage, spatialEvents: [...(stage.spatialEvents ?? []), ...additions.get(index)!] }
        : stage),
    },
  };
}
