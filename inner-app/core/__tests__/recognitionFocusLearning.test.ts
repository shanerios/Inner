import { describe, expect, it } from '@jest/globals';
import type { NightRecord } from '../nightRecords';
import {
  deriveRecognitionFocusObservations,
  recognitionFocusEvidenceText,
  recognitionFocusObservationForSign,
  recognitionFocusObservationText,
} from '../recognitionFocusLearning';

function focusedNight(
  id: number,
  sign: string,
  appeared: 'no' | 'unsure' | 'yes',
  recognized?: 'no' | 'unsure' | 'yes',
  testSession = false,
): NightRecord {
  return {
    schemaVersion: 1,
    id: `night-${id}`,
    source: 'overnight_journey',
    sourceSessionId: `session-${id}`,
    scheduledAt: id,
    sleepOnsetAt: id,
    reviewAt: id,
    reflectedAt: id,
    testSession: testSession || undefined,
    outcome: {
      recall: 'dream',
      dreamDetails: { recognitionFocus: { sign, appeared, recognized } },
    },
  };
}

describe('recognition focus learning', () => {
  it('separates appearance from recognition and ignores QA nights', () => {
    const result = recognitionFocusObservationForSign([
      focusedNight(1, 'Water', 'no'),
      focusedNight(2, 'water', 'yes', 'no'),
      focusedNight(3, 'Water', 'yes', 'yes'),
      focusedNight(4, 'Water', 'yes', 'yes', true),
    ], 'WATER');
    expect(result).toEqual({
      sign: 'Water',
      answeredNights: 3,
      appearedNights: 2,
      uncertainAppearanceNights: 0,
      recognitionAnsweredNights: 2,
      recognizedNights: 1,
      mostRecentAt: 3,
    });
  });

  it('uses unknown language before three answered nights', () => {
    const observation = deriveRecognitionFocusObservations([focusedNight(1, 'Water', 'yes', 'no')])[0];
    expect(recognitionFocusObservationText(observation)).toBe('Inner has 1 answered Water-focus night.');
    expect(recognitionFocusEvidenceText(observation)).toContain("There isn't enough information yet.");
  });

  it('reports sufficiently repeated outcomes as observations', () => {
    const observation = deriveRecognitionFocusObservations([
      focusedNight(1, 'Water', 'no'),
      focusedNight(2, 'Water', 'yes', 'no'),
      focusedNight(3, 'Water', 'yes', 'yes'),
    ])[0];
    expect(recognitionFocusObservationText(observation)).toBe('Water appeared in 2 of 3 answered focus nights.');
    expect(recognitionFocusEvidenceText(observation)).toBe('Observed: it was recognized in 1 of 2 reported appearances.');
  });
});
