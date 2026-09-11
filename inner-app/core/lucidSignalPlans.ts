export type LucidSignalCuePlan = 'standard' | 'gentle';

export const LUCID_SIGNAL_CUE_OFFSETS_HOURS: Record<LucidSignalCuePlan, number[]> = {
  standard: [4.5, 6, 7.5],
  gentle: [5.5, 7],
};
