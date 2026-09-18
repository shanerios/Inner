import { describe, expect, it, jest } from '@jest/globals';
import { DEFAULT_PROCEDURAL_AUDIO_CONFIG } from '../config';
import { ProceduralPlaybackSession } from '../proceduralSession';
import { compileAudioJourneyTimeline } from '../timeline';
import type { InnerAudioEngine } from '../types';

function engine(): jest.Mocked<InnerAudioEngine> {
  return {
    kind: 'procedural',
    isAvailable: jest.fn(() => true),
    getSnapshot: jest.fn(),
    configure: jest.fn(async () => {}),
    update: jest.fn(async () => {}),
    setTimeline: jest.fn(async () => {}),
    seekTimeline: jest.fn(async () => {}),
    setNowPlaying: jest.fn(async () => {}),
    setSleepTimer: jest.fn(async () => {}),
    getLastTimerCompletionAtMs: jest.fn(async () => null),
    getPlaybackState: jest.fn(async () => 'stopped'),
    getTimelinePositionMs: jest.fn(async () => null),
    drainDiagnosticEvents: jest.fn(async () => []),
    setRecognitionSignal: jest.fn(async () => undefined),
    triggerCue: jest.fn(async () => {}),
    setCheckpointSessionId: jest.fn(async () => undefined),
    getCheckpoint: jest.fn(async () => null),
    clearCheckpoint: jest.fn(async () => undefined),
    play: jest.fn(async () => {}),
    pause: jest.fn(async () => {}),
    stop: jest.fn(async () => {}),
    subscribe: jest.fn(() => () => {}),
  };
}

describe('ProceduralPlaybackSession', () => {
  it('tracks elapsed time across pause and resume', async () => {
    let time = 1_000;
    const native = engine();
    const session = new ProceduralPlaybackSession(native, () => time);
    await session.start(DEFAULT_PROCEDURAL_AUDIO_CONFIG);
    time = 3_500;
    expect(session.getPositionMs()).toBe(2_500);
    await session.pause();
    time = 8_000;
    expect(session.getPositionMs()).toBe(2_500);
    await session.play();
    time = 9_000;
    expect(session.getPositionMs()).toBe(3_500);
  });

  it('reconciles stale JavaScript playback state with native playback', async () => {
    let time = 1_000;
    const native = engine();
    native.getPlaybackState.mockResolvedValue('paused');
    const session = new ProceduralPlaybackSession(native, () => time);
    await session.start(DEFAULT_PROCEDURAL_AUDIO_CONFIG);
    time = 4_000;

    await expect(session.reconcilePlaybackState()).resolves.toBe('paused');
    expect(session.isPlaying()).toBe(false);
    expect(session.getPositionMs()).toBe(3_000);

    await session.play();
    expect(native.play).toHaveBeenCalledTimes(2);
  });

  it('uses the native timeline position when route handling pauses playback', async () => {
    let time = 1_000;
    const native = engine();
    const session = new ProceduralPlaybackSession(native, () => time);
    await session.start(DEFAULT_PROCEDURAL_AUDIO_CONFIG);
    native.getPlaybackState.mockResolvedValue('paused');
    native.getTimelinePositionMs.mockResolvedValue(1_250);
    time = 4_000;

    await session.reconcilePlaybackState();
    expect(session.isPlaying()).toBe(false);
    expect(session.getPositionMs()).toBe(1_250);

    native.getPlaybackState.mockResolvedValue('playing');
    time = 6_000;
    await session.reconcilePlaybackState();
    time = 6_500;
    expect(session.getPositionMs()).toBe(1_750);
  });

  it('updates volume through the normalized engine patch', async () => {
    const native = engine();
    const session = new ProceduralPlaybackSession(native);
    await session.start(DEFAULT_PROCEDURAL_AUDIO_CONFIG);
    await session.setVolume(2);
    expect(native.update).toHaveBeenCalledWith(expect.objectContaining({ masterGain: 1 }));
  });

  it('merges and normalizes live mixer updates', async () => {
    const native = engine();
    const session = new ProceduralPlaybackSession(native);
    await session.start(DEFAULT_PROCEDURAL_AUDIO_CONFIG);
    await session.update({ binauralCarrierHz: 50, binauralGain: 0.4, binauralDeltaHz: 80, noiseColor: 'pink' });
    expect(session.getConfig()).toEqual(expect.objectContaining({
      carrierHz: 528,
      binauralCarrierHz: 100,
      binauralGain: 0.4,
      binauralDeltaHz: 40,
      noiseColor: 'pink',
    }));
    expect(native.update).toHaveBeenCalledWith(expect.objectContaining({
      binauralCarrierHz: 100,
      binauralGain: 0.4,
      binauralDeltaHz: 40,
      noiseColor: 'pink',
    }));
  });

  it('starts a compiled timeline natively', async () => {
    const native = engine();
    const session = new ProceduralPlaybackSession(native);
    const timeline = compileAudioJourneyTimeline({
      id: 'demo', title: 'Demo Journey', loop: true,
      stages: [{ id: 'one', label: 'One', durationMs: 2_000, target: { binauralDeltaHz: 6 } }],
    }, DEFAULT_PROCEDURAL_AUDIO_CONFIG);
    await session.startTimeline(DEFAULT_PROCEDURAL_AUDIO_CONFIG, timeline);
    expect(native.configure).toHaveBeenCalledWith(DEFAULT_PROCEDURAL_AUDIO_CONFIG);
    expect(native.setTimeline).toHaveBeenCalledWith(timeline);
    expect(native.setNowPlaying).toHaveBeenCalledWith('Demo Journey');
    expect(native.play).toHaveBeenCalled();
  });

  it('keeps the native timeline aligned when seeking', async () => {
    const native = engine();
    const session = new ProceduralPlaybackSession(native);
    await session.start(DEFAULT_PROCEDURAL_AUDIO_CONFIG);
    await session.seekToMs(120_000);
    expect(session.getPositionMs()).toBe(120_000);
    expect(native.seekTimeline).toHaveBeenCalledWith(120_000);
  });
});

