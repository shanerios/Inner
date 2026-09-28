import type { InnerAudioEngine, NativeCheckpoint, NativeEngineDebugState } from './audio/types';

/** Terminal receipts are safe to reconcile even while a newer journey is live. */
export function isLiveJourneyCheckpoint(checkpoint: NativeCheckpoint, live: NativeEngineDebugState | null): boolean {
  if (checkpoint.terminalOutcome || !live || live.playbackState === 'stopped') return false;
  if (live.processInstanceId && checkpoint.processInstanceId && live.processInstanceId !== checkpoint.processInstanceId) return false;
  // iOS's paused AVAudioEngine is not running, but still owns a live timeline.
  if (live.checkpointSessionId) return live.checkpointSessionId === checkpoint.sessionId && live.timelineLoaded;
  // Legacy builds have no session identity; conservatively preserve their live evidence.
  return live.engineRunning;
}

/** Do not acknowledge failed history writes. Re-read live identity for each record. */
export async function recoverJourneyCheckpoints(
  engine: Pick<InnerAudioEngine, 'getCheckpoint' | 'getCheckpoints' | 'getDebugState' | 'clearCheckpoint'>,
  reconcile: (checkpoint: NativeCheckpoint) => Promise<unknown>,
): Promise<void> {
  const checkpoints = engine.getCheckpoints
    ? await engine.getCheckpoints()
    : [await engine.getCheckpoint()].filter((item): item is NativeCheckpoint => item != null);
  for (const checkpoint of checkpoints) {
    const live = await engine.getDebugState?.() ?? null;
    // Failed native inspection is not evidence that playback ended.
    if (engine.getDebugState && !live && !checkpoint.terminalOutcome) continue;
    if (isLiveJourneyCheckpoint(checkpoint, live)) continue;
    await reconcile(checkpoint);
    await engine.clearCheckpoint(checkpoint.sessionId);
  }
}
