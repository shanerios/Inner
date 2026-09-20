import { describe, expect, it } from '@jest/globals';
import * as fs from 'fs';
import * as path from 'path';
import { DEFAULT_PROCEDURAL_AUDIO_CONFIG, normalizeProceduralAudioConfig } from '../config';

const ROOT = path.resolve(__dirname, '../../..');
const dir = path.join(ROOT, 'modules/inner-audio/android/src/main/java/expo/modules/inneraudio');
const bed = fs.readFileSync(path.join(dir, 'NoiseBed.kt'), 'utf8');
const engine = fs.readFileSync(path.join(dir, 'ProceduralAudioEngine.kt'), 'utf8');
const records = fs.readFileSync(path.join(dir, 'Records.kt'), 'utf8');
const swift = fs.readFileSync(path.join(ROOT, 'modules/inner-audio/ios/InnerAudioModule.swift'), 'utf8');

const camel = (name: string) => name.toLowerCase().replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
const kotlinNumber = (name: string) => Number(bed.match(new RegExp(`const val ${name} = ([0-9_.]+)`))![1].replace(/_/g, ''));
const swiftNumber = (name: string) => Number(swift.match(new RegExp(`static let ${camel(name)}(?:: Int64)? = ([0-9_.]+)`))![1].replace(/_/g, ''));

