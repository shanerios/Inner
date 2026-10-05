import { describe, expect, it, jest } from '@jest/globals';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

import {
  canPresentMorningReturn,
  canShowMorningReturnContinuation,
  selectPendingMorningReturn,
} from '../morningReturn';

const scheduled = {
  id: 'scheduled-signal',
  scheduledAt: 10,
  sleepOnsetAt: 20,
  cueTimes: [30],
  reviewAt: 40,
};

function overnightSession(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: 2,
    id: 'overnight-session',
    journeyId: 'overnight-recognition-ocean-standard',
    title: 'Ocean Night',
    startedAt: 100,
    plannedDurationMs: 1_000,
    endPolicy: 'protocolControlled',
    protocolVersion: 1,
    seed: 1,
    initialConfig: {},
    stages: [],
    events: [],
    morningCapture: { journalEntryId: 'dream-entry', savedAt: 1_101 },
    ...overrides,
  };
}

describe('global Morning Return selection', () => {
  it('prioritizes the exact eligible Overnight Journey', () => {
    const pending = selectPendingMorningReturn({
      schemaVersion: 2,
      sessions: [overnightSession()],
    } as any, scheduled as any, 1_100);
    expect(pending).toMatchObject({
      id: 'overnight-session',
      journeySessionId: 'overnight-session',
      morningCaptureEntryId: 'dream-entry',
      practiceLink: {
        sessionId: 'overnight-session',
        type: 'overnight_journey',
        contentTitle: 'Ocean Night',
        linkReason: 'exact_overnight_session',
      },
    });
  });

  it('falls back to scheduled signals before an Overnight Journey becomes eligible', () => {
    const pending = selectPendingMorningReturn({
      schemaVersion: 2,
      sessions: [overnightSession()],
    } as any, scheduled as any, 1_099);
    expect(pending?.id).toBe('scheduled-signal');
    expect(pending?.practiceLink).toMatchObject({
      sessionId: 'scheduled-signal',
      type: 'recognition_signal',
      linkReason: 'exact_signal_night',
    });
    expect(pending?.practiceLink?.firedCueIds).toBeUndefined();
  });

  it('carries the development QA marker into Morning Return', () => {
    const pending = selectPendingMorningReturn({
      schemaVersion: 2,
      sessions: [overnightSession({ testSession: true })],
    } as any, null, 1_100);
    expect(pending?.testSession).toBe(true);
  });

  it('does not interrupt startup, blocking flows, or active playback', () => {
    expect(canPresentMorningReturn('Splash')).toBe(false);
    expect(canPresentMorningReturn('LucidJourneyPlayer')).toBe(false);
    expect(canPresentMorningReturn('GuardianPlayer')).toBe(false);
    expect(canPresentMorningReturn('Home')).toBe(true);
    expect(canPresentMorningReturn('Journal')).toBe(true);
    expect(canPresentMorningReturn(undefined)).toBe(false);
  });

  it('waits for Home entry flows to finish before presenting', () => {
    expect(canPresentMorningReturn('Home', false)).toBe(false);
    expect(canPresentMorningReturn('Home', true)).toBe(true);
    expect(canPresentMorningReturn('Journal', false)).toBe(true);
  });

  it('keeps a deferred return available only from Home', () => {
    expect(canShowMorningReturnContinuation('Home')).toBe(true);
    expect(canShowMorningReturnContinuation('Journal')).toBe(false);
    expect(canShowMorningReturnContinuation('LucidJourneys')).toBe(false);
    expect(canShowMorningReturnContinuation(undefined)).toBe(false);
  });
});
