import type { NightRecord } from './nightRecords';
import { deriveNightLearningSamples } from './nightLearning';
import {
  deriveRecognitionFocusObservations,
  MIN_RECOGNITION_FOCUS_NIGHTS,
} from './recognitionFocusLearning';
import { deriveSupportedEnvironmentAdjustment } from './adaptiveRecipeLearning';
import type { JourneyMemorySession } from './journeyMemory';

export const PRACTICE_STATE_SCHEMA_VERSION = 1 as const;
export const PRACTICE_STATE_RULES_VERSION = 1 as const;

export type PracticeObjective =
  | 'establish_baseline'
  | 'protect_sleep'
  | 'strengthen_recognition'
  | 'calibrate_signal'
  | 'test_supported_environment'
  | 'refresh_recognition'
  | 'observe_stable_recipe';

export type PracticeStateV1 = {
  schemaVersion: typeof PRACTICE_STATE_SCHEMA_VERSION;
  rulesVersion: typeof PRACTICE_STATE_RULES_VERSION;
  derivedAt: number;
  nightsObserved: number;
  confidence: 'forming' | 'early' | 'established';
  objective: {
    id: PracticeObjective;
    title: string;
    reason: string;
  };
  recall: {
    answeredNights: number;
    rememberedNights: number;
  };
  sleepSafety: {
    comparableNights: number;
    wokeNights: number;
  };
  signalExperience: {
    answeredNights: number;
    inDreamNights: number;
    whileWakingNights: number;
    bothNights: number;
    notNoticedNights: number;
    uncertainNights: number;
    legacyNoticedNights: number;
  };
  recognition: {
    focus?: string;
    answeredNights: number;
    appearedNights: number;
    recognizedNights: number;
    preparedFocusNights: number;
    matchedPreparationNights: number;
  };
};

function confidenceFor(nights: number): PracticeStateV1['confidence'] {
  if (nights >= 8) return 'established';
  if (nights >= 3) return 'early';
  return 'forming';
}

/**
 * Derives a local, inspectable state from durable night records. It describes
 * what to learn next; it never mutates a recipe or claims causation.
 */
