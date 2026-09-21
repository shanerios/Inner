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
  /** How different the noise is in the two ears: 0 = the same noise in both, 1 = independent noise in each. */
  noiseWidth: number;
  /**
   * How far, in dB, each ear's bed swells either side of its average, on its own irregular schedule, so the bed drifts
   * from side to side without a cycle. 0 = still. Heard on headphones or earbuds; on a speaker the two sides merge.
   */
  noiseDriftDb: number;
  /** A typical length, in seconds, of one of those swells. */
  noiseDriftSeconds: number;
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

/** How long a swell of the bed's drift lasts when a world has no drift of its own. */
const DEFAULT_DRIFT_SECONDS = 12;

/** The binaural field the overnight journeys began with: 208 Hz, the beat falling 8 to 4 Hz through preparation and holding 5 Hz all night. */
const SHARED_BINAURAL: WorldBinaural = {
  carrierHz: 208,
  beatHz: { entry: 8, prepEnd: 4, descent: 5, earlySleep: 5, remSleep: 5 },
  trimDb: 0,
  levelDb: 0,
  rationale: 'The original shared design, taken from the published cue-training protocol for preparation, then held at 5 Hz. Theory only: the evidence that a binaural beat entrains the brain is inconclusive.',
};

/** About a third quieter once the REM-rich hours begin. */
const REM_NOISE_TAPER = 0.67;

/** The bed the overnight journeys began with, kept by every world that has not been given its own. */
const SHARED_BED_RATIONALE = {
  goal: 'A steady, even masking layer that keeps small outside sounds from reaching a sleeper.',
  atmosphere: 'Neutral and unobtrusive, equally present across the audible range.',
  basis: 'The original shared design. Pink noise has the most sleep-lab attention of the common noise colors, in small studies; the evidence for any color is limited.',
} as const;

/**
 * The binaural field of a world: a carrier that belongs to the world's own timbre, and a beat that moves through the
 * night. The beat is one quiet ingredient, not the mechanism: the evidence that a binaural beat entrains the brain is
 * inconclusive, so the range is kept narrow and never runs down into delta through the REM-rich hours.
 */
