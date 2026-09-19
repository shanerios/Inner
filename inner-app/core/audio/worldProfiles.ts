import type { ProceduralEnvironment } from './types';

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
  },
  wind: {
    id: 'wind', label: 'Wind', concept: 'Broad moving air shaped by slow gusts and pressure changes.',
    foundation: ['low-air-pressure', 'filtered-air'],
    acoustics: { scale: 'vast', absorption: 0.2, diffusion: 0.45, width: 0.88 },
    signatures: ['passing-gusts'], motion: 'drift', events: [], recognitionRecoverySeconds: 2,
  },
  fire: {
    id: 'fire', label: 'Fire', concept: 'A close, warm hearth built from body, hiss, and fine crackle.',
    foundation: ['warm-body', 'filtered-hiss'],
    acoustics: { scale: 'intimate', absorption: 0.7, diffusion: 0.3, width: 0.46 },
    signatures: ['micro-crackle'], motion: 'stochastic', events: [], recognitionRecoverySeconds: 2,
  },
  cosmic: {
    id: 'cosmic', label: 'Cosmic', concept: 'A vast liminal field with harmonic horizons, breathing voice, and gravity.',
    foundation: ['void-pressure', 'harmonic-horizon', 'gravity-drone'],
    acoustics: { scale: 'vast', absorption: 0.08, diffusion: 0.86, width: 0.96 },
    signatures: ['breathing-distant-voice', 'golden-ratio-blooms'], motion: 'orbit',
    events: [{ id: 'harmonic-bloom', role: 'accent', salience: 0.45, recoverySeconds: 4 }],
    recognitionRecoverySeconds: 2,
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
  },
};

const OVERNIGHT_WORLD_ORDER: readonly OvernightAudioWorld[] = ['ocean', 'abyssal', 'forest', 'temple', 'cosmic', 'fire'];

export const OVERNIGHT_WORLD_PROFILES: ReadonlyArray<WorldProfile & { id: OvernightAudioWorld }> =
  OVERNIGHT_WORLD_ORDER.map((id) => ({ ...WORLD_PROFILES[id], id }));

export function worldProfile(environment: AudioWorld): WorldProfile {
  return WORLD_PROFILES[environment];
}
