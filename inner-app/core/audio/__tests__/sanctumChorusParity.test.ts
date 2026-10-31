import { describe, expect, it } from '@jest/globals';
import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.resolve(__dirname, '../../..');
const kotlinDir = path.join(ROOT, 'modules/inner-audio/android/src/main/java/expo/modules/inneraudio');
const chorus = fs.readFileSync(path.join(kotlinDir, 'SanctumChorus.kt'), 'utf8');
const engine = fs.readFileSync(path.join(kotlinDir, 'ProceduralAudioEngine.kt'), 'utf8');
const swiftFile = fs.readFileSync(path.join(ROOT, 'modules/inner-audio/ios/InnerAudioModule.swift'), 'utf8');
// The Swift chorus is one class in the module file; read only its body so a constant elsewhere cannot satisfy a check.
const swiftStart = swiftFile.indexOf('final class SanctumChorus {');
const swift = swiftFile.slice(swiftStart, swiftFile.indexOf('\n}\n', swiftStart));

const numbers = (text: string) => text.split(',').map(part => Number(part.trim()));
const kotlinList = (name: string) => numbers(chorus.match(new RegExp(`val ${name} = doubleArrayOf\\(([^)]*)\\)`))![1]);
const swiftList = (name: string) => numbers(swift.match(new RegExp(`static let ${name} = \\[([^\\]]*)\\]`))![1]);

describe('Sanctum chorus: Kotlin and Swift sound the same', () => {
  it('has the same voices, weights, positions and tail', () => {
    expect(swift.length).toBeGreaterThan(0);
    for (const [kotlinName, swiftName] of [
      ['FREQS', 'freqs'],
      ['WEIGHTS', 'weights'],
      ['PANS', 'pans'],
      ['COMB_SECONDS_LEFT', 'combSecondsLeft'],
      ['COMB_SECONDS_RIGHT', 'combSecondsRight'],
    ] as const) {
      expect(swiftList(swiftName)).toEqual(kotlinList(kotlinName));
    }
    expect(kotlinList('FREQS')).toHaveLength(6);
    expect(kotlinList('WEIGHTS')).toHaveLength(6);
    expect(kotlinList('PANS')).toHaveLength(6);
  });

  it('uses the same scalar constants', () => {
    const pairs: Array<[string, string]> = [
      ['BLOOM_SECONDS = 6.0', 'bloomSeconds = 6.0'],
      ['COMB_FEEDBACK = 0.78', 'combFeedback = 0.78'],
      ['COMB_DAMPING = 0.6', 'combDamping = 0.6'],
      ['LOWPASS_HZ = 380.0', 'lowpassHz = 380.0'],
      ['COMB_CAPACITY = 24_000', 'combCapacity = 24_000'],
      ['DRY_MIX = 0.55', 'dryMix = 0.55'],
      ['WET_MIX = 0.9', 'wetMix = 0.9'],
      ['HALL_SEND = 0.25', 'hallSend = 0.25'],
    ];
    for (const [kotlinLine, swiftLine] of pairs) {
      expect(chorus).toContain(kotlinLine);
      expect(swift).toContain(swiftLine);
    }
  });

  it('shapes the level, swell, formants and tail the same way', () => {
    const pairs: Array<[string, string]> = [
      ['clamp(presence, 0.0, 12.0) * (0.54 + intensity * 0.36)', 'clamp(presence, 0, 12) * (0.54 + intensity * 0.36)'],
      ['0.62 + 0.2 * sin(elapsedSeconds * tau / 19.0 + offsets[0]) + 0.18 * sin(elapsedSeconds * tau / 27.0 + offsets[1])', '0.62 + 0.2 * sin(elapsedSeconds * tau / 19.0 + offsets[0]) + 0.18 * sin(elapsedSeconds * tau / 27.0 + offsets[1])'],
      ['170.0 * (1.0 + 0.06 * sin(elapsedSeconds * tau * 0.021 + offsets[2]))', '170.0 * (1.0 + 0.06 * sin(elapsedSeconds * tau * 0.021 + offsets[2]))'],
      ['330.0 * (1.0 + 0.06 * sin(elapsedSeconds * tau * 0.017 + offsets[3]))', '330.0 * (1.0 + 0.06 * sin(elapsedSeconds * tau * 0.017 + offsets[3]))'],
      ['sin(phase) + sin(phase * 2) * 0.55 + sin(phase * 3) * 0.20 + sin(phase * 4) * 0.05', 'sin(phase) + sin(phase * 2) * 0.55 + sin(phase * 3) * 0.20 + sin(phase * 4) * 0.05'],
      ['0.0022 * sin(elapsedSeconds * tau * (4.9 + index * 0.23) + offsets[index])', '0.0022 * sin(elapsedSeconds * tau * (4.9 + Double(index) * 0.23) + offsets[index])'],
      ['0.0012 * sin(elapsedSeconds * tau * (0.07 + index * 0.013) + offsets[index])', '0.0012 * sin(elapsedSeconds * tau * (0.07 + Double(index) * 0.013) + offsets[index])'],
      ['formant1, 2.0) * 1.2', 'frequency: formant1, q: 2.0) * 1.2'],
      ['formant2, 2.2) * 0.6 + body * 1.0', 'frequency: formant2, q: 2.2) * 0.6 + body * 1.0'],
      ['formant1 * 0.994, 2.0)', 'frequency: formant1 * 0.994, q: 2.0)'],
      ['formant2 * 1.006, 2.2)', 'frequency: formant2 * 1.006, q: 2.2)'],
      ['lowpass[0] += lowpassCoefficient * (rawLeft - lowpass[0])', 'lowpass[0] += lowpassCoefficient * (rawLeft - lowpass[0])'],
      ['lowpass[3] += lowpassCoefficient * (lowpass[2] - lowpass[3])', 'lowpass[3] += lowpassCoefficient * (lowpass[2] - lowpass[3])'],
      ['val chorusLeft = lowpass[1] * level * swell', 'let chorusLeft = lowpass[1] * level * swell'],
      ['chorusLeft + dampLeft[comb] * COMB_FEEDBACK', 'chorusLeft + dampLeft[comb] * Self.combFeedback'],
      ['chorusLeft * DRY_MIX + wetLeft * 0.25 * WET_MIX', 'chorusLeft * Self.dryMix + wetLeft * 0.25 * Self.wetMix'],
      ['(chorusLeft + chorusRight) * 0.5 * HALL_SEND', '(chorusLeft + chorusRight) * 0.5 * Self.hallSend'],
    ];
    for (const [kotlinLine, swiftLine] of pairs) {
      expect(chorus).toContain(kotlinLine);
      expect(swift).toContain(swiftLine);
    }
  });

  it('starts each voice from the same seed-drawn phase', () => {
    expect(chorus).toContain('((nightSeed ushr (index * 8)) and 0xFFL).toDouble() / 256.0 * tau');
    expect(swift).toContain('Double((nightSeed >> UInt64(index * 8)) & 0xFF) / 256.0 * tau');
  });
});

