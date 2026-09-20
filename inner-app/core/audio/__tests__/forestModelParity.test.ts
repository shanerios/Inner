import { describe, expect, it } from '@jest/globals';
import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.resolve(__dirname, '../../..');
const dir = path.join(ROOT, 'modules/inner-audio/android/src/main/java/expo/modules/inneraudio');
const forest = fs.readFileSync(path.join(dir, 'ForestModel.kt'), 'utf8');
const engine = fs.readFileSync(path.join(dir, 'ProceduralAudioEngine.kt'), 'utf8');
const swiftAll = fs.readFileSync(path.join(ROOT, 'modules/inner-audio/ios/InnerAudioModule.swift'), 'utf8');
const swiftStart = swiftAll.indexOf('final class ForestModel');
const swift = swiftAll.slice(swiftStart, swiftAll.indexOf('\n}\n', swiftStart) + 3);

const camel = (name: string) => name.toLowerCase().replace(/_([a-z0-9])/g, (_, c: string) => c.toUpperCase());
const scalar = (source: string, name: string, swiftSide: boolean): number => {
  const match = source.match(new RegExp(swiftSide ? `static let ${camel(name)} = (-?[0-9.]+)` : `const val ${name} = (-?[0-9.]+)`));
  expect(match).not.toBeNull();
  return Number(match![1]);
};
const list = (source: string, name: string, swiftSide: boolean): number[] => {
  const match = source.match(new RegExp(swiftSide ? `static let ${camel(name)} = \\[([^\\]]*)\\]` : `val ${name} = doubleArrayOf\\(([^)]*)\\)`));
  expect(match).not.toBeNull();
  return match![1].split(',').map(part => Number(part.trim()));
};
const pairs = (list: Array<[string, string]>) => {
  for (const [kotlinLine, swiftLine] of list) {
    expect(`${kotlinLine}: ${forest.includes(kotlinLine)}`).toBe(`${kotlinLine}: true`);
    expect(`${swiftLine}: ${swift.includes(swiftLine)}`).toBe(`${swiftLine}: true`);
  }
};