function deferred<T = void>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

const order = (mock: { mock: { invocationCallOrder: number[] } }) => mock.mock.invocationCallOrder[0];

describe('ProceduralPlaybackSession engine lifecycle', () => {
  it('begins every session from a stopped engine', async () => {
    const native = engine();
    const session = new ProceduralPlaybackSession(native);
    await session.start(DEFAULT_PROCEDURAL_AUDIO_CONFIG);
    expect(native.stop).toHaveBeenCalledTimes(1);
    expect(order(native.stop)).toBeLessThan(order(native.configure));
    expect(order(native.configure)).toBeLessThan(order(native.play));
  });

  it('takes the engine only once for a session that starts and then starts a timeline', async () => {
    const native = engine();
    const session = new ProceduralPlaybackSession(native);
    const timeline = compileAudioJourneyTimeline({
      id: 'demo', title: 'Demo', stages: [{ id: 'one', label: 'One', durationMs: 2_000, target: {} }],
    }, DEFAULT_PROCEDURAL_AUDIO_CONFIG);
    await session.start(DEFAULT_PROCEDURAL_AUDIO_CONFIG);
    await session.startTimeline(DEFAULT_PROCEDURAL_AUDIO_CONFIG, timeline);
    expect(native.stop).toHaveBeenCalledTimes(1);
  });

  it('does not let a displaced session stop, re-arm or reconfigure the newer one', async () => {
    const native = engine();
    const older = new ProceduralPlaybackSession(native);
    const newer = new ProceduralPlaybackSession(native);
    await older.start(DEFAULT_PROCEDURAL_AUDIO_CONFIG);
    await newer.start(DEFAULT_PROCEDURAL_AUDIO_CONFIG);
    expect(older.ownsEngine()).toBe(false);
    expect(newer.ownsEngine()).toBe(true);
    native.stop.mockClear();
    native.setSleepTimer.mockClear();
    native.update.mockClear();

    await older.stop();
    await older.setSleepTimer(Date.now() + 60_000);
    await older.update({ masterGain: 0.1 });
    await older.pause();

    expect(native.stop).not.toHaveBeenCalled();
    expect(native.setSleepTimer).not.toHaveBeenCalled();
    expect(native.update).not.toHaveBeenCalled();
    expect(newer.ownsEngine()).toBe(true);
  });

  it('runs a leaving session\'s stop to completion before the next session configures', async () => {
    const native = engine();
    const leaving = new ProceduralPlaybackSession(native);
    const arriving = new ProceduralPlaybackSession(native);
    await leaving.start(DEFAULT_PROCEDURAL_AUDIO_CONFIG);
    native.stop.mockClear();
    native.configure.mockClear();
    const stopGate = deferred();
    native.stop.mockImplementationOnce(() => stopGate.promise);

    const stopping = leaving.stop();
    const starting = arriving.start(DEFAULT_PROCEDURAL_AUDIO_CONFIG);
    await Promise.resolve();
    await Promise.resolve();
    expect(native.configure).not.toHaveBeenCalled();

    stopGate.resolve();
    await Promise.all([stopping, starting]);
    expect(native.configure).toHaveBeenCalledTimes(1);
    expect(arriving.ownsEngine()).toBe(true);
  });

  it('cannot arm a sleep timer after the session has stopped', async () => {
    const native = engine();
    const session = new ProceduralPlaybackSession(native);
    await session.start(DEFAULT_PROCEDURAL_AUDIO_CONFIG);
    await session.stop();
    native.setSleepTimer.mockClear();
    await session.setSleepTimer(Date.now() + 8 * 3_600_000);
    expect(native.setSleepTimer).not.toHaveBeenCalled();
  });

  it('rejects playback and signal changes from a session that no longer owns the engine', async () => {
    const native = engine();
    const session = new ProceduralPlaybackSession(native);
    await session.start(DEFAULT_PROCEDURAL_AUDIO_CONFIG);
    await session.stop();
    await expect(session.play()).rejects.toThrow('no longer active');
    await expect(session.setRecognitionSignal('bell', 'file:///bell.wav')).rejects.toThrow('no longer active');
    expect(native.setRecognitionSignal).not.toHaveBeenCalled();
  });

  it('keeps serving later sessions after one start fails', async () => {
    const native = engine();
    native.configure.mockRejectedValueOnce(new Error('engine unavailable'));
    const failing = new ProceduralPlaybackSession(native);
    await expect(failing.start(DEFAULT_PROCEDURAL_AUDIO_CONFIG)).rejects.toThrow('engine unavailable');
    await failing.stop();

    const next = new ProceduralPlaybackSession(native);
    await next.start(DEFAULT_PROCEDURAL_AUDIO_CONFIG);
    expect(next.isPlaying()).toBe(true);
    expect(next.ownsEngine()).toBe(true);
  });

  it('releases ownership even when the native stop throws', async () => {
    const native = engine();
    const session = new ProceduralPlaybackSession(native);
    await session.start(DEFAULT_PROCEDURAL_AUDIO_CONFIG);
    native.stop.mockRejectedValueOnce(new Error('stop failed'));
    await expect(session.stop()).rejects.toThrow('stop failed');
    expect(session.ownsEngine()).toBe(false);
    expect(session.isPlaying()).toBe(false);
  });

  it('applies the checkpoint id only while it owns the engine', async () => {
    const native = engine();
    const session = new ProceduralPlaybackSession(native);
    await session.acquire();
    await session.setCheckpointSessionId('memory-1');
    expect(native.setCheckpointSessionId).toHaveBeenCalledWith('memory-1');
    await session.stop();
    native.setCheckpointSessionId.mockClear();
    await session.setCheckpointSessionId(null);
    expect(native.setCheckpointSessionId).not.toHaveBeenCalled();
  });
});

