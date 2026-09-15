import { describe, expect, it } from '@jest/globals';
import { DEFAULT_PROCEDURAL_AUDIO_CONFIG } from '../config';
import { compileAudioJourneyTimeline } from '../timeline';

describe('audio journey timeline compiler', () => {
  it('migrates the retired Cave environment to Cosmic', () => {
    const result = compileAudioJourneyTimeline({
      id: 'legacy-cave', title: 'Legacy Cave', stages: [{
        id: 'space', label: 'Space', durationMs: 10_000,
        target: { environment: 'cave' } as any,
      }],
    }, DEFAULT_PROCEDURAL_AUDIO_CONFIG);
    expect(result.stages[0].config.environment).toBe('cosmic');
  });

  it('carries configuration forward and calculates duration', () => {
    const result = compileAudioJourneyTimeline({
      id: ' descent ',
      title: ' Evening Descent ',
      loop: false,
      stages: [
        { id: 'arrive', label: 'Arrive', durationMs: 60_000, target: { binauralDeltaHz: 10 } },
        { id: 'settle', label: 'Settle', durationMs: 120_000, transitionMs: 30_000, target: { binauralDeltaHz: 6, noiseColor: 'pink' } },
      ],
    }, DEFAULT_PROCEDURAL_AUDIO_CONFIG);
    expect(result).toEqual(expect.objectContaining({ id: 'descent', title: 'Evening Descent', totalDurationMs: 180_000 }));
    expect(result).toEqual(expect.objectContaining({ endPolicy: 'fadeAndStop', protocolVersion: 1 }));
    expect(result.stages[1].config).toEqual(expect.objectContaining({ carrierHz: 528, binauralDeltaHz: 6, noiseColor: 'pink' }));
  });

  it('preserves explicit overnight end semantics', () => {
    const result = compileAudioJourneyTimeline({
      id: 'night-001', title: 'Night 001', endPolicy: 'protocolControlled', protocolVersion: 2,
      stages: [{ id: 'night', label: 'Night', durationMs: 10_000, target: {} }],
    }, DEFAULT_PROCEDURAL_AUDIO_CONFIG);
    expect(result).toEqual(expect.objectContaining({
      endPolicy: 'protocolControlled', protocolVersion: 2, totalDurationMs: 10_000,
    }));
  });

  it('clamps spatial movement to conservative engine limits', () => {
    const result = compileAudioJourneyTimeline({
      id: 'spatial', title: 'Spatial', stages: [{
        id: 'move', label: 'Move', durationMs: 10_000,
        target: { spatialMode: 'swoosh', spatialTarget: 'noise', spatialDepth: 4, spatialRate: 20 },
      }],
    }, DEFAULT_PROCEDURAL_AUDIO_CONFIG);
    expect(result.stages[0].config).toEqual(expect.objectContaining({
      spatialMode: 'swoosh', spatialTarget: 'noise', spatialDepth: 0.8, spatialRate: 3,
    }));
  });

  it('compiles bounded stage-triggered spatial events', () => {
    const result = compileAudioJourneyTimeline({
      id: 'event', title: 'Event', stages: [{
        id: 'recognize', label: 'Recognize', durationMs: 10_000, target: {},
        spatialEvents: [{ id: 'cross', atMs: 2_000, type: 'swoosh', direction: 'right', durationMs: 1_500, depth: 2 }],
      }],
    }, DEFAULT_PROCEDURAL_AUDIO_CONFIG);
    expect(result.stages[0].spatialEvents[0]).toEqual(expect.objectContaining({ depth: 0.8, direction: 'right' }));
  });

  it('preserves cue events without treating them as spatial sweeps', () => {
    const result = compileAudioJourneyTimeline({
      id: 'cue-training', title: 'Cue Training', stages: [{
        id: 'learn', label: 'Learn', durationMs: 10_000, target: {},
        spatialEvents: [{ id: 'signal', atMs: 2_000, type: 'cue' }],
      }],
    }, DEFAULT_PROCEDURAL_AUDIO_CONFIG);
    expect(result.stages[0].spatialEvents).toEqual([
      { id: 'signal', atMs: 2_000, type: 'cue' },
    ]);
  });

  it('preserves the overnight recognition-space cue marker', () => {
    const result = compileAudioJourneyTimeline({
      id: 'overnight-cue', title: 'Overnight Cue', stages: [{
        id: 'recognize', label: 'Recognize', durationMs: 60_000, target: {},
        spatialEvents: [{ id: 'signal', atMs: 30_000, type: 'cue', recognitionSpace: true }],
      }],
    }, DEFAULT_PROCEDURAL_AUDIO_CONFIG);
    expect(result.stages[0].spatialEvents).toEqual([
      { id: 'signal', atMs: 30_000, type: 'cue', recognitionSpace: true },
    ]);
  });

  it('rejects cue events outside their stage', () => {
    expect(() => compileAudioJourneyTimeline({
      id: 'bad-cue', title: 'Bad Cue', stages: [{
        id: 'learn', label: 'Learn', durationMs: 10_000, target: {},
        spatialEvents: [{ id: 'late-signal', atMs: 10_000, type: 'cue' }],
      }],
    }, DEFAULT_PROCEDURAL_AUDIO_CONFIG)).toThrow('invalid start time');
  });

  it('rejects spatial events that extend beyond their stage', () => {
    expect(() => compileAudioJourneyTimeline({
      id: 'bad-event', title: 'Bad Event', stages: [{
        id: 'short', label: 'Short', durationMs: 2_000, target: {},
        spatialEvents: [{ id: 'late', atMs: 1_500, type: 'swoosh', direction: 'left', durationMs: 1_000, depth: 0.8 }],
      }],
    }, DEFAULT_PROCEDURAL_AUDIO_CONFIG)).toThrow('invalid duration');
  });

  it('rejects unsafe timing and duplicate stage ids', () => {
    expect(() => compileAudioJourneyTimeline({
      id: 'bad', title: 'Bad', stages: [{ id: 'x', label: 'X', durationMs: 500, target: {} }],
    }, DEFAULT_PROCEDURAL_AUDIO_CONFIG)).toThrow('invalid duration');
    expect(() => compileAudioJourneyTimeline({
      id: 'bad', title: 'Bad', stages: [
        { id: 'x', label: 'X', durationMs: 1_000, target: {} },
        { id: 'x', label: 'Again', durationMs: 1_000, target: {} },
      ],
    }, DEFAULT_PROCEDURAL_AUDIO_CONFIG)).toThrow('unique');
  });
});
