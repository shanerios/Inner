export function shouldCacheBeforePlayback(platform: string, isSoundscape: boolean): boolean {
  return platform === 'ios' && !isSoundscape;
}

export function sanitizeResumePosition(
  resumeMs: number,
  _durationMs: number,
  isSoundscape: boolean
): number {
  if (!Number.isFinite(resumeMs) || resumeMs <= 0) return 0;
  return isSoundscape ? resumeMs : 0;
}
