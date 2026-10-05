import type { LucidSignalCuePlan } from './lucidSignalPlans';
import { recognitionCueMinutesForDuration } from './lucidSignalPlans';
import type { RecognitionSignalId } from './recognitionSignals';
import type { ProceduralEnvironment } from './audio/types';

export const NIGHT_RECIPE_SCHEMA_VERSION = 2 as const;

export type NightRecipeEnvironment = Exclude<ProceduralEnvironment, 'none' | 'wind'>;
export type NightRecipeFeel = 'gentle' | 'deep' | 'immersive';

export type NightRecipeRecognitionWindow = {
  id: string;
  /** The signal's actual presentation time, measured from the end of waking preparation. */
  cueAtMinute: number;
  signalGainScale: number;
  presentations: number;
  backgroundDuckGain: number;
  recoverySeconds: number;
};

export type NightRecipeV2 = {
  schemaVersion: typeof NIGHT_RECIPE_SCHEMA_VERSION;
  id: string;
  createdAt: number;
  seed: number;
  goal: 'lucid_recognition';
  durationMinutes: number;
  environment: NightRecipeEnvironment;
  feel: NightRecipeFeel;
  preparation: {
    practice: 'lucid_signal';
    durationMinutes: 7;
  };
  recognition: {
    signalId: RecognitionSignalId;
    cuePlan: LucidSignalCuePlan;
    windows: NightRecipeRecognitionWindow[];
  };
  environmentArc: 'protected_standard';
};

export type CreateNightRecipeInput = {
  durationMinutes: number;
  environment: NightRecipeEnvironment;
  feel: NightRecipeFeel;
  signalId: RecognitionSignalId;
  cuePlan: LucidSignalCuePlan;
  seed: number;
  createdAt?: number;
};

/** Freezes every planned recognition exposure before native playback begins. */
export function createNightRecipeV2(input: CreateNightRecipeInput): NightRecipeV2 {
  const createdAt = input.createdAt ?? Date.now();
  const cueMinutes = recognitionCueMinutesForDuration(input.durationMinutes, input.cuePlan);
  return {
    schemaVersion: NIGHT_RECIPE_SCHEMA_VERSION,
    id: `night-recipe-${createdAt}-${input.seed}`,
    createdAt,
    seed: input.seed,
    goal: 'lucid_recognition',
    durationMinutes: input.durationMinutes,
    environment: input.environment,
    feel: input.feel,
    preparation: { practice: 'lucid_signal', durationMinutes: 7 },
    recognition: {
      signalId: input.signalId,
      cuePlan: input.cuePlan,
      windows: cueMinutes.map((cueAtMinute, index) => ({
        id: `recognition-${index + 1}`,
        cueAtMinute,
        signalGainScale: 1,
        presentations: 1,
        backgroundDuckGain: 0.55,
        recoverySeconds: 35,
      })),
    },
    environmentArc: 'protected_standard',
  };
}

export function nightRecipeCueSummary(recipe: NightRecipeV2): string {
  return recipe.recognition.windows.map(window => {
    const hours = Math.floor(window.cueAtMinute / 60);
    const minutes = window.cueAtMinute % 60;
    return minutes ? `${hours}h ${minutes}m` : `${hours}h`;
  }).join(' · ');
}
