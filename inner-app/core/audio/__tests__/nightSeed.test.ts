import { describe, expect, it } from '@jest/globals';
import * as fs from 'fs';
import * as path from 'path';
import { DEFAULT_PROCEDURAL_AUDIO_CONFIG } from '../config';
import { compileAudioJourneyTimeline } from '../timeline';
import { createNightSeed, NIGHT_SEED_MAX } from '../nightSeed';

const timeline = (seed?: number) => ({
  id: 'overnight-recognition-cosmic-standard',
  title: 'Overnight Recognition',
  seed,
  stages: [{ id: 'one', label: 'One', durationMs: 60_000, target: {} }],
});

describe('night seed', () => {
  it('is a whole number the native engines accept, never zero', () => {
    for (const draw of [0, 0.0000001, 0.5, 0.999999999]) {
      const seed = createNightSeed(() => draw);
      expect(Number.isInteger(seed)).toBe(true);
      expect(seed).toBeGreaterThanOrEqual(1);
      expect(seed).toBeLessThanOrEqual(NIGHT_SEED_MAX);
    }
    expect(createNightSeed(() => Number.NaN)).toBe(1);
  });

  it('differs from one night to the next', () => {
    const seeds = new Set(Array.from({ length: 200 }, () => createNightSeed()));
    expect(seeds.size).toBeGreaterThan(190);
  });

  it('is what the compiled timeline, and so Journey Memory, carries', () => {
    expect(compileAudioJourneyTimeline(timeline(123_456), DEFAULT_PROCEDURAL_AUDIO_CONFIG).seed).toBe(123_456);
  });

  it('shows why one is needed: with none, every night for the same journey id gets the same seed', () => {
    const first = compileAudioJourneyTimeline(timeline(), DEFAULT_PROCEDURAL_AUDIO_CONFIG).seed;
    const second = compileAudioJourneyTimeline(timeline(), DEFAULT_PROCEDURAL_AUDIO_CONFIG).seed;
    expect(first).toBe(second);
  });

  it('is drawn fresh each time an Overnight journey begins', () => {
    const screen = fs.readFileSync(path.resolve(__dirname, '../../../screens/OvernightJourneyScreen.tsx'), 'utf8');
    expect(screen).toContain('accelerated && INNER_LAB_BUILD, createNightSeed())');
    expect(screen).toMatch(/protocolVersion: protocol\.schemaVersion,[\s\S]{0,160}\bseed,/);
  });
});
