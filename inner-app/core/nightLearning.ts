import type { DreamAgency, DreamAwareness, DreamRecall, DreamSleepImpact } from './dreamDetails';
import type { SignalNotice } from './lucidSignalLearning';
import type { NightExecutionRecord } from './nightExecution';
import type { NightRecord } from './nightRecords';

export type NightLearningExclusion =
  | 'test_session'
  | 'not_overnight'
  | 'quiet_night'
  | 'route_changed'
  | 'volume_low'
  | 'volume_changed'
  | 'missing_recipe'
  | 'missing_execution'
  | 'incomplete_execution'
  | 'missing_cues'
  | 'interrupted'
  | 'missing_sleep_answer'
  | 'signal_level_overridden';

export type NightLearningSample = {
  id: string;
  reflectedAt: number;
  eligibleForCueLevel: boolean;
  exclusion?: NightLearningExclusion;
  signalId?: string;
  cuePlan?: 'standard' | 'gentle';
  audioRoute: 'private' | 'speaker' | 'unknown';
  signalGainScale?: number;
  /** Midpoint of the sampled system volume, when the build recorded it. */
  outputVolume?: number;
  execution?: Pick<NightExecutionRecord, 'status' | 'interruptionCount'> & {
    plannedCueCount: number;
    deliveredCueCount: number;
  };
  outcome: {
    recall: DreamRecall;
    awareness?: DreamAwareness;
    agency?: DreamAgency;
    signalNotice?: SignalNotice;
    sleepImpact?: DreamSleepImpact;
  };
};

export type CueLevelAdjustment = {
  direction: 'lower' | 'raise';
  previousGainScale: number;
  proposedGainScale: number;
  sampleCount: number;
  wokeCount: number;
  notNoticedCount: number;
  reason: string;
};

const MIN_GAIN_SCALE = 0.65;
const MAX_GAIN_SCALE = 1.2;
/**
 * Starting values, not yet tuned against real nights: below the floor the system
 * volume is close to muted, and a swing larger than the allowed spread means the
 * night was not heard at one level. Unrecorded volume stays eligible.
 */
const MIN_OUTPUT_VOLUME = 0.15;
const MAX_VOLUME_SPREAD = 0.15;
const MIN_COMPARABLE_NIGHTS = 3;
const MAX_COMPARABLE_NIGHTS = 5;

function roundedGain(value: number): number {
  return Math.round(value * 100) / 100;
}

function recipeGain(record: NightRecord): number | undefined {
  const windows = record.practiceContext?.nightPlan?.recipe?.recognition.windows;
  if (!windows?.length) return undefined;
  return roundedGain(windows.reduce((total, window) => total + window.signalGainScale, 0) / windows.length);
}

function executionFor(record: NightRecord): NightExecutionRecord | undefined {
  return record.practiceContext?.links.find(link => link.type === 'overnight_journey')?.nightExecution;
}

function learningExclusion(
  record: NightRecord,
  execution: NightExecutionRecord | undefined,
  gain: number | undefined,
): NightLearningExclusion | undefined {
  const plan = record.practiceContext?.nightPlan;
  if (record.testSession) return 'test_session';
  if (record.source !== 'overnight_journey') return 'not_overnight';
  if (plan?.quietNight) return 'quiet_night';
  if (gain === undefined || !plan?.recipe) return 'missing_recipe';
  if (!execution) return 'missing_execution';
  if (execution.status !== 'completed' && execution.status !== 'completed_early') return 'incomplete_execution';
  if (execution.audioRouteChanges) return 'route_changed';
  if (execution.outputVolume && execution.outputVolume.min < MIN_OUTPUT_VOLUME) return 'volume_low';
  if (execution.outputVolume && execution.outputVolume.max - execution.outputVolume.min > MAX_VOLUME_SPREAD) return 'volume_changed';
  if (!execution.plannedCues.length || execution.missingCueIds.length > 0
    || execution.deliveredCues.length !== execution.plannedCues.length) return 'missing_cues';
  if (execution.interruptionCount > 0) return 'interrupted';
  if (!record.outcome.sleepImpact) return 'missing_sleep_answer';
  if (plan.userChanged.includes('signalGainScale')) return 'signal_level_overridden';
  return undefined;
}

/**
 * Flattens the plan, confirmed playback, and morning report into one comparable
 * record. Eligibility is intentionally strict so missing delivery cannot be
 * mistaken for a signal the practitioner slept through.
 */