describe('the forest: Kotlin and Swift are the same model', () => {
  it('uses the same levels, partials, room and timings', () => {
    for (const name of ['LEAF_GAIN', 'HOWL_GAIN', 'LOW_BODY', 'HOWL_LEVEL', 'PARTIAL_1', 'PARTIAL_3', 'PARTIAL_5', 'PARTIAL_7', 'ROOM_DECAY_SECONDS',
      'GUSTS', 'VOICES', 'PENDING', 'ECHO_SIZE_SECONDS', 'HOWL_SECONDS', 'ANSWER_DELAY_SECONDS', 'STIR_KNEE', 'STIR_FALL', 'SLIP_RISE_SECONDS', 'SLIP_SETTLE_SECONDS',
      'THIRD_RISE_SECONDS', 'THIRD_FALL_SECONDS', 'THIRD_LEVEL']) {
      expect(scalar(swift, name, true)).toBe(scalar(forest, name, false));
    }
    for (const name of ['ROOM_SECONDS', 'ROOM_INPUT']) expect(list(swift, name, true)).toEqual(list(forest, name, false));
  });

  it('keeps the leaves and the howl at the levels they were auditioned at, and the hollow tube odd-harmonic', () => {
    // The leaves 21.3 dB and the howl 9 dB from the levels they were built at.
    expect(20 * Math.log10(scalar(forest, 'LEAF_GAIN', false))).toBeCloseTo(-21.3, 6);
    expect(20 * Math.log10(scalar(forest, 'HOWL_GAIN', false))).toBeCloseTo(9, 6);
    const partials = ['PARTIAL_1', 'PARTIAL_3', 'PARTIAL_5', 'PARTIAL_7'].map(name => scalar(forest, name, false));
    expect(partials).toEqual([1, 0.5, 0.22, 0.09]);
    expect(forest).toContain('pitch * 3.0');
    expect(forest).toContain('pitch * 5.0');
    expect(forest).toContain('pitch * 7.0');
  });

  it('runs the wind in gusts with no cycle, and lets each gust stir the leaves', () => {
    pairs([
      ['nextGust = time + (4.0 + 13.0 * unit()) / stir(intensity)', 'nextGust = time + (4.0 + 13.0 * unit()) / stir(intensity)'],
      ['gustRise[gustCount] = 1.5 + 3.0 * unit()', 'gustRise[gustCount] = 1.5 + 3.0 * unit()'],
      ['gustFall[gustCount] = 2.5 + 4.0 * unit()', 'gustFall[gustCount] = 2.5 + 4.0 * unit()'],
      ['val activity = clamp(0.10 + 0.05 * slow + gustCached, 0.03, 1.6) * (0.75 + 0.25 * flutter * 0.5) * stir(intensity)', 'let activity = clamp(0.10 + 0.05 * slow + gustCached, 0.03, 1.6) * (0.75 + 0.25 * flutter * 0.5) * stir(intensity)'],
      ['val grainRate = (120.0 + 2600.0 * activity.pow(1.3)) / rate', 'let grainRate = (120.0 + 2600.0 * pow(activity, 1.3)) / rate'],
      ['if (unit() < (0.4 + 11.0 * activity.pow(1.5)) / rate) crinkle()', 'if unit() < (0.4 + 11.0 * pow(activity, 1.5)) / rate { crinkle() }'],
      ['val frequency = logUniform(1800.0, 7500.0)', 'let frequency = logUniform(1800.0, 7500.0)'],
      ['val leavesLeft = hissLeft * 0.9 + crinkleLeft * 0.30 + bodyLeft * 0.55 + lowLeft', 'let leavesLeft = hissLeft * 0.9 + crinkleLeft * 0.30 + bodyLeft * 0.55 + lowLeft'],
    ]);
    // Nothing in the leaves is a fixed cycle: no sine of time drives their level.
    const leaves = forest.slice(forest.indexOf('// ---- the wind in the canopy'), forest.indexOf('// ---- the howl: wind through a hollow trunk'));
    expect(leaves).not.toMatch(/sin\(\s*(time|elapsed)/);
    expect(leaves).not.toMatch(/PI \* 2 \/ 14|5\.3/);
  });

  it('blows the howl through a hollow trunk: pitch follows the gust, the answer is a second, smaller tree a few seconds later', () => {
    pairs([
      ['val pitch = base * (0.90 + 0.30 * wind.pow(0.8)) * (1.0 + 0.004 * drift) * (if (gesture.slipRatio != 1.0) slipFactor(seconds) else 1.0)', 'let pitch = base * (0.90 + 0.30 * pow(wind, 0.8)) * (1.0 + 0.004 * drift) * (gesture.slipRatio != 1.0 ? slipFactor(seconds) : 1.0)'],
      ['val jet = excite * wind.pow(1.25) * (1.0 + 0.32 * tremor)', 'let jet = excite * pow(wind, 1.25) * (1.0 + 0.32 * tremor)'],
      ['base = logUniform(112.0, 168.0)', 'base = logUniform(112.0, 168.0)'],
      ['baseAnswer = base * (1.28 + 0.24 * unit())', 'baseAnswer = base * (1.28 + 0.24 * unit())'],
      ['val answerSeconds = seconds - answerDelay', 'let answerSeconds = seconds - answerDelay'],
      ['val first = (echoIndex - (rate * 0.19).toInt() + size) % size', 'let first = (echoIndex - Int(rate * 0.19) + size) % size'],
      ['val second = (echoIndex - (rate * 0.43).toInt() + size) % size', 'let second = (echoIndex - Int(rate * 0.43) + size) % size'],
      ['val third = (echoIndex - (rate * 0.79).toInt() + size) % size', 'let third = (echoIndex - Int(rate * 0.79) + size) % size'],
      ['left = leavesLeft * LEAF_GAIN + howlLeft * HOWL_GAIN', 'left = leavesLeft * ForestModel.leafGain + howlLeft * ForestModel.howlGain'],
    ]);
  });

  it('holds a new howl around a recognition signal, waits less in the fuller feels, and stays quiet with no presence', () => {
    pairs([
      ['if (presence > 0.0001 && salience.reserve(salience = 0.5, durationSeconds = reserveSeconds, recoverySeconds = 4.0)) {', 'if presence > 0.0001 && salience.reserve(salience: 0.5, durationSeconds: reserveSeconds, recoverySeconds: 4.0) {'],
      ['countdown = rate * (110.0 - 84.0 * fullness + unit() * (70.0 - 58.0 * fullness)) / clamp(density, 0.2, 1.0)', 'countdown = rate * (110.0 - 84.0 * fullness + unit() * (70.0 - 58.0 * fullness)) / clamp(density, 0.2, 1.0)'],
      ['val fullness = clamp((variety - 0.6) / 0.4, 0.0, 1.0)', 'let fullness = clamp((variety - 0.6) / 0.4, 0.0, 1.0)'],
      ['val level = HOWL_LEVEL * clamp(presence, 0.0, 1.5) * gesture.level * (1.0 - (if (far > 0.0) 0.4 * far else 0.35 * far))', 'let level = ForestModel.howlLevel * clamp(presence, 0.0, 1.5) * gesture.level * (1.0 - (far > 0.0 ? 0.4 * far : 0.35 * far))'],
    ]);
  });

  it('is the only forest in both engines: the old canopy bed and hollow-trunk call are gone, and the birds stay', () => {
    expect(fs.existsSync(path.join(dir, 'ForestCallModel.kt'))).toBe(false);
    for (const source of [engine, swiftAll]) {
      expect(source).not.toContain('forestCanopy');
      expect(source).not.toMatch(/FOREST_NOISE_MIX|forestNoiseMix/);
      expect(source).not.toMatch(/ForestCallModel|forestCallModel/);
    }
    expect(engine).toContain('forestModel.render(sampleRate, intensity, presence, density, variety, worldSalience)');
    expect(swiftAll).toContain('forestModel.render(sampleRate: sampleRate, intensity: intensity, presence: presence, density: density, variety: variety, salience: worldSalience)');
    expect(engine).toContain('forestSample.set(forestModel.left + birdLeft, forestModel.right + birdRight)');
    expect(engine).toContain('forestBirdActive');
    expect(swiftAll).toContain('(forestModel.left + birdLeft, forestModel.right + birdRight)');
  });

  it('reseeds with every journey, on its own random stream', () => {
    expect(engine).toContain('forestModel.reset(activeTimeline.seed, sampleRate)');
    expect(engine).toContain('forestModel.reset(XORSHIFT_SEED, sampleRate)');
    expect(swiftAll).toContain('forestModel.reset(seed: activeTimeline.seed, sampleRate: sampleRate)');
    const kotlinModel = forest.slice(forest.indexOf('internal class ForestModel'));
    expect(kotlinModel).not.toContain('nextForestWhite');
    expect(swift).not.toContain('nextForestWhite');
  });

  it('spawns nothing from the audio loop that allocates, and never scans every voice each sample', () => {
    const render = forest.slice(forest.indexOf('fun render('));
    expect(render).not.toMatch(/doubleArrayOf|IntArray\(|DoubleArray\(|listOf|mutableListOf|Pair\(|Array\(/);
    expect(render).toContain('while (n < activeCount)');
    const swiftRender = swift.slice(swift.indexOf('func render('));
    expect(swiftRender).not.toMatch(/\[Double\]\(repeating|\[Int\]\(repeating|\[Bool\]\(repeating/);
  });
});
