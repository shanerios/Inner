import { describe, expect, it, jest } from '@jest/globals';
import * as fs from 'fs';
import * as path from 'path';
import { DEFAULT_PROCEDURAL_AUDIO_CONFIG } from '../config';
import { ProceduralPlaybackSession } from '../proceduralSession';
import type { InnerAudioEngine } from '../types';
import { RECOGNITION_ONLY_CUE_FADE_IN_MS } from '../../overnightMode';

const mockNativeTriggerCue = jest.fn(async (..._args: number[]) => {});
jest.mock('expo', () => ({
  requireOptionalNativeModule: () => ({ isAvailable: () => true, triggerCue: mockNativeTriggerCue }),
}));

const ROOT = path.resolve(__dirname, '../../..');
const screen = fs.readFileSync(path.join(ROOT, 'screens/OvernightJourneyScreen.tsx'), 'utf8');
const kotlin = fs.readFileSync(path.join(ROOT, 'modules/inner-audio/android/src/main/java/expo/modules/inneraudio/ProceduralAudioEngine.kt'), 'utf8');
const swift = fs.readFileSync(path.join(ROOT, 'modules/inner-audio/ios/InnerAudioModule.swift'), 'utf8');

describe('signal preview fade is specific to Recognition Only', () => {
  it('only sends a fade across the native bridge when one is requested', async () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { proceduralAudioEngine } = require('../nativeEngine') as typeof import('../nativeEngine');
    mockNativeTriggerCue.mockClear();
    await proceduralAudioEngine.triggerCue();
    await proceduralAudioEngine.triggerCue(0);
    await proceduralAudioEngine.triggerCue(RECOGNITION_ONLY_CUE_FADE_IN_MS);
    expect(mockNativeTriggerCue.mock.calls).toEqual([[], [], [RECOGNITION_ONLY_CUE_FADE_IN_MS]]);
  });

  it('passes the fade through a playback session, and makes the same bare call without one', async () => {
    const triggerCue = jest.fn(async (..._args: number[]) => {});
    const engine = { kind: 'procedural', isAvailable: () => true, configure: jest.fn(async () => {}), update: jest.fn(async () => {}),
      play: jest.fn(async () => {}), pause: jest.fn(async () => {}), stop: jest.fn(async () => {}), subscribe: jest.fn(() => () => {}),
      setNowPlaying: jest.fn(async () => {}), setSleepTimer: jest.fn(async () => {}), getSnapshot: jest.fn(), triggerCue,
      getPlaybackState: jest.fn(async () => 'stopped'), drainDiagnosticEvents: jest.fn(async () => []) } as unknown as jest.Mocked<InnerAudioEngine>;
    const session = new ProceduralPlaybackSession(engine);
    await session.start(DEFAULT_PROCEDURAL_AUDIO_CONFIG);
    await session.triggerCue();
    await session.triggerCue(RECOGNITION_ONLY_CUE_FADE_IN_MS);
    expect(triggerCue.mock.calls).toEqual([[], [RECOGNITION_ONLY_CUE_FADE_IN_MS]]);
  });

  it('asks for the shared Recognition Only fade from the overnight screen only in that mode', () => {
    expect(screen).toContain('triggerCue(recognitionOnly ? RECOGNITION_ONLY_CUE_FADE_IN_MS : undefined)');
    expect(screen.match(/triggerCue\(/g)).toHaveLength(1);
  });

  it('reuses the one native fade: a preview cue starts with the pending fade and no second path', () => {
    expect(kotlin).toContain('fun triggerCue(fadeInMs: Double = 0.0)');
    expect(kotlin).toContain('startCue(fadeInMs = cuePendingFadeInMs)');
    expect(swift).toContain('func triggerCue(fadeInMs: Double = 0)');
    expect(swift).toContain('startCue(fadeInMs: cuePendingFadeInMs)');
    expect(kotlin.match(/fun cueFadeGain|private fun cueFadeGain/g)).toHaveLength(1);
    expect(swift.match(/private func cueFadeGain/g)).toHaveLength(1);
  });
});
