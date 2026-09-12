import type { JourneyMemorySession, JourneyMemoryState } from './journeyMemory';

export const PLAYBACK_DIAGNOSTICS_EXPORT_VERSION = 1 as const;

export type PlaybackDiagnosticsExport = {
  exportVersion: typeof PLAYBACK_DIAGNOSTICS_EXPORT_VERSION;
  generatedAt: number;
  app: { version: string | null; build: string | null; platform: string };
  sessions: Array<Omit<JourneyMemorySession, 'title' | 'morningReflection' | 'morningCapture'>>;
};

/**
 * Produces a support-safe playback record. User-authored titles and morning
 * answers and journal links are intentionally excluded; journal content never
 * enters Journey Memory and therefore cannot enter this export.
 */
export function buildPlaybackDiagnosticsExport(
  memory: JourneyMemoryState,
  app: PlaybackDiagnosticsExport['app'],
  generatedAt = Date.now(),
): PlaybackDiagnosticsExport {
  return {
    exportVersion: PLAYBACK_DIAGNOSTICS_EXPORT_VERSION,
    generatedAt,
    app,
    sessions: memory.sessions.map(({ title: _title, morningReflection: _reflection, morningCapture: _capture, ...session }) => session),
  };
}

export function serializePlaybackDiagnostics(value: PlaybackDiagnosticsExport): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}
