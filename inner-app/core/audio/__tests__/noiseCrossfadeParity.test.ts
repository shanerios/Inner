import { describe, expect, it } from '@jest/globals';
import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.resolve(__dirname, '../../..');
const kotlin = fs.readFileSync(path.join(ROOT, 'modules/inner-audio/android/src/main/java/expo/modules/inneraudio/ProceduralAudioEngine.kt'), 'utf8');
const swift = fs.readFileSync(path.join(ROOT, 'modules/inner-audio/ios/InnerAudioModule.swift'), 'utf8');

describe('noise color changes blend instead of dropping out', () => {
  it('uses the same blend time in both engines', () => {
    const k = Number(kotlin.match(/private const val NOISE_CROSSFADE_SECONDS = ([0-9.]+)/)?.[1]);
    const s = Number(swift.match(/private static let noiseCrossfadeSeconds = ([0-9.]+)/)?.[1]);
    expect(k).toBe(s);
    expect(k).toBeGreaterThanOrEqual(3);
  });

  it('blends two present colors with an equal-power crossfade, and only falls back to a dip when noise is starting or stopping', () => {
    expect(kotlin).toContain('if (target.noiseColor != null && renderedNoiseColor != null && !isChangingNoiseColor && fadingFromNoiseColor == null &&');
    expect(swift).toContain('if target.noiseColor != nil && renderedNoiseColor != nil && !isChangingNoiseColor && fadingFromNoiseColor == nil &&');
    expect(kotlin).toContain('outgoing * cos(blendAngle) + incoming * sin(blendAngle)');
    expect(swift).toContain('outgoing * cos(blendAngle) + incoming * sin(blendAngle)');
    expect(kotlin).toContain('val blendAngle = noiseCrossfade * Math.PI / 2');
    expect(swift).toContain('let blendAngle = noiseCrossfade * Double.pi / 2');
  });

  it('clears the blend whenever the engine resets, so one journey never blends into the next', () => {
    expect(kotlin).toContain('fadingFromNoiseColor = null\n    noiseCrossfade = 0.0');
    expect(swift).toContain('fadingFromNoiseColor = nil\n    noiseCrossfade = 0');
  });
});
