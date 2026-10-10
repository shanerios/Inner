import type { FactoryAudioJourney } from './factoryJourneys';

type GuidanceCue = NonNullable<FactoryAudioJourney['timeline']['guidance']>[number];

export function recurringSignalPrompt(sign: string): string {
  return `When you encounter ${sign.trim().toLocaleLowerCase()}, pause and ask: could this be a dream?`;
}

/**
 * The four Lucid Signal guidance cues that name a personal dream sign. Shared by the standalone
 * Recognition practice and the waking preparation inside an Overnight Journey, so both say the same
 * thing. Other cues keep their authored wording.
 */
export function personalizedSignalGuidance(guidance: GuidanceCue[] | undefined, sign: string): GuidanceCue[] | undefined {
  const cleanSign = sign.trim();
  if (!cleanSign) return guidance;
  const lowerSign = cleanSign.toLocaleLowerCase();
  return guidance?.map(cue => {
    if (cue.id === 'signal-intro') return { ...cue, prompt: `A tone will sound. Pair it with your recurring sign: ${cleanSign}.` };
    if (cue.id === 'signal-first') return { ...cue, prompt: `Picture noticing ${lowerSign} inside a dream. Let the tone sharpen your attention.` };
    if (cue.id === 'signal-rehearse') return { ...cue, prompt: recurringSignalPrompt(cleanSign) };
    if (cue.id === 'signal-release') return { ...cue, prompt: `If the tone or ${lowerSign} appears tonight, remember: you may be dreaming.` };
    return cue;
  });
}

/**
 * Names the night's recognition sign in the waking preparation only. Sleep audio, cue timing and
 * every audio stage are left exactly as built, so the sign cannot shape what is played during sleep.
 */
export function withPreparationFocus(journey: FactoryAudioJourney, sign: string | null | undefined): FactoryAudioJourney {
  if (!sign?.trim()) return journey;
  return {
    ...journey,
    timeline: {
      ...journey.timeline,
      guidance: personalizedSignalGuidance(journey.timeline.guidance, sign),
    },
  };
}
