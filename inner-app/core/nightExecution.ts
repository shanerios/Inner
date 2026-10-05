import type { JourneyMemoryOutcome, JourneyMemorySession } from './journeyMemory';

export type NightExecutionStatus = 'running' | 'completed' | 'completed_early' | 'partial' | 'abandoned' | 'failed';

export type NightExecutionRecord = {
  status: NightExecutionStatus;
  startedAt: number;
  endedAt?: number;
  plannedCues: Array<{ cueId: string; scheduledPositionMs?: number }>;
  deliveredCues: Array<{
    cueId: string;
    signalId?: string;
    firedAt: number;
    scheduledPositionMs?: number;
    actualPositionMs?: number;
    driftMs?: number;
  }>;
  missingCueIds: string[];
  audioRoute?: 'private' | 'speaker' | 'unknown';
  interruptionCount: number;
  outcome?: JourneyMemoryOutcome;
  error?: string;
};

/**
 * Turns durable native receipts into the compact planned-versus-delivered
 * record copied into Morning Return and Dream Log practice context.
 */
export function nightExecutionForSession(session: JourneyMemorySession): NightExecutionRecord | undefined {
  if (!session.journeyId.startsWith('overnight-recognition-') && !session.plannedRecognitionCues?.length) return undefined;

  const checkpointPlanned = (session.nativeCheckpoint?.plannedCueIds ?? [])
    .filter(cueId => cueId.includes('overnight-recognition-window'));
  const plannedCues: NightExecutionRecord['plannedCues'] = session.plannedRecognitionCues?.length
    ? session.plannedRecognitionCues
    : checkpointPlanned.map(cueId => ({ cueId }));
  const plannedIds = new Set(plannedCues.map(cue => cue.cueId));
  const delivered = new Map<string, NightExecutionRecord['deliveredCues'][number]>();

  for (const event of session.events) {
    if (event.type !== 'recognition_signal_fired' || !event.cueId) continue;
    if (plannedIds.size && !plannedIds.has(event.cueId)) continue;
    delivered.set(event.cueId, {
      cueId: event.cueId,
      signalId: event.signalId,
      firedAt: event.at,
      scheduledPositionMs: event.scheduledPositionMs,
      actualPositionMs: event.actualPositionMs,
      driftMs: event.driftMs,
    });
  }
  (session.nativeCheckpoint?.firedCueIds ?? []).forEach((cueId, index) => {
    if (plannedIds.size && !plannedIds.has(cueId)) return;
    if (!cueId.includes('overnight-recognition-window') && !plannedIds.has(cueId)) return;
    if (!delivered.has(cueId)) delivered.set(cueId, {
      cueId,
      signalId: session.nativeCheckpoint?.firedSignalIds[index],
      firedAt: session.nativeCheckpoint?.lastUpdatedAt ?? session.endedAt ?? session.startedAt,
      scheduledPositionMs: plannedCues.find(cue => cue.cueId === cueId)?.scheduledPositionMs,
    });
  });

  const deliveredCues = [...delivered.values()].sort((left, right) => (
    (left.scheduledPositionMs ?? left.firedAt) - (right.scheduledPositionMs ?? right.firedAt)
  ));
  const interruptionCount = session.events.filter(event => (
    event.type === 'interruption_began' || event.type === 'previous_session_interrupted_unexpectedly'
  )).length;
  const routeEvent = [...session.events].reverse().find(event => event.type === 'audio_route_changed' && event.route);
  const route = session.nativeCheckpoint?.audioRoute ?? routeEvent?.route;
  const errorEvent = [...session.events].reverse().find(event => event.type === 'error');
  const error = errorEvent?.message ?? errorEvent?.reason;
  const status: NightExecutionStatus = !session.endedAt
    ? 'running'
    : session.outcome === 'failed' ? 'failed'
      : session.completionStatus === 'completed' ? 'completed'
        : session.completionStatus === 'completed_early' ? 'completed_early'
          : session.completionStatus === 'partial' ? 'partial'
            : 'abandoned';

  return {
    status,
    startedAt: session.startedAt,
    endedAt: session.endedAt,
    plannedCues,
    deliveredCues,
    missingCueIds: plannedCues.map(cue => cue.cueId).filter(cueId => !delivered.has(cueId)),
    audioRoute: route === 'private' || route === 'speaker' || route === 'unknown' ? route : undefined,
    interruptionCount,
    outcome: session.outcome,
    error,
  };
}
