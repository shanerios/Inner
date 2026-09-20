import { describe, expect, it } from '@jest/globals';
import { noiseForWorld, OVERNIGHT_WORLD_PROFILES, WORLD_PROFILES } from '../worldProfiles';

const WORLD_IDS = ['ocean', 'abyssal', 'wind', 'fire', 'cosmic', 'forest', 'temple'] as const;

describe('procedural world profiles', () => {
  it('defines one complete profile for every procedural world', () => {
    expect(Object.keys(WORLD_PROFILES).sort()).toEqual([...WORLD_IDS].sort());
    for (const id of WORLD_IDS) {
      const world = WORLD_PROFILES[id];
      expect(world.id).toBe(id);
      expect(world.foundation.length).toBeGreaterThan(0);
      expect(world.signatures.length).toBeGreaterThan(0);
      expect(world.recognitionRecoverySeconds).toBeGreaterThanOrEqual(2);
      for (const value of [world.acoustics.absorption, world.acoustics.diffusion, world.acoustics.width]) {
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThanOrEqual(1);
      }
    }
  });

  it('keeps rare event identities unique and salience bounded', () => {
    const ids = Object.values(WORLD_PROFILES).flatMap((world) => world.events.map((event) => event.id));
    expect(new Set(ids).size).toBe(ids.length);
    for (const world of Object.values(WORLD_PROFILES)) {
      for (const event of world.events) {
        expect(event.salience).toBeGreaterThanOrEqual(0);
        expect(event.salience).toBeLessThanOrEqual(1);
        expect(event.recoverySeconds).toBeGreaterThan(0);
      }
    }
  });

  it('gives every world a bed with a stated goal, atmosphere and basis', () => {
    for (const world of Object.values(WORLD_PROFILES)) {
      expect(['white', 'pink', 'brown', 'grey']).toContain(world.bed.noiseColor);
      expect(world.bed.noiseGainScale).toBeGreaterThanOrEqual(0.25);
      expect(world.bed.noiseGainScale).toBeLessThanOrEqual(1.5);
      expect(world.bed.remNoiseTaper).toBeGreaterThanOrEqual(0.4);
      expect(world.bed.remNoiseTaper).toBeLessThanOrEqual(1);
      expect(world.bed.binauralGainScale).toBeGreaterThanOrEqual(0);
      expect(world.bed.binauralGainScale).toBeLessThanOrEqual(1.5);
      for (const text of Object.values(world.bed.rationale)) expect(text.trim().length).toBeGreaterThan(20);
    }
  });

  it('names a bed that departs from the shared one only where its basis is stated', () => {
    // A world whose bed is not the shared pink one must say what it rests on.
    for (const world of Object.values(WORLD_PROFILES)) {
      if (world.bed.noiseColor !== 'pink' || world.bed.noiseGainScale !== 1) {
        expect(world.bed.rationale.basis).toMatch(/theory|research|measur|stud/i);
      }
    }
  });

  it('leaves the noise of a preparation stage alone for worlds on the shared bed, and gives the others their own', () => {
    const designed = { noiseColor: 'pink' as const, noiseGain: 0.14 };
    for (const world of ['ocean', 'abyssal', 'temple', 'cosmic', 'fire'] as const) expect(noiseForWorld(world, designed)).toBe(designed);
    const forest = noiseForWorld('forest', designed);
    expect(forest.noiseColor).toBe('brown');
    expect(forest.noiseGain).toBeCloseTo(0.07, 10);
    // A stage designed brown (the end of preparation) stays brown for a brown world, at that world's level.
    expect(noiseForWorld('forest', { noiseColor: 'brown', noiseGain: 0.14 }).noiseColor).toBe('brown');
  });

  it('drives the overnight picker from the same world catalog', () => {
    expect(OVERNIGHT_WORLD_PROFILES.map((world) => world.id)).toEqual([
      'ocean', 'abyssal', 'forest', 'temple', 'cosmic', 'fire',
    ]);
  });
});
