// src/lunar/lunarMeanings.ts
import type { MoonPhase } from '../../utils/lunar';

export type LunarMeaning = {
  title: string;           // e.g., "Illumination"
  summary: string;         // 1–2 line guidance
  ritualTip: string;       // actionable suggestion
  affirmation: string;     // “I …”
};

export const lunarMeanings: Record<MoonPhase, LunarMeaning> = {
  'new': {
    title: 'Beginnings',
    summary: 'Seed the cycle with clear intention. Let stillness reveal what truly wants to begin.',
    ritualTip: 'Write a single sentence intention. Whisper it into your breath three times.',
    affirmation: 'I begin with clarity and devotion.',
  },
  'waxing-crescent': {
    title: 'Gathering',
    summary: 'Energy builds. Nurture your intention with gentle, consistent focus.',
    ritualTip: 'Choose one tiny action that honors your intention today.',
    affirmation: 'I tend small actions that grow great change.',
  },
  'first-quarter': {
    title: 'Decision',
    summary: 'Friction clarifies the path. Meet resistance and choose momentum.',
    ritualTip: 'Name the smallest block. Breathe, then take one decisive step.',
    affirmation: 'I move through resistance with courage.',
  },
  'waxing-gibbous': {
    title: 'Refinement',
    summary: 'Polish the work. Adjust details so form matches essence.',
    ritualTip: 'Edit, tune, or reorganize one part of your practice.',
    affirmation: 'I refine patiently toward resonance.',
  },
  'full': {
    title: 'Illumination',
    summary: 'What was hidden becomes visible. Release excess. Keep the light.',
    ritualTip: 'Exhale what you’ve outgrown. Journal one truth that’s now clear.',
    affirmation: 'I let go and I shine.',
  },
  'waning-gibbous': {
    title: 'Gratitude',
    summary: 'Harvest insight. Share learning. Reflect on how far you’ve come.',
    ritualTip: 'List three gratitudes from this cycle and offer one to someone else.',
    affirmation: 'I harvest and I give thanks.',
  },
  'last-quarter': {
    title: 'Release',
    summary: 'Close loops. Compost what’s complete to nourish what’s next.',
    ritualTip: 'Identify one commitment to end with grace.',
    affirmation: 'I release with kindness and wisdom.',
  },
  'waning-crescent': {
    title: 'Surrender',
    summary: 'Rest inside the hush. Dream space opens the door to renewal.',
    ritualTip: 'Choose stillness. Breathe quietly for three minutes before sleep.',
    affirmation: 'I surrender into restorative silence.',
  },
};