import { describe, expect, it, jest } from '@jest/globals';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

import { DEFAULT_PROCEDURAL_AUDIO_CONFIG } from '../audio';
import {
  practiceContextSummary,
  practiceLinkFromOvernightSession,
  snapshotPracticeContext,
} from '../practiceContext';

describe('dream practice context', () => {
  const session = {
    schemaVersion: 2 as const,
    id: 'night-1',
    nightPlanId: 'night-plan-1',
    journeyId: 'overnight-recognition-ocean-standard',
    title: 'Ocean Night',
    startedAt: 1_000,
    endedAt: 61_000,
    plannedDurationMs: 60_000,
    endPolicy: 'protocolControlled' as const,
    protocolVersion: 1,
    seed: 4,
    initialConfig: DEFAULT_PROCEDURAL_AUDIO_CONFIG,
    stages: [{
      id: 'recognition-window',
      durationMs: 60_000,
      config: { ...DEFAULT_PROCEDURAL_AUDIO_CONFIG, environment: 'ocean' as const, environmentGain: 0.4 },
    }],
    events: [
      { type: 'recognition_signal_selected' as const, at: 2_000, positionMs: 0, signalId: 'droplets' },
      { type: 'audio_route_changed' as const, at: 3_000, positionMs: 0, route: 'private' },
      { type: 'recognition_signal_fired' as const, at: 30_000, positionMs: 29_000, cueId: 'cue-1' },
    ],
  };

  it('captures the exact overnight evidence without dream text', () => {
    expect(practiceLinkFromOvernightSession(session as any)).toEqual(expect.objectContaining({
      sessionId: 'night-1',
      contentTitle: 'Ocean Night',
      environment: 'ocean',
      signalId: 'droplets',
      audioRoute: 'private',
      stageIds: ['recognition-window'],
      firedCueIds: ['cue-1'],
      nightPlanId: 'night-plan-1',
    }));
  });

  it('carries the native planned-versus-delivered receipt into dream context', () => {
    const withRecipeCues = {
      ...session,
      completionStatus: 'partial' as const,
      outcome: 'user_stopped' as const,
      plannedRecognitionCues: [
        { cueId: 'cue-1', scheduledPositionMs: 29_000 },
        { cueId: 'cue-2', scheduledPositionMs: 49_000 },
      ],
    };
    const snapshot = snapshotPracticeContext(practiceLinkFromOvernightSession(withRecipeCues as any), 181_000)!;
    expect(snapshot.links[0].nightExecution).toEqual(expect.objectContaining({
      status: 'partial',
      deliveredCues: [expect.objectContaining({ cueId: 'cue-1' })],
      missingCueIds: ['cue-2'],
    }));
    expect(practiceContextSummary(snapshot)).toContain('Night delivery: 1 of 2 planned signals');
  });

  it('freezes timing relative to capture and creates a readable summary', () => {
    const snapshot = snapshotPracticeContext(practiceLinkFromOvernightSession(session as any), 181_000)!;
    expect(snapshot.links[0].minutesBeforeCapture).toBe(2);
    expect(practiceContextSummary(snapshot)).toEqual([
      'Ocean Night',
      'Environment: Ocean',
      'Recognition signal: Droplets',
      '1 cue presented',
      'Audio route: Headphones or private output',
      'Reflection captured near the end of the night',
    ]);
  });

  it('uses natural units when a reflection is captured days later', () => {
    const snapshot = snapshotPracticeContext(practiceLinkFromOvernightSession(session as any), 61_000 + 7_391 * 60_000)!;
    expect(practiceContextSummary(snapshot)).toContain('Reflection captured 5 days later');
  });

  it('shows the recommendation separately from the practice that actually occurred', () => {
    const snapshot = snapshotPracticeContext(practiceLinkFromOvernightSession(session as any), 181_000)!;
    snapshot.recommendation = {
      id: 'environment:ocean',
      kind: 'repeat_environment',
      title: 'Return to Ocean',
      reason: 'Ocean nights have included stronger recall in your reports.',
      selectedAt: 500,
    };
    expect(practiceContextSummary(snapshot).slice(0, 2)).toEqual([
      'Inner suggested · Return to Ocean',
      'Ocean nights have included stronger recall in your reports.',
    ]);
  });

  it('summarizes the reviewed Night Plan before actual journey evidence', () => {
    const snapshot = snapshotPracticeContext(practiceLinkFromOvernightSession(session as any), 181_000)!;
    snapshot.nightPlan = {
      id: 'night-plan-1',
      createdAt: 900,
      source: 'experiment',
      configuration: {
        durationMinutes: 450,
        environment: 'ocean',
        feel: 'gentle',
        signalId: 'droplets',
        cuePlan: 'standard',
        recognitionWindowCount: 2,
      },
      userChanged: [],
      recipe: {
        schemaVersion: 2,
        id: 'recipe-1',
        createdAt: 900,
        seed: 1,
        goal: 'lucid_recognition',
        durationMinutes: 450,
        environment: 'ocean',
        feel: 'gentle',
        preparation: { practice: 'lucid_signal', durationMinutes: 7 },
        recognition: {
          signalId: 'droplets',
          cuePlan: 'standard',
          windows: [],
          intention: {
            type: 'recurring_dream_sign',
            sign: 'Water',
            selectedAt: 800,
            evidence: { appearances: 4, rememberedDreams: 7 },
          },
        },
        environmentArc: 'protected_standard',
      },
    };
    expect(practiceContextSummary(snapshot).slice(0, 4)).toEqual([
      "Tonight's plan · Ocean",
      '450 min · gentle · 2 recognition windows',
      'Recognition focus: Water',
      'Source: Personal experiment',
    ]);
  });
});
