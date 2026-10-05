import { describe, expect, it } from '@jest/globals';
import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.resolve(__dirname, '../../..');
const dir = path.join(ROOT, 'modules/inner-audio/android/src/main/java/expo/modules/inneraudio');
const gulls = fs.readFileSync(path.join(dir, 'OceanGulls.kt'), 'utf8');
const engine = fs.readFileSync(path.join(dir, 'ProceduralAudioEngine.kt'), 'utf8');
const swiftAll = fs.readFileSync(path.join(ROOT, 'modules/inner-audio/ios/InnerAudioModule.swift'), 'utf8');
const swiftStart = swiftAll.indexOf('final class OceanGulls');
const swift = swiftAll.slice(swiftStart, swiftAll.indexOf('\n}\n', swiftStart) + 3);

const camel = (name: string) => name.toLowerCase().replace(/_([a-z0-9])/g, (_, c: string) => c.toUpperCase());
const scalar = (source: string, name: string, swiftSide: boolean): number => {
  const match = source.match(new RegExp(swiftSide ? `static let ${camel(name)} = (-?[0-9.]+)` : `const val ${name} = (-?[0-9.]+)`));
  expect(match).not.toBeNull();
  return Number(match![1]);
};
const pairs = (list: Array<[string, string]>) => {
  for (const [kotlinLine, swiftLine] of list) {
    expect(`${kotlinLine}: ${gulls.includes(kotlinLine)}`).toBe(`${kotlinLine}: true`);
    expect(`${swiftLine}: ${swift.includes(swiftLine)}`).toBe(`${swiftLine}: true`);
  }
};

describe('the ocean gulls: Kotlin and Swift are the same model', () => {
  it('uses the same pitch, rasp, timing, and the level it was approved at', () => {
    for (const name of ['PULSES_MIN', 'PULSES_RANGE', 'PULSE_LOW_HZ', 'PULSE_HIGH_HZ', 'PULSE_STEP_DOWN',
      'PULSE_LENGTH_LOW_SECONDS', 'PULSE_LENGTH_RANGE_SECONDS', 'PULSE_BEND_LOW', 'PULSE_BEND_RANGE',
      'PULSE_GAP_LOW_SECONDS', 'PULSE_GAP_RANGE_SECONDS', 'PULSE_TREMOLO_RATE_LOW', 'PULSE_TREMOLO_RATE_RANGE',
      'PULSE_TREMOLO_DEPTH_LOW', 'PULSE_TREMOLO_DEPTH_RANGE', 'PULSE_BREATH_LOW', 'PULSE_BREATH_RANGE',
      'CRY_CHANCE', 'CRY_PITCH_LOW', 'CRY_PITCH_RANGE', 'CRY_LENGTH_LOW_SECONDS', 'CRY_LENGTH_RANGE_SECONDS',
      'CRY_BEND_LOW', 'CRY_BEND_RANGE', 'CRY_TREMOLO_RATE_LOW', 'CRY_TREMOLO_RATE_RANGE', 'CRY_TREMOLO_DEPTH_LOW',
      'CRY_TREMOLO_DEPTH_RANGE', 'CRY_BREATH_LOW', 'CRY_BREATH_RANGE', 'ATTACK_SECONDS', 'DECAY_FRACTION',
      'BREATH_LOW_RATIO', 'BREATH_HIGH_RATIO', 'NEAR_CUTOFF_HZ', 'DISTANCE_CUTOFF_RANGE_HZ', 'NEAR_DISTANCE',
      'FAR_DISTANCE', 'BASE_GAP_LOW_SECONDS', 'BASE_GAP_RANGE_SECONDS', 'LEVEL_GAIN']) {
      expect(scalar(swift, name, true)).toBe(scalar(gulls, name, false));
    }
  });

  it('a call ends the same way whether it finishes on a pulse or on the cry, so both get the same gap to the next call', () => {
    // the bug this guards: setting callActive=false directly when the cry ends skipped the gap computation,
    // which lives only in the scheduling block, and left calls paced by the salience recovery alone (~5s)
    // instead of the intended roughly-a-minute-plus gap.
    expect(gulls).not.toMatch(/if\s*\(inCry\)\s*callActive\s*=\s*false/);
    expect(swift).not.toMatch(/if\s*inCry\s*\{\s*callActive\s*=\s*false\s*\}/);
    pairs([
      ['val gap = (BASE_GAP_LOW_SECONDS + unit() * BASE_GAP_RANGE_SECONDS) *', 'let gap = (OceanGulls.baseGapLowSeconds + unit() * OceanGulls.baseGapRangeSeconds) *'],
      ['} else if (hasCry && !inCry) {', '} else if hasCry && !inCry {'],
    ]);
  });

  it('is low-pitched and harsh -- a soft-clipped, tremolo'+String.fromCharCode(39)+'d harmonic stack, not a clean tone at songbird pitch', () => {
    expect(scalar(gulls, 'PULSE_LOW_HZ', false)).toBeLessThan(1200);
    pairs([
      ['tone = tanh(tone * 1.5) / tanh(1.5)', 'tone = tanh(tone * 1.5) / tanh(1.5)'],
      ['val tremolo = 1.0 - syllableTremoloDepth * (0.5 - 0.5 * cos(2.0 * PI * syllableTremoloRate * t))', 'let tremolo = 1.0 - syllableTremoloDepth * (0.5 - 0.5 * cos(2.0 * Double.pi * syllableTremoloRate * t))'],
    ]);
  });

  it('is wired into Ocean, on its own random stream, reseeded with every journey, no room send (open air)', () => {
    expect(engine).toContain('oceanGulls.render(sampleRate, intensity, density, worldSalience)');
    expect(engine).toContain('oceanModel.left + oceanGulls.left');
    expect(swiftAll).toContain('oceanGulls.render(sampleRate: sampleRate, intensity: intensity, density: density, salience: worldSalience)');
    expect(swiftAll).toContain('oceanModel.left + oceanGulls.left');
    expect(engine).toContain('oceanGulls.reset(activeTimeline.seed, sampleRate)');
    expect(swiftAll).toContain('oceanGulls.reset(seed: activeTimeline.seed, sampleRate: sampleRate)');
    expect(gulls).toContain('random = (seed xor 0x477566656c6c73L)');
    expect(swift).toContain('random = seed ^ 0x477566656c6c73');
  });

  it('spawns nothing from the audio loop that allocates', () => {
    const render = gulls.slice(gulls.indexOf('fun render('));
    expect(render).not.toMatch(/doubleArrayOf|IntArray\(|DoubleArray\(|BooleanArray\(|listOf|mutableListOf|Array\(/);
    const swiftRender = swift.slice(swift.indexOf('func render('));
    expect(swiftRender).not.toMatch(/\[Double\]\(repeating|\[Int\]\(repeating|\[Bool\]\(repeating/);
  });
});
