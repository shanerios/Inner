import type { ProceduralAudioPatch } from './types';

export type FactoryPresetCategory = 'balanced' | 'research' | 'gateway-inspired';

export type FactoryMixerPreset = {
  id: string;
  label: string;
  category: FactoryPresetCategory;
  summary: string;
  patch: ProceduralAudioPatch;
  sourceUrl?: string;
};

export const FACTORY_PRESET_CATEGORY_LABELS: Record<FactoryPresetCategory, string> = {
  balanced: 'Balanced',
  research: 'Research',
  'gateway-inspired': 'Gateway-Inspired',
};

export const FACTORY_MIXER_PRESETS: FactoryMixerPreset[] = [
  {
    id: 'balanced-pure-tone',
    label: 'Pure Tone',
    category: 'balanced',
    summary: 'A comfortable single-layer starting point designed by Inner.',
    patch: { toneGain: 0.72, binauralGain: 0, noiseColor: null, noiseGain: 0, masterGain: 0.8 },
  },
  {
    id: 'balanced-theta-pink',
    label: 'Theta + Pink',
    category: 'balanced',
    summary: 'An Inner-designed balance of a 6 Hz difference and pink noise.',
    patch: { binauralCarrierHz: 200, binauralDeltaHz: 6, toneGain: 0.3, binauralGain: 0.42, noiseColor: 'pink', noiseGain: 0.22, masterGain: 0.8 },
  },
  {
    id: 'balanced-alpha-brown',
    label: 'Alpha + Brown',
    category: 'balanced',
    summary: 'An Inner-designed balance of a 10 Hz difference and brown noise.',
    patch: { binauralCarrierHz: 220, binauralDeltaHz: 10, toneGain: 0.28, binauralGain: 0.38, noiseColor: 'brown', noiseGain: 0.24, masterGain: 0.8 },
  },
  {
    id: 'balanced-gamma-white',
    label: '40 Hz + White',
    category: 'balanced',
    summary: 'An experimental high-difference mix; some listeners perceive two tones rather than one beat.',
    patch: { binauralCarrierHz: 240, binauralDeltaHz: 40, toneGain: 0.25, binauralGain: 0.3, noiseColor: 'white', noiseGain: 0.16, masterGain: 0.76 },
  },
  ...[3, 6, 9, 12].map((difference): FactoryMixerPreset => ({
    id: `research-250-base-${difference}hz`,
    label: `250 + ${difference} Hz`,
    category: 'research',
    summary: `Pure stereo tones modeled on a study condition: 250 Hz in one ear and ${250 + difference} Hz in the other. This reproduces signal parameters, not a promised outcome.`,
    // Inner defines carrier as the midpoint of the stereo pair.
    patch: {
      binauralCarrierHz: 250 + difference / 2,
      binauralDeltaHz: difference,
      toneGain: 0,
      binauralGain: 0.5,
      noiseColor: null,
      noiseGain: 0,
      masterGain: 0.8,
    },
    sourceUrl: 'https://pubmed.ncbi.nlm.nih.gov/41920802/',
  })),
  {
    id: 'gateway-inspired-200-3_875',
    label: '200 + 3.875 Hz',
    category: 'gateway-inspired',
    summary: 'A community-reported Gateway-style pair. It is not an authenticated Hemi-Sync or Gateway reproduction.',
    patch: {
      binauralCarrierHz: 201.9375,
      binauralDeltaHz: 3.875,
      toneGain: 0.2,
      binauralGain: 0.44,
      noiseColor: 'pink',
      noiseGain: 0.16,
      masterGain: 0.78,
    },
    sourceUrl: 'https://www.reddit.com/r/gatewaytapes/comments/11prhwr/',
  },
];
