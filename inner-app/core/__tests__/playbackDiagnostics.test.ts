import { buildPlaybackDiagnosticsExport, serializePlaybackDiagnostics } from '../playbackDiagnostics';
import { DEFAULT_PROCEDURAL_AUDIO_CONFIG } from '../audio/config';
import { describe, expect, it } from '@jest/globals';

describe('playback diagnostics export', () => {
  it('contains playback evidence without user-authored reflection content', () => {
    const exported = buildPlaybackDiagnosticsExport({
      schemaVersion: 1,
      sessions: [{
        schemaVersion: 1,
        id: 'session-1',
        journeyId: 'overnight-recognition-ocean-standard',
        title: 'A private custom title',
        startedAt: 100,
        endedAt: 200,
        morningReflection: {
          answers: { noticed: 'yes', lucid: true, sleepImpact: 'none' },
          savedAt: 250,
        },
        plannedDurationMs: 60_000,
        endPolicy: 'protocolControlled',
        protocolVersion: 1,
        seed: 42,
        initialConfig: DEFAULT_PROCEDURAL_AUDIO_CONFIG,
        stages: [],
        outcome: 'left_early',
        endReason: 'manual_stop',
        actualDurationMs: 55_000,
        elapsedWallTimeMs: 100,
        events: [{ type: 'audio_underrun', at: 150, positionMs: 40_000, underrunCount: 2 }],
      }],
    }, { version: '2.3', build: '59', platform: 'android' }, 300);

    expect(exported.sessions[0]).toMatchObject({
      id: 'session-1',
      journeyId: 'overnight-recognition-ocean-standard',
      events: [{ type: 'audio_underrun', underrunCount: 2 }],
    });
    expect(exported.sessions[0]).not.toHaveProperty('title');
    expect(exported.sessions[0]).not.toHaveProperty('morningReflection');
    const json = serializePlaybackDiagnostics(exported);
    expect(json).not.toContain('private custom title');
    expect(json).not.toContain('sleepImpact');
  });
});
