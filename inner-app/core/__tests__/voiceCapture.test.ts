import { describe, expect, it } from '@jest/globals';
import {
  appendFinalVoiceSegment,
  appendVoiceTranscript,
  composeVoiceTranscript,
} from '../voiceCapture';

describe('voice capture transcription', () => {
  it('turns the first spoken fragment into entry text', () => {
    expect(appendVoiceTranscript('', '  I was standing by the ocean.  ')).toBe('I was standing by the ocean.');
  });

  it('adds a later spoken fragment without overwriting existing text', () => {
    expect(appendVoiceTranscript('There was a blue door. ', 'Then I became aware.')).toBe(
      'There was a blue door. Then I became aware.',
    );
  });

  it('honors the journal entry length limit', () => {
    expect(appendVoiceTranscript('1234', '5678', 7)).toBe('1234 56');
  });

  it('keeps completed phrases while showing the current phrase', () => {
    expect(composeVoiceTranscript(
      'I remember',
      ['walking through a forest.', 'Then everything became quiet.'],
      'I saw a doorway',
    )).toBe(
      'I remember walking through a forest. Then everything became quiet. I saw a doorway',
    );
  });

  it('does not duplicate a repeated final phrase from the speech service', () => {
    const segments = appendFinalVoiceSegment([], 'The ocean was glowing.');
    expect(appendFinalVoiceSegment(segments, ' The ocean was glowing. ')).toEqual(segments);
  });

  it('applies the entry length limit across finalized and current phrases', () => {
    expect(composeVoiceTranscript('', ['1234'], '5678', 7)).toBe('1234 56');
  });
});