describe('Sanctum chorus: both engines place it in the hall the same way', () => {
  it('fades it in with the world, in place of the Aum', () => {
    expect(engine).toContain('val sanctumTarget = if (target.environment == "sanctum" && target.environmentGain > 0.0001) 1.0 else 0.0');
    expect(swiftFile).toContain('let sanctumTarget = target.environment == "sanctum" && target.environmentGain > 0.0001 ? 1.0 : 0.0');
    expect(engine).toContain('sanctumEnvelope += clamp(sanctumTarget - sanctumEnvelope, -templeSpaceStep, templeSpaceStep)');
    expect(swiftFile).toContain('sanctumEnvelope += clamp(sanctumTarget - sanctumEnvelope, -templeSpaceStep, templeSpaceStep)');
    expect(engine).toContain('val chantScale = 1.0 - sanctum');
    expect(swiftFile).toContain('let chantScale = 1.0 - sanctum');
  });

  it('mixes the chorus and the scaled Aum into the room and its reflections', () => {
    expect(engine).toContain('(aumChant.voiceLeft + aumChant.echoLeft) * chantScale + chorusLeft');
    expect(swiftFile).toContain('(aumChant.voiceLeft + aumChant.echoLeft) * chantScale + chorusLeft');
    expect(engine).toContain('(aumChant.voiceRight + aumChant.echoRight) * chantScale + chorusRight');
    expect(swiftFile).toContain('(aumChant.voiceRight + aumChant.echoRight) * chantScale + chorusRight');
    expect(engine).toContain('aumChant.farWet * chantScale + chorusFarWet');
    expect(swiftFile).toContain('aumChant.farWet * chantScale + chorusFarWet');
  });

  it('resets the chorus with the Aum, at the start of the engine and of a timeline', () => {
    expect(engine).toContain('sanctumChorus.reset(XORSHIFT_SEED)');
    expect(engine).toContain('sanctumChorus.reset(activeTimeline.seed)');
    expect(swiftFile).toContain('sanctumChorus.reset(seed: 0x9e3779b97f4a7c15)');
    expect(swiftFile).toContain('sanctumChorus.reset(seed: activeTimeline.seed)');
  });

  it('leaves the Temple untouched: the chorus is silent unless the Sanctum is the environment', () => {
    // The render gate is the only way in, and it needs the sanctum envelope above zero.
    expect(engine).toContain('if (sanctum > 0.0001) {');
    expect(swiftFile).toContain('if sanctum > 0.0001 {');
  });
});
