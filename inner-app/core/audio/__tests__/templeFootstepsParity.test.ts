import { describe, expect, it } from '@jest/globals';
import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.resolve(__dirname, '../../..');
const dir = path.join(ROOT, 'modules/inner-audio/android/src/main/java/expo/modules/inneraudio');
const footsteps = fs.readFileSync(path.join(dir, 'TempleFootsteps.kt'), 'utf8');
const engine = fs.readFileSync(path.join(dir, 'ProceduralAudioEngine.kt'), 'utf8');
const swiftAll = fs.readFileSync(path.join(ROOT, 'modules/inner-audio/ios/InnerAudioModule.swift'), 'utf8');
const swiftStart = swiftAll.indexOf('final class TempleFootsteps');
const swift = swiftAll.slice(swiftStart, swiftAll.indexOf('\n}\n', swiftStart) + 3);

const camel = (name: string) => name.toLowerCase().replace(/_([a-z0-9])/g, (_, c: string) => c.toUpperCase());
const scalar = (source: string, name: string, swiftSide: boolean): number => {
  const match = source.match(new RegExp(swiftSide ? `static let ${camel(name)} = (-?[0-9.]+)` : `const val ${name} = (-?[0-9.]+)`));
  expect(match).not.toBeNull();
  return Number(match![1]);
};
const pairs = (list: Array<[string, string]>) => {
  for (const [kotlinLine, swiftLine] of list) {
    expect(`${kotlinLine}: ${footsteps.includes(kotlinLine)}`).toBe(`${kotlinLine}: true`);
    expect(`${swiftLine}: ${swift.includes(swiftLine)}`).toBe(`${swiftLine}: true`);
  }
};

describe('the temple footsteps: Kotlin and Swift are the same model', () => {
  it('uses the same timing, band, and the level it was approved at', () => {
    for (const name of ['ELIGIBLE_UNTIL_SECONDS', 'MIN_STEPS', 'STEP_RANGE', 'STEP_TEMPO_SECONDS', 'TEMPO_JITTER',
      'STEP_SWELL_SECONDS', 'STEP_TOTAL_SECONDS', 'GRAIN_RATE_PER_SECOND', 'GRAIN_DECAY_SECONDS', 'HIGHPASS_HZ',
      'LOWPASS_HZ', 'THUD_LOWPASS_HZ', 'THUD_DECAY_SECONDS', 'THUD_LEVEL', 'NEAR_DISTANCE', 'FAR_DISTANCE',
      'DISTANCE_CUTOFF_NEAR_HZ', 'DISTANCE_CUTOFF_RANGE_HZ', 'LEVEL_GAIN']) {
      expect(scalar(swift, name, true)).toBe(scalar(footsteps, name, false));
    }
  });

  it('only happens in the first stages of the journey, before deep sleep has settled in', () => {
    expect(scalar(footsteps, 'ELIGIBLE_UNTIL_SECONDS', false)).toBe(2400);
    pairs([
      ['if (elapsedSeconds > ELIGIBLE_UNTIL_SECONDS) {', 'if elapsedSeconds > TempleFootsteps.eligibleUntilSeconds {'],
      ['appearancesUsed = appearancesTotal', 'appearancesUsed = appearancesTotal'],
    ]);
  });

  it('uses a 20/60/20 distribution for zero, one, or two distant appearances', () => {
    pairs([
      ['appearancesTotal = if (appearanceRoll < 0.2) 0 else if (appearanceRoll < 0.8) 1 else 2', 'appearancesTotal = appearanceRoll < 0.2 ? 0 : (appearanceRoll < 0.8 ? 1 : 2)'],
      ['sequenceStartPan = side * (0.25 + unit() * 0.4)', 'sequenceStartPan = side * (0.25 + unit() * 0.4)'],
      ['sequenceEndPan = -sequenceStartPan * (0.55 + unit() * 0.3)', 'sequenceEndPan = -sequenceStartPan * (0.55 + unit() * 0.3)'],
      ['totalStepsInSequence = MIN_STEPS + (unit() * (STEP_RANGE + 1)).toInt()', 'totalStepsInSequence = TempleFootsteps.minSteps + Int(unit() * Double(TempleFootsteps.stepRange + 1))'],
      ['stepDistance = NEAR_DISTANCE + (FAR_DISTANCE - NEAR_DISTANCE) * fraction', 'stepDistance = TempleFootsteps.nearDistance + (TempleFootsteps.farDistance - TempleFootsteps.nearDistance) * fraction'],
      ['val shape = sin(PI * min(1.0, ageSeconds / STEP_SWELL_SECONDS)).pow(0.8)', 'let shape = pow(sin(Double.pi * min(1.0, ageSeconds / TempleFootsteps.stepSwellSeconds)), 0.8)'],
    ]);
    expect(scalar(footsteps, 'NEAR_DISTANCE', false)).toBeGreaterThanOrEqual(0.7);
    expect(scalar(footsteps, 'FAR_DISTANCE', false)).toBeGreaterThanOrEqual(0.95);
    // no pitched oscillator anywhere in the model -- only noise-driven grains and filters.
    expect(footsteps).not.toMatch(/sin\(.*freq|sin\(.*pitch/i);
  });

  it('feeds the Temple\'s own shared room at its own, lower send, rather than building a separate one, on its own random stream', () => {
    expect(engine).toContain('templeFootsteps.render(sampleRate, elapsedSeconds, worldSalience)');
    expect(engine).toContain('val dryLeft = otherLeft + templeFootsteps.left');
    expect(swiftAll).toContain('templeFootsteps.render(sampleRate: sampleRate, elapsedSeconds: elapsedSeconds, salience: worldSalience)');
    expect(swiftAll).toContain('let dryLeft = otherLeft + templeFootsteps.left');
    // the room reflects the footsteps less than everything else in the space, not the same amount.
    expect(engine).toContain('val footstepsRoomFeed = (templeFootsteps.left + templeFootsteps.right) * TEMPLE_FOOTSTEPS_ROOM_SEND');
    expect(swiftAll).toContain('let footstepsRoomFeed = (templeFootsteps.left + templeFootsteps.right) * Self.templeFootstepsRoomSend');
    expect(engine).toContain('private const val TEMPLE_FOOTSTEPS_ROOM_SEND = 0.55');
    expect(swiftAll).toContain('private static let templeFootstepsRoomSend = 0.55');
    expect(engine).toContain('templeFootsteps.reset(activeTimeline.seed, sampleRate)');
    expect(swiftAll).toContain('templeFootsteps.reset(seed: activeTimeline.seed, sampleRate: sampleRate)');
    expect(footsteps).toContain('random = (seed xor 0x466f6f7473746570L)');
    expect(swift).toContain('random = seed ^ 0x466f6f7473746570');
  });

  it('spawns nothing from the audio loop that allocates', () => {
    const render = footsteps.slice(footsteps.indexOf('fun render('));
    expect(render).not.toMatch(/doubleArrayOf|IntArray\(|DoubleArray\(|BooleanArray\(|listOf|mutableListOf|Array\(/);
    const swiftRender = swift.slice(swift.indexOf('func render('));
    expect(swiftRender).not.toMatch(/\[Double\]\(repeating|\[Int\]\(repeating|\[Bool\]\(repeating/);
  });
});
