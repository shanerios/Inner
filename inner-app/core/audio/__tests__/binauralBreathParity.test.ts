import { describe, expect, it } from '@jest/globals';
import * as fs from 'fs';
import * as path from 'path';
import { DEFAULT_PROCEDURAL_AUDIO_CONFIG, normalizeProceduralAudioConfig } from '../config';

const ROOT = path.resolve(__dirname, '../../..');
const dir = path.join(ROOT, 'modules/inner-audio/android/src/main/java/expo/modules/inneraudio');
const breath = fs.readFileSync(path.join(dir, 'BinauralBreath.kt'), 'utf8');
const engine = fs.readFileSync(path.join(dir, 'ProceduralAudioEngine.kt'), 'utf8');
const records = fs.readFileSync(path.join(dir, 'Records.kt'), 'utf8');
const swiftAll = fs.readFileSync(path.join(ROOT, 'modules/inner-audio/ios/InnerAudioModule.swift'), 'utf8');
const swift = swiftAll.slice(swiftAll.indexOf('final class BinauralBreath'));

describe('the binaural layer breathes', () => {
  it('is off by default and stays within its limits', () => {
    expect(DEFAULT_PROCEDURAL_AUDIO_CONFIG.binauralBreathDb).toBe(0);
    expect(normalizeProceduralAudioConfig({ binauralBreathDb: 99, binauralBreathInSeconds: 0, binauralBreathOutSeconds: 99, binauralBreathVariation: 5 }))
      .toMatchObject({ binauralBreathDb: 20, binauralBreathInSeconds: 1, binauralBreathOutSeconds: 20, binauralBreathVariation: 0.4 });
    expect(normalizeProceduralAudioConfig({ binauralBreathDb: -3, binauralBreathVariation: -1 })).toMatchObject({ binauralBreathDb: 0, binauralBreathVariation: 0 });
  });

  it('is carried through the native records, limits and stage blending in both engines', () => {
    for (const field of ['binauralBreathDb', 'binauralBreathInSeconds', 'binauralBreathOutSeconds', 'binauralBreathVariation']) {
      expect(records).toContain(`@Field var ${field}: Double`);
      expect(swiftAll).toContain(`@Field var ${field} = `);
      expect(engine).toContain(`output.${field} = lerp(from.${field}, to.${field})`);
      expect(swiftAll).toContain(`${field}: lerp(from.${field}, to.${field}),`);
    }
    expect(engine).toContain('binauralBreathDb = clamp(raw.binauralBreathDb, 0.0, 20.0),');
    expect(swiftAll).toContain('binauralBreathDb: clamp(raw.binauralBreathDb, 0, 20),');
    expect(engine).toContain('binauralBreathVariation = clamp(raw.binauralBreathVariation, 0.0, 0.4),');
    expect(swiftAll).toContain('binauralBreathVariation: clamp(raw.binauralBreathVariation, 0, 0.4),');
  });

  it('breathes the same way in both engines: a raised cosine each way, each breath a little different, off means exactly 1', () => {
    expect(Number(breath.match(/const val UPDATE_SAMPLES = (\d+)/)![1])).toBe(Number(swift.match(/static let updateSamples: Int64 = (\d+)/)![1]));
    const kSalt = breath.match(/const val SALT = 0x([0-9a-fA-F]+)L/)![1].toLowerCase();
    const sSalt = swift.match(/static let salt: UInt64 = 0x([0-9a-fA-F]+)/)![1].toLowerCase();
    expect(kSalt).toBe(sSalt);
    for (const [kotlin, swiftLine] of [
      ['val shape = if (inhaling) 0.5 - 0.5 * cos(PI * u) else 0.5 + 0.5 * cos(PI * u)', 'let shape = inhaling ? 0.5 - 0.5 * cos(Double.pi * u) : 0.5 + 0.5 * cos(Double.pi * u)'],
      ['gain = 10.0.pow(-depthDb * (1.0 - shape) / 20.0)', 'gain = pow(10.0, -depthDb * (1.0 - shape) / 20.0)'],
      ['max(1L, (seconds * (1.0 + variation * (unit() * 2.0 - 1.0)) * sampleRate).toLong())', 'Swift.max(1, Int64(seconds * (1.0 + variation * (unit() * 2.0 - 1.0)) * sampleRate))'],
      ['length = breathLength(sampleRate, if (inhaling) inhaleSeconds else exhaleSeconds, variation)', 'length = breathLength(sampleRate: sampleRate, seconds: inhaling ? inhaleSeconds : exhaleSeconds, variation: variation)'],
    ]) {
      expect(`${breath.includes(kotlin)}: ${kotlin}`).toBe(`true: ${kotlin}`);
      expect(`${swift.includes(swiftLine)}: ${swiftLine}`).toBe(`true: ${swiftLine}`);
    }
    expect(breath).toMatch(/if \(depthDb <= 0\.0\) \{\n\s+gain = 1\.0\n\s+return/);
    expect(swift).toMatch(/if depthDb <= 0 \{\n\s+gain = 1\n\s+return/);
  });

  it('sets the breath explicitly for each phase of the night, so easing any one stage cannot be lost to inheritance', () => {
    const protocol = fs.readFileSync(path.join(ROOT, 'core/audio/overnightProtocol.ts'), 'utf8');
    for (const line of [
      'binauralBreathDb: field.breath.depthDb.preparation,',
      'binauralBreathDb: field.breath.depthDb.descent,',
      'binauralBreathDb: index === 0 ? field.breath.depthDb.earlySleep : field.breath.depthDb.remSleep,',
      'binauralBreathDb: cueOffsets.length ? field.breath.depthDb.remSleep : field.breath.depthDb.earlySleep,',
    ]) expect(protocol).toContain(line);
  });

  it('applies to every path the layer is heard by, on its own random stream, and reseeds with every journey', () => {
    expect(engine).toContain('val binauralLevel = gains[1] * binauralBreath.gain');
    expect(swiftAll).toContain('let binauralLevel = gains[1] * binauralBreath.gain');
    // Headphones (two tones) and speakers (the pulse) both follow it, so the layer breathes either way.
    for (const source of [engine, swiftAll]) {
      expect(source).toMatch(/speakerPulse = sin\(phases\[5\]\) \* pulseEnvelope \* binauralLevel \* spatialRoom/);
      expect(source).toMatch(/leftEntrainment = sin\(phases\[1\]\) \* binauralLevel/);
      expect(source).toMatch(/rightEntrainment = sin\(phases\[2\]\) \* binauralLevel/);
    }
    expect(engine).toContain('binauralBreath.reset(activeTimeline.seed)');
    expect(engine).toContain('binauralBreath.reset(XORSHIFT_SEED)');
    expect(swiftAll).toContain('binauralBreath.reset(seed: activeTimeline.seed)');
    expect(breath).not.toContain('nextWhite');
    // A different stream from the bed's drift, the forest and the fire.
    const salts = [...(fs.readFileSync(path.join(dir, 'NoiseBed.kt'), 'utf8')).matchAll(/SALT = 0x([0-9a-fA-F]+)L/g)].map(match => match[1].toLowerCase());
    expect(salts).not.toContain(kSaltOf(breath));
  });
});

function kSaltOf(source: string): string {
  return source.match(/const val SALT = 0x([0-9a-fA-F]+)L/)![1].toLowerCase();
}
