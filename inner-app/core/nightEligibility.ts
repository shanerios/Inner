import type { NightExecutionRecord } from './nightExecution';
import type { NightRecord } from './nightRecords';

/**
 * The one place that decides whether a recorded night can count as evidence of how
 * a recipe or signal level behaved. Each learner adds only its own answer
 * requirements on top, so a threshold changed here changes every learner at once.
 */
export type NightEligibilityExclusion =
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
  | 'volume_changed';

/** Reasons a learner can add for its own missing answers or overrides. */
export type LearnerOnlyExclusion =
  | 'missing_sleep_answer'
  | 'signal_level_overridden'
  | 'missing_recall_answer';

/**
 * Starting values, not yet tuned against real nights: below the floor the system
 * volume is close to muted, and a swing larger than the allowed spread means the
 * night was not heard at one level. Unrecorded volume stays eligible.
 */
export const MIN_OUTPUT_VOLUME = 0.15;
export const MAX_VOLUME_SPREAD = 0.15;
/** Floating-point slack so a difference of exactly the allowed spread still counts as within it. */
const VOLUME_EPSILON = 1e-9;

export const NIGHT_EXCLUSION_LABELS: Record<NightEligibilityExclusion | LearnerOnlyExclusion, string> = {
  test_session: 'test session',
  not_overnight: 'not an Overnight Journey',
  quiet_night: 'marked as a quiet night',
  missing_recipe: 'recipe unavailable',
  missing_execution: 'playback receipt unavailable',
  incomplete_execution: 'journey did not complete',
  missing_cues: 'one or more signals were not delivered',
  interrupted: 'playback was interrupted',
  route_changed: 'audio route changed',
  volume_low: 'device volume was near mute',
  volume_changed: 'device volume changed',
  missing_sleep_answer: 'sleep effect was unanswered',
  signal_level_overridden: 'signal level differed from the proposal',
  missing_recall_answer: 'dream recall was unanswered',
};

export function nightExecutionFor(record: NightRecord): NightExecutionRecord | undefined {
  return record.practiceContext?.links.find(link => link.type === 'overnight_journey')?.nightExecution;
}

/**
 * Checks what every learner needs: a real, completed, fully delivered, uninterrupted
 * Overnight Journey heard at one steady level. Playback problems come first because
 * they make the listening conditions meaningless to inspect.
 */
export function nightEligibilityExclusion(
  record: NightRecord,
  execution: NightExecutionRecord | undefined,
  hasRecipe: boolean,
): NightEligibilityExclusion | undefined {
  if (record.testSession) return 'test_session';
  if (record.source !== 'overnight_journey') return 'not_overnight';
  if (record.practiceContext?.nightPlan?.quietNight) return 'quiet_night';
  if (!hasRecipe) return 'missing_recipe';
  if (!execution) return 'missing_execution';
  if (execution.status !== 'completed' && execution.status !== 'completed_early') return 'incomplete_execution';
  if (!execution.plannedCues.length || execution.missingCueIds.length > 0
    || execution.deliveredCues.length !== execution.plannedCues.length) return 'missing_cues';
  if (execution.interruptionCount > 0) return 'interrupted';
  if (execution.audioRouteChanges) return 'route_changed';
  if (execution.outputVolume && execution.outputVolume.min < MIN_OUTPUT_VOLUME - VOLUME_EPSILON) return 'volume_low';
  if (execution.outputVolume && execution.outputVolume.max - execution.outputVolume.min > MAX_VOLUME_SPREAD + VOLUME_EPSILON) return 'volume_changed';
  return undefined;
}

/** Midpoint of the sampled system volume, or undefined when the build did not record it. */
export function meanOutputVolume(execution: NightExecutionRecord | undefined): number | undefined {
  if (!execution?.outputVolume) return undefined;
  return Math.round((execution.outputVolume.min + execution.outputVolume.max) / 2 * 100) / 100;
}

/** Two nights were heard at a similar level; both unrecorded counts as similar. */
export function sameVolumeBand(left?: number, right?: number): boolean {
  if (left === undefined || right === undefined) return left === right;
  return Math.abs(left - right) <= MAX_VOLUME_SPREAD + VOLUME_EPSILON;
}
