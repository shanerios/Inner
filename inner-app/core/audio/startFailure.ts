/**
 * Raised by both native engines when another app or a call is holding the
 * audio output, so a start cannot produce sound. Matched by code, never by the
 * wording of an error message: Expo wraps native errors in text that is not
 * meant for listeners.
 */
export const AUDIO_BUSY_CODE = 'ERR_AUDIO_BUSY';

export const AUDIO_BUSY_MESSAGE = 'Something else is holding the sound. Let it pass, then try again.';

/**
 * What a listener is told when a start fails. Known causes get their own
 * words; everything else gets the caller's `fallback`, written for its own
 * surface. The raw error belongs in diagnostics, not on screen.
 */
export function startFailureMessage(error: unknown, fallback: string): string {
  const code = typeof error === 'object' && error !== null ? (error as { code?: unknown }).code : undefined;
  return code === AUDIO_BUSY_CODE ? AUDIO_BUSY_MESSAGE : fallback;
}