export function derivePracticeState(
  records: NightRecord[],
  now = Date.now(),
  sessions?: JourneyMemorySession[],
): PracticeStateV1 {
  const recent = records
    .filter(record => !record.testSession && record.source === 'overnight_journey')
    .sort((left, right) => right.reflectedAt - left.reflectedAt)
    .slice(0, 12);
  const comparable = deriveNightLearningSamples(recent).filter(sample => sample.eligibleForCueLevel);
  const rememberedNights = recent.filter(record => record.outcome.recall !== 'none').length;
  const wokeNights = comparable.filter(sample => sample.outcome.sleepImpact === 'woke').length;
  const comparableNotNoticedNights = comparable.filter(sample => sample.outcome.signalNotice === 'no').length;

  const signalExperience = {
    answeredNights: 0,
    inDreamNights: 0,
    whileWakingNights: 0,
    bothNights: 0,
    notNoticedNights: 0,
    uncertainNights: 0,
    legacyNoticedNights: 0,
  };
  for (const record of recent) {
    const experience = record.outcome.signalExperience;
    if (experience) {
      signalExperience.answeredNights += 1;
      if (experience === 'in_dream') signalExperience.inDreamNights += 1;
      if (experience === 'while_waking') signalExperience.whileWakingNights += 1;
      if (experience === 'both') signalExperience.bothNights += 1;
      if (experience === 'not_noticed') signalExperience.notNoticedNights += 1;
      if (experience === 'unsure') signalExperience.uncertainNights += 1;
    } else if (record.outcome.signalNotice) {
      signalExperience.answeredNights += 1;
      if (record.outcome.signalNotice === 'yes') signalExperience.legacyNoticedNights += 1;
      if (record.outcome.signalNotice === 'no') signalExperience.notNoticedNights += 1;
      if (record.outcome.signalNotice === 'unsure') signalExperience.uncertainNights += 1;
    }
  }

  const focusObservation = deriveRecognitionFocusObservations(recent)[0];
  const focusKey = focusObservation?.sign.toLocaleLowerCase();
  const focusedRecords = focusKey
    ? recent.filter(record => record.practiceContext?.nightPlan?.recipe?.recognition.intention?.sign.toLocaleLowerCase() === focusKey)
    : [];
  const preparedFocusNights = focusedRecords.filter(record => (
    record.practiceContext?.nightPlan?.recipe?.recognition.intention?.completedPractice
  )).length;
  const matchedPreparationNights = focusedRecords.filter(record => {
    const recipe = record.practiceContext?.nightPlan?.recipe;
    return recipe?.recognition.intention?.completedPractice?.signalId === recipe?.recognition.signalId;
  }).length;
  const recognition = {
    focus: focusObservation?.sign,
    answeredNights: focusObservation?.answeredNights ?? 0,
    appearedNights: focusObservation?.appearedNights ?? 0,
    recognizedNights: focusObservation?.recognizedNights ?? 0,
    preparedFocusNights,
    matchedPreparationNights,
  };
  const environmentAdjustment = deriveSupportedEnvironmentAdjustment(recent);
  const recentRecognition = sessions?.some(session => (
    session.journeyId === 'lucid-signal' && session.startedAt >= now - 7 * 24 * 60 * 60_000
  ));
  const hasRecentOutcome = recent.some(record => record.reflectedAt >= now - 30 * 24 * 60 * 60_000);

  let objective: PracticeStateV1['objective'];
  if (recent.length < 3) {
    objective = {
      id: 'establish_baseline',
      title: 'Establish your baseline',
      reason: `${recent.length} reflected ${recent.length === 1 ? 'night is' : 'nights are'} recorded. Inner needs at least three before treating an outcome as an early pattern.`,
    };
  } else if (comparable.length >= 3 && wokeNights >= Math.ceil(comparable.length / 2)) {
    objective = {
      id: 'protect_sleep',
      title: 'Protect sleep continuity',
      reason: `You reported waking on ${wokeNights} of ${comparable.length} comparable nights. Signal intensity should stabilize before another variable changes.`,
    };
  } else if (focusObservation
    && focusObservation.answeredNights >= MIN_RECOGNITION_FOCUS_NIGHTS
    && focusObservation.appearedNights >= 2
    && focusObservation.recognitionAnsweredNights >= 2
    && focusObservation.recognizedNights === 0) {
    objective = {
      id: 'strengthen_recognition',
      title: `Strengthen ${focusObservation.sign} recognition`,
      reason: `${focusObservation.sign} appeared in ${focusObservation.appearedNights} answered focus nights without a reported recognition. Waking practice is the next variable to strengthen.`,
    };
  } else if (comparable.length >= 3
    && comparableNotNoticedNights >= 3
    && wokeNights === 0) {
    objective = {
      id: 'calibrate_signal',
      title: 'Calibrate signal presence',
      reason: `The signal was not noticed on ${comparableNotNoticedNights} comparable nights without a reported waking response.`,
    };
  } else if (environmentAdjustment) {
    const label = environmentAdjustment.environment.charAt(0).toUpperCase() + environmentAdjustment.environment.slice(1);
    objective = {
      id: 'test_supported_environment',
      title: `Test another ${label} night`,
      reason: environmentAdjustment.reason,
    };
  } else if (sessions && recent.length >= 3 && hasRecentOutcome && !recentRecognition) {
    objective = {
      id: 'refresh_recognition',
      title: 'Refresh recognition',
      reason: 'Recognition practice has not appeared in the last seven days of recorded practice.',
    };
  } else {
    objective = {
      id: 'observe_stable_recipe',
      title: 'Keep the next night comparable',
      reason: 'No single outcome currently justifies changing the recipe. Repeating a stable setup will make the next observation more useful.',
    };
  }

  return {
    schemaVersion: PRACTICE_STATE_SCHEMA_VERSION,
    rulesVersion: PRACTICE_STATE_RULES_VERSION,
    derivedAt: now,
    nightsObserved: recent.length,
    confidence: confidenceFor(recent.length),
    objective,
    recall: { answeredNights: recent.length, rememberedNights },
    sleepSafety: { comparableNights: comparable.length, wokeNights },
    signalExperience,
    recognition,
  };
}
