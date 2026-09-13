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
