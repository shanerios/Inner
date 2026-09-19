import { describe, expect, it } from '@jest/globals';
import * as fs from 'fs';
import * as path from 'path';
import { IDENTITY_FEEL_VARIETY } from '../identityArc';

const ROOT = path.resolve(__dirname, '../../..');
const kotlinDir = path.join(ROOT, 'modules/inner-audio/android/src/main/java/expo/modules/inneraudio');
const gestures = fs.readFileSync(path.join(kotlinDir, 'IdentityGestures.kt'), 'utf8');
const chant = fs.readFileSync(path.join(kotlinDir, 'AumChant.kt'), 'utf8');
const engine = fs.readFileSync(path.join(kotlinDir, 'ProceduralAudioEngine.kt'), 'utf8');
const swift = fs.readFileSync(path.join(ROOT, 'modules/inner-audio/ios/InnerAudioModule.swift'), 'utf8');

const TWO_64 = 1n << 64n;
/** A Kotlin signed hex literal, e.g. -0x61c8864680b583ebL, as the unsigned 64-bit value Swift writes. */
const unsigned = (literal: string) => {
  const negative = literal.startsWith('-');
  const value = BigInt(negative ? literal.slice(1).replace(/L$/, '') : literal.replace(/L$/, ''));
  return negative ? (TWO_64 - value) % TWO_64 : value;
};
const list = (text: string) => text.split(',').map(part => Number(part.trim().replace(/\s*\/\s*/g, '/').split('/').reduce((a, b) => String(Number(a) / Number(b)))));

describe('Aum gestures: Kotlin and Swift draw the same appearance for the same night', () => {
  it('hashes with the same SplitMix64 constants', () => {
    const kotlinConstants = [...gestures.matchAll(/(-?0x[0-9a-f]+L)/g)].map(match => match[1]);
    const add = kotlinConstants.find(value => unsigned(value) === 0x9E3779B97F4A7C15n);
    const mul1 = kotlinConstants.find(value => unsigned(value) === 0xBF58476D1CE4E5B9n);
    const mul2 = kotlinConstants.find(value => unsigned(value) === 0x94D049BB133111EBn);
    expect(add).toBeDefined();
    expect(mul1).toBeDefined();
    expect(mul2).toBeDefined();
    expect(swift).toContain('var z = x &+ 0x9E3779B97F4A7C15');
    expect(swift).toContain('z = (z ^ (z >> 30)) &* 0xBF58476D1CE4E5B9');
    expect(swift).toContain('z = (z ^ (z >> 27)) &* 0x94D049BB133111EB');
    expect(gestures).toContain('z xor (z ushr 31)');
    expect(swift).toContain('return z ^ (z >> 31)');
  });

  it('uses the same salt, kinds, bag shuffle and slots', () => {
    expect(gestures).toContain('const val AUM_SALT = 0x41756d01L');
    expect(swift).toContain('static let aumSalt: UInt64 = 0x41756d01');
    expect(gestures).toContain('const val KINDS = 6');
    expect(swift).toContain('static let kinds = 6');
    expect(gestures).toContain('salt xor 0x62616700L, bag, 16 + i');
    expect(swift).toContain('salt: salt ^ 0x62616700, index: bag, slot: 16 + i');
    expect(gestures).toContain('index * 32L + slot.toLong()');
    expect(swift).toContain('UInt64(index) &* 32 &+ UInt64(slot)');
    expect(gestures).toContain('if (bagA[0] == bagB[KINDS - 1])');
    expect(swift).toContain('if bagA[0] == bagB[kinds - 1]');
  });

  it('draws every trait the same way', () => {
    const pairs: Array<[string, string]> = [
      ['level = 1.0 + variety * (u(0) - 0.5) * 0.3', 'level = 1.0 + variety * (u(0) - 0.5) * 0.3'],
      ['startDelay = variety * u(1) * 9.0', 'startDelay = variety * u(1) * 9.0'],
      ['stretch = 1.0 + variety * (u(2) - 0.4) * 0.3', 'stretch = 1.0 + variety * (u(2) - 0.4) * 0.3'],
      ['if (u(3) < 0.2 + 0.45 * variety) rootRatio = DEEPER[min(2, (u(4) * 3.0).toInt())]', 'if u(3) < 0.2 + 0.45 * variety { rootRatio = Self.deeper[min(2, Int(u(4) * 3.0))] }'],
      ['level *= 1.0 + 0.4 * variety; sub = 0.6 * variety', 'level *= 1.0 + 0.4 * variety'],
      ['panStart = (if (u(5) < 0.5) -1.0 else 1.0) * variety', 'panStart = (u(5) < 0.5 ? -1.0 : 1.0) * variety'],
      ['distStart = 0.9 * variety', 'distStart = 0.9 * variety'],
      ['echoSend = 0.55 * variety', 'echoSend = 0.55 * variety'],
      ['rootRatio = DEEPER[min(if (variety > 0.7) 3 else 2, (u(6) * 4.0).toInt())]', 'rootRatio = Self.deeper[min(variety > 0.7 ? 3 : 2, Int(u(6) * 4.0))]'],
      ['glide = (1.0 + u(7) * 2.0) * variety', 'glide = (1.0 + u(7) * 2.0) * variety'],
    ];
    for (const [kotlinLine, swiftLine] of pairs) {
      expect(gestures).toContain(kotlinLine);
      expect(swift).toContain(swiftLine);
    }
  });

  it('deals the same consonant roots below the chant', () => {
    const kotlinRoots = gestures.match(/val DEEPER = doubleArrayOf\(([^)]*)\)/)![1];
    const swiftRoots = swift.match(/static let deeper = \[([^\]]*)\]/)![1];
    expect(list(swiftRoots)).toEqual(list(kotlinRoots));
    expect(list(kotlinRoots)[0]).toBeCloseTo(8 / 9, 10);
    expect(list(kotlinRoots)[3]).toBe(0.5);
  });
});

