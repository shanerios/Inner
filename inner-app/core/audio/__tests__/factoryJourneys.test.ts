import { describe, expect, it } from '@jest/globals';
import { DEFAULT_PROCEDURAL_AUDIO_CONFIG } from '../config';
import { createDreamIncubationJourney, createJourneyPreview, createPersonalizedLucidJourney, FACTORY_AUDIO_JOURNEYS } from '../factoryJourneys';
import { compileAudioJourneyTimeline } from '../timeline';

describe('factory audio journeys', () => {
  it('builds a ten-minute Dream Incubation journey around the held seed', () => {
    const journey = createDreamIncubationJourney('  the   house by the sea ');
    expect(journey.timeline.stages.reduce((total, item) => total + item.durationMs, 0)).toBe(10 * 60_000);
    expect(journey.timeline.guidance?.some(cue => cue.prompt.includes('the house by the sea'))).toBe(true);
    expect(() => compileAudioJourneyTimeline(journey.timeline, DEFAULT_PROCEDURAL_AUDIO_CONFIG)).not.toThrow();
  });

  it('keeps the WBTB journey at eight minutes', () => {
    const journey = FACTORY_AUDIO_JOURNEYS.find(item => item.id === 'lucid-return-wbtb');
    expect(journey).toBeDefined();
    expect(compileAudioJourneyTimeline(journey!.timeline, DEFAULT_PROCEDURAL_AUDIO_CONFIG).totalDurationMs)
      .toBe(8 * 60_000);
    expect(compileAudioJourneyTimeline(journey!.timeline, DEFAULT_PROCEDURAL_AUDIO_CONFIG).fadeInMs)
      .toBe(4_000);
  });

  it('keeps the extended practice at twenty-seven minutes', () => {
    const journey = FACTORY_AUDIO_JOURNEYS.find(item => item.id === 'lucid-threshold');
    expect(journey).toBeDefined();
    expect(compileAudioJourneyTimeline(journey!.timeline, DEFAULT_PROCEDURAL_AUDIO_CONFIG).totalDurationMs)
      .toBe(27 * 60_000);
  });

  it('keeps Lucid Signal at seven minutes with its complete cue sequence', () => {
    const journey = FACTORY_AUDIO_JOURNEYS.find(item => item.id === 'lucid-signal');
    expect(journey).toBeDefined();
    const compiled = compileAudioJourneyTimeline(journey!.timeline, DEFAULT_PROCEDURAL_AUDIO_CONFIG);
    expect(compiled.totalDurationMs).toBe(7 * 60_000);
    expect(compiled.stages.flatMap(stage => stage.spatialEvents)
      .filter(event => event.type === 'cue')).toHaveLength(7);
  });

  it('creates valid accelerated previews', () => {
    for (const journey of FACTORY_AUDIO_JOURNEYS) {
      const preview = compileAudioJourneyTimeline(
        createJourneyPreview(journey),
        DEFAULT_PROCEDURAL_AUDIO_CONFIG,
      );
      expect(preview.totalDurationMs).toBe(56_000);
    }
  });

  it.each(['lucidity', 'recall', 'calm', 'visualization'] as const)(
    'preserves a valid 56-second %s personalized preview',
    intention => {
      const journey = createPersonalizedLucidJourney({
        intention, durationMinutes: 10, feel: 'immersive', familiarity: 'familiar',
      });
      const preview = compileAudioJourneyTimeline(
        createJourneyPreview(journey),
        DEFAULT_PROCEDURAL_AUDIO_CONFIG,
      );
      expect(preview.totalDurationMs).toBe(56_000);
    },
  );

  it.each([5, 10, 20, 30] as const)('creates an exact %i minute personalized journey', durationMinutes => {
    const journey = createPersonalizedLucidJourney({
      intention: 'lucidity', durationMinutes, feel: 'gentle', familiarity: 'new',
    });
    const compiled = compileAudioJourneyTimeline(journey.timeline, DEFAULT_PROCEDURAL_AUDIO_CONFIG);
    expect(compiled.totalDurationMs).toBe(durationMinutes * 60_000);
    expect(compiled.fadeInMs).toBe(4_000);
    expect(journey.timeline.guidance?.every(cue => cue.atMs < compiled.totalDurationMs)).toBe(true);
  });

  it('turns grounded journeys toward brown noise without exceeding safe gains', () => {
    const journey = createPersonalizedLucidJourney({
      intention: 'recall', durationMinutes: 20, feel: 'grounded', familiarity: 'experienced',
    });
    expect(journey.timeline.stages.every(stage => stage.target.noiseColor === 'brown')).toBe(true);
    expect(journey.timeline.stages.every(stage => (stage.target.binauralGain ?? 0) <= 1)).toBe(true);
    expect(journey.timeline.stages.every(stage => stage.target.spatialMode === 'still')).toBe(true);
  });

  it('keeps the carrier equally quiet beneath every personalized environment', () => {
    const temple = createPersonalizedLucidJourney({
      intention: 'lucidity', environment: 'temple', durationMinutes: 10, feel: 'gentle', familiarity: 'new',
    });
    const ocean = createPersonalizedLucidJourney({
      intention: 'lucidity', environment: 'ocean', durationMinutes: 10, feel: 'gentle', familiarity: 'new',
    });
    expect(temple.timeline.stages.every(item => item.target.environment === 'temple')).toBe(true);
    expect(temple.timeline.stages.every(item => (item.target.environmentGain ?? 0) > 0)).toBe(true);
    expect(temple.timeline.stages.map(item => item.target.toneGain))
      .toEqual(ocean.timeline.stages.map(item => item.target.toneGain));
    expect(Math.max(...temple.timeline.stages.map(item => item.target.toneGain ?? 0))).toBeLessThan(0.07);
    expect(() => compileAudioJourneyTimeline(temple.timeline, DEFAULT_PROCEDURAL_AUDIO_CONFIG)).not.toThrow();
  });

  it('preserves the visualization sound arc and keeps movement bounded', () => {
    const journey = createPersonalizedLucidJourney({
      intention: 'visualization', durationMinutes: 10, feel: 'immersive', familiarity: 'familiar',
    });
    const modes = journey.timeline.stages.map(stage => stage.target.spatialMode);
    expect(modes).toEqual(expect.arrayContaining(['orbit', 'rain', 'pendulum']));
    expect(journey.timeline.stages.every(stage => (stage.target.spatialDepth ?? 0) <= 0.8)).toBe(true);
    expect(journey.timeline.stages.find(stage => stage.id === 'place-sign')?.spatialEvents)
      .toEqual(expect.arrayContaining([expect.objectContaining({ type: 'swoosh', direction: 'left' })]));
    expect(() => compileAudioJourneyTimeline(journey.timeline, DEFAULT_PROCEDURAL_AUDIO_CONFIG)).not.toThrow();
  });

  it('uses rain sparingly for recall and settles back to stillness', () => {
    const journey = createPersonalizedLucidJourney({
      intention: 'recall', durationMinutes: 5, feel: 'gentle', familiarity: 'new',
    });
    expect(journey.timeline.stages.filter(stage => stage.target.spatialMode === 'rain')).toHaveLength(2);
    expect(journey.timeline.stages.at(-1)?.target.spatialMode).toBe('still');
    expect(() => compileAudioJourneyTimeline(journey.timeline, DEFAULT_PROCEDURAL_AUDIO_CONFIG)).not.toThrow();
  });

  it('uses a distinct practice and audio blueprint for every intention', () => {
    const intentions = ['lucidity', 'recall', 'calm', 'visualization'] as const;
    const journeys = intentions.map(intention => createPersonalizedLucidJourney({
      intention, durationMinutes: 10, feel: 'gentle', familiarity: 'familiar',
    }));
    expect(new Set(journeys.map(item => item.timeline.stages.map(stage => stage.id).join('|'))).size).toBe(4);
    expect(new Set(journeys.map(item => item.timeline.guidance?.map(cue => cue.prompt).join('|'))).size).toBe(4);
    expect(journeys[1].timeline.stages[0].target.carrierHz).toBe(432);
    expect(journeys[2].timeline.stages.every(stage => stage.target.noiseColor === 'brown')).toBe(true);
    expect(journeys[2].timeline.stages.every(stage => stage.target.toneGain === 0)).toBe(true);
    expect(journeys[3].timeline.stages[0].target.carrierHz).toBe(639);
  });
});