export type WorldBinaural = {
  /** The tone the beat is made from, in Hz: heard as part of the world, and a carrier that is easy to hear a beat on. */
  carrierHz: number;
  /** The beat in Hz at each moment of the night: as the night begins, as preparation ends, the descent, early sleep, the REM-rich hours. */
  beatHz: { entry: number; prepEnd: number; descent: number; earlySleep: number; remSleep: number };
  /** A level trim in dB for the carrier's pitch, so a higher carrier is not louder to the ear than a lower one. */
  trimDb: number;
  /** How far, in dB, the whole binaural layer sits under the level the app began with, so it sits within the world and not over it. */
  levelDb: number;
  /** Why: what it is for, and how little of it rests on evidence. */
  rationale: string;
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
  bed: WorldBed;
  binaural: WorldBinaural;
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
      noiseWidth: 1,
      noiseDriftDb: 5,
      noiseDriftSeconds: 6,
      binauralGainScale: 1,
      remNoiseTaper: REM_NOISE_TAPER,
      rationale: {
        goal: 'Let the surf and its small water detail be heard, while keeping the low-end masking of the shared bed.',
        atmosphere: 'A warm, wide swell under the surf that drifts from side to side, with less hiss over the foam.',
        basis: 'Theory and measurement, not sleep research: brown noise has no meaningful sleep studies. The shared pink bed sat 3-12 dB above the surf from 63 Hz to 2 kHz. Brown at half the level keeps the low end within about 1-2.5 dB of it while the 1-8 kHz range is 6-15 dB quieter, so foam and bubbles come forward. The bed is wide (different noise in each ear) and each ear swells irregularly, about +/-5 dB every 6 s, chosen by ear; a mono, still bed felt thin.',
      },
    },
    binaural: {
      carrierHz: 250,
      beatHz: { entry: 7, prepEnd: 6.2, descent: 5.8, earlySleep: 6, remSleep: 7 },
      trimDb: -1.5,
      levelDb: -10,
      rationale: 'A carrier low enough to sit under the surf, and a rhythmic, drifting beat that eases down through the descent and comes back up for the REM-rich hours. Theory only: binaural-beat entrainment is unproven, so the beat stays between about 5.8 and 7 Hz, and the carrier was picked for the world\'s timbre (a 250 Hz carrier has been used in sleep studies).',
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
      noiseWidth: 1,
      noiseDriftDb: 4.5,
      noiseDriftSeconds: 12,
      binauralGainScale: 0.6,
      remNoiseTaper: REM_NOISE_TAPER,
      rationale: {
        goal: 'Make the deepest world feel weighted from below, and keep hiss off its glass resonance.',
        atmosphere: 'Heavy, close and low, more like pressure than sound, slowly shifting from side to side.',
        basis: 'Theory and measurement, not sleep research. Brown at three quarters of the shared level adds about 1-2.4 dB of body below 250 Hz and takes 3-11 dB off everything above 1 kHz. The world itself stays well under the bed in the upper bands, so its detail is carried by its own events. The bed is wide and each ear swells irregularly, about +/-4.5 dB every 12 s, chosen by ear.',
      },
    },
    binaural: {
      carrierHz: 220,
      beatHz: { entry: 6, prepEnd: 5, descent: 4.8, earlySleep: 5.5, remSleep: 6.5 },
      trimDb: -0.5,
      levelDb: -10,
      rationale: 'The deepest world: the lowest carrier and a beat that descends early, dipping to about 4.8 Hz in the first hour so it feels like going down, then returning toward 6-6.5 Hz so the REM-rich hours are not held in slow, delta-adjacent territory. Theory only: one small nap study found very slow beats shortened the time to deep sleep without measurable entrainment, and lucid REM shows less 2-4 Hz delta than ordinary REM.',
    },
  },
  wind: {
    id: 'wind', label: 'Wind', concept: 'Broad moving air shaped by slow gusts and pressure changes.',
    foundation: ['low-air-pressure', 'filtered-air'],
    acoustics: { scale: 'vast', absorption: 0.2, diffusion: 0.45, width: 0.88 },
    signatures: ['passing-gusts'], motion: 'drift', events: [], recognitionRecoverySeconds: 2,
    bed: { noiseColor: 'pink', noiseGainScale: 1, noiseHighCutHz: NO_HIGH_CUT, noiseWidth: 0, noiseDriftDb: 0, noiseDriftSeconds: DEFAULT_DRIFT_SECONDS, binauralGainScale: 1, remNoiseTaper: REM_NOISE_TAPER, rationale: SHARED_BED_RATIONALE },
    binaural: SHARED_BINAURAL,
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
      noiseWidth: 1,
      noiseDriftDb: 3,
      noiseDriftSeconds: 8,
      binauralGainScale: 1,
      remNoiseTaper: REM_NOISE_TAPER,
      rationale: {
        goal: 'Let the crackle and the chimney wind stand out against the bed.',
        atmosphere: 'Warm and close: a wide, restless glow under the fire that shifts from side to side, not a second layer of hiss.',
        basis: 'Theory and measurement, not sleep research. The fire and the shared bed sat within about 2 dB of each other across the spectrum; brown at half the level keeps the low end and lifts the crackle band 6-15 dB above the bed. The bed is wide and each ear swells irregularly, about +/-3 dB every 8 s, chosen by ear.',
      },
    },
    binaural: {
      carrierHz: 240,
      beatHz: { entry: 7, prepEnd: 6.3, descent: 6, earlySleep: 6.3, remSleep: 7 },
      trimDb: -1,
      levelDb: -10,
      rationale: 'A hypnotic, embodied theta range, kept steady rather than pulsing, with a low carrier for warmth. Theory only: rhythmic-trance ranges of about 4-7 Hz are traditional, with mixed evidence, so the beat is held at 6-7 Hz.',
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
      noiseWidth: 1,
      noiseDriftDb: 3,
      noiseDriftSeconds: 16,
      binauralGainScale: 1,
      remNoiseTaper: REM_NOISE_TAPER,
      rationale: {
        goal: 'Give the wide, slow field of the world room to be heard.',
        atmosphere: 'Spacious and light: mostly the world, with a wide bed underneath that drifts slowly from side to side.',
        basis: 'Theory and measurement, not sleep research. The world sat 15-40 dB under the shared bed through most of the spectrum, so the bed is 6 dB quieter and rolled off above 4 kHz (about 6 dB down at 6 kHz, 18 dB at 12 kHz), which keeps hiss off the upper field. The bed is wide and each ear swells slowly, about +/-3 dB every 16 s, chosen by ear.',
      },
    },
    binaural: {
      carrierHz: 400,
      beatHz: { entry: 8, prepEnd: 7, descent: 6.5, earlySleep: 7, remSleep: 8 },
      trimDb: -5,
      levelDb: -10,
      rationale: 'A spacious, cognitive world: a higher carrier and a beat that settles to about 6.5 Hz in the descent and lifts to 7-8 Hz in the REM-rich hours. Theory only: continuous 40 Hz gamma is deliberately not used, because the frontal 40 Hz signature reported in lucid dreams was largely explained by eye-movement artifacts.',
    },
  },
  forest: {
    id: 'forest', label: 'Forest', concept: 'A sheltered canopy where gusts of wind stir the leaves, and a hollow trunk howls through them with a smaller tree answering far off.',
    foundation: ['canopy-swell', 'leaf-crinkle'],
    acoustics: { scale: 'natural', absorption: 0.58, diffusion: 0.64, width: 0.78 },
    signatures: ['seeded-bird-calls', 'wind-through-hollow-trunk', 'answering-tree'], motion: 'drift',
    events: [
      { id: 'bird-call', role: 'accent', salience: 0.38, recoverySeconds: 1.5 },
      { id: 'hollow-tree-breath', role: 'anchor', salience: 0.5, recoverySeconds: 4 },
    ],
    recognitionRecoverySeconds: 2,
    bed: {
      noiseColor: 'brown',
      noiseGainScale: 0.5,
      noiseHighCutHz: NO_HIGH_CUT,
      noiseWidth: 1,
      noiseDriftDb: 4,
      noiseDriftSeconds: 7,
      binauralGainScale: 1,
      remNoiseTaper: REM_NOISE_TAPER,
      rationale: {
        goal: 'Keep the shared bed\'s low-end masking while leaving the leaves and the hollow trunk\'s voice clear of hiss.',
        atmosphere: 'A soft, wide rumble like distant wind through a dense canopy, swelling from side to side with the gusts.',
        basis: 'Theory and measurement, not sleep research: brown noise has no meaningful sleep studies. At half the level its low end sits within about 2.5 dB of the shared bed below 250 Hz, while the 2-8 kHz band where leaves live is 9-15 dB quieter, so leaf crinkles clear the bed by about 9 dB instead of falling about 3 dB under it. The bed is wide and each ear swells irregularly, about +/-4 dB every 7 s, chosen by ear.',
      },
    },
    binaural: {
      carrierHz: 300,
      beatHz: { entry: 8.5, prepEnd: 8, descent: 7.5, earlySleep: 8, remSleep: 8.6 },
      trimDb: -3,
      levelDb: -10,
      rationale: 'The lightest, most perceptual world: an alpha-leaning beat that eases only a little through the descent, on a mid carrier where a binaural beat is easier to hear. Theory only: natural sounds are associated with relaxation, and 300-400 Hz carriers are reported to make beats easier to perceive.',
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
      noiseWidth: 1,
      noiseDriftDb: 2,
      noiseDriftSeconds: 20,
      binauralGainScale: 1,
      remNoiseTaper: REM_NOISE_TAPER,
      rationale: {
        goal: 'Leave room for the chant, the bowls and the resonance of the hall.',
        atmosphere: 'Quiet, dark, wide stone-hall air that barely moves: present, but never the subject.',
        basis: 'Theory and measurement, not sleep research. Pink stays as the neutral bed with the most sleep-lab attention, but about 4 dB quieter and rolled off above 1.8 kHz (about 10 dB down at 3 kHz, 25 dB at 6 kHz), because the world only cleared the shared bed below 250 Hz. The bed is wide and each ear swells very slowly, about +/-2 dB every 20 s, chosen by ear.',
      },
    },
    binaural: {
      carrierHz: 241.3,
      beatHz: { entry: 6.68, prepEnd: 6.68, descent: 6.68, earlySleep: 6.68, remSleep: 6.68 },
      trimDb: -1.2,
      levelDb: -10,
      rationale: 'Held at 6.68 Hz all night, after a real singing bowl whose fundamental is 482.61 Hz and whose beating sits at 6.68 Hz, so the beat is the bowl\'s own. The carrier is 241.3 Hz, the octave below the bowl, chosen by ear: the bowl\'s own pitch was too bright as a steady tone. Theory only: that study was 17 waking listeners for five minutes, so it shows the acoustic beat is real, not that it helps sleep or lucidity.',
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
  if (bed.noiseColor === 'pink' && bed.noiseGainScale === 1 && bed.noiseHighCutHz === NO_HIGH_CUT && bed.noiseWidth === 0 && bed.noiseDriftDb === 0) return designed;
  return {
    noiseColor: bed.noiseColor,
    noiseGain: designed.noiseGain * bed.noiseGainScale,
    noiseHighCutHz: bed.noiseHighCutHz,
    noiseWidth: bed.noiseWidth,
    noiseDriftDb: bed.noiseDriftDb,
    noiseDriftSeconds: bed.noiseDriftSeconds,
  };
}

/** Where each of the factory preparation stages sits between the night's entry beat and the beat at the end of preparation. */
const PREPARATION_BEAT_POSITION: Record<string, number> = { learn: 0, rehearse: 0.25, drift: 0.625, release: 1 };

export function worldBinaural(environment: AudioWorld): WorldBinaural {
  return WORLD_PROFILES[environment].binaural;
}

/**
 * A preparation stage's binaural values for a world, given the values it was designed with for the shared field. The
 * carrier keeps the shape the preparation gave it (falling a little toward sleep) around the world's own; the beat
 * moves between the world's entry beat and its end-of-preparation beat where the design moved it between 8 and 4 Hz.
 */
export function binauralForWorld(
  environment: AudioWorld,
  stageId: string,
  designed: { binauralCarrierHz?: number; binauralDeltaHz?: number; binauralGain?: number },
) {
  const binaural = worldBinaural(environment);
  const bed = worldBed(environment);
  if (binaural === SHARED_BINAURAL) return {};
  const position = PREPARATION_BEAT_POSITION[stageId];
  return {
    ...(designed.binauralCarrierHz === undefined ? {} : { binauralCarrierHz: designed.binauralCarrierHz * binaural.carrierHz / SHARED_BINAURAL.carrierHz }),
    ...(designed.binauralDeltaHz === undefined || position === undefined
      ? {}
      : { binauralDeltaHz: binaural.beatHz.entry + (binaural.beatHz.prepEnd - binaural.beatHz.entry) * position }),
    ...(designed.binauralGain === undefined ? {} : { binauralGain: designed.binauralGain * bed.binauralGainScale * 10 ** ((binaural.trimDb + binaural.levelDb) / 20) }),
  };
}
