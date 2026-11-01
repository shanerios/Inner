import type { ProceduralEnvironment } from './types';

/**
 * Fire in the mixers (Live Mix and the chamber mixer) plays at the fullest setting of its own sounds: the chimney wind
 * lifted into the ear, each settling log with its own gesture, and the window answering some gusts. That is how Overnight
 * plays it in the Immersive feel. The mixers have no feel control and otherwise leave this at 0, which is the plainer
 * Gentle fire. Every other world keeps what it had.
 */
export const MIXER_FIRE_VARIETY = 1;

export type MixerVarietyChange = {
  /** The variety to apply with the environment change, or undefined to leave it alone. */
  identityVariety?: number;
  /** What to remember for when Fire is left: the variety before Fire raised it, or null when nothing is held. */
  remembered: number | null;
};

/**
 * What the environment pill should do to the variety when `to` is chosen while `from` is playing. Choosing Fire raises
 * it and remembers the value it had; choosing anything else after Fire gives that value back, so no other world is
 * ever played at Fire's setting.
 */
export function mixerVarietyChange(
  from: ProceduralEnvironment,
  to: ProceduralEnvironment,
  currentVariety: number,
  remembered: number | null,
): MixerVarietyChange {
  if (to === 'fire' && from !== 'fire') return { identityVariety: MIXER_FIRE_VARIETY, remembered: currentVariety };
  if (to !== 'fire' && from === 'fire') return { identityVariety: remembered ?? 0, remembered: null };
  return { remembered };
}
