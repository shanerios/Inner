import { describe, expect, it } from '@jest/globals';
import { OVERNIGHT_WORLD_PROFILES, WORLD_PROFILES } from '../worldProfiles';

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

  it('drives the overnight picker from the same world catalog', () => {
    expect(OVERNIGHT_WORLD_PROFILES.map((world) => world.id)).toEqual([
      'ocean', 'abyssal', 'forest', 'temple', 'cosmic', 'fire',
    ]);
  });
});
