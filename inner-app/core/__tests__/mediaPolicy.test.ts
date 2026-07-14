import { describe, expect, it } from '@jest/globals';
import { sanitizeResumePosition, shouldCacheBeforePlayback } from '../mediaPolicy';

describe('mediaPolicy', () => {
  it('caches chambers first only on iOS', () => {
    expect(shouldCacheBeforePlayback('ios', false)).toBe(true);
    expect(shouldCacheBeforePlayback('ios', true)).toBe(false);
    expect(shouldCacheBeforePlayback('android', false)).toBe(false);
  });

  it('resumes soundscapes but restarts chambers', () => {
    expect(sanitizeResumePosition(42_000, 120_000, true)).toBe(42_000);
    expect(sanitizeResumePosition(42_000, 120_000, false)).toBe(0);
    expect(sanitizeResumePosition(Number.NaN, 120_000, true)).toBe(0);
  });
});
