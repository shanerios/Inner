import { describe, expect, it, jest } from '@jest/globals';
import { DEFAULT_PROCEDURAL_AUDIO_CONFIG } from '../config';
import { overnightJourney } from '../overnightJourney';
import { compileOvernightProtocol, createRecognitionOvernightProtocol } from '../overnightProtocol';
import { compileAudioJourneyTimeline } from '../timeline';
import { FACTORY_AUDIO_JOURNEYS } from '../factoryJourneys';
import { personalizedSignalGuidance, recurringSignalPrompt, withPreparationFocus } from '../preparationFocus';
import { createRecurringSignalJourney } from '../../recurringDreamSignals';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

function night() {
  const protocol = compileOvernightProtocol(createRecognitionOvernightProtocol({
    environment: 'temple', feel: 'gentle', sleepDurationMinutes: 450, cuePlan: 'standard', signalId: 'guardian',
  }), DEFAULT_PROCEDURAL_AUDIO_CONFIG);
  return overnightJourney('temple', 'gentle', protocol, false, 6284);
}

describe('sign-aware preparation', () => {
  it('names the sign in the same four cues the Recognition practice does', () => {
    const base = FACTORY_AUDIO_JOURNEYS.find(journey => journey.id === 'lucid-signal')!;
    const practice = createRecurringSignalJourney(base, 'Flying');
    const overnight = withPreparationFocus(night(), 'Flying');
    const changed = (journey: typeof overnight) => journey.timeline.guidance!.filter(cue => cue.prompt.toLowerCase().includes('flying')).map(cue => cue.id);
    expect(changed(overnight)).toEqual(['signal-intro', 'signal-first', 'signal-rehearse', 'signal-release']);
    expect(overnight.timeline.guidance).toEqual(practice.timeline.guidance);
  });

  it('keeps every other cue as authored', () => {
    const plain = night().timeline.guidance!;
    const focused = withPreparationFocus(night(), 'Water').timeline.guidance!;
    expect(focused).toHaveLength(plain.length);
    for (const [index, cue] of plain.entries()) {
      expect(focused[index].id).toBe(cue.id);
      expect(focused[index].atMs).toBe(cue.atMs);
      if (!['signal-intro', 'signal-first', 'signal-rehearse', 'signal-release'].includes(cue.id)) {
        expect(focused[index]).toEqual(cue);
      }
    }
  });

  it('cannot change what plays during sleep: every audio stage and cue is identical', () => {
    const config = DEFAULT_PROCEDURAL_AUDIO_CONFIG;
    const plain = night();
    const focused = withPreparationFocus(night(), 'Shadow Presence');
    expect(focused.timeline.stages).toEqual(plain.timeline.stages);
    expect(focused.timeline.seed).toBe(plain.timeline.seed);
    expect(compileAudioJourneyTimeline(focused.timeline, config)).toEqual(compileAudioJourneyTimeline(plain.timeline, config));
    expect(focused.overnight).toEqual(plain.overnight);
    expect(focused.id).toBe(plain.id);
    expect(focused.title).toBe(plain.title);
  });

  it('does not mark the overnight preparation as a completed Recognition practice', () => {
    expect(withPreparationFocus(night(), 'Water')).not.toHaveProperty('recognitionPractice');
  });

  it('leaves the journey untouched without a sign, and never mutates its input', () => {
    const journey = night();
    const before = JSON.stringify(journey);
    expect(withPreparationFocus(journey, undefined)).toBe(journey);
    expect(withPreparationFocus(journey, null)).toBe(journey);
    expect(withPreparationFocus(journey, '   ')).toBe(journey);
    withPreparationFocus(journey, 'Water');
    expect(JSON.stringify(journey)).toBe(before);
  });

  it('handles a journey without guidance and trims the sign', () => {
    expect(personalizedSignalGuidance(undefined, 'Water')).toBeUndefined();
    expect(recurringSignalPrompt('  Water ')).toBe('When you encounter water, pause and ask: could this be a dream?');
  });
});
