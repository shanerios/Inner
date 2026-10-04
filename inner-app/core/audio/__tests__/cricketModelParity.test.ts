import { describe, expect, it } from '@jest/globals';
import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.resolve(__dirname, '../../..');
const dir = path.join(ROOT, 'modules/inner-audio/android/src/main/java/expo/modules/inneraudio');
const cricket = fs.readFileSync(path.join(dir, 'CricketModel.kt'), 'utf8');
const engine = fs.readFileSync(path.join(dir, 'ProceduralAudioEngine.kt'), 'utf8');
const swiftAll = fs.readFileSync(path.join(ROOT, 'modules/inner-audio/ios/InnerAudioModule.swift'), 'utf8');
const swiftStart = swiftAll.indexOf('final class CricketModel');
const swift = swiftAll.slice(swiftStart, swiftAll.indexOf('\n}\n', swiftStart) + 3);

const camel = (name: string) => name.toLowerCase().replace(/_([a-z0-9])/g, (_, c: string) => c.toUpperCase());
const scalar = (source: string, name: string, swiftSide: boolean): number => {
  const match = source.match(new RegExp(swiftSide ? `static let ${camel(name)} = (-?[0-9.]+)` : `const val ${name} = (-?[0-9.]+)`));
  expect(match).not.toBeNull();
  return Number(match![1]);
};
const pairs = (list: Array<[string, string]>) => {
  for (const [kotlinLine, swiftLine] of list) {
    expect(`${kotlinLine}: ${cricket.includes(kotlinLine)}`).toBe(`${kotlinLine}: true`);
    expect(`${swiftLine}: ${swift.includes(swiftLine)}`).toBe(`${swiftLine}: true`);
  }
};

describe('the cricket chorus: Kotlin and Swift are the same model', () => {
  it('uses the same cast size, pitches, and the level it was measured at', () => {
    for (const name of ['SINGERS', 'CARRIER_LOW_HZ', 'CARRIER_HIGH_HZ', 'CHORUS_GAIN', 'SECOND_HARMONIC',
      'PULSE_ATTACK_SECONDS', 'PULSE_DECAY_FRACTION', 'WANDER_HZ', 'WANDER_RANGE', 'TRILL_BURST_LOW', 'TRILL_BURST_RANGE',
      'CHIRP_BURST_LOW', 'CHIRP_BURST_RANGE', 'TRILL_GAP_LOW_SECONDS', 'TRILL_GAP_RANGE_SECONDS',
      'CHIRP_GAP_LOW_SECONDS', 'CHIRP_GAP_RANGE_SECONDS', 'NEAR_CUTOFF_HZ', 'DISTANCE_CUTOFF_RANGE_HZ', 'SPACE_SECONDS']) {
      expect(scalar(swift, name, true)).toBe(scalar(cricket, name, false));
    }
  });

  it('is calibrated against the forest bed, confirmed by ear through the real engine', () => {
    expect(scalar(cricket, 'CHORUS_GAIN', false)).toBeCloseTo(0.504, 6);
  });

  it('is a steady chorus: nothing in it reads intensity, presence, density, or variety', () => {
    const kotlinRender = cricket.slice(cricket.indexOf('fun render('), cricket.lastIndexOf('}'));
    const swiftRender = swift.slice(swift.indexOf('func render('), swift.lastIndexOf('}'));
    for (const name of ['intensity', 'presence', 'density', 'variety']) {
      expect(kotlinRender).not.toMatch(new RegExp(name, 'i'));
      expect(swiftRender).not.toMatch(new RegExp(name, 'i'));
    }
  });

  it('runs each singer on its own schedule: a fixed cast, with chirp/trill bursts and a wandering pitch', () => {
    pairs([
      ['freq[s] = clampHz(freq[s] + (unit() * 2.0 - 1.0) * WANDER_HZ, carrierHz[s])', 'freq[s] = clampHz(freq[s] + (unit() * 2.0 - 1.0) * CricketModel.wanderHz, carrier: carrierHz[s])'],
      ['amp[s] = (0.75 + 0.25 * unit()) * (if (isTrill[s]) 0.6 else 1.0)', 'amp[s] = (0.75 + 0.25 * unit()) * (isTrill[s] ? 0.6 : 1.0)'],
      ['val envelope = min(1.0, t / PULSE_ATTACK_SECONDS) * exp(-t / (pulseSeconds[s] * PULSE_DECAY_FRACTION))', 'let envelope = min(1.0, t / CricketModel.pulseAttackSeconds) * exp(-t / (pulseSeconds[s] * CricketModel.pulseDecayFraction))'],
      ['val tone = sin(phase[s]) + SECOND_HARMONIC * sin(2.0 * phase[s])', 'let tone = sin(phase[s]) + CricketModel.secondHarmonic * sin(2.0 * phase[s])'],
    ]);
  });

  it('gives a distant singer a lower cutoff and more of the shared night air than a near one', () => {
    pairs([
      ['cutoffPole[s] = pole(NEAR_CUTOFF_HZ - distance[s] * DISTANCE_CUTOFF_RANGE_HZ)', 'cutoffPole[s] = pole(CricketModel.nearCutoffHz - distance[s] * CricketModel.distanceCutoffRangeHz)'],
      ['levelFactor[s] = 0.35 + 0.65 * (1.0 - distance[s])', 'levelFactor[s] = 0.35 + 0.65 * (1.0 - distance[s])'],
      ['farMono += filtered * distance[s]', 'farMono += filtered * distance[s]'],
    ]);
  });

  it('is wired into the forest, on its own random stream, reseeded with every journey', () => {
    expect(engine).toContain('cricketModel.render(sampleRate)');
    expect(engine).toContain('forestModel.left + birdLeft + cricketModel.left');
    expect(swiftAll).toContain('cricketModel.render(sampleRate: sampleRate)');
    expect(swiftAll).toContain('forestModel.left + birdLeft + cricketModel.left');
    expect(engine).toContain('cricketModel.reset(activeTimeline.seed, sampleRate)');
    expect(swiftAll).toContain('cricketModel.reset(seed: activeTimeline.seed, sampleRate: sampleRate)');
    expect(cricket).toContain('random = (seed xor 0x437269636b657473L)');
    expect(swift).toContain('random = seed ^ 0x437269636b657473');
  });

  it('spawns nothing from the audio loop that allocates', () => {
    const render = cricket.slice(cricket.indexOf('fun render('));
    expect(render).not.toMatch(/doubleArrayOf|IntArray\(|DoubleArray\(|BooleanArray\(|listOf|mutableListOf|Array\(/);
    const swiftRender = swift.slice(swift.indexOf('func render('));
    expect(swiftRender).not.toMatch(/\[Double\]\(repeating|\[Int\]\(repeating|\[Bool\]\(repeating/);
  });
});
