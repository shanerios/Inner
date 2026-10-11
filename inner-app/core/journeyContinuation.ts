import type { FactoryAudioJourney, NativeCheckpoint } from './audio';
import type { JourneyMemorySession, JourneyMemoryState } from './journeyMemory';
import type { NightPlan } from './nightPlans';

/** A paused night remains recoverable until the following waking day. */
export const JOURNEY_CONTINUATION_MAX_AGE_MS = 18 * 60 * 60_000;

export type JourneyContinuation = {
  session: JourneyMemorySession;
  checkpoint: NativeCheckpoint;
  remainingMs: number;
};

export function isResumableJourneyCheckpoint(
  checkpoint: NativeCheckpoint,
  session: JourneyMemorySession | undefined,
  now = Date.now(),
): boolean {
  if (!session || session.endedAt || checkpoint.terminalOutcome) return false;
  if (!session.journeyId.startsWith('overnight-')) return false;
  if (checkpoint.positionMs <= 0 || checkpoint.positionMs >= session.plannedDurationMs - 500) return false;
  const ageMs = Math.max(0, now - checkpoint.lastUpdatedAt);
  return ageMs <= JOURNEY_CONTINUATION_MAX_AGE_MS;
}

export function findJourneyContinuation(
  memory: JourneyMemoryState,
  checkpoints: NativeCheckpoint[],
  now = Date.now(),
): JourneyContinuation | null {
  const candidates = checkpoints.flatMap(checkpoint => {
    const session = memory.sessions.find(item => item.id === checkpoint.sessionId);
    return session && isResumableJourneyCheckpoint(checkpoint, session, now)
      ? [{ session, checkpoint, remainingMs: Math.max(0, session.plannedDurationMs - checkpoint.positionMs) }]
      : [];
  });
  return candidates.sort((left, right) => right.checkpoint.lastUpdatedAt - left.checkpoint.lastUpdatedAt)[0] ?? null;
}

/**
 * Rebuilds the frozen timeline from Journey Memory. This is used only if the
 * native service no longer owns the live timeline; a still-live service is
 * adopted without touching its audio graph.
 */
export function journeyForContinuation(
  session: JourneyMemorySession,
  plan: NightPlan | null,
): FactoryAudioJourney {
  let stageStartMs = 0;
  let recognitionIndex = 0;
  const stages = session.stages.map((stage, stageIndex) => {
    const startsAtMs = stageStartMs;
    const endsAtMs = startsAtMs + stage.durationMs;
    const cues = (session.plannedRecognitionCues ?? []).flatMap(cue => {
      if (cue.scheduledPositionMs < startsAtMs || cue.scheduledPositionMs >= endsAtMs) return [];
      const recipeWindow = plan?.recipe?.recognition.windows[recognitionIndex++];
      const cueId = cue.cueId.includes('/') ? cue.cueId.slice(cue.cueId.indexOf('/') + 1) : cue.cueId;
      return [{
        id: cueId,
        type: 'cue' as const,
        atMs: cue.scheduledPositionMs - startsAtMs,
        recognitionSpace: true,
        signalGainScale: recipeWindow?.signalGainScale,
        recoverySeconds: recipeWindow?.recoverySeconds,
      }];
    });
    stageStartMs = endsAtMs;
    return {
      id: stage.id,
      label: stage.id.replace(/^overnight-/, '').replace(/-/g, ' '),
      durationMs: stage.durationMs,
      transitionMs: stageIndex === 0 ? 0 : Math.min(5_000, stage.durationMs),
      target: stage.config,
      spatialEvents: cues,
    };
  });
  const signalId = plan?.recipe?.recognition.signalId
    ?? session.events.find(event => event.type === 'recognition_signal_selected')?.signalId;
  return {
    id: session.journeyId,
    title: session.title,
    summary: 'Continue your Overnight Journey from the point Inner preserved.',
    durationLabel: 'Overnight',
    overnight: {
      sleepOnsetDelayMs: session.stages
        .filter(stage => !stage.id.startsWith('overnight-'))
        .reduce((total, stage) => total + stage.durationMs, 0),
      ...(signalId ? { recognitionSignalId: signalId as any } : {}),
    },
    timeline: {
      id: session.journeyId,
      title: session.title,
      seed: session.seed,
      endPolicy: session.endPolicy,
      protocolVersion: session.protocolVersion,
      stages,
    },
  };
}

export function journeyContinuationTimeLabel(remainingMs: number): string {
  const totalMinutes = Math.max(1, Math.ceil(remainingMs / 60_000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (!hours) return `${minutes} min remaining`;
  return minutes ? `${hours}h ${minutes}m remaining` : `${hours}h remaining`;
}
