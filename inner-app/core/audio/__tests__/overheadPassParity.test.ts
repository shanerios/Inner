import { describe, expect, it } from '@jest/globals';
import * as fs from 'fs';
import * as path from 'path';
import { normalizeProceduralAudioConfig, DEFAULT_PROCEDURAL_AUDIO_CONFIG } from '../config';

const ROOT = path.resolve(__dirname, '../../..');
const engine = fs.readFileSync(path.join(ROOT, 'modules/inner-audio/android/src/main/java/expo/modules/inneraudio/ProceduralAudioEngine.kt'), 'utf8');
const swift = fs.readFileSync(path.join(ROOT, 'modules/inner-audio/ios/InnerAudioModule.swift'), 'utf8');

describe('the overhead pass: a heavy body crossing over the listener', () => {
  it('is an accepted spatial mode in TypeScript and both engines', () => {
    const config = normalizeProceduralAudioConfig({ ...DEFAULT_PROCEDURAL_AUDIO_CONFIG, spatialMode: 'overhead' });
    expect(config.spatialMode).toBe('overhead');
    expect(engine).toContain('it == "overhead" || it == "channelTest"');
    expect(swift).toContain('"vortex", "overhead", "channelTest"');
  });

  it('crosses in the same time, eases, alternates and swells the same way in both engines', () => {
    expect(engine).toContain('private const val OVERHEAD_PASS_SECONDS = 4.5');
    expect(swift).toContain('private static let overheadPassSeconds = 4.5');
    expect(engine).toContain('private const val OVERHEAD_FAR_DROP = 0.8');
    expect(swift).toContain('private static let overheadFarDrop = 0.8');
    const pairs: Array<[string, string]> = [
      ['val period = 60.0 / max(0.5, cyclesPerMinute)', 'let period = 60.0 / max(0.5, cyclesPerMinute)'],
      ['val passSeconds = min(OVERHEAD_PASS_SECONDS, period * 0.5)', 'let passSeconds = min(Self.overheadPassSeconds, period * 0.5)'],
      ['val within = elapsedSeconds - Math.floor(elapsedSeconds / period) * period', 'let within = elapsedSeconds - floor(elapsedSeconds / period) * period'],
      ['clamp((within - (period - passSeconds) / 2) / passSeconds, 0.0, 1.0)', 'clamp((within - (period - passSeconds) / 2) / passSeconds, 0, 1)'],
      ['return progress * progress * (3 - 2 * progress)', 'return progress * progress * (3 - 2 * progress)'],
      ['val shape = sin(Math.PI * overheadProgress(elapsedSeconds, cyclesPerMinute))', 'let shape = sin(Double.pi * overheadProgress(elapsedSeconds, cyclesPerMinute: cyclesPerMinute))'],
      ['overheadDirection(elapsedSeconds, target.spatialRate) * (2 * overheadEase(elapsedSeconds, target.spatialRate) - 1)', 'overheadDirection(elapsedSeconds, cyclesPerMinute: target.spatialRate) * (2 * overheadEase(elapsedSeconds, cyclesPerMinute: target.spatialRate) - 1)'],
      ['val orbitNear = if (overhead) overheadProximity(spatialSeconds, target.spatialRate) else (cos(orbitPhase) + 1) / 2', 'let orbitNear = overhead ? overheadProximity(spatialSeconds, cyclesPerMinute: target.spatialRate) : (cos(orbitPhase) + 1) / 2'],
      ['val orbitDistance = 1 - target.spatialDepth * (if (overhead) OVERHEAD_FAR_DROP else 0.5) * (1 - orbitNear)', 'let orbitDistance = 1 - target.spatialDepth * (overhead ? Self.overheadFarDrop : 0.5) * (1 - orbitNear)'],
    ];
    for (const [kotlinLine, swiftLine] of pairs) {
      expect(engine).toContain(kotlinLine);
      expect(swift).toContain(swiftLine);
    }
    // The existing orbit and vortex motions are unchanged: they still read the cosine for how near they are.
    expect(engine).toContain('else (cos(orbitPhase) + 1) / 2');
  });

  it('puts the Sanctum\'s footsteps about 4 dB under the Temple\'s, in both engines', () => {
    expect(engine).toContain('private const val SANCTUM_FOOTSTEPS_LEVEL = 0.63');
    expect(swift).toContain('private static let sanctumFootstepsLevel = 0.63');
    expect(engine).toContain('val stepsScale = 1.0 - sanctum * (1.0 - SANCTUM_FOOTSTEPS_LEVEL)');
    expect(swift).toContain('let stepsScale = 1.0 - sanctum * (1.0 - Self.sanctumFootstepsLevel)');
    expect(20 * Math.log10(0.63)).toBeCloseTo(-4, 0);
    expect(engine).toContain('val dryRight = otherRight + stepsRight');
    expect(swift).toContain('let dryRight = otherRight + stepsRight');
  });
});
