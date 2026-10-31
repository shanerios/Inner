import { track } from './analytics';
import type { InductionEntry } from './inductionState';

/**
 * The Induction funnel. Events carry only how it was offered and how far someone got, never anything about
 * what they said or experienced. (The shared helper also drops any free text.)
 */
const props = (entry: InductionEntry | null) => ({ entry: entry ?? 'unknown' });

export const trackInductionOffered = (entry: InductionEntry) => track('induction_offered', props(entry));
export const trackInductionDismissed = (entry: InductionEntry | null) => track('induction_dismissed', props(entry));
export const trackInductionStarted = (entry: InductionEntry | null) => track('induction_started', props(entry));

export const trackInductionCompleted = (entry: InductionEntry | null, durationS: number) =>
  track('induction_completed', { ...props(entry), duration_s: Math.max(0, Math.round(durationS)) });

export const trackInductionLeftEarly = (entry: InductionEntry | null, progressPct: number) =>
  track('induction_left_early', { ...props(entry), progress_pct: Math.min(100, Math.max(0, Math.round(progressPct))) });
