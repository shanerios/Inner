import { describe, expect, it } from '@jest/globals';
import { describeEngineState } from '../startDiagnostics';
import type { NativeEngineDebugState } from '../types';

const debug = (overrides: Partial<NativeEngineDebugState> = {}): NativeEngineDebugState => ({
  playbackState: 'stopped',
  engineRunning: false,
  timelineLoaded: false,
  renderedFrames: 0,
  sampleRate: 48_000,
  ...overrides,
});

describe('describeEngineState', () => {
  it('shows a sleep timer that is already in the past as a negative offset', () => {
    const text = describeEngineState(debug({ sleepEndMs: 900_000 }), { nativeState: 'stopped', nativePositionMs: 0 }, 1_000_000);
    expect(text).toContain('sleepEnd=-100000ms');
    expect(text).toContain('native=stopped');
    expect(text).toContain('pos=0');
  });

  it('reports an unarmed timer, render counts and the last stop cause', () => {
    const text = describeEngineState(
      debug({ renderedFrames: 960.4, lastStopReason: 'sleep_timer', timelineLoaded: true }),
      { nativeState: 'stopped', nativePositionMs: null },
      0,
    );
    expect(text).toContain('sleepEnd=none');
    expect(text).toContain('rendered=960');
    expect(text).toContain('lastStop=sleep_timer');
    expect(text).toContain('pos=none');
  });

  it('degrades gracefully without native debug state', () => {
    expect(describeEngineState(null, { nativeState: 'paused', nativePositionMs: 12.6 }, 0)).toBe('native=paused pos=13 debug=unavailable');
  });

  it('never includes anything but flags and numbers', () => {
    const text = describeEngineState(debug({ sleepEndMs: 5, lastStopReason: 'user_stop' }), null, 0);
    expect(text).toMatch(/^[A-Za-z_=0-9 .-]+$/);
  });
});
