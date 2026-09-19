import type { ProceduralAudioPatch, ProceduralEnvironment } from './types';

/**
 * The night's arc for each world's identity sound: the Aum (temple), the whale call (abyssal) and the
 * Cosmic voice (cosmic).
 *
 * Whether these are heard depends on how far they stand above the bed in their own frequency band, not on
 * overall loudness: they are low and narrow, and the bed is broad. So the arc is set as a band level: the
 * identity sound's level above the bed's, in the 1/3-octave band where the sound stands out most.
 */
export type IdentityWorld = 'temple' | 'abyssal' | 'cosmic';

export type IdentityStage =
  | 'preparation'    // stage 1: the practice
  | 'descent'        // stage 1: the 30 minute descent
  | 'earlySleep'     // stage 2: sleep protection before the first recognition signal
  | 'remSleep'       // stage 3: from the first recognition signal onward
  | 'recognitionWindow';

/**
 * Identity level above bed level, in dB, in the identity's strongest 1/3-octave band, with presence 1 and
 * density 1. Measured through the real Kotlin engine on the JVM with the settings each stage gives its world
 * (gentle feel), over the frames where the identity sound is sounding. Re-measure whenever a world's bed or
 * identity sound changes. Recognition windows share the REM bed.
 */
const MEASURED_BAND_SNR_DB: Record<IdentityWorld, { preparation: number; descent: number; earlySleep: number; remSleep: number }> = {
  temple: { preparation: 1.21, descent: 0.90, earlySleep: 0.68, remSleep: 0.68 },
  abyssal: { preparation: 1.87, descent: 1.37, earlySleep: 1.16, remSleep: 1.16 },
  cosmic: { preparation: -6.89, descent: -7.77, earlySleep: -7.99, remSleep: -7.99 },
};

/**
 * Where each sound stands above the bed in stage 1, in dB. Set by ear on a Pixel 8 Pro:
 * - abyssal: at +9.5 the call and answer were "good", "could be raised slightly" -> 11
 * - temple: at +8.1 the Aum was "audible, but barely" -> 15
 * - cosmic: at +2.6 the voice could not be heard at all -> 11, level with the whale call
 */
export const IDENTITY_STAGE_ONE_SNR_DB: Record<IdentityWorld, number> = {
  temple: 15,
  abyssal: 11,
  cosmic: 11,
};

/** Change from stage 1 in each later stage, in dB. */
export const IDENTITY_STAGE_OFFSET_DB: Record<Exclude<IdentityStage, 'recognitionWindow'>, number> = {
  preparation: 0,
  descent: 0,
  earlySleep: -3,
  remSleep: -5,
};

/** Near a recognition signal the identity sound steps aside by this much beyond the REM level. */
export const IDENTITY_WINDOW_YIELD_DB = -9;

/** How often the identity sound speaks in each stage: every occasion, or about every other one in REM. */
export const IDENTITY_STAGE_DENSITY: Record<IdentityStage, number> = {
  preparation: 1,
  descent: 1,
  earlySleep: 1,
  remSleep: 0.5,
  recognitionWindow: 0.5,
};

/** The native engines clamp presence to this; the arc must stay under it. */
export const IDENTITY_PRESENCE_MAX = 12;

export function isIdentityWorld(environment: ProceduralEnvironment): environment is IdentityWorld {
  return environment === 'temple' || environment === 'abyssal' || environment === 'cosmic';
}

function measuredDb(world: IdentityWorld, stage: IdentityStage): number {
  const measured = MEASURED_BAND_SNR_DB[world];
  return stage === 'recognitionWindow' ? measured.remSleep : measured[stage];
}

/** Where the identity sound should stand above the bed at this stage, in dB. */
export function identityTargetDb(world: IdentityWorld, stage: IdentityStage): number {
  const offset = stage === 'recognitionWindow'
    ? IDENTITY_STAGE_OFFSET_DB.remSleep + IDENTITY_WINDOW_YIELD_DB
    : IDENTITY_STAGE_OFFSET_DB[stage];
  return IDENTITY_STAGE_ONE_SNR_DB[world] + offset;
}

export function identityPresenceFor(world: IdentityWorld, stage: IdentityStage): number {
  const gainDb = identityTargetDb(world, stage) - measuredDb(world, stage);
  return Math.min(IDENTITY_PRESENCE_MAX, 10 ** (gainDb / 20));
}

/** Where the identity sound actually lands above the bed once presence is applied, in dB. */
export function identityAchievedDb(world: IdentityWorld, stage: IdentityStage): number {
  return measuredDb(world, stage) + 20 * Math.log10(identityPresenceFor(world, stage));
}

/**
 * The audio patch that sets a stage's identity presence and density. Worlds with no identity sound
 * get an empty patch so their audio stays exactly as it was.
 */
export function identityPatch(environment: ProceduralEnvironment, stage: IdentityStage): ProceduralAudioPatch {
  if (!isIdentityWorld(environment)) return {};
  return {
    identityPresence: identityPresenceFor(environment, stage),
    identityDensity: IDENTITY_STAGE_DENSITY[stage],
  };
}
