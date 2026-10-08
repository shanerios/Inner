import type { NightRecord } from './nightRecords';

const RECENT_FOCUS_OUTCOME_LIMIT = 12;
export const MIN_RECOGNITION_FOCUS_NIGHTS = 3;

export type RecognitionFocusObservation = {
  sign: string;
  answeredNights: number;
  appearedNights: number;
  uncertainAppearanceNights: number;
  recognitionAnsweredNights: number;
  recognizedNights: number;
  mostRecentAt: number;
};

export function deriveRecognitionFocusObservations(records: NightRecord[]): RecognitionFocusObservation[] {
  const outcomes = records
    .filter(record => !record.testSession && record.outcome.recall !== 'none')
    .flatMap(record => {
      const focus = record.outcome.dreamDetails?.recognitionFocus;
      return focus?.sign && focus.appeared
        ? [{ focus, reflectedAt: record.reflectedAt }]
        : [];
    })
    .sort((a, b) => b.reflectedAt - a.reflectedAt)
    .slice(0, RECENT_FOCUS_OUTCOME_LIMIT);

  const groups = new Map<string, RecognitionFocusObservation>();
  for (const { focus, reflectedAt } of outcomes) {
    const key = focus.sign.toLocaleLowerCase();
    const current = groups.get(key) ?? {
      sign: focus.sign,
      answeredNights: 0,
      appearedNights: 0,
      uncertainAppearanceNights: 0,
      recognitionAnsweredNights: 0,
      recognizedNights: 0,
      mostRecentAt: reflectedAt,
    };
    current.answeredNights += 1;
    if (focus.appeared === 'yes') {
      current.appearedNights += 1;
      if (focus.recognized) {
        current.recognitionAnsweredNights += 1;
        if (focus.recognized === 'yes') current.recognizedNights += 1;
      }
    } else if (focus.appeared === 'unsure') {
      current.uncertainAppearanceNights += 1;
    }
    current.mostRecentAt = Math.max(current.mostRecentAt, reflectedAt);
    groups.set(key, current);
  }

  return [...groups.values()].sort((a, b) => b.mostRecentAt - a.mostRecentAt);
}

export function recognitionFocusObservationForSign(
  records: NightRecord[],
  sign: string,
): RecognitionFocusObservation | null {
  const key = sign.trim().toLocaleLowerCase();
  return deriveRecognitionFocusObservations(records)
    .find(observation => observation.sign.toLocaleLowerCase() === key) ?? null;
}

export function recognitionFocusObservationText(observation: RecognitionFocusObservation): string {
  if (observation.answeredNights < MIN_RECOGNITION_FOCUS_NIGHTS) {
    return `Inner has ${observation.answeredNights} answered ${observation.sign}-focus ${observation.answeredNights === 1 ? 'night' : 'nights'}.`;
  }
  return `${observation.sign} appeared in ${observation.appearedNights} of ${observation.answeredNights} answered focus nights.`;
}

export function recognitionFocusEvidenceText(observation: RecognitionFocusObservation): string {
  if (observation.answeredNights < MIN_RECOGNITION_FOCUS_NIGHTS) {
    return `There isn't enough information yet. Inner waits for at least ${MIN_RECOGNITION_FOCUS_NIGHTS} answered nights before using this outcome in a recommendation.`;
  }
  if (!observation.recognitionAnsweredNights) {
    return 'Observed: recognition has not yet been reported for an appearance of this sign.';
  }
  return `Observed: it was recognized in ${observation.recognizedNights} of ${observation.recognitionAnsweredNights} reported appearances.`;
}