describe('the wide, drifting bed', () => {
  it('is off by default and stays within its limits', () => {
    expect(DEFAULT_PROCEDURAL_AUDIO_CONFIG.noiseWidth).toBe(0);
    expect(DEFAULT_PROCEDURAL_AUDIO_CONFIG.noiseDriftDb).toBe(0);
    expect(normalizeProceduralAudioConfig({ noiseWidth: 3, noiseDriftDb: 50, noiseDriftSeconds: 1 })).toMatchObject({ noiseWidth: 1, noiseDriftDb: 8, noiseDriftSeconds: 3 });
    expect(normalizeProceduralAudioConfig({ noiseWidth: -1, noiseDriftDb: -2, noiseDriftSeconds: 900 })).toMatchObject({ noiseWidth: 0, noiseDriftDb: 0, noiseDriftSeconds: 40 });
  });

  it('is carried through the native records, limits and stage blending in both engines', () => {
    for (const field of ['noiseWidth', 'noiseDriftDb', 'noiseDriftSeconds']) {
      expect(records).toContain(`@Field var ${field}: Double`);
      expect(swift).toContain(`@Field var ${field} = `);
      expect(engine).toContain(`output.${field} = lerp(from.${field}, to.${field})`);
      expect(swift).toContain(`${field}: lerp(from.${field}, to.${field}),`);
    }
    expect(engine).toContain('noiseWidth = clamp(raw.noiseWidth, 0.0, 1.0),');
    expect(swift).toContain('noiseWidth: clamp(raw.noiseWidth, 0, 1),');
    expect(engine).toContain('noiseDriftDb = clamp(raw.noiseDriftDb, 0.0, 8.0),');
    expect(swift).toContain('noiseDriftDb: clamp(raw.noiseDriftDb, 0, 8),');
    expect(engine).toContain('noiseDriftSeconds = clamp(raw.noiseDriftSeconds, 3.0, 40.0),');
    expect(swift).toContain('noiseDriftSeconds: clamp(raw.noiseDriftSeconds, 3, 40),');
  });

  it('uses the same drift constants and salts in both engines', () => {
    for (const name of ['SUM_SCALE', 'SUM_MEAN', 'SWING', 'SMOOTH_SECONDS', 'UPDATE_SAMPLES', 'SURGES', 'CUT_OFF_HZ']) {
      expect(kotlinNumber(name)).toBe(swiftNumber(name));
    }
    for (const [kotlin, swiftName] of [['SALT', 'salt'], ['LEFT_SALT', 'leftSalt'], ['RIGHT_SALT', 'rightSalt']] as const) {
      const k = bed.match(new RegExp(`const val ${kotlin} = 0x([0-9a-fA-F]+)L`))![1].toLowerCase();
      const s = swift.match(new RegExp(`static let ${swiftName}: UInt64 = 0x([0-9a-fA-F]+)`))![1].toLowerCase();
      expect(k).toBe(s);
    }
    // The three salts must differ, so the two ears and the companion noise never repeat one another.
    expect(new Set([...bed.matchAll(/SALT = 0x([0-9a-fA-F]+)L/g)].map(match => match[1].toLowerCase())).size).toBe(3);
  });

  it('turns depth into a swing the same way in both engines, and keeps the average level', () => {
    expect(bed).toContain('return depthDb * 2.0 * (max(0.0, min(1.0, sum / SUM_SCALE)) - SUM_MEAN) / SWING');
    expect(swift).toContain('return depthDb * 2.0 * (Swift.max(0, Swift.min(1, sum / BedDrift.sumScale)) - BedDrift.sumMean) / BedDrift.swing');
    expect(bed).toContain('val duration = seconds * (0.7 + 0.8 * unit())');
    expect(swift).toContain('let duration = seconds * (0.7 + 0.8 * unit())');
    // When off, both gains are exactly 1.
    expect(bed).toMatch(/if \(depthDb <= 0\.0\) \{\n\s+left = 1\.0; right = 1\.0/);
    expect(swift).toMatch(/if depthDb <= 0 \{\n\s+left = 1; right = 1/);
  });

  it('widens the bed by mid and side, so each ear keeps its power, and leaves the mono path untouched when off', () => {
    expect(engine).toContain('if (target.noiseWidth > 0.0001 || target.noiseDriftDb > 0.0001) {');
    expect(swift).toContain('if target.noiseWidth > 0.0001 || target.noiseDriftDb > 0.0001 {');
    expect(engine).toContain('val widthNorm = 1.0 / Math.sqrt(1.0 + width * width)');
    expect(swift).toContain('let widthNorm = 1.0 / (1.0 + width * width).squareRoot()');
    expect(engine).toContain('baseLeftNoise = (noise + width * side) * widthNorm * bedDrift.left');
    expect(engine).toContain('baseRightNoise = (noise - width * side) * widthNorm * bedDrift.right');
    expect(swift).toContain('baseLeftNoise = (noise + width * side) * widthNorm * bedDrift.left');
    expect(swift).toContain('baseRightNoise = (noise - width * side) * widthNorm * bedDrift.right');
    // The original mono lines are still there for the off case.
    expect(engine).toContain('baseLeftNoise = noise * (if (movesNoise) leftSpatial else 1.0)');
    expect(swift).toContain('baseLeftNoise = noise * (movesNoise ? leftSpatial : 1)');
  });

  it('reseeds both with every journey', () => {
    expect(engine).toContain('bedSide.reset(activeTimeline.seed)');
    expect(engine).toContain('bedDrift.reset(activeTimeline.seed)');
    expect(engine).toContain('bedSide.reset(XORSHIFT_SEED)');
    expect(swift).toContain('bedSide.reset(seed: activeTimeline.seed)');
    expect(swift).toContain('bedDrift.reset(seed: activeTimeline.seed)');
  });

  it('gives the companion noise the same colors as the engine, drawn from its own stream', () => {
    const kotlinSide = bed.slice(bed.indexOf('internal class BedSideNoise'), bed.indexOf('internal class BedDrift'));
    const swiftSide = swift.slice(swift.indexOf('final class BedSideNoise'), swift.indexOf('final class BedDrift'));
    const colors = (source: string) => [...source.matchAll(/(0\.99886|0\.99332|0\.96900|0\.86650|0\.55000|0\.7616|0\.5362|0\.115926|0\.0555179|0\.0750759|0\.1538520|0\.3104856|0\.5329522|0\.0168980|3\.5\b|0\.015\b|0\.11\b)/g)].map(match => match[1]);
    expect(colors(kotlinSide).length).toBeGreaterThan(15);
    expect(colors(kotlinSide)).toEqual(colors(swiftSide));
    // The engine's own coefficients, so the companion sounds like the bed it accompanies.
    const engineColors = colors(engine.slice(engine.indexOf('private fun nextNoise'), engine.indexOf('private fun spatialPan')));
    expect(colors(kotlinSide)).toEqual(engineColors);
    expect(kotlinSide).not.toContain('nextWhite');
  });
});
