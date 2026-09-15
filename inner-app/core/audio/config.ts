import type { NoiseColor, ProceduralAudioConfig } from './types';

// In environment-led journeys, the carrier should sit beneath the scene rather
// than compete with it. Live Mix remains unscaled so its tone control stays
// literal and user-directed.
export const ENVIRONMENT_TONE_GAIN_SCALE = 0.08;

export function toneGainForEnvironment(
  toneGain: number,
  environment: ProceduralAudioConfig['environment'],
): number {
  return environment === 'none' ? toneGain : toneGain * ENVIRONMENT_TONE_GAIN_SCALE;
}

export const PROCEDURAL_AUDIO_LIMITS = {
  carrierHz: { min: 20, max: 2000 },
  binauralCarrierHz: { min: 100, max: 500 },
  binauralDeltaHz: { min: 0.5, max: 40 },
  gain: { min: 0, max: 1 },
  rampMs: { min: 20, max: 5000 },
  spatialDepth: { min: 0, max: 0.8 },
  spatialRate: { min: 0.1, max: 3 },
} as const;

export const DEFAULT_PROCEDURAL_AUDIO_CONFIG: ProceduralAudioConfig = {
  carrierHz: 528,
  binauralCarrierHz: 200,
  binauralDeltaHz: 4,
  toneGain: 0.22,
  harmonicWarmth: 0,
  binauralGain: 0,
  noiseColor: null,
  noiseGain: 0,
  environment: 'none',
  environmentGain: 0,
  environmentIntensity: 0.5,
  thresholdShift: 0,
  harmonicTranslation: 0,
  templeGain: 0,
  templeIntensity: 0.5,
  masterGain: 0.8,
  rampMs: 80,
  spatialMode: 'still',
  spatialTarget: 'noise',
  spatialDepth: 0,
  spatialRate: 0.3,
};

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));

const isNoiseColor = (value: unknown): value is NoiseColor =>
  value === 'white' || value === 'pink' || value === 'brown' || value === 'grey';

export function normalizeProceduralAudioConfig(
  value: Partial<ProceduralAudioConfig> = {},
): ProceduralAudioConfig {
  const gain = PROCEDURAL_AUDIO_LIMITS.gain;
  // Cave shipped briefly during development. Preserve those saved mixes by
  // moving the retired selection into its replacement instead of turning it off.
  const requestedEnvironment = value.environment as unknown;
  const environment = requestedEnvironment === 'cave' ? 'cosmic' : requestedEnvironment;
  return {
    carrierHz: clamp(
      value.carrierHz ?? DEFAULT_PROCEDURAL_AUDIO_CONFIG.carrierHz,
      PROCEDURAL_AUDIO_LIMITS.carrierHz.min,
      PROCEDURAL_AUDIO_LIMITS.carrierHz.max,
    ),
    binauralCarrierHz: clamp(
      value.binauralCarrierHz ?? DEFAULT_PROCEDURAL_AUDIO_CONFIG.binauralCarrierHz,
      PROCEDURAL_AUDIO_LIMITS.binauralCarrierHz.min,
      PROCEDURAL_AUDIO_LIMITS.binauralCarrierHz.max,
    ),
    binauralDeltaHz: clamp(
      value.binauralDeltaHz ?? DEFAULT_PROCEDURAL_AUDIO_CONFIG.binauralDeltaHz,
      PROCEDURAL_AUDIO_LIMITS.binauralDeltaHz.min,
      PROCEDURAL_AUDIO_LIMITS.binauralDeltaHz.max,
    ),
    toneGain: clamp(value.toneGain ?? DEFAULT_PROCEDURAL_AUDIO_CONFIG.toneGain, gain.min, gain.max),
    harmonicWarmth: clamp(value.harmonicWarmth ?? DEFAULT_PROCEDURAL_AUDIO_CONFIG.harmonicWarmth, gain.min, gain.max),
    binauralGain: clamp(value.binauralGain ?? DEFAULT_PROCEDURAL_AUDIO_CONFIG.binauralGain, gain.min, gain.max),
    noiseColor: value.noiseColor === null || isNoiseColor(value.noiseColor) ? value.noiseColor : null,
    noiseGain: clamp(value.noiseGain ?? DEFAULT_PROCEDURAL_AUDIO_CONFIG.noiseGain, gain.min, gain.max),
    environment: environment === 'ocean' || environment === 'wind' || environment === 'fire' || environment === 'cosmic' || environment === 'forest' || environment === 'temple' ? environment : 'none',
    environmentGain: clamp(value.environmentGain ?? DEFAULT_PROCEDURAL_AUDIO_CONFIG.environmentGain, gain.min, gain.max),
    environmentIntensity: clamp(value.environmentIntensity ?? DEFAULT_PROCEDURAL_AUDIO_CONFIG.environmentIntensity, gain.min, gain.max),
    thresholdShift: clamp(value.thresholdShift ?? DEFAULT_PROCEDURAL_AUDIO_CONFIG.thresholdShift, gain.min, gain.max),
    harmonicTranslation: clamp(value.harmonicTranslation ?? DEFAULT_PROCEDURAL_AUDIO_CONFIG.harmonicTranslation, gain.min, gain.max),
    templeGain: clamp(value.templeGain ?? DEFAULT_PROCEDURAL_AUDIO_CONFIG.templeGain, gain.min, gain.max),
    templeIntensity: clamp(value.templeIntensity ?? DEFAULT_PROCEDURAL_AUDIO_CONFIG.templeIntensity, gain.min, gain.max),
    masterGain: clamp(value.masterGain ?? DEFAULT_PROCEDURAL_AUDIO_CONFIG.masterGain, gain.min, gain.max),
    rampMs: clamp(
      value.rampMs ?? DEFAULT_PROCEDURAL_AUDIO_CONFIG.rampMs,
      PROCEDURAL_AUDIO_LIMITS.rampMs.min,
      PROCEDURAL_AUDIO_LIMITS.rampMs.max,
    ),
    spatialMode: value.spatialMode === 'drift' || value.spatialMode === 'pendulum' || value.spatialMode === 'swoosh' || value.spatialMode === 'rain' || value.spatialMode === 'orbit' || value.spatialMode === 'vortex' || value.spatialMode === 'channelTest' ? value.spatialMode : 'still',
    spatialTarget: value.spatialTarget === 'tone' || value.spatialTarget === 'both' ? value.spatialTarget : 'noise',
    spatialDepth: clamp(value.spatialDepth ?? DEFAULT_PROCEDURAL_AUDIO_CONFIG.spatialDepth, PROCEDURAL_AUDIO_LIMITS.spatialDepth.min, PROCEDURAL_AUDIO_LIMITS.spatialDepth.max),
    spatialRate: clamp(value.spatialRate ?? DEFAULT_PROCEDURAL_AUDIO_CONFIG.spatialRate, PROCEDURAL_AUDIO_LIMITS.spatialRate.min, PROCEDURAL_AUDIO_LIMITS.spatialRate.max),
  };
}
