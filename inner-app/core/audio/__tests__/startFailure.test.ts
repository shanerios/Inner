import { describe, expect, it } from '@jest/globals';
import { AUDIO_BUSY_CODE, AUDIO_BUSY_MESSAGE, startFailureMessage } from '../startFailure';

const FALLBACK = 'The journey did not begin. Nothing has been lost.';

describe('startFailureMessage', () => {
  it('answers a busy audio output in Inner\'s own voice', () => {
    const expoError = Object.assign(
      new Error("Call to function 'InnerAudio.play' has been rejected.\n→ Caused by: Audio was not started because another app is holding the audio output."),
      { code: AUDIO_BUSY_CODE },
    );
    expect(startFailureMessage(expoError, FALLBACK)).toBe(AUDIO_BUSY_MESSAGE);
  });

  it('never shows the wrapper text Expo puts around native errors', () => {
    const message = startFailureMessage(Object.assign(new Error('Call to function rejected'), { code: AUDIO_BUSY_CODE }), FALLBACK);
    expect(message).not.toMatch(/Call to function|Caused by|Exception|InnerAudio/);
  });

  it('uses the caller\'s fallback for every other failure', () => {
    expect(startFailureMessage(Object.assign(new Error('boom'), { code: 'ERR_UNEXPECTED' }), FALLBACK)).toBe(FALLBACK);
    expect(startFailureMessage(new Error('Procedural audio is unavailable in this build.'), FALLBACK)).toBe(FALLBACK);
    expect(startFailureMessage('a plain string', FALLBACK)).toBe(FALLBACK);
    expect(startFailureMessage(undefined, FALLBACK)).toBe(FALLBACK);
    expect(startFailureMessage(null, FALLBACK)).toBe(FALLBACK);
  });

  it('matches on the code, not on similar-sounding words in a message', () => {
    expect(startFailureMessage(new Error('another app is holding the audio output'), FALLBACK)).toBe(FALLBACK);
  });
});