export function nightLearningSample(record: NightRecord): NightLearningSample {
  const execution = executionFor(record);
  const gain = recipeGain(record);
  const plan = record.practiceContext?.nightPlan;
  const signalId = plan?.recipe?.recognition.signalId ?? plan?.configuration.signalId;
  const cuePlan = plan?.recipe?.recognition.cuePlan ?? plan?.configuration.cuePlan;
  const audioRoute = execution?.audioRoute ?? 'unknown';
  const summary: NightLearningSample = {
    id: record.id,
    reflectedAt: record.reflectedAt,
    eligibleForCueLevel: false,
    signalId,
    cuePlan,
    audioRoute,
    signalGainScale: gain,
    outputVolume: execution?.outputVolume
      ? roundedGain((execution.outputVolume.min + execution.outputVolume.max) / 2)
      : undefined,
    execution: execution ? {
      status: execution.status,
      interruptionCount: execution.interruptionCount,
      plannedCueCount: execution.plannedCues.length,
      deliveredCueCount: execution.deliveredCues.length,
    } : undefined,
    outcome: {
      recall: record.outcome.recall,
      awareness: record.outcome.dreamDetails?.awareness,
      agency: record.outcome.dreamDetails?.agency,
      signalNotice: record.outcome.signalNotice,
      sleepImpact: record.outcome.sleepImpact,
    },
  };

  const exclusion = learningExclusion(record, execution, gain);

  return exclusion
    ? { ...summary, exclusion }
    : { ...summary, eligibleForCueLevel: true };
}

export function deriveNightLearningSamples(records: NightRecord[]): NightLearningSample[] {
  return records.map(nightLearningSample).sort((left, right) => right.reflectedAt - left.reflectedAt);
}

function sameVolumeBand(left?: number, right?: number): boolean {
  if (left === undefined || right === undefined) return left === right;
  return Math.abs(left - right) <= MAX_VOLUME_SPREAD;
}

/**
 * Suggests one conservative cue-level step after at least three comparable
 * nights at the current level, with the same signal and audio route.
 */
export function deriveCueLevelAdjustment(records: NightRecord[]): CueLevelAdjustment | null {
  const eligible = deriveNightLearningSamples(records).filter(sample => sample.eligibleForCueLevel);
  const latest = eligible[0];
  if (!latest || latest.signalGainScale === undefined || !latest.signalId) return null;

  const comparable = eligible
    .filter(sample => sample.signalId === latest.signalId
      && sample.cuePlan === latest.cuePlan
      && sample.audioRoute === latest.audioRoute
      && sameVolumeBand(sample.outputVolume, latest.outputVolume)
      && sample.execution?.plannedCueCount === latest.execution?.plannedCueCount
      && sample.signalGainScale === latest.signalGainScale)
    .slice(0, MAX_COMPARABLE_NIGHTS);
  if (comparable.length < MIN_COMPARABLE_NIGHTS) return null;

  const wokeCount = comparable.filter(sample => sample.outcome.sleepImpact === 'woke').length;
  const notNoticedCount = comparable.filter(sample => sample.outcome.signalNotice === 'no').length;
  const current = latest.signalGainScale;

  if (wokeCount >= Math.ceil(comparable.length / 2) && current > MIN_GAIN_SCALE) {
    const proposed = roundedGain(Math.max(MIN_GAIN_SCALE, current - 0.15));
    return {
      direction: 'lower',
      previousGainScale: current,
      proposedGainScale: proposed,
      sampleCount: comparable.length,
      wokeCount,
      notNoticedCount,
      reason: `The signal was confirmed delivered and woke you on ${wokeCount} of ${comparable.length} comparable nights. Inner suggests lowering it from ${Math.round(current * 100)}% to ${Math.round(proposed * 100)}% of its calibrated level.`,
    };
  }

  if (wokeCount === 0 && notNoticedCount === comparable.length && current < MAX_GAIN_SCALE) {
    const proposed = roundedGain(Math.min(MAX_GAIN_SCALE, current + 0.1));
    return {
      direction: 'raise',
      previousGainScale: current,
      proposedGainScale: proposed,
      sampleCount: comparable.length,
      wokeCount,
      notNoticedCount,
      reason: `The signal was confirmed delivered but not noticed on ${notNoticedCount} comparable nights, without waking you. Inner suggests raising it from ${Math.round(current * 100)}% to ${Math.round(proposed * 100)}% of its calibrated level.`,
    };
  }

  return null;
}
