import { describe, expect, it } from '@jest/globals';
import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.resolve(__dirname, '../../..');
const kotlin = fs.readFileSync(path.join(ROOT, 'modules/inner-audio/android/src/main/java/expo/modules/inneraudio/ProceduralAudioEngine.kt'), 'utf8');
const swift = fs.readFileSync(path.join(ROOT, 'modules/inner-audio/ios/InnerAudioModule.swift'), 'utf8');

describe('the quiet field around a recognition cue: both engines thin the noise bed the same way', () => {
  it('uses the same thinning, and thins the noise about 6 dB at the center of the field', () => {
    const k = Number(kotlin.match(/private const val RECOGNITION_NOISE_THINNING = ([0-9.]+)/)?.[1]);
    const s = Number(swift.match(/private static let recognitionNoiseThinning = ([0-9.]+)/)?.[1]);
    expect(k).toBe(s);
    // The environment's gain bottoms out at 1 - 0.9 * 0.46 at the center of the field (both engines share that curve).
    const center = 1 - 0.9 * 0.46;
    const noiseAtCentre = 1 - k * (1 - center);
    expect(20 * Math.log10(noiseAtCentre)).toBeGreaterThan(-7);
    expect(20 * Math.log10(noiseAtCentre)).toBeLessThan(-5);
    expect(kotlin).toContain('val recognitionNoiseGain = max(0.0, 1.0 - RECOGNITION_NOISE_THINNING * (1.0 - recognitionGain))');
    expect(swift).toContain('let recognitionNoiseGain = max(0.0, 1.0 - Self.recognitionNoiseThinning * (1.0 - recognitionGain))');
  });

  it('keeps the world quieting curve identical in both engines', () => {
    expect(kotlin).toContain('val gain = 1.0 - progress * 0.46');
    expect(swift).toMatch(/let gain = 1(\.0)? - progress \* 0\.46/);
  });
});
