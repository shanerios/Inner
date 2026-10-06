import { describe, expect, it } from '@jest/globals';
import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.resolve(__dirname, '../../..');
const kotlin = fs.readFileSync(path.join(ROOT, 'modules/inner-audio/android/src/main/java/expo/modules/inneraudio/ProceduralAudioEngine.kt'), 'utf8');
const swift = fs.readFileSync(path.join(ROOT, 'modules/inner-audio/ios/InnerAudioModule.swift'), 'utf8');

describe('the cue settle guard: both engines hold a cue after a resume the same way', () => {
  it('uses the same settle window and hold cap', () => {
    const k = (name: string) => Number(kotlin.match(new RegExp(`private const val ${name} = ([0-9_.]+)`))?.[1].replace(/_/g, ''));
    const s = (name: string) => Number(swift.match(new RegExp(`private static let ${name} = ([0-9_.]+)`))?.[1].replace(/_/g, ''));
    expect(k('CUE_SETTLE_MS')).toBe(90_000);
    expect(s('cueSettleMs')).toBe(k('CUE_SETTLE_MS'));
    expect(k('CUE_MAX_HOLD_MS')).toBe(300_000);
    expect(s('cueMaxHoldMs')).toBe(k('CUE_MAX_HOLD_MS'));
  });

  it('arms the guard from the shared pause and resume hooks and clears it on reset', () => {
    expect(kotlin).toMatch(/fun pauseSleepTimer\(\) \{\s+lock\.withLock \{\s+cueDisturbed = true/);
    expect(swift).toMatch(/func pauseSleepTimer\(\) \{\s+lock\.lock\(\)\s+cueDisturbed = true/);
    expect(kotlin).toMatch(/if \(cueDisturbed\) \{\s+cueDisturbed = false\s+cueSettlePending = true/);
    expect(swift).toMatch(/if cueDisturbed \{\s+cueDisturbed = false\s+cueSettlePending = true/);
    expect(kotlin).toContain('cueHoldUntilMs = -1.0\n    heldCueId = null\n    checkpointSessionId = null');
    expect(swift).toContain('cueHoldUntilMs = -1\n    heldCueId = nil\n    cueActive = false');
  });

  it('holds only the cue firing, leaving the fire threshold untouched, and reports it once', () => {
    expect(kotlin).toContain('?.takeUnless { holdCue(activeTimeline, it, timelineElapsedMs) }');
    expect(swift).toContain('!holdCue(activeTimeline, cueFireMs: cueFireMs, elapsedMs: timelineElapsedMs)');
    expect(kotlin).toContain('if (heldCueId != cueId)');
    expect(swift).toContain('if heldCueId != cueId');
    expect(kotlin).toContain('"recognition_signal_held"');
    expect(swift).toContain('"recognition_signal_held"');
  });
});
