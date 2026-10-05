import { describe, expect, it, jest } from '@jest/globals';
import type { JournalEntry } from '../journalRepo';
import type { NightRecord } from '../nightRecords';
import { deriveTonightRecommendation } from '../tonightRecommendation';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

const record = (id: string, sleepImpact: 'none' | 'gentle' | 'woke'): NightRecord => ({
  schemaVersion: 1,
  id,
  source: 'scheduled_signal',
  sourceSessionId: id,
  scheduledAt: 1,
  sleepOnsetAt: 1,
  reviewAt: 2,
  reflectedAt: Number(id.replace(/\D/g, '')) || 1,
  outcome: { recall: 'none', sleepImpact },
});

const deliveredRecord = (id: string, sleepImpact: 'none' | 'gentle' | 'woke', noticed: 'yes' | 'unsure' | 'no' = 'yes'): NightRecord => ({
  ...record(id, sleepImpact),
  source: 'overnight_journey',
  outcome: { recall: 'none', sleepImpact, signalNotice: noticed },
  practiceContext: {
    linkedAt: 2,
    links: [{
      sessionId: id,
      type: 'overnight_journey',
      startedAt: 1,
      linkReason: 'exact_overnight_session',
      nightExecution: {
        status: 'completed',
        startedAt: 1,
        endedAt: 2,
        plannedCues: [{ cueId: 'cue-1' }],
        deliveredCues: [{ cueId: 'cue-1', firedAt: 2 }],
        missingCueIds: [],
        audioRoute: 'private',
        interruptionCount: 0,
      },
    }],
    nightPlan: {
      id: `plan-${id}`,
      createdAt: 1,
      source: 'manual',
      configuration: {
        durationMinutes: 420,
        environment: 'ocean',
        feel: 'gentle',
        signalId: 'guardian',
        cuePlan: 'gentle',
        recognitionWindowCount: 1,
        signalGainScale: 1,
      },
      userChanged: [],
      recipe: {
        schemaVersion: 2,
        id: `recipe-${id}`,
        createdAt: 1,
        seed: 1,
        goal: 'lucid_recognition',
        durationMinutes: 420,
        environment: 'ocean',
        feel: 'gentle',
        preparation: { practice: 'lucid_signal', durationMinutes: 7 },
        recognition: {
          signalId: 'guardian',
          cuePlan: 'gentle',
          windows: [{ id: 'cue-1', cueAtMinute: 300, signalGainScale: 1, presentations: 1, backgroundDuckGain: 0.55, recoverySeconds: 35 }],
        },
        environmentArc: 'protected_standard',
      },
    },
  },
});

const dream = (id: string, sign: string): JournalEntry => ({
  schemaVersion: 2, id, createdAt: Number(id), updatedAt: Number(id), kind: 'dream', body: 'Remembered', dreamSigns: [sign],
});

describe('tonight recommendation', () => {
  it('prioritizes a gentler signal when repeated waking is observed', () => {
    expect(deriveTonightRecommendation([], [deliveredRecord('1', 'woke'), deliveredRecord('2', 'woke'), deliveredRecord('3', 'gentle')], [])).toEqual(expect.objectContaining({
      kind: 'gentler_signal',
      signalGainScale: 0.85,
    }));
  });

  it('suggests a small increase only after repeated confirmed non-recognition without waking', () => {
    expect(deriveTonightRecommendation([], [
      deliveredRecord('1', 'none', 'no'),
      deliveredRecord('2', 'none', 'no'),
      deliveredRecord('3', 'gentle', 'no'),
    ], [])).toEqual(expect.objectContaining({
      kind: 'clearer_signal',
      signalGainScale: 1.1,
    }));
  });

  it('turns a recurring sign into an explained practice action', () => {
    expect(deriveTonightRecommendation([dream('1', 'Water'), dream('2', 'Water'), dream('3', 'Water')], [], [])).toEqual(expect.objectContaining({
      kind: 'recurring_signal',
      title: 'Recognize Water',
    }));
  });

  it('recommends an environment only after a comparison supports it', () => {
    const environmentRecord = (id: string, environment: string, recall: 'dream' | 'none'): NightRecord => ({
      ...record(id, 'none'),
      source: 'overnight_journey',
      outcome: { recall, sleepImpact: 'none' },
      practiceContext: {
        linkedAt: Number(id),
        links: [{ sessionId: id, type: 'overnight_journey', contentTitle: `${environment} night`, startedAt: 1, linkReason: 'exact_overnight_session', environment }],
      },
    });
    const records = [
      ...['1', '2', '3', '4'].map(id => environmentRecord(id, 'ocean', 'dream')),
      environmentRecord('5', 'ocean', 'none'),
      ...['6', '7', '8'].map(id => environmentRecord(id, 'forest', 'none')),
    ];
    expect(deriveTonightRecommendation([], records, [])).toEqual(expect.objectContaining({
      kind: 'repeat_environment',
      title: 'Return to Ocean',
    }));
  });

  it('suggests a recognition refresh only when several outcomes exist', () => {
    const records = [record('1', 'none'), record('2', 'none'), record('3', 'none')].map(item => ({
      ...item,
      source: 'overnight_journey' as const,
    }));
    expect(deriveTonightRecommendation([], records, [], 8 * 24 * 60 * 60_000)).toEqual(expect.objectContaining({
      kind: 'recognition_refresh',
    }));
  });

  it('returns no recommendation when evidence is insufficient', () => {
    expect(deriveTonightRecommendation([dream('1', 'Water')], [], [])).toBeNull();
  });

  it('does not use development QA entries as recommendation evidence', () => {
    const qaDreams = ['1', '2', '3'].map(id => ({ ...dream(id, 'Water'), testSession: true }));
    expect(deriveTonightRecommendation(qaDreams, [], [])).toBeNull();
  });

  it('skips a paused rule and continues to the next supported recommendation', () => {
    const dreams = ['1', '2', '3'].map(id => dream(id, 'Water'));
    const disruptive = [deliveredRecord('4', 'woke'), deliveredRecord('5', 'woke'), deliveredRecord('6', 'gentle')];
    expect(deriveTonightRecommendation(dreams, disruptive, [], Date.now(), {
      excludedKinds: ['gentler_signal'],
    })).toEqual(expect.objectContaining({ kind: 'recurring_signal' }));
  });
});
