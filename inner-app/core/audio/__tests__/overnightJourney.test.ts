import { it, expect } from '@jest/globals';
import { createHash } from 'crypto';
import { overnightJourney } from '../overnightJourney';
import { compileOvernightProtocol, createAcceleratedOvernightProtocol, createRecognitionOvernightProtocol } from '../overnightProtocol';
import { compileAudioJourneyTimeline } from '../timeline';
import { DEFAULT_PROCEDURAL_AUDIO_CONFIG } from '../config';
import { recognitionCueMinutesForDuration } from '../../lucidSignalPlans';
import type { RecognitionSignalId } from '../../recognitionSignals';

const environments = ['ocean', 'abyssal', 'forest', 'temple', 'cosmic', 'fire'] as const;
const signalIds: RecognitionSignalId[] = ['ascending', 'bell', 'chimes', 'droplets', 'guardian'];

// Golden digests lock the complete authored and compiled production output,
// including duration-aware cue placement, not just stage counts or durations.
it.each(environments)('preserves the production %s journey matrix', environment => {
  const hash = createHash('sha256');
  for (const feel of ['gentle', 'deep', 'immersive'] as const)
    for (const sleepDurationMinutes of [360, 420, 450, 480, 540, 600])
      for (const cuePlan of ['gentle', 'standard'] as const)
        for (const signalId of signalIds)
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
  expect(nightCues).toEqual(recognitionCueMinutesForDuration(480, 'standard')
    .map(minutes => (7 + minutes) * 60_000));
  const window = timeline.stages.find(s => s.id === 'overnight-recognition-window-1-1')!;
  expect(window.config.masterGain).toBeCloseTo(protocol.phases.find(p => p.id === 'recognition-window-1')!.audioConfig.masterGain * 0.55);
  expect(timeline.stages.at(-1)?.config.masterGain).toBe(0);
  expect(timeline.stages.at(-1)?.transitionMs).toBe(5_000);
});

it('carries recipe gain, repetitions, ducking, and recovery into the native timeline', () => {
  const protocol = compileOvernightProtocol(createRecognitionOvernightProtocol({
    environment: 'forest', feel: 'deep', sleepDurationMinutes: 420, cuePlan: 'standard', signalId: 'guardian',
    recognitionWindows: [{
      id: 'custom-window', cueAtMinute: 250, signalGainScale: 0.65,
      presentations: 2, backgroundDuckGain: 0.4, recoverySeconds: 50,
    }],
  }), DEFAULT_PROCEDURAL_AUDIO_CONFIG);
  const timeline = compileAudioJourneyTimeline(
    overnightJourney('forest', 'deep', protocol, false, 99).timeline,
    DEFAULT_PROCEDURAL_AUDIO_CONFIG,
  );
  const window = timeline.stages.find(stage => stage.id === 'overnight-recognition-window-1-1')!;
  expect(window.config.masterGain).toBeCloseTo(
    protocol.phases.find(phase => phase.id === 'recognition-window-1')!.audioConfig.masterGain * 0.4,
  );
  expect(window.spatialEvents).toEqual([
    expect.objectContaining({ id: 'signal-1-1', signalGainScale: 0.65, recoverySeconds: 50 }),
    expect.objectContaining({ id: 'signal-1-2', signalGainScale: 0.65, recoverySeconds: 50 }),
  ]);
});
