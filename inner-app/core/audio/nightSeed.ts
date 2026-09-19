/**
 * A fresh seed for one night. The native engines derive every random detail of a journey from its seed
 * (when rare events sound, how they vary), so a new seed each night means no two nights are the same.
 * Without one the engine falls back to a hash of the journey's id, which repeats every night.
 *
 * The seed is recorded with the night in Journey Memory, so a night can be replayed exactly.
 */
export const NIGHT_SEED_MAX = 0xffff_ffff;

export function createNightSeed(random: () => number = Math.random): number {
  const seed = Math.floor(random() * NIGHT_SEED_MAX);
  return Number.isFinite(seed) && seed >= 1 ? seed : 1;
}
