import { describe, expect, it } from '@jest/globals';
import { normalizeProceduralAudioConfig, PROCEDURAL_AUDIO_LIMITS } from '../config';
import { FACTORY_MIXER_PRESETS } from '../factoryPresets';

describe('factory mixer presets', () => {
  it('uses unique ids and valid engine parameters', () => {
    const ids = FACTORY_MIXER_PRESETS.map(preset => preset.id);
    expect(new Set(ids).size).toBe(ids.length);
    FACTORY_MIXER_PRESETS.forEach(preset => {
      const config = normalizeProceduralAudioConfig(preset.patch);
      expect(config.binauralCarrierHz).toBeGreaterThanOrEqual(PROCEDURAL_AUDIO_LIMITS.binauralCarrierHz.min);
      expect(config.binauralCarrierHz).toBeLessThanOrEqual(PROCEDURAL_AUDIO_LIMITS.binauralCarrierHz.max);
      expect(config.binauralDeltaHz).toBeGreaterThanOrEqual(PROCEDURAL_AUDIO_LIMITS.binauralDeltaHz.min);
      expect(config.binauralDeltaHz).toBeLessThanOrEqual(PROCEDURAL_AUDIO_LIMITS.binauralDeltaHz.max);
    });
  });

  it('provides provenance and a caution for non-balanced presets', () => {
    FACTORY_MIXER_PRESETS.filter(preset => preset.category !== 'balanced').forEach(preset => {
      expect(preset.sourceUrl).toMatch(/^https:\/\//);
      expect(preset.summary.length).toBeGreaterThan(30);
    });
  });
});
