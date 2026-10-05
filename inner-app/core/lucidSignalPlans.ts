export type LucidSignalCuePlan = 'standard' | 'gentle';

/** Legacy reference points retained for older records and migrations. New nights use duration-relative scheduling. */
export const LUCID_SIGNAL_CUE_OFFSETS_HOURS: Record<LucidSignalCuePlan, number[]> = {
  standard: [4.5, 6, 7.5],
  gentle: [5.5, 7],
};

const CUE_POSITION_FRACTIONS: Record<LucidSignalCuePlan, number[]> = {
  standard: [0.6, 0.8, 0.92],
  gentle: [0.72, 0.9],
};

/**
 * Places the recognition signals within the night the practitioner actually chose.
 * Times are rounded to five-minute marks and represent the instant the signal plays,
 * measured from the end of waking preparation.
 */
export function recognitionCueMinutesForDuration(
  sleepDurationMinutes: number,
  plan: LucidSignalCuePlan,
): number[] {
  const duration = Math.min(10 * 60, Math.max(6 * 60, Math.round(sleepDurationMinutes)));
  return CUE_POSITION_FRACTIONS[plan].map(fraction => Math.round((duration * fraction) / 5) * 5);
}
