import type { NightPlanConfiguration, NightPlanSource } from './nightPlans';
import type { NightRecipeRecognitionIntention } from './nightRecipes';

/**
 * Every setting the generator is allowed to vary for a night, and the record of why each took
 * the value it did. A lever is only registered if the generator really reads it, so the registry
 * cannot promise adaptation the sound does not deliver.
 */
export type GenerationLeverId =
  | 'environment'
  | 'feel'
  | 'signal'
  | 'signal_level'
  | 'cue_plan'
  | 'prep_focus';

export type LeverStage = 'waking_preparation' | 'sleep_audio' | 'recognition_cueing';
export type LeverOutcome = 'recall' | 'lucidity' | 'signal_experience' | 'sleep_impact' | 'sign_recognition';

export type LeverDefinition = {
  id: GenerationLeverId;
  label: string;
  stage: LeverStage;
  description: string;
  /** Outcomes a change to this lever could plausibly move; what an experiment on it should measure. */
  outcomes: LeverOutcome[];
  /**
   * Whether changing it alters what plays while the practitioner sleeps. Levers that do not can be
   * varied without confounding what the night produces, such as which sign appears.
   */
  altersSleepAudio: boolean;
  /** Source files that read the lever; a test keeps this honest. */
  honoredBy: Array<{ file: string; token: string }>;
};

export const GENERATION_LEVERS: readonly LeverDefinition[] = [
  {
    id: 'environment',
    label: 'Environment',
    stage: 'sleep_audio',
    description: 'The procedural world that carries the whole night.',
    outcomes: ['recall', 'sleep_impact', 'lucidity'],
    altersSleepAudio: true,
    honoredBy: [{ file: 'core/audio/overnightJourney.ts', token: 'environment' }],
  },
  {
    id: 'feel',
    label: 'Feel',
    stage: 'sleep_audio',
    description: 'How present the world is: gentle, deep, or immersive.',
    outcomes: ['sleep_impact', 'recall'],
    altersSleepAudio: true,
    honoredBy: [{ file: 'core/audio/overnightJourney.ts', token: 'feel' }],
  },
  {
    id: 'signal',
    label: 'Recognition signal',
    stage: 'recognition_cueing',
    description: 'The sound that returns later in the night.',
    outcomes: ['signal_experience', 'lucidity', 'sleep_impact'],
    altersSleepAudio: true,
    honoredBy: [{ file: 'core/audio/overnightJourney.ts', token: 'recognitionSignalId' }],
  },
  {
    id: 'signal_level',
    label: 'Signal level',
    stage: 'recognition_cueing',
    description: 'How loud the recognition signal is, relative to its calibrated level.',
    outcomes: ['signal_experience', 'sleep_impact'],
    altersSleepAudio: true,
    honoredBy: [{ file: 'core/audio/overnightJourney.ts', token: 'signalGainScale' }],
  },
  {
    id: 'cue_plan',
    label: 'Cue plan',
    stage: 'recognition_cueing',
    description: 'How many recognition windows there are, and when they fall.',
    outcomes: ['signal_experience', 'lucidity', 'sleep_impact'],
    altersSleepAudio: true,
    honoredBy: [{ file: 'core/audio/overnightProtocol.ts', token: 'recognitionWindows' }],
  },
  {
    id: 'prep_focus',
    label: 'Preparation focus',
    stage: 'waking_preparation',
    description: 'Names the practitioner\'s recurring dream sign in the waking preparation.',
    outcomes: ['sign_recognition', 'lucidity'],
    altersSleepAudio: false,
    honoredBy: [
      { file: 'core/audio/preparationFocus.ts', token: 'withPreparationFocus' },
      { file: 'screens/OvernightJourneyScreen.tsx', token: 'withPreparationFocus' },
    ],
  },
] as const;

export function leverDefinition(id: GenerationLeverId): LeverDefinition {
  const lever = GENERATION_LEVERS.find(item => item.id === id);
  if (!lever) throw new Error(`Unknown generation lever: ${id}`);
  return lever;
}

export type LeverSource =
  | 'chosen'
  | 'recommendation'
  | 'experiment'
  | 'adaptive_rule'
  | 'dream_sign'
  | 'default';

export type GenerationNote = {
  lever: GenerationLeverId;
  /** The value the night used. Null when the lever was not applied. */
  value: string | number | null;
  source: LeverSource;
  reason?: string;
};

export type GenerationNotesV1 = {
  schemaVersion: 1;
  notes: GenerationNote[];
};

const CONFIGURATION_LEVERS: Array<{ lever: Exclude<GenerationLeverId, 'prep_focus'>; field: keyof NightPlanConfiguration }> = [
  { lever: 'environment', field: 'environment' },
  { lever: 'feel', field: 'feel' },
  { lever: 'signal', field: 'signalId' },
  { lever: 'signal_level', field: 'signalGainScale' },
  { lever: 'cue_plan', field: 'cuePlan' },
];

const PROPOSAL_SOURCE: Record<Exclude<NightPlanSource, 'manual'>, LeverSource> = {
  recommendation: 'recommendation',
  experiment: 'experiment',
  adaptive_rule: 'adaptive_rule',
};

export type BuildGenerationNotesInput = {
  configuration: NightPlanConfiguration;
  planSource: NightPlanSource;
  planReason?: string;
  proposedConfiguration?: Partial<NightPlanConfiguration>;
  userChanged?: Array<keyof NightPlanConfiguration>;
  recognitionIntention?: NightRecipeRecognitionIntention;
};

/**
 * Records where each lever's value came from: the practitioner, a proposal they accepted, or the
 * dream sign they chose to focus on. Order is fixed so notes compare cleanly across nights.
 */
export function buildGenerationNotes(input: BuildGenerationNotesInput): GenerationNotesV1 {
  const changed = new Set(input.userChanged ?? []);
  const notes: GenerationNote[] = CONFIGURATION_LEVERS.map(({ lever, field }) => {
    const value = (input.configuration[field] ?? null) as string | number | null;
    const proposed = input.proposedConfiguration?.[field] !== undefined;
    if (proposed && changed.has(field)) {
      return { lever, value, source: 'chosen' as const, reason: 'Changed from the proposal during review.' };
    }
    if (proposed && input.planSource !== 'manual') {
      return {
        lever,
        value,
        source: PROPOSAL_SOURCE[input.planSource],
        ...(input.planReason ? { reason: input.planReason } : {}),
      };
    }
    return { lever, value, source: 'chosen' as const };
  });

  const intention = input.recognitionIntention;
  const sign = intention?.sign.trim();
  notes.push(sign
    ? {
        lever: 'prep_focus',
        value: sign,
        source: 'dream_sign',
        reason: `Recurring sign: ${intention!.evidence.appearances} appearances in ${intention!.evidence.rememberedDreams} remembered dreams. Shapes the waking preparation only.`,
      }
    : { lever: 'prep_focus', value: null, source: 'default' });

  return { schemaVersion: 1, notes };
}
