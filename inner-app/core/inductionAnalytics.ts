import { track } from './analytics';
import type { InductionEntry } from './inductionState';

/**
 * The Induction funnel. Events carry only how it was offered, which surface offered it and how far someone got,
 * never anything they said or experienced. (The shared helper also drops any free text.)
 *
 * - offered: the welcome or the card was shown
 * - listen_pressed: they chose to listen (from either)
 * - skipped: they skipped the welcome (it then waits as a card)
 * - dismissed: they let the card go
 * - started: audio began
 * - completed / left_early: they heard it to the end, or stopped part-way
 */
export type InductionSurface = 'welcome' | 'card';

const props = (entry: InductionEntry | null, surface?: InductionSurface) => ({
  entry: entry ?? 'unknown',
  ...(surface ? { surface } : {}),
});

export const trackInductionOffered = (entry: InductionEntry, surface: InductionSurface) =>
  track('induction_offered', props(entry, surface));
export const trackInductionListenPressed = (entry: InductionEntry | null, surface: InductionSurface) =>
  track('induction_listen_pressed', props(entry, surface));
export const trackInductionSkipped = (entry: InductionEntry | null) => track('induction_skipped', props(entry, 'welcome'));
export const trackInductionDismissed = (entry: InductionEntry | null) => track('induction_dismissed', props(entry, 'card'));
export const trackInductionStarted = (entry: InductionEntry | null) => track('induction_started', props(entry));

export const trackInductionCompleted = (entry: InductionEntry | null, durationS: number) =>
  track('induction_completed', { ...props(entry), duration_s: Math.max(0, Math.round(durationS)) });

export const trackInductionLeftEarly = (entry: InductionEntry | null, progressPct: number) =>
  track('induction_left_early', { ...props(entry), progress_pct: Math.min(100, Math.max(0, Math.round(progressPct))) });
