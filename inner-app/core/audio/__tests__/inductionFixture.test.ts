import { describe, expect, it } from '@jest/globals';
import * as fs from 'fs';
import * as path from 'path';
import { DEFAULT_PROCEDURAL_AUDIO_CONFIG } from '../config';
import { INDUCTION_JOURNEY } from '../inductionJourney';
import { compileAudioJourneyTimeline } from '../timeline';

const ROOT = path.resolve(__dirname, '../../..');
const fixturePath = path.join(ROOT, 'modules/inner-audio/android/src/test/resources/induction-fixture.json');

describe('the Induction fixture the Android engine renders', () => {
  it('matches the TypeScript journey, so the render is of what the app plays', () => {
    const fixture = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
    const compiled = compileAudioJourneyTimeline(INDUCTION_JOURNEY.timeline, DEFAULT_PROCEDURAL_AUDIO_CONFIG);
    // Regenerate with: node scripts/export-induction-fixture.js
    expect(fixture.title).toBe(compiled.title);
    expect(fixture.seed).toBe(compiled.seed);
    expect(fixture.fadeInMs).toBe(compiled.fadeInMs);
    expect(fixture.totalDurationMs).toBe(compiled.totalDurationMs);
    expect(fixture.stages).toEqual(JSON.parse(JSON.stringify(compiled.stages)));
  });
});
