export type OvernightMode = 'full' | 'recognition_only';

/** Journey id prefix written by `createRecognitionOvernightProtocol` for Recognition Only nights. */
export const RECOGNITION_ONLY_JOURNEY_PREFIX = 'overnight-recognition-only-';

/** Derived from the stored journey id, so history needs no new field and older sessions read as full. */
export function overnightModeForJourneyId(journeyId: string): OvernightMode {
  return journeyId.startsWith(RECOGNITION_ONLY_JOURNEY_PREFIX) ? 'recognition_only' : 'full';
}

/**
 * Provisional starting ceiling for a signal heard with no bed under it. Not yet verified against
 * measured output levels; it only caps the starting value and never changes the saved full-journey level.
 */
export const RECOGNITION_ONLY_SIGNAL_GAIN_CAP = 0.8;
