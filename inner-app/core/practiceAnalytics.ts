import { track, trackOnce } from './analytics';

/** Same bar the Chamber events use: counted complete at 85% listened. */
export const PRACTICE_COMPLETION_THRESHOLD = 0.85;

export function trackGuardianStarted(activityId: string, trackId: string) {
  trackOnce(`${activityId}:guardian_started`, 'guardian_practice_started', { guardian_id: trackId });
}

/** Called wherever a Guardian session ends; reports completion once, only if enough was heard. */
export function trackGuardianEnded(activityId: string, trackId: string, listenedMs: number, durationMs: number) {
  if (!(durationMs > 0)) return;
  const ratio = listenedMs / durationMs;
  if (ratio < PRACTICE_COMPLETION_THRESHOLD) return;
  trackOnce(`${activityId}:guardian_completed`, 'guardian_practice_completed', {
    guardian_id: trackId,
    duration_s: Math.round(durationMs / 1000),
    completion_ratio: Math.round(Math.min(1, ratio) * 100) / 100,
  });
}

export function trackPracticeMemoryOpened() {
  track('practice_memory_opened');
}
