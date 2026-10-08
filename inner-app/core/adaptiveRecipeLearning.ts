import type { DreamRecall } from './dreamDetails';
import type { NightExecutionRecord } from './nightExecution';
import type { NightRecord } from './nightRecords';

export type AdaptiveRecipeExclusion =
  | 'test_session'
  | 'not_overnight'
  | 'quiet_night'
  | 'missing_recipe'
  | 'missing_execution'
  | 'incomplete_execution'
  | 'missing_cues'
  | 'interrupted'
  | 'route_changed'
  | 'volume_low'
  | 'volume_changed'
  | 'missing_recall_answer';

export type AdaptiveRecipeSample = {
  id: string;
  reflectedAt: number;
  eligibleForEnvironment: boolean;
  exclusion?: AdaptiveRecipeExclusion;
  environment?: string;
  durationMinutes?: number;
  feel?: string;
  signalId?: string;
  cuePlan?: string;
  cueCount?: number;
  signalGainScale?: number;
  recognitionIntention?: string;
  audioRoute: 'private' | 'speaker' | 'unknown';
  outputVolume?: number;
  recall: DreamRecall;
};

export type SupportedEnvironmentAdjustment = {
  environment: string;
  recalledNights: number;
  environmentNights: number;
  comparisonRecallNights: number;
  comparisonNights: number;
  reason: string;
};

const MIN_OUTPUT_VOLUME = 0.15;
const MAX_VOLUME_SPREAD = 0.15;
const MAX_RECENT_SAMPLES = 12;
const MIN_ENVIRONMENT_NIGHTS = 5;
const MIN_ENVIRONMENT_RECALLS = 3;
const MIN_COMPARISON_NIGHTS = 3;
const MIN_RECALL_RATE_DIFFERENCE = 0.25;

function rounded(value: number): number {
  return Math.round(value * 100) / 100;
}

function executionFor(record: NightRecord): NightExecutionRecord | undefined {
  return record.practiceContext?.links.find(link => link.type === 'overnight_journey')?.nightExecution;
}

function exclusionFor(
  record: NightRecord,
  execution: NightExecutionRecord | undefined,
): AdaptiveRecipeExclusion | undefined {
  const plan = record.practiceContext?.nightPlan;
  const recipe = plan?.recipe;
  if (record.testSession) return 'test_session';
  if (record.source !== 'overnight_journey') return 'not_overnight';
  if (plan?.quietNight) return 'quiet_night';
  if (!recipe) return 'missing_recipe';
  if (!execution) return 'missing_execution';
  if (execution.status !== 'completed' && execution.status !== 'completed_early') return 'incomplete_execution';
  if (!execution.plannedCues.length || execution.missingCueIds.length > 0
    || execution.deliveredCues.length !== execution.plannedCues.length) return 'missing_cues';
  if (execution.interruptionCount > 0) return 'interrupted';
  if (execution.audioRouteChanges) return 'route_changed';
  if (execution.outputVolume && execution.outputVolume.min < MIN_OUTPUT_VOLUME) return 'volume_low';
  if (execution.outputVolume && execution.outputVolume.max - execution.outputVolume.min > MAX_VOLUME_SPREAD) return 'volume_changed';
  if (!record.outcome.recall) return 'missing_recall_answer';
  return undefined;
}

/**
 * Flattens the final recipe, verified playback, and morning recall into a sample
 * suitable for changing one recipe field: environment.
 */
