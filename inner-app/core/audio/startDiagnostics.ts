import type { StartHealth } from './proceduralSession';
import type { NativeEngineDebugState } from './types';

/**
 * A single line of flags and numbers describing why a start looks unhealthy.
 * It contains no user content, so it is safe to keep in Journey Memory and in
 * exported playback diagnostics.
 */
export function describeEngineState(
  debug: NativeEngineDebugState | null,
  health: Pick<StartHealth, 'nativeState' | 'nativePositionMs'> | null,
  nowMs: number,
): string {
  const parts: string[] = [];
  if (health) {
    parts.push(`native=${health.nativeState}`);
    parts.push(`pos=${health.nativePositionMs === null ? 'none' : Math.round(health.nativePositionMs)}`);
  }
  if (!debug) {
    parts.push('debug=unavailable');
    return parts.join(' ');
  }
  if (!health) parts.push(`native=${debug.playbackState}`);
  parts.push(`running=${debug.engineRunning}`);
  parts.push(`timeline=${debug.timelineLoaded}`);
  parts.push(`rendered=${Math.round(debug.renderedFrames)}`);
  // Relative to now: a negative value at session start is the stale-timer signature.
  parts.push(debug.sleepEndMs === undefined ? 'sleepEnd=none' : `sleepEnd=${Math.round(debug.sleepEndMs - nowMs)}ms`);
  if (debug.lastStopReason) parts.push(`lastStop=${debug.lastStopReason}`);
  return parts.join(' ');
}
