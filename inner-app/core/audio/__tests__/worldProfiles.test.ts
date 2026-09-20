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
      expect(world.bed.noiseWidth).toBeGreaterThanOrEqual(0);
      expect(world.bed.noiseWidth).toBeLessThanOrEqual(1);
      expect(world.bed.noiseDriftDb).toBeGreaterThanOrEqual(0);
      expect(world.bed.noiseDriftDb).toBeLessThanOrEqual(8);
      expect(world.bed.noiseDriftSeconds).toBeGreaterThanOrEqual(3);
      expect(world.bed.noiseDriftSeconds).toBeLessThanOrEqual(40);
      expect(world.bed.noiseHighCutHz).toBeGreaterThanOrEqual(300);
      expect(world.bed.noiseHighCutHz).toBeLessThanOrEqual(20_000);
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

  it('leaves the noise of a preparation stage alone for a world on the shared bed, and gives the others their own', () => {
    const designed = { noiseColor: 'pink' as const, noiseGain: 0.14 };
    expect(noiseForWorld('wind', designed)).toBe(designed);
    expect(noiseForWorld('ocean', designed)).toEqual({ noiseColor: 'brown', noiseGain: 0.14 * 0.5, noiseHighCutHz: 20_000, noiseWidth: 1, noiseDriftDb: 5, noiseDriftSeconds: 6 });
    expect(noiseForWorld('abyssal', designed)).toEqual({ noiseColor: 'brown', noiseGain: 0.14 * 0.75, noiseHighCutHz: 20_000, noiseWidth: 1, noiseDriftDb: 4.5, noiseDriftSeconds: 12 });
    expect(noiseForWorld('fire', designed)).toEqual({ noiseColor: 'brown', noiseGain: 0.14 * 0.5, noiseHighCutHz: 20_000, noiseWidth: 1, noiseDriftDb: 3, noiseDriftSeconds: 8 });
    expect(noiseForWorld('temple', designed)).toEqual({ noiseColor: 'pink', noiseGain: 0.14 * 0.63, noiseHighCutHz: 1_800, noiseWidth: 1, noiseDriftDb: 2, noiseDriftSeconds: 20 });
    expect(noiseForWorld('cosmic', designed)).toEqual({ noiseColor: 'pink', noiseGain: 0.14 * 0.5, noiseHighCutHz: 4_000, noiseWidth: 1, noiseDriftDb: 3, noiseDriftSeconds: 16 });
    // A stage designed brown (the end of preparation) takes the world's own color.
    expect(noiseForWorld('forest', { noiseColor: 'brown', noiseGain: 0.14 }).noiseColor).toBe('brown');
    expect(noiseForWorld('temple', { noiseColor: 'brown', noiseGain: 0.14 }).noiseColor).toBe('pink');
  });

  it('drives the overnight picker from the same world catalog', () => {
    expect(OVERNIGHT_WORLD_PROFILES.map((world) => world.id)).toEqual([
      'ocean', 'abyssal', 'forest', 'temple', 'cosmic', 'fire',
    ]);
  });
});
