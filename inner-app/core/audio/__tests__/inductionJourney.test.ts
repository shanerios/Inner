import { describe, expect, it, jest } from '@jest/globals';
import { DEFAULT_PROCEDURAL_AUDIO_CONFIG } from '../config';
import { FACTORY_AUDIO_JOURNEYS } from '../factoryJourneys';
import { IDENTITY_PRESENCE_MAX } from '../identityArc';
import { INDUCTION_DURATION_MS, INDUCTION_JOURNEY, INDUCTION_JOURNEY_ID, INDUCTION_SIGNAL_ID } from '../inductionJourney';
import { compileAudioJourneyTimeline } from '../timeline';
import { decideStart, environmentsOfTimeline, isPremiumOvernightEnvironment, playerStartFromRoute } from '../../../src/core/subscriptions/playbackPolicy';

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: { getItem: jest.fn(), setItem: jest.fn(), removeItem: jest.fn() },
}));

jest.mock('react-native-purchases', () => ({
  __esModule: true,
  default: { getCustomerInfo: jest.fn() },
}));

const { timeline } = INDUCTION_JOURNEY;

describe('The Induction', () => {
  it('compiles, runs six minutes, and has unique stages', () => {
    const compiled = compileAudioJourneyTimeline(timeline, DEFAULT_PROCEDURAL_AUDIO_CONFIG);
    expect(compiled.totalDurationMs).toBe(6 * 60_000);
    expect(INDUCTION_DURATION_MS).toBe(6 * 60_000);
    expect(new Set(compiled.stages.map(item => item.id)).size).toBe(compiled.stages.length);
  });

  it('is free: the Sanctum is not a premium world, and a factory start is never gated', () => {
    for (const environment of environmentsOfTimeline(timeline)) expect(isPremiumOvernightEnvironment(environment)).toBe(false);
    expect(environmentsOfTimeline(timeline)).toEqual(['sanctum']);
    const start = playerStartFromRoute({ playbackKind: 'factory' }, timeline);
    expect(start).toEqual({ kind: 'factory' });
    for (const status of ['member', 'not_member', 'unknown'] as const) {
      expect(decideStart(start, status)).toEqual({ allowed: true });
    }
    // Even with no label at all, nothing about its content sends it through the premium gate.
    expect(playerStartFromRoute({}, timeline)).toEqual({ kind: 'factory' });
  });

  it('is kept out of every journey list and found by its own id', () => {
    expect(FACTORY_AUDIO_JOURNEYS.map(item => item.id)).not.toContain(INDUCTION_JOURNEY_ID);
    expect(INDUCTION_JOURNEY.id).toBe(INDUCTION_JOURNEY_ID);
    expect(timeline.id).toBe(INDUCTION_JOURNEY_ID);
  });

  it('introduces the Bell once and returns it once, after the long middle', () => {
    expect(INDUCTION_JOURNEY.fixedRecognitionSignalId).toBe(INDUCTION_SIGNAL_ID);
    expect(INDUCTION_JOURNEY.overnight).toBeUndefined();
    let offset = 0;
    const cues: Array<{ id: string; atMs: number; stage: string }> = [];
    for (const item of timeline.stages) {
      for (const event of item.spatialEvents ?? []) {
        if (event.type === 'cue') cues.push({ id: event.id, atMs: offset + event.atMs, stage: item.id });
      }
      offset += item.durationMs;
    }
    expect(cues.map(cue => cue.id)).toEqual(['induction-bell-1', 'induction-bell-2']);
    expect(cues[0].stage).toBe('introduce');
    expect(cues[1].stage).toBe('return');
    // The return follows the sound's introduction by minutes, not seconds.
    expect(cues[1].atMs - cues[0].atMs).toBeGreaterThanOrEqual(2 * 60_000);
  });

  it('opens with the hall alone, builds the chorus, and lets it fall away', () => {
    const presence = timeline.stages.map(item => item.target.identityPresence ?? 1);
    expect(presence[0]).toBe(0);
    expect(Math.max(...presence)).toBeLessThanOrEqual(IDENTITY_PRESENCE_MAX);
    expect(presence.indexOf(Math.max(...presence))).toBe(timeline.stages.findIndex(item => item.id === 'deepen'));
    expect(presence[presence.length - 1]).toBeLessThan(0.3);
    for (const item of timeline.stages) {
      expect(item.target.environment).toBe('sanctum');
      expect(item.target.masterGain).toBeLessThanOrEqual(0.7);
    }
  });

  it('keeps the guidance inside the journey, in order, and makes no promise it cannot keep', () => {
    const cues = timeline.guidance ?? [];
    expect(cues.length).toBeGreaterThan(0);
    expect(new Set(cues.map(cue => cue.id)).size).toBe(cues.length);
    for (let index = 0; index < cues.length; index += 1) {
      expect(cues[index].atMs).toBeLessThan(INDUCTION_DURATION_MS);
      if (index > 0) expect(cues[index].atMs).toBeGreaterThan(cues[index - 1].atMs);
      expect(cues[index].prompt).not.toMatch(/guarantee|you will (?:become|be) lucid|will make you lucid/i);
    }
    expect(cues[0].prompt).toMatch(/headphones/i);
  });
});