describe('Aum chant: the gestures are shaped the same way in Kotlin and Swift', () => {
  it('uses the same voices, echo and shaping', () => {
    for (const [kotlinLine, swiftLine] of [
      ['private val FREQS = doubleArrayOf(104.0, 108.0, 111.5)', 'private static let freqs = [104.0, 108.0, 111.5]'],
      ['private val WEIGHTS = doubleArrayOf(0.34, 0.28, 0.23)', 'private static let weights = [0.34, 0.28, 0.23]'],
      ['private const val ECHO_SECONDS = 2.75', 'private static let echoSeconds = 2.75'],
      ['private const val PERIOD_SECONDS = 31.0', 'private static let periodSeconds = 31.0'],
      ['private const val PERIOD_FULL_SECONDS = 25.0', 'private static let periodFullSeconds = 25.0'],
      ['private const val PERIOD_SHORTENS_FROM = 0.6', 'private static let periodShortensFrom = 0.6'],
      ['val period = PERIOD_SECONDS - (PERIOD_SECONDS - PERIOD_FULL_SECONDS) * clamp((variety - PERIOD_SHORTENS_FROM) / (1.0 - PERIOD_SHORTENS_FROM), 0.0, 1.0)', 'let period = Self.periodSeconds - (Self.periodSeconds - Self.periodFullSeconds) * clamp((variety - Self.periodShortensFrom) / (1.0 - Self.periodShortensFrom), 0, 1)'],
      ['val chantPosition = elapsedSeconds + (period - 5.0)', 'let chantPosition = elapsedSeconds + (period - 5.0)'],
      ['val cycle = (chantPosition / period).toLong()', 'let cycle = Int64(chantPosition / period)'],
      ['val chantTime = ((chantPosition % period) - gesture.startDelay) / gesture.stretch', 'let chantTime = (fmod(chantPosition, period) - gesture.startDelay) / gesture.stretch'],
      ['cycle % chantEvery == 0L', 'cycle % Int64(chantEvery) == 0'],
      ['gesture.rootRatio * 2.0.pow(-gesture.glide * chantProgress / 12.0)', 'gesture.rootRatio * pow(2.0, -gesture.glide * chantProgress / 12.0)'],
      ['left += beneath * gesture.sub * 0.9', 'left += beneath * gesture.sub * 0.9'],
      ['val panProgress = clamp((chantTime - 1.2) / 6.6, 0.0, 1.0)', 'let panProgress = clamp((chantTime - 1.2) / 6.6, 0, 1)'],
      ['val farCoefficient = 1.0 - exp(-tau * (6_000.0 - 5_300.0 * distance) / sampleRate)', 'let farCoefficient = 1.0 - exp(-tau * (6_000.0 - 5_300.0 * distance) / sampleRate)'],
      ['dryMix = 1.0 - 0.65 * distance', 'dryMix = 1.0 - 0.65 * distance'],
      ['farSend = 0.6 * distance', 'farSend = 0.6 * distance'],
      ['echoBufferLeft[echoIndex] = left * chantLevel * gesture.echoSend + echoDampRight * 0.45', 'echoBufferLeft[echoIndex] = left * chantLevel * gesture.echoSend + echoDampRight * 0.45'],
      ['echoOutLeft = echoDampLeft * 0.8', 'echoOutLeft = echoDampLeft * 0.8'],
    ] as Array<[string, string]>) {
      expect(chant).toContain(kotlinLine);
      expect(swift).toContain(swiftLine);
    }
  });

  it('keeps the designed 31 s cycle for Gentle and Deep and shortens it only for Immersive', () => {
    const from = Number(chant.match(/PERIOD_SHORTENS_FROM = ([0-9.]+)/)![1]);
    expect(IDENTITY_FEEL_VARIETY.gentle).toBeLessThanOrEqual(from);
    expect(IDENTITY_FEEL_VARIETY.deep).toBeLessThanOrEqual(from);
    expect(IDENTITY_FEEL_VARIETY.immersive).toBeGreaterThan(from);
    // The first chant is always 5 s in, whatever the period.
    expect(chant).toContain('elapsedSeconds + (period - 5.0)');
  });

  it('is placed the same way by the Temple room, with variety 0 leaving the chant exactly as designed', () => {
    expect(engine).toContain('aumChant.render(sampleRate, elapsedSeconds, intensity, presence, density, variety)');
    expect(engine).toContain('aumChant.voiceLeft + aumChant.echoLeft + drop.first');
    expect(engine).toContain('+ aumChant.farWet');
    expect(swift).toContain('aumChant.render(sampleRate: sampleRate, elapsedSeconds: elapsedSeconds, intensity: intensity, presence: presence, density: density, variety: variety)');
    expect(swift).toContain('aumChant.voiceLeft + aumChant.echoLeft + drop.left');
    expect(swift).toContain('+ aumChant.farWet');
    // Variety 0 must skip every gesture path so the chant is bit-identical to what it always was.
    expect(chant).toContain('if (variety <= 0.0) {');
    expect(chant).toContain('if (variety > 0.0) {');
    expect(swift).toContain('if variety <= 0 {');
    expect(swift).toContain('if variety > 0 {');
  });

  it('clears every voice and echo tail when a night starts', () => {
    expect(chant).toContain('echoBufferLeft.fill(0.0); echoBufferRight.fill(0.0)');
    expect(chant).toContain('gesture.neutral(); gestureNeutral = true; gestureCycle = -1L');
    expect(engine).toContain('aumChant.reset(activeTimeline.seed)');
    expect(swift).toContain('aumChant.reset(seed: activeTimeline.seed)');
    expect(swift).toContain('for i in echoBufferLeft.indices { echoBufferLeft[i] = 0; echoBufferRight[i] = 0 }');
  });
});
