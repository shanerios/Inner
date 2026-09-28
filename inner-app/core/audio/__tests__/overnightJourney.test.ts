import { it, expect } from '@jest/globals';
import { createHash } from 'crypto';
import { overnightJourney } from '../overnightJourney';
import { compileOvernightProtocol, createAcceleratedOvernightProtocol, createRecognitionOvernightProtocol } from '../overnightProtocol';
import { compileAudioJourneyTimeline } from '../timeline';
import { DEFAULT_PROCEDURAL_AUDIO_CONFIG } from '../config';

const environments = ['ocean', 'abyssal', 'forest', 'temple', 'cosmic', 'fire'] as const;

// Golden digests captured against the original screen-local builder. Include
// complete authored and compiled output, not just stage counts or durations.
it.each(environments)('preserves the production %s journey matrix', environment => {
  const hash = createHash('sha256');
  for (const feel of ['gentle', 'deep', 'immersive'] as const)
    for (const sleepDurationMinutes of [360, 420, 450, 480, 540, 600])
      for (const cuePlan of ['gentle', 'standard'] as const)
        for (const signalId of ['ascending', 'bell', 'chimes', 'droplets'] as const)
          for (const accelerated of [false, true]) {
            const source = createRecognitionOvernightProtocol({ environment, feel, sleepDurationMinutes, cuePlan, signalId });
            const protocol = compileOvernightProtocol(accelerated ? createAcceleratedOvernightProtocol(source) : source, DEFAULT_PROCEDURAL_AUDIO_CONFIG);
            const journey = overnightJourney(environment, feel, protocol, accelerated, 6284);
            const timeline = compileAudioJourneyTimeline(journey.timeline, DEFAULT_PROCEDURAL_AUDIO_CONFIG);
            hash.update(JSON.stringify({ journey, timeline }));
          }
  expect(hash.digest('hex')).toMatchSnapshot();
});

it('preserves preparation cues, chunking, recognition shaping, and Return', () => {
  const protocol = compileOvernightProtocol(createRecognitionOvernightProtocol({
    environment: 'ocean', feel: 'gentle', sleepDurationMinutes: 480, cuePlan: 'standard', signalId: 'droplets',
  }), DEFAULT_PROCEDURAL_AUDIO_CONFIG);
  const journey = overnightJourney('ocean', 'gentle', protocol, false, 6284);
  const timeline = compileAudioJourneyTimeline(journey.timeline, DEFAULT_PROCEDURAL_AUDIO_CONFIG);
  expect(timeline.totalDurationMs).toBe(487 * 60_000);
  expect(timeline.seed).toBe(6284);
  expect(timeline.stages.slice(0, 4).map(s => s.id)).toEqual(['learn', 'rehearse', 'drift', 'release']);
  expect(timeline.stages.slice(0, 4).flatMap(s => s.spatialEvents)).toHaveLength(7);
  let cursor = 0;
  const nightCues: number[] = [];
  for (const stage of timeline.stages) {
    expect(stage.durationMs).toBeLessThanOrEqual(4 * 3_600_000);
    for (const cue of stage.spatialEvents) if (cue.type === 'cue' && cue.recognitionSpace) nightCues.push(cursor + cue.atMs);
    cursor += stage.durationMs;
  }
  expect(nightCues).toEqual([4.5, 6, 7.5].map(hours => 7 * 60_000 + hours * 3_600_000 - 45_000));
  const window = timeline.stages.find(s => s.id === 'overnight-recognition-window-1-1')!;
  expect(window.config.masterGain).toBeCloseTo(protocol.phases.find(p => p.id === 'recognition-window-1')!.audioConfig.masterGain * 0.55);
  expect(timeline.stages.at(-1)?.config.masterGain).toBe(0);
  expect(timeline.stages.at(-1)?.transitionMs).toBe(5_000);
});
