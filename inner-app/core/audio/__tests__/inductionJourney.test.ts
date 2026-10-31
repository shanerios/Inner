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

  it('is greeted by the drone alone rising from silence, then walked in and out', () => {
    let offset = 0;
    const steps: Array<{ atMs: number; direction: string; stage: string }> = [];
    for (const item of timeline.stages) {
      for (const event of item.spatialEvents ?? []) {
        if (event.type === 'footsteps') steps.push({ atMs: offset + event.atMs, direction: event.direction, stage: item.id });
      }
      offset += item.durationMs;
    }
    expect(steps.map(step => step.direction)).toEqual(['approach', 'recede']);
    // A moment of true silence first, so the engine's default start state (a 528 Hz carrier tone) is never heard.
    const [hush, greet] = timeline.stages;
    expect(hush.id).toBe('hush');
    expect(hush.transitionMs).toBe(0);
    expect(hush.target.environmentGain).toBe(0);
    expect(hush.target.toneGain).toBe(0);
    // The drone then rises from nothing to full over 20 to 25 seconds, and only after that do the footsteps come.
    expect(greet.id).toBe('greet');
    expect(hush.durationMs + greet.durationMs).toBeGreaterThanOrEqual(20_000);
    expect(hush.durationMs + greet.durationMs).toBeLessThanOrEqual(25_000);
    expect(greet.transitionMs).toBe(greet.durationMs);
    expect(greet.target.environmentGain!).toBeGreaterThan(0);
    expect(steps[0].atMs).toBeGreaterThanOrEqual(hush.durationMs + greet.durationMs);
    expect(steps[1].stage).toBe('leave');
    expect(timeline.stages[timeline.stages.length - 1].id).toBe('leave');
    expect(timeline.stages[timeline.stages.length - 1].target.identityPresence ?? 1).toBeLessThan(0.3);
  });

  it('keeps the drone alone until the footsteps are done, then fades the brown bed and binaural in together', () => {
    const ids = timeline.stages.map(item => item.id);
    expect(ids.slice(0, 4)).toEqual(['hush', 'greet', 'steps', 'bed']);
    const [hush, greet, steps, bed] = timeline.stages;
    // Nothing of the bed or the binaural field is heard while the drone rises, the footsteps come and finish.
    for (const quiet of [hush, greet, steps]) {
      expect(quiet.target.noiseGain).toBe(0);
      expect(quiet.target.binauralGain).toBe(0);
      expect(quiet.target.toneGain).toBe(0);
    }
    // They begin once the footsteps could have finished (about nine hesitant steps), and take 10 to 15 seconds.
    const bedStartMs = hush.durationMs + greet.durationMs + steps.durationMs;
    expect(bedStartMs).toBeGreaterThanOrEqual(30_000);
    expect(bedStartMs).toBeLessThanOrEqual(45_000);
    const walkMs = hush.durationMs + greet.durationMs + (steps.spatialEvents?.[0]?.atMs ?? 0);
    expect(bedStartMs - walkMs).toBeGreaterThanOrEqual(12_000);
    expect(bed.transitionMs).toBeGreaterThanOrEqual(10_000);
    expect(bed.transitionMs).toBeLessThanOrEqual(15_000);
    expect(bed.target.noiseColor).toBe('brown');
    expect(bed.target.noiseGain).toBeGreaterThan(0);
    expect(bed.target.binauralGain).toBeGreaterThan(0);
    // The drone builds a little fuller as they arrive.
    expect(bed.target.identityPresence!).toBeGreaterThan(steps.target.identityPresence!);
  });

  it('carries the bed with a massive body passing overhead: quick but plainly heard, heaviest in the long middle', () => {
    const byId = Object.fromEntries(timeline.stages.map(item => [item.id, item.target]));
    // Still while the drone stands alone, passing once the bed is in, at rest again in the hall.
    expect(byId.greet.spatialDepth).toBe(0);
    expect(byId.bed.spatialMode).toBe('overhead');
    expect(byId.bed.spatialTarget).toBe('noise');
    expect(byId.bed.spatialDepth!).toBeGreaterThanOrEqual(0.7);
    expect(byId.hall.spatialDepth).toBe(0);
    expect(byId.leave.spatialDepth).toBe(0);
    // A pass takes 4.5 seconds and the cycle is at least twelve, so each is quick against the quiet around it.
    const periodSeconds = 60 / byId.bed.spatialRate!;
    expect(periodSeconds).toBeGreaterThanOrEqual(12);
    expect(periodSeconds).toBeLessThanOrEqual(30);
    // The bed is heaviest in the middle and eases in the hall.
    expect(byId.fullest.noiseGain!).toBeGreaterThan(byId.bed.noiseGain!);
    expect(byId.hall.noiseGain!).toBeLessThan(byId.fullest.noiseGain!);
  });

  it('keeps the Bell low', () => {
    for (const item of timeline.stages) {
      for (const event of item.spatialEvents ?? []) {
        if (event.type === 'cue') expect(event.signalGainScale!).toBeLessThanOrEqual(0.35);
      }
    }
  });

  it('calls four Aum chants over the drone, none near the Bell, one into the empty hall', () => {
    let offset = 0;
    const aums: Array<{ atMs: number; stage: string }> = [];
    const bells: number[] = [];
    for (const item of timeline.stages) {
      for (const event of item.spatialEvents ?? []) {
        if (event.type === 'aum') aums.push({ atMs: offset + event.atMs, stage: item.id });
        if (event.type === 'cue') bells.push(offset + event.atMs);
      }
      offset += item.durationMs;
    }
    expect(aums).toHaveLength(4);
    // An Aum lasts nine seconds; keep each clear of the Bell and its decay (about five seconds).
    for (const aum of aums) {
      for (const bell of bells) {
        const clear = aum.atMs + 9_000 < bell - 1_000 || aum.atMs > bell + 6_000;
        expect(clear).toBe(true);
      }
    }
    expect(aums[aums.length - 1].stage).toBe('hall');
  });

  it('shapes the four Aum chants: an approach, two plain, and a retreat into the empty hall', () => {
    const shapes: string[] = [];
    for (const item of timeline.stages) {
      for (const event of item.spatialEvents ?? []) if (event.type === 'aum') shapes.push(event.direction);
    }
    expect(shapes).toEqual(['approach', 'still', 'still', 'retreat']);
    // Nothing about them is left to chance: no random variety is drawn.
    expect(timeline.stages[0].target.identityVariety).toBe(0);
  });

  it('brings the Bell in around 1:30', () => {
    let offset = 0;
    for (const item of timeline.stages) {
      for (const event of item.spatialEvents ?? []) {
        if (event.type === 'cue' && event.id === 'induction-bell-1') {
          expect(offset + event.atMs).toBeGreaterThanOrEqual(88_000);
          expect(offset + event.atMs).toBeLessThanOrEqual(96_000);
        }
      }
      offset += item.durationMs;
    }
  });

  it('opens with the drone, builds it fuller to the middle, and lets it fall away', () => {
    const presence = timeline.stages.map(item => item.target.identityPresence ?? 1);
    const at = (id: string) => presence[timeline.stages.findIndex(item => item.id === id)];
    expect(at('greet')).toBeLessThan(at('bloom'));
    expect(at('bed')).toBeGreaterThan(at('greet'));
    expect(Math.max(...presence)).toBeLessThanOrEqual(IDENTITY_PRESENCE_MAX);
    expect(presence.indexOf(Math.max(...presence))).toBe(timeline.stages.findIndex(item => item.id === 'fullest'));
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