export function adaptiveRecipeSample(record: NightRecord): AdaptiveRecipeSample {
  const recipe = record.practiceContext?.nightPlan?.recipe;
  const execution = executionFor(record);
  const windows = recipe?.recognition.windows ?? [];
  const signalGainScale = windows.length
    ? rounded(windows.reduce((total, window) => total + window.signalGainScale, 0) / windows.length)
    : undefined;
  const exclusion = exclusionFor(record, execution);
  const sample: AdaptiveRecipeSample = {
    id: record.id,
    reflectedAt: record.reflectedAt,
    eligibleForEnvironment: !exclusion,
    exclusion,
    environment: recipe?.environment,
    durationMinutes: recipe?.durationMinutes,
    feel: recipe?.feel,
    signalId: recipe?.recognition.signalId,
    cuePlan: recipe?.recognition.cuePlan,
    cueCount: windows.length || undefined,
    signalGainScale,
    recognitionIntention: recipe?.recognition.intention?.sign.trim().toLocaleLowerCase(),
    audioRoute: execution?.audioRoute ?? 'unknown',
    outputVolume: execution?.outputVolume
      ? rounded((execution.outputVolume.min + execution.outputVolume.max) / 2)
      : undefined,
    recall: record.outcome.recall,
  };
  return sample;
}

function sameOptionalNumber(left?: number, right?: number): boolean {
  if (left === undefined || right === undefined) return left === right;
  return Math.abs(left - right) <= MAX_VOLUME_SPREAD;
}

function comparableExceptEnvironment(left: AdaptiveRecipeSample, right: AdaptiveRecipeSample): boolean {
  return left.durationMinutes === right.durationMinutes
    && left.feel === right.feel
    && left.signalId === right.signalId
    && left.cuePlan === right.cuePlan
    && left.cueCount === right.cueCount
    && left.signalGainScale === right.signalGainScale
    && left.recognitionIntention === right.recognitionIntention
    && left.audioRoute === right.audioRoute
    && sameOptionalNumber(left.outputVolume, right.outputVolume);
}

function titleCase(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

/**
 * Finds a possible environment pattern only within completed, comparable nights.
 * Every setting except environment must match, so the resulting planner changes
 * one variable and leaves the rest of the recipe in the practitioner's hands.
 */
export function deriveSupportedEnvironmentAdjustment(
  records: NightRecord[],
): SupportedEnvironmentAdjustment | null {
  const eligible = records
    .map(adaptiveRecipeSample)
    .filter(sample => sample.eligibleForEnvironment && sample.environment)
    .sort((left, right) => right.reflectedAt - left.reflectedAt);

  const candidates: Array<SupportedEnvironmentAdjustment & { latestAt: number; difference: number }> = [];
  for (const anchor of eligible) {
    const comparable = eligible
      .filter(sample => comparableExceptEnvironment(sample, anchor))
      .slice(0, MAX_RECENT_SAMPLES);
    const environmentNights = comparable.filter(sample => sample.environment === anchor.environment);
    const comparisonNights = comparable.filter(sample => sample.environment !== anchor.environment);
    const recalledNights = environmentNights.filter(sample => sample.recall !== 'none').length;
    const comparisonRecallNights = comparisonNights.filter(sample => sample.recall !== 'none').length;
    if (environmentNights.length < MIN_ENVIRONMENT_NIGHTS
      || recalledNights < MIN_ENVIRONMENT_RECALLS
      || comparisonNights.length < MIN_COMPARISON_NIGHTS) continue;
    const difference = recalledNights / environmentNights.length
      - comparisonRecallNights / comparisonNights.length;
    if (difference < MIN_RECALL_RATE_DIFFERENCE) continue;
    const environment = anchor.environment as string;
    candidates.push({
      environment,
      recalledNights,
      environmentNights: environmentNights.length,
      comparisonRecallNights,
      comparisonNights: comparisonNights.length,
      difference,
      latestAt: Math.max(...environmentNights.map(sample => sample.reflectedAt)),
      reason: `You recalled dreams after ${recalledNights} of ${environmentNights.length} comparable ${titleCase(environment)} nights, compared with ${comparisonRecallNights} of ${comparisonNights.length} otherwise-matched nights.`,
    });
  }

  const best = candidates.sort((left, right) => right.difference - left.difference || right.latestAt - left.latestAt)[0];
  if (!best) return null;
  const { latestAt: _latestAt, difference: _difference, ...adjustment } = best;
  return adjustment;
}
