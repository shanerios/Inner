import type { NoiseColor, ProceduralEnvironment } from './types';

export type AudioWorld = Exclude<ProceduralEnvironment, 'none'>;
export type OvernightAudioWorld = Exclude<AudioWorld, 'wind'>;
export type WorldScale = 'intimate' | 'natural' | 'vast';
export type WorldMotion = 'still' | 'drift' | 'surge' | 'orbit' | 'stochastic';
export type WorldEventRole = 'texture' | 'accent' | 'anchor';

export type WorldEventProfile = {
  id: string;
  role: WorldEventRole;
  /** Perceptual prominence, from background detail (0) to primary landmark (1). */
  salience: number;
  /** Minimum clear space after the event before another rare event may begin. */
  recoverySeconds: number;
};

/**
 * What sits under a world: its noise and how strongly the binaural carrier is felt. Worlds differ in goal and
 * atmosphere, so they need not share one bed. The rationale records why, and how much it rests on evidence.
 */
export type WorldBed = {
  noiseColor: NoiseColor;
  /** Scales the overnight noise level at every stage. 1 is the level designed for pink noise. */
  noiseGainScale: number;
  /** Rolls the noise off above this frequency, in Hz, so hiss does not cover the world's own sound. 20000 leaves it untouched. */
  noiseHighCutHz: number;
  /** Scales the binaural level in the descent and in sleep. 1 is the standard level. */
  binauralGainScale: number;
  /**
   * How much of its level the noise keeps once the REM-rich hours begin (after the first recognition cue). Continuous
   * broadband noise has been linked to less REM in one small lab study, so the bed thins as the night goes on.
   */
  remNoiseTaper: number;
  rationale: {
    /** What the bed is meant to do for the listener. */
    goal: string;
    /** How it should feel. */
    atmosphere: string;
    /** What it rests on: research, measurement, or theory. Say so plainly when it is only theory. */
    basis: string;
  };
};

/** The bed's high cut when a world has none. */
const NO_HIGH_CUT = 20_000;

/** About a third quieter once the REM-rich hours begin. */
const REM_NOISE_TAPER = 0.67;

/** The bed the overnight journeys began with, kept by every world that has not been given its own. */
const SHARED_BED_RATIONALE = {
  goal: 'A steady, even masking layer that keeps small outside sounds from reaching a sleeper.',
  atmosphere: 'Neutral and unobtrusive, equally present across the audible range.',
  basis: 'The original shared design. Pink noise has the most sleep-lab attention of the common noise colors, in small studies; the evidence for any color is limited.',
} as const;

export type WorldProfile = {
  id: AudioWorld;
  label: string;
  concept: string;
  foundation: readonly string[];
  acoustics: {
    scale: WorldScale;
    absorption: number;
    diffusion: number;
    width: number;
  };
  signatures: readonly string[];
  motion: WorldMotion;
  events: readonly WorldEventProfile[];
  /** Rare events yield throughout the cue window and this many seconds after it. */
  recognitionRecoverySeconds: number;
  bed: WorldBed;
};

