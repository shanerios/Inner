import type { DreamAgency, DreamAwareness, DreamRecall, DreamSleepImpact } from './dreamDetails';
import type { SignalNotice } from './lucidSignalLearning';
import type { NightExecutionRecord } from './nightExecution';
import type { NightRecord } from './nightRecords';

export type NightLearningExclusion =
  | 'test_session'
  | 'not_overnight'
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

  const exclusion: NightLearningExclusion | undefined = record.testSession
    ? 'test_session'
    : record.source !== 'overnight_journey'
      ? 'not_overnight'
      : gain === undefined || !plan?.recipe
        ? 'missing_recipe'
        : !execution
          ? 'missing_execution'
          : execution.status !== 'completed' && execution.status !== 'completed_early'
            ? 'incomplete_execution'
            : !execution.plannedCues.length || execution.missingCueIds.length > 0
              || execution.deliveredCues.length !== execution.plannedCues.length
              ? 'missing_cues'
              : execution.interruptionCount > 0
                ? 'interrupted'
                : !record.outcome.sleepImpact
                  ? 'missing_sleep_answer'
                  : plan.userChanged.includes('signalGainScale')
                    ? 'signal_level_overridden'
                    : undefined;

  return exclusion
    ? { ...summary, exclusion }
    : { ...summary, eligibleForCueLevel: true };
}

export function deriveNightLearningSamples(records: NightRecord[]): NightLearningSample[] {
  return records.map(nightLearningSample).sort((left, right) => right.reflectedAt - left.reflectedAt);
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
