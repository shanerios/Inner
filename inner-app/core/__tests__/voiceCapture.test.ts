import { describe, expect, it } from '@jest/globals';
import { appendVoiceTranscript } from '../voiceCapture';

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
});
