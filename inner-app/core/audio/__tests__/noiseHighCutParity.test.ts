import { describe, expect, it } from '@jest/globals';
import * as fs from 'fs';
import * as path from 'path';
import { DEFAULT_PROCEDURAL_AUDIO_CONFIG, normalizeProceduralAudioConfig } from '../config';

const ROOT = path.resolve(__dirname, '../../..');
const dir = path.join(ROOT, 'modules/inner-audio/android/src/main/java/expo/modules/inneraudio');
const kotlin = fs.readFileSync(path.join(dir, 'ProceduralAudioEngine.kt'), 'utf8');
const records = fs.readFileSync(path.join(dir, 'Records.kt'), 'utf8');
const swift = fs.readFileSync(path.join(ROOT, 'modules/inner-audio/ios/InnerAudioModule.swift'), 'utf8');

describe('the bed high cut', () => {
  it('is off by default and stays within its limits', () => {
    expect(DEFAULT_PROCEDURAL_AUDIO_CONFIG.noiseHighCutHz).toBe(20_000);
    expect(normalizeProceduralAudioConfig({}).noiseHighCutHz).toBe(20_000);
    expect(normalizeProceduralAudioConfig({ noiseHighCutHz: 3_000 }).noiseHighCutHz).toBe(3_000);
    expect(normalizeProceduralAudioConfig({ noiseHighCutHz: 50 }).noiseHighCutHz).toBe(300);
    expect(normalizeProceduralAudioConfig({ noiseHighCutHz: 90_000 }).noiseHighCutHz).toBe(20_000);
  });

  it('is carried through the native records, limits and stage blending in both engines', () => {
    expect(records).toContain('@Field var noiseHighCutHz: Double = 20_000.0');
    expect(swift).toContain('@Field var noiseHighCutHz = 20_000.0');
    expect(kotlin).toContain('noiseHighCutHz = clamp(raw.noiseHighCutHz, 300.0, 20_000.0),');
    expect(swift).toContain('noiseHighCutHz: clamp(raw.noiseHighCutHz, 300, 20_000),');
    expect(kotlin).toContain('output.noiseHighCutHz = lerp(from.noiseHighCutHz, to.noiseHighCutHz)');
    expect(swift).toContain('noiseHighCutHz: lerp(from.noiseHighCutHz, to.noiseHighCutHz),');
  });

  it('filters the same way in both engines, and leaves the noise untouched when it is off', () => {
    const k = (name: string) => Number(kotlin.match(new RegExp(`private const val ${name} = ([0-9_.]+)`))![1].replace(/_/g, ''));
    const s = (name: string) => Number(swift.match(new RegExp(`private static let ${name} = ([0-9_.]+)`))![1].replace(/_/g, ''));
    expect(k('NOISE_CUT_OFF_HZ')).toBe(s('noiseCutOffHz'));
    expect(k('NOISE_CUT_SMOOTH_SECONDS')).toBe(s('noiseCutSmoothSeconds'));
    expect(kotlin).toContain('noiseCutSmoothed += (target.noiseHighCutHz - noiseCutSmoothed) / max(1.0, sampleRate * NOISE_CUT_SMOOTH_SECONDS)');
    expect(swift).toContain('noiseCutSmoothed += (target.noiseHighCutHz - noiseCutSmoothed) / max(1, sampleRate * Self.noiseCutSmoothSeconds)');
    expect(kotlin).toContain('val cutCoefficient = 1.0 - Math.exp(-2.0 * Math.PI * noiseCutSmoothed / sampleRate)');
    expect(swift).toContain('let cutCoefficient = 1 - exp(-2 * Double.pi * noiseCutSmoothed / sampleRate)');
    // Two poles in series, the second fed by the first.
    expect(kotlin).toContain('noiseCutTwo += cutCoefficient * (noiseCutOne - noiseCutTwo)');
    expect(swift).toContain('noiseCutTwo += cutCoefficient * (noiseCutOne - noiseCutTwo)');
    // When off, the filter follows the noise so switching it on cannot click, and the noise passes through unchanged.
    expect(kotlin).toMatch(/noiseCutOne = colorNoise\n\s+noiseCutTwo = colorNoise\n\s+colorNoise/);
    expect(swift).toMatch(/noiseCutOne = colorNoise\n\s+noiseCutTwo = colorNoise\n\s+rawNoise = colorNoise/);
  });

  it('starts every journey with the cut off', () => {
    expect(kotlin).toContain('noiseCutSmoothed = 20_000.0\n    noiseCutOne = 0.0\n    noiseCutTwo = 0.0');
    expect(swift).toContain('noiseCutSmoothed = 20_000\n    noiseCutOne = 0\n    noiseCutTwo = 0');
  });
});
