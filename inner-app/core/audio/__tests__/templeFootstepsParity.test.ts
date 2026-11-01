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
      ['stepDistance = NEAR_DISTANCE + (FAR_DISTANCE - NEAR_DISTANCE) * distanceFraction', 'stepDistance = TempleFootsteps.nearDistance + (TempleFootsteps.farDistance - TempleFootsteps.nearDistance) * distanceFraction'],
      ['val shape = sin(PI * min(1.0, ageSeconds / STEP_SWELL_SECONDS)).pow(0.8)', 'let shape = pow(sin(Double.pi * min(1.0, ageSeconds / TempleFootsteps.stepSwellSeconds)), 0.8)'],
    ]);
    expect(scalar(footsteps, 'NEAR_DISTANCE', false)).toBeGreaterThanOrEqual(0.7);
    expect(scalar(footsteps, 'FAR_DISTANCE', false)).toBeGreaterThanOrEqual(0.95);
    // no pitched oscillator anywhere in the model -- only noise-driven grains and filters.
    expect(footsteps).not.toMatch(/sin\(.*freq|sin\(.*pitch/i);
  });

  it('feeds the Temple\'s own shared room at its own, lower send, rather than building a separate one, on its own random stream', () => {
    expect(engine).toContain('templeFootsteps.render(sampleRate, elapsedSeconds, worldSalience, scriptedOnly = sanctum > 0.0001)');
    expect(engine).toContain('val dryLeft = otherLeft + stepsLeft');
    expect(swiftAll).toContain('templeFootsteps.render(sampleRate: sampleRate, elapsedSeconds: elapsedSeconds, salience: worldSalience, scriptedOnly: sanctum > 0.0001)');
    expect(swiftAll).toContain('let dryLeft = otherLeft + stepsLeft');
    // the room reflects the footsteps less than everything else in the space, not the same amount.
    expect(engine).toContain('val footstepsRoomFeed = (stepsLeft + stepsRight) * TEMPLE_FOOTSTEPS_ROOM_SEND * (1.0 - sanctum * (1.0 - SANCTUM_FOOTSTEPS_ROOM_RATIO))');
    expect(swiftAll).toContain('let footstepsRoomFeed = (stepsLeft + stepsRight) * Self.templeFootstepsRoomSend * (1.0 - sanctum * (1.0 - Self.sanctumFootstepsRoomRatio))');
    expect(engine).toContain('private const val TEMPLE_FOOTSTEPS_ROOM_SEND = 0.55');
    expect(swiftAll).toContain('private static let templeFootstepsRoomSend = 0.55');
    expect(engine).toContain('templeFootsteps.reset(activeTimeline.seed, sampleRate)');
    expect(swiftAll).toContain('templeFootsteps.reset(seed: activeTimeline.seed, sampleRate: sampleRate)');
    expect(footsteps).toContain('random = (seed xor 0x466f6f7473746570L)');
    expect(swift).toContain('random = seed ^ 0x466f6f7473746570');
  });

  it('walks a passage the journey calls: toward the listener or away, and no random ones in the Sanctum', () => {
    pairs([
      ['val distanceFraction = if (sequenceApproaching) 1.0 - fraction else fraction', 'let distanceFraction = sequenceApproaching ? 1.0 - fraction : fraction'],
      ['pendingTrigger = if (approach) 1 else 2', 'pendingTrigger = approach ? 1 : 2'],
      ['beginSequence(approaching = pendingTrigger == 1, hesitant = true)', 'beginSequence(approaching: pendingTrigger == 1, hesitant: true)'],
      ['val tempo = if (sequenceHesitant) HESITANT_TEMPO_SECONDS else STEP_TEMPO_SECONDS', 'let tempo = sequenceHesitant ? TempleFootsteps.hesitantTempoSeconds : TempleFootsteps.stepTempoSeconds'],
      ['val jitter = if (sequenceHesitant) HESITANT_TEMPO_JITTER else TEMPO_JITTER', 'let jitter = sequenceHesitant ? TempleFootsteps.hesitantTempoJitter : TempleFootsteps.tempoJitter'],
      ['if (!scriptedOnly && !sequenceActive && appearancesUsed < appearancesTotal) {', 'if !scriptedOnly && !sequenceActive && appearancesUsed < appearancesTotal {'],
      ['salience.reserve(salience = 0.3, durationSeconds = 7.0, recoverySeconds = 3.0)\n      beginSequence', 'salience: 0.3, durationSeconds: 7.0, recoverySeconds: 3.0)\n      beginSequence'],
    ]);
    // Both engines read the same authored event, fire it once when it falls due, and clear it on a fresh timeline.
    expect(engine).toContain('if (event.type != "footsteps" || event.atMs < 0) return@mapNotNull null');
    expect(swiftAll).toContain('guard event.type == "footsteps", event.atMs >= 0 else { return nil }');
    expect(engine).toContain('FootstepsEventState(atMs = event.atMs, approach = event.direction == "approach")');
    expect(swiftAll).toContain('FootstepsEvent(atMs: event.atMs, approach: event.direction == "approach")');
    expect(engine).toContain('templeFootsteps.trigger(footstepsFire.second.approach)');
    expect(swiftAll).toContain('templeFootsteps.trigger(approach: footstepsFire.approach)');
    expect(engine).toContain('footstepsTimelineThresholdMs = timelineStartFrame * 1_000.0 / sampleRate');
    expect(swiftAll).toContain('footstepsTimelineThresholdMs = timelineStartFrame * 1_000 / sampleRate');
  });

  it('spawns nothing from the audio loop that allocates', () => {
    const render = footsteps.slice(footsteps.indexOf('fun render('));
    expect(render).not.toMatch(/doubleArrayOf|IntArray\(|DoubleArray\(|BooleanArray\(|listOf|mutableListOf|Array\(/);
    const swiftRender = swift.slice(swift.indexOf('func render('));
    expect(swiftRender).not.toMatch(/\[Double\]\(repeating|\[Int\]\(repeating|\[Bool\]\(repeating/);
  });
});
