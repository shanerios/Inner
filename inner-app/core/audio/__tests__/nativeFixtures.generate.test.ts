import { describe, it } from '@jest/globals';
import * as fs from 'fs';
import * as path from 'path';
import { DEFAULT_PROCEDURAL_AUDIO_CONFIG } from '../config';
import { compileAudioJourneyTimeline } from '../timeline';
import { compileOvernightProtocol, createAcceleratedOvernightProtocol, createRecognitionOvernightProtocol } from '../overnightProtocol';
import { overnightJourney } from '../overnightJourney';

/**
 * Writes the native engine's Recognition Only fixtures from the production TypeScript builders.
 * Skipped unless WRITE_NATIVE_FIXTURES=1, so a normal jest run never touches the Android test resources.
 * Run: WRITE_NATIVE_FIXTURES=1 npx jest core/audio/__tests__/nativeFixtures.generate.test.ts
 */
const OUT = path.resolve(__dirname, '../../../modules/inner-audio/android/src/test/resources');
const write = process.env.WRITE_NATIVE_FIXTURES === '1' ? it : it.skip;

function fixtureFor(environment: 'none' | 'ocean', accelerated: boolean, minutes: number) {
  const mode = environment === 'none' ? 'recognition_only' as const : 'full' as const;
  const source = createRecognitionOvernightProtocol({
    sleepDurationMinutes: minutes, environment, mode, signalId: 'bell', cuePlan: 'standard', feel: 'gentle',
  });
  const protocol = compileOvernightProtocol(accelerated ? createAcceleratedOvernightProtocol(source) : source, DEFAULT_PROCEDURAL_AUDIO_CONFIG);
  const journey = overnightJourney(environment, 'gentle', protocol, accelerated, 4242);
  const compiled = compileAudioJourneyTimeline(journey.timeline, DEFAULT_PROCEDURAL_AUDIO_CONFIG);
  return {
    title: journey.title,
    seed: compiled.seed,
    fadeInMs: compiled.fadeInMs,
    totalDurationMs: compiled.totalDurationMs,
    stages: compiled.stages.map(stage => ({
      id: stage.id, label: stage.label, durationMs: stage.durationMs, transitionMs: stage.transitionMs,
      config: stage.config, spatialEvents: stage.spatialEvents,
    })),
  };
}

describe('native fixture generation', () => {
  write('writes Recognition Only and full reference fixtures', () => {
    fs.writeFileSync(path.join(OUT, 'recognition-only-accelerated-fixture.json'), JSON.stringify(fixtureFor('none', true, 450)));
    fs.writeFileSync(path.join(OUT, 'full-reference-accelerated-fixture.json'), JSON.stringify(fixtureFor('ocean', true, 450)));
    fs.writeFileSync(path.join(OUT, 'recognition-only-night-fixture.json'), JSON.stringify(fixtureFor('none', false, 360)));
  });
});
