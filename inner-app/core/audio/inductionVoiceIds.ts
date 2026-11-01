/**
 * The ids of the Induction's spoken lines. Kept apart from the files themselves (core/audio/inductionVoice.ts) so the
 * journey, and the script that exports it for the engine tests, never load an audio asset.
 */
export const INDUCTION_VOICE_CLIP_IDS = {
  open1: 'induction-open-1',
  open2: 'induction-open-2',
  cue1: 'induction-cue-1',
  cue2: 'induction-cue-2',
  close: 'induction-close',
} as const;

export type InductionVoiceClipId = typeof INDUCTION_VOICE_CLIP_IDS[keyof typeof INDUCTION_VOICE_CLIP_IDS];

/** Level each clip plays at, as a multiple of the file: -6.5 dB, because the mixed recordings sat too loud over the hall. */
export const INDUCTION_VOICE_GAIN = 10 ** (-6.5 / 20);