describe('ProceduralPlaybackSession start health', () => {
  it('treats a resolved play() with no rendered audio as unhealthy', async () => {
    const native = engine();
    const session = new ProceduralPlaybackSession(native);
    await session.start(DEFAULT_PROCEDURAL_AUDIO_CONFIG);

    native.getPlaybackState.mockResolvedValue('playing');
    native.getTimelinePositionMs.mockResolvedValue(0);
    await expect(session.checkStartHealth()).resolves.toMatchObject({ healthy: false, nativeState: 'playing' });

    native.getTimelinePositionMs.mockResolvedValue(1_200);
    await expect(session.checkStartHealth()).resolves.toMatchObject({ healthy: true });
  });

  it('counts a start as healthy once the timeline has advanced, even if the user paused since', async () => {
    const native = engine();
    const session = new ProceduralPlaybackSession(native);
    native.getPlaybackState.mockResolvedValue('paused');
    native.getTimelinePositionMs.mockResolvedValue(2_000);
    await expect(session.checkStartHealth()).resolves.toMatchObject({ healthy: true, nativeState: 'paused' });
  });

  it('is unhealthy for a stopped engine and for one paused before it rendered anything', async () => {
    const native = engine();
    const session = new ProceduralPlaybackSession(native);
    native.getPlaybackState.mockResolvedValue('stopped');
    native.getTimelinePositionMs.mockResolvedValue(null);
    await expect(session.checkStartHealth()).resolves.toMatchObject({ healthy: false, nativeState: 'stopped' });

    native.getPlaybackState.mockResolvedValue('paused');
    native.getTimelinePositionMs.mockResolvedValue(0);
    await expect(session.checkStartHealth()).resolves.toMatchObject({ healthy: false, nativeState: 'paused' });
  });

  it('accepts a playing engine that has no timeline position', async () => {
    const native = engine();
    const session = new ProceduralPlaybackSession(native);
    native.getPlaybackState.mockResolvedValue('playing');
    native.getTimelinePositionMs.mockResolvedValue(null);
    await expect(session.checkStartHealth()).resolves.toMatchObject({ healthy: true, nativePositionMs: null });
  });

  it('reports no debug state when the native build cannot provide one', async () => {
    const native = engine();
    const session = new ProceduralPlaybackSession(native);
    await expect(session.getDebugState()).resolves.toBeNull();
    native.getDebugState = jest.fn(async () => ({
      playbackState: 'stopped' as const, engineRunning: false, timelineLoaded: false, renderedFrames: 0, sampleRate: 48_000,
    }));
    await expect(session.getDebugState()).resolves.toMatchObject({ renderedFrames: 0 });
  });
});
