import { track, trackOnce } from './analytics';
import { nightExecutionForSession } from './nightExecution';
import { overnightModeForJourneyId } from './overnightMode';
import type { JourneyMemoryOutcome, JourneyMemorySession } from './journeyMemory';

/**
 * Overnight lifecycle analytics, derived from the Journey Memory session and its existing execution
 * evidence. It runs after a durable write, never touches the audio engine, and sends only the random
 * session id, counts and enums: no recipe choices, recognition sign, or user text.
 */

const OVERNIGHT_JOURNEY_PREFIX = 'overnight-';

export function isOvernightSession(session: Pick<JourneyMemorySession, 'journeyId'>): boolean {
  return session.journeyId.startsWith(OVERNIGHT_JOURNEY_PREFIX);
}

const minutes = (ms: number | undefined) => (typeof ms === 'number' ? Math.round(ms / 60_000) : undefined);

function evidenceProps(session: JourneyMemorySession) {
  const execution = nightExecutionForSession(session);
  return {
    session_id: session.id,
    mode: overnightModeForJourneyId(session.journeyId),
    planned_min: minutes(session.plannedDurationMs),
    actual_min: minutes(session.actualDurationMs),
    progress: typeof session.progress === 'number' ? Math.round(session.progress * 100) / 100 : undefined,
    completion_status: session.completionStatus,
    outcome: session.outcome,
    cues_planned: execution?.plannedCues.length,
    cues_delivered: execution?.deliveredCues.length,
    cues_missing: execution?.missingCueIds.length,
    interruptions: execution?.interruptionCount,
    audio_route: execution?.audioRoute,
  };
}

export function trackOvernightStarted(session: JourneyMemorySession) {
  if (!isOvernightSession(session)) return;
  trackOnce(`${session.id}:started`, 'overnight_started', {
    session_id: session.id,
    mode: overnightModeForJourneyId(session.journeyId),
    planned_min: minutes(session.plannedDurationMs),
  });
}

/** A rebuilt or adopted checkpoint continuing an earlier session. */
export function trackOvernightResumed(session: JourneyMemorySession | undefined, positionMs: number) {
  if (!session || !isOvernightSession(session)) return;
  track('overnight_resumed', {
    session_id: session.id,
    mode: overnightModeForJourneyId(session.journeyId),
    position_min: minutes(positionMs),
  });
}

/** Unexpected end found at relaunch while the night can still be continued. Once per session. */
export function trackOvernightInterrupted(session: JourneyMemorySession, extra?: { phase: 'continuable' | 'ended' }) {
  if (!isOvernightSession(session)) return;
  trackOnce(`${session.id}:interrupted`, 'overnight_interrupted', {
    ...evidenceProps(session),
    phase: extra?.phase,
  });
}

const TERMINAL_EVENT: Record<JourneyMemoryOutcome, string> = {
  completed: 'overnight_completed',
  user_stopped: 'overnight_ended_by_user',
  recovered_interrupted: 'overnight_recovered',
  abandoned_interrupted: 'overnight_interrupted',
  os_terminated: 'overnight_interrupted',
  failed: 'overnight_failed',
  unknown: 'overnight_interrupted',
};

/** Fires once per session, from the session record that was just written with its terminal outcome. */
export function trackOvernightFinished(session: JourneyMemorySession | undefined) {
  if (!session?.endedAt || !session.outcome || !isOvernightSession(session)) return;
  const event = TERMINAL_EVENT[session.outcome];
  // An interruption already reported at relaunch is not reported a second time at reconciliation.
  const key = event === 'overnight_interrupted' ? `${session.id}:interrupted` : `${session.id}:${event}`;
  trackOnce(key, event, { ...evidenceProps(session), phase: event === 'overnight_interrupted' ? 'ended' : undefined });
}

/** Called when the user confirms tonight's plan, before the player opens. Coarse settings only. */
export function trackOvernightConfigured(props: {
  durationMinutes: number;
  recognitionWindows: number;
  voiceGuidance: boolean;
  planSource: string;
  accelerated: boolean;
  mode: 'full' | 'recognition_only';
}) {
  track('overnight_configured', {
    duration_min: props.durationMinutes,
    recognition_windows: props.recognitionWindows,
    voice_guidance: props.voiceGuidance,
    plan_source: props.planSource,
    accelerated_test: props.accelerated,
    mode: props.mode,
  });
}