export const WORLD_PROFILES: Record<AudioWorld, WorldProfile> = {
  ocean: {
    id: 'ocean', label: 'Ocean', concept: 'A living shoreline with rolling pressure, foam, and small water detail.',
    foundation: ['undertow', 'surf-body', 'foam-air'],
    acoustics: { scale: 'vast', absorption: 0.32, diffusion: 0.62, width: 0.82 },
    signatures: ['asymmetric-wave-sets', 'micro-bubbles', 'distant-beacon'], motion: 'surge',
    events: [
      { id: 'bubble-burst', role: 'accent', salience: 0.28, recoverySeconds: 2 },
      { id: 'distant-beacon', role: 'anchor', salience: 0.46, recoverySeconds: 5 },
    ],
    recognitionRecoverySeconds: 2,
    bed: {
      noiseColor: 'brown',
      noiseGainScale: 0.5,
      noiseHighCutHz: NO_HIGH_CUT,
      binauralGainScale: 1,
      remNoiseTaper: REM_NOISE_TAPER,
      rationale: {
        goal: 'Let the surf and its small water detail be heard, while keeping the low-end masking of the shared bed.',
        atmosphere: 'A warm, low swell under the surf, with less hiss over the foam.',
        basis: 'Theory and measurement, not sleep research: brown noise has no meaningful sleep studies. The shared pink bed sat 3-12 dB above the surf from 63 Hz to 2 kHz. Brown at half the level keeps the low end within about 1-2.5 dB of it while the 1-8 kHz range is 6-15 dB quieter, so foam and bubbles come forward.',
      },
    },
  },
  abyssal: {
    id: 'abyssal', label: 'Abyssal Glass', concept: 'A protected glass habitat resting under immense deep-ocean pressure.',
    foundation: ['pressure-drone', 'hydrophone-water', 'glass-resonance'],
    acoustics: { scale: 'vast', absorption: 0.82, diffusion: 0.7, width: 0.76 },
    signatures: ['distant-call-response', 'rising-bubble-trails', 'condensation-on-glass', 'structural-flex'], motion: 'surge',
    events: [
      { id: 'condensation-drop', role: 'texture', salience: 0.22, recoverySeconds: 1.5 },
      { id: 'bubble-trail', role: 'texture', salience: 0.18, recoverySeconds: 1.5 },
      { id: 'abyssal-call', role: 'anchor', salience: 0.58, recoverySeconds: 5 },
    ],
    recognitionRecoverySeconds: 2,
    bed: {
      noiseColor: 'brown',
      noiseGainScale: 0.75,
      noiseHighCutHz: NO_HIGH_CUT,
      binauralGainScale: 0.6,
      remNoiseTaper: REM_NOISE_TAPER,
      rationale: {
        goal: 'Make the deepest world feel weighted from below, and keep hiss off its glass resonance.',
        atmosphere: 'Heavy, close and low, more like pressure than sound.',
        basis: 'Theory and measurement, not sleep research. Brown at three quarters of the shared level adds about 1-2.4 dB of body below 250 Hz and takes 3-11 dB off everything above 1 kHz. The world itself stays well under the bed in the upper bands, so its detail is carried by its own events.',
      },
    },
  },
  wind: {
    id: 'wind', label: 'Wind', concept: 'Broad moving air shaped by slow gusts and pressure changes.',
    foundation: ['low-air-pressure', 'filtered-air'],
    acoustics: { scale: 'vast', absorption: 0.2, diffusion: 0.45, width: 0.88 },
    signatures: ['passing-gusts'], motion: 'drift', events: [], recognitionRecoverySeconds: 2,
    bed: { noiseColor: 'pink', noiseGainScale: 1, noiseHighCutHz: NO_HIGH_CUT, binauralGainScale: 1, remNoiseTaper: REM_NOISE_TAPER, rationale: SHARED_BED_RATIONALE },
  },
  fire: {
    id: 'fire', label: 'Fire', concept: 'A close hearth that burns down with your night: warm body, crackle in bursts, settling logs, and wind in the chimney that the house answers.',
    foundation: ['warm-body', 'crackle-hiss'],
    acoustics: { scale: 'intimate', absorption: 0.7, diffusion: 0.3, width: 0.46 },
    signatures: ['crackle-in-bursts', 'settling-logs', 'wet-log-steam', 'chimney-wind', 'window-rattle'], motion: 'stochastic',
    events: [
      { id: 'settling-log', role: 'anchor', salience: 0.46, recoverySeconds: 3 },
      { id: 'chimney-gust', role: 'accent', salience: 0.3, recoverySeconds: 2 },
    ],
    recognitionRecoverySeconds: 2,
    bed: {
      noiseColor: 'brown',
      noiseGainScale: 0.5,
      noiseHighCutHz: NO_HIGH_CUT,
      binauralGainScale: 1,
      remNoiseTaper: REM_NOISE_TAPER,
      rationale: {
        goal: 'Let the crackle and the chimney wind stand out against the bed.',
        atmosphere: 'Warm and close: a low glow under the fire, not a second layer of hiss.',
        basis: 'Theory and measurement, not sleep research. The fire and the shared bed sat within about 2 dB of each other across the spectrum; brown at half the level keeps the low end and lifts the crackle band 6-15 dB above the bed.',
      },
    },
  },
  cosmic: {
    id: 'cosmic', label: 'Cosmic', concept: 'A vast liminal field with harmonic horizons, breathing voice, and gravity.',
    foundation: ['void-pressure', 'harmonic-horizon', 'gravity-drone'],
    acoustics: { scale: 'vast', absorption: 0.08, diffusion: 0.86, width: 0.96 },
    signatures: ['breathing-distant-voice', 'golden-ratio-blooms'], motion: 'orbit',
    events: [{ id: 'harmonic-bloom', role: 'accent', salience: 0.45, recoverySeconds: 4 }],
    recognitionRecoverySeconds: 2,
    bed: {
      noiseColor: 'pink',
      noiseGainScale: 0.5,
      noiseHighCutHz: 4_000,
      binauralGainScale: 1,
      remNoiseTaper: REM_NOISE_TAPER,
      rationale: {
        goal: 'Give the wide, slow field of the world room to be heard.',
        atmosphere: 'Spacious and light: mostly the world, with the bed just underneath.',
        basis: 'Theory and measurement, not sleep research. The world sat 15-40 dB under the shared bed through most of the spectrum, so the bed is 6 dB quieter and rolled off above 4 kHz (about 6 dB down at 6 kHz, 18 dB at 12 kHz), which keeps hiss off the upper field.',
      },
    },
  },
  forest: {
    id: 'forest', label: 'Forest', concept: 'A sheltered canopy where wind gives hollow trunks a distant voice.',
    foundation: ['canopy-body', 'leaf-shimmer'],
    acoustics: { scale: 'natural', absorption: 0.58, diffusion: 0.64, width: 0.78 },
    signatures: ['seeded-bird-calls', 'hollow-tree-breath'], motion: 'drift',
    events: [
      { id: 'bird-call', role: 'accent', salience: 0.38, recoverySeconds: 1.5 },
      { id: 'hollow-tree-breath', role: 'anchor', salience: 0.5, recoverySeconds: 4 },
    ],
    recognitionRecoverySeconds: 2,
    bed: {
      noiseColor: 'brown',
      noiseGainScale: 0.5,
      noiseHighCutHz: NO_HIGH_CUT,
      binauralGainScale: 1,
      remNoiseTaper: REM_NOISE_TAPER,
      rationale: {
        goal: 'Keep the shared bed\'s low-end masking while leaving the leaves and the hollow trunk\'s voice clear of hiss.',
        atmosphere: 'A soft low rumble, like distant wind through a dense canopy, rather than a steady hiss.',
        basis: 'Theory and measurement, not sleep research: brown noise has no meaningful sleep studies. At half the level its low end sits within about 2.5 dB of the shared bed below 250 Hz, while the 2-8 kHz band where leaves live is 9-15 dB quieter, so leaf crinkles clear the bed by about 9 dB instead of falling about 3 dB under it.',
      },
    },
  },
  temple: {
    id: 'temple', label: 'Temple', concept: 'A resonant stone chamber carried by shared breath and distant chant.',
    foundation: ['stone-resonance', 'filtered-air', 'temple-breath'],
    acoustics: { scale: 'vast', absorption: 0.16, diffusion: 0.9, width: 0.84 },
    signatures: ['distant-aum', 'water-drops', 'singing-bowl', 'wind-chimes'], motion: 'still',
    events: [
      { id: 'water-drop', role: 'texture', salience: 0.2, recoverySeconds: 1.2 },
      { id: 'wind-chime-cluster', role: 'accent', salience: 0.42, recoverySeconds: 2 },
      { id: 'singing-bowl', role: 'anchor', salience: 0.72, recoverySeconds: 4 },
    ],
    recognitionRecoverySeconds: 2,
    bed: {
      noiseColor: 'pink',
      noiseGainScale: 0.63,
      noiseHighCutHz: 1_800,
      binauralGainScale: 1,
      remNoiseTaper: REM_NOISE_TAPER,
      rationale: {
        goal: 'Leave room for the chant, the bowls and the resonance of the hall.',
        atmosphere: 'Quiet, dark stone-hall air: present, but never the subject.',
        basis: 'Theory and measurement, not sleep research. Pink stays as the neutral bed with the most sleep-lab attention, but about 4 dB quieter and rolled off above 1.8 kHz (about 10 dB down at 3 kHz, 25 dB at 6 kHz), because the world only cleared the shared bed below 250 Hz.',
      },
    },
  },
};

