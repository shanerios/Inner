import type { ProceduralAudioPatch, ProceduralEnvironment } from './types';

/**
 * The night's arc for each world's identity sound: the Aum (temple), the whale call (abyssal) and the
 * Cosmic voice (cosmic). Presence is set relative to the bed, not as an absolute level, because a sound
 * is heard against what surrounds it and the bed falls by ~14 dB between preparation and deep sleep.
 */
export type IdentityWorld = 'temple' | 'abyssal' | 'cosmic';

export type IdentityStage =
  | 'preparation'    // stage 1: the practice
  | 'descent'        // stage 1: the 30 minute descent
  | 'earlySleep'     // stage 2: sleep protection before the first recognition signal
  | 'remSleep'       // stage 3: from the first recognition signal onward
  | 'recognitionWindow';

/**
 * Identity level minus bed level, in dB (BS.1770 K-weighted, gated), with presence 1 and density 1.
 * Measured through the real Kotlin engine on the JVM with the settings each stage gives its world
 * (gentle feel). `sleep` is early and REM sleep, which share a bed and differ by <0.3 dB.
 * Re-measure whenever a world's bed or identity sound changes.
 */
const MEASURED_IDENTITY_TO_BED_DB: Record<IdentityWorld, { preparation: number; descent: number; sleep: number }> = {
  temple: { preparation: -14.25, descent: -11.57, sleep: -11.74 },
  abyssal: { preparation: -11.35, descent: -8.70, sleep: -8.90 },
  cosmic: { preparation: -21.86, descent: -19.61, sleep: -19.82 },
};

/**
 * The same relation in Create a Journey (environment gain 0.38), where each identity sound is already
 * heard as present and unforced. Stage 1 aims to match it, and the later stages fall from there.
 */
const CREATE_IDENTITY_TO_BED_DB: Record<IdentityWorld, number> = {
  temple: -7.31,
  abyssal: -3.73,
  cosmic: -12.32,
};

/** Target change from the Create relation, in dB. */
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

export const IDENTITY_PRESENCE_MAX = 4;

export function isIdentityWorld(environment: ProceduralEnvironment): environment is IdentityWorld {
  return environment === 'temple' || environment === 'abyssal' || environment === 'cosmic';
}

function measuredDb(world: IdentityWorld, stage: IdentityStage): number {
  const measured = MEASURED_IDENTITY_TO_BED_DB[world];
  if (stage === 'preparation') return measured.preparation;
  if (stage === 'descent') return measured.descent;
  return measured.sleep;
}

/** Where the identity sound should sit against the bed at this stage, in dB. */
export function identityTargetDb(world: IdentityWorld, stage: IdentityStage): number {
  const offset = stage === 'recognitionWindow'
    ? IDENTITY_STAGE_OFFSET_DB.remSleep + IDENTITY_WINDOW_YIELD_DB
    : IDENTITY_STAGE_OFFSET_DB[stage];
  return CREATE_IDENTITY_TO_BED_DB[world] + offset;
}

export function identityPresenceFor(world: IdentityWorld, stage: IdentityStage): number {
  const gainDb = identityTargetDb(world, stage) - measuredDb(world, stage);
  return Math.min(IDENTITY_PRESENCE_MAX, 10 ** (gainDb / 20));
}

/** Where the identity sound actually lands against the bed once presence is applied, in dB. */
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