const OVERNIGHT_WORLD_ORDER: readonly OvernightAudioWorld[] = ['ocean', 'abyssal', 'forest', 'temple', 'cosmic', 'fire'];

export const OVERNIGHT_WORLD_PROFILES: ReadonlyArray<WorldProfile & { id: OvernightAudioWorld }> =
  OVERNIGHT_WORLD_ORDER.map((id) => ({ ...WORLD_PROFILES[id], id }));

export function worldProfile(environment: AudioWorld): WorldProfile {
  return WORLD_PROFILES[environment];
}

export function worldBed(environment: AudioWorld): WorldBed {
  return WORLD_PROFILES[environment].bed;
}

/**
 * The noise a world's stages should use, given the noise a stage was designed with for the shared pink bed. Worlds that
 * keep the shared bed are left exactly as designed; the others get their own color at their own level.
 */
export function noiseForWorld(environment: AudioWorld, designed: { noiseColor: NoiseColor | null; noiseGain: number }) {
  const bed = worldBed(environment);
  if (bed.noiseColor === 'pink' && bed.noiseGainScale === 1 && bed.noiseHighCutHz === NO_HIGH_CUT) return designed;
  return { noiseColor: bed.noiseColor, noiseGain: designed.noiseGain * bed.noiseGainScale, noiseHighCutHz: bed.noiseHighCutHz };
}
