import { describe, expect, it } from '@jest/globals';
import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.resolve(__dirname, '../../..');
const kotlinDir = path.join(ROOT, 'modules/inner-audio/android/src/main/java/expo/modules/inneraudio');
const fire = fs.readFileSync(path.join(kotlinDir, 'FireModel.kt'), 'utf8');
const gestures = fs.readFileSync(path.join(kotlinDir, 'IdentityGestures.kt'), 'utf8');
const scheduler = fs.readFileSync(path.join(kotlinDir, 'WorldSalienceScheduler.kt'), 'utf8');
const engine = fs.readFileSync(path.join(kotlinDir, 'ProceduralAudioEngine.kt'), 'utf8');
const swift = fs.readFileSync(path.join(ROOT, 'modules/inner-audio/ios/InnerAudioModule.swift'), 'utf8');

const camel = (name: string) => name.toLowerCase().replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
const scalar = (source: string, name: string, swiftSide: boolean): number => {
  const match = source.match(new RegExp(swiftSide ? `static let ${camel(name)} = (-?[0-9.]+)` : `const val ${name} = (-?[0-9.]+)`));
  expect(match).not.toBeNull();
  return Number(match![1]);
};
const list = (source: string, kotlinName: string, swiftSide: boolean): number[] => {
  const match = source.match(new RegExp(swiftSide ? `static let ${camel(kotlinName)} = \\[([^\\]]*)\\]` : `val ${kotlinName} = doubleArrayOf\\(([^)]*)\\)`));
  expect(match).not.toBeNull();
  return match![1].split(',').map(part => Number(part.trim()));
};
const pairs = (list: Array<[string, string]>) => {
  for (const [kotlinLine, swiftLine] of list) {
    expect(`${kotlinLine}: ${fire.includes(kotlinLine) || gestures.includes(kotlinLine) || scheduler.includes(kotlinLine)}`).toBe(`${kotlinLine}: true`);
    expect(`${swiftLine}: ${swift.includes(swiftLine)}`).toBe(`${swiftLine}: true`);
  }
};

describe('the fire: Kotlin and Swift are the same model', () => {
  it('uses the same mix balance, ceilings and output trim', () => {
    for (const name of ['GAIN_BODY', 'GAIN_ROAR', 'GAIN_GRAIN', 'GAIN_TICK', 'GAIN_POP', 'GAIN_THUMP', 'GAIN_RUSTLE', 'GAIN_SIZZLE', 'GAIN_STEAM', 'GAIN_WIND', 'LIMIT_TICK', 'LIMIT_POP', 'LIMIT_THUMP', 'OUTPUT_TRIM']) {
      expect(scalar(swift, name, true)).toBe(scalar(fire, name, false));
    }
    // The trim is exactly 1 dB.
    expect(20 * Math.log10(scalar(fire, 'OUTPUT_TRIM', false))).toBeCloseTo(1, 10);
  });

  it('uses the same rooms, partials and decay for the steam and the wind', () => {
    for (const name of ['WIND_PARTIALS', 'WIND_ROOM_INPUT', 'WIND_ROOM_SECONDS', 'STEAM_ROOM_INPUT', 'STEAM_ROOM_SECONDS']) {
      expect(list(swift, name, true)).toEqual(list(fire, name, false));
    }
    expect(scalar(swift, 'ROOM_DECAY_SECONDS', true)).toBe(scalar(fire, 'ROOM_DECAY_SECONDS', false));
    expect(list(fire, 'WIND_PARTIALS', false)).toEqual([1.0, 0.22, 0.5, 0.1, 0.24, 0.05]);
  });

  it('maps intensity, presence, density and variety the same way', () => {
    pairs([
      ['val mu = max(0.08, min(1.0, intensity * 1.25))', 'let mu = max(0.08, min(1.0, intensity * 1.25))'],
      ['activity += (mu - activity) * 0.012 + 0.03 * gauss()', 'activity += (mu - activity) * 0.012 + 0.03 * gauss()'],
      ['val mult = presence', 'let mult = presence'],
      ['settleAt = i + (rate * (51.0 + 21.0 * unit()) / max(0.2, min(1.0, density))).toLong()', 'settleAt = i + Int64(rate * (51.0 + 21.0 * unit()) / max(0.2, min(1.0, density)))'],
      ['val kind = if (variety > 0.0) IdentityGestures.kind(fireSeed, IdentityGestures.FIRE_SALT, settleCount, IdentityGestures.FIRE_KINDS) else 0',
       'let kind = variety > 0.0 ? IdentityGestures.kind(seed: fireSeed, salt: IdentityGestures.fireSalt, index: settleCount, kinds: IdentityGestures.fireKinds) : 0'],
      ['const val FIRE_SALT = 0x46697265L', 'static let fireSalt: UInt64 = 0x46697265'],
      ['const val FIRE_KINDS = 8', 'static let fireKinds = 8'],
    ]);
  });

  it('paces the wind by how lively the fire is, and lets each gust lift the flames', () => {
    pairs([
      ['val amplitudeScale = max(0.15, min(1.0, (a / 0.85).pow(0.85)))', 'let amplitudeScale = max(0.15, min(1.0, pow(a / 0.85, 0.85)))'],
      ['var gap = (17.0 + 21.0 * unit()) * (0.85 / a).pow(1.15)', 'var gap = (17.0 + 21.0 * unit()) * pow(0.85 / a, 1.15)'],
      ['flareAt = i + (0.3 * rate).toLong()', 'flareAt = i + Int64(0.3 * rate)'],
      ['flareAmplitude = 0.7 + 1.5 * gustAmplitude', 'flareAmplitude = 0.7 + 1.5 * gustAmplitude'],
      ['val f0 = (165 + 115 * gustEnvelope) * (1 + windJitter)', 'let f0 = (165 + 115 * gustEnvelope) * (1 + windJitter)'],
      ['val bodyGain = flame * (0.45 + 0.55 * a) * (1 + 0.12 * gustDelayed)', 'let bodyGain = flame * (0.45 + 0.55 * a) * (1 + 0.12 * gustDelayed)'],
      ['val roarGain = flame * (0.2 + 0.8 * a) * (1 + flarePeak * flare) * (1 + 0.5 * gustDelayed)', 'let roarGain = flame * (0.2 + 0.8 * a) * (1 + flarePeak * flare) * (1 + 0.5 * gustDelayed)'],
      ['if (unit() < (12 + 83 * a) * (1 + 2.0 * crackleT) * (1 + 0.9 * gustDelayed) / rate)', 'if unit() < (12 + 83 * a) * (1 + 2.0 * crackleT) * (1 + 0.9 * gustDelayed) / rate'],
    ]);
  });

  it('lifts the wind for the fuller feels the same way in both engines, and leaves Gentle exactly as it was', () => {
    for (const name of ['WIND_LIFT_AT_FULL_VARIETY', 'WIND_FOLLOW_AT_FULL_VARIETY', 'WIND_FLOOR_AT_FULL_VARIETY', 'WIND_IMMERSIVE_BOOST', 'WIND_IMMERSIVE_FROM']) {
      expect(scalar(swift, name, true)).toBe(scalar(fire, name, false));
    }
    pairs([
      ['gustVoice = if (variety > 0.0) windVoice(a, variety, amplitudeScale) else 1.0', 'gustVoice = variety > 0.0 ? windVoice(a, variety, amplitudeScale) : 1.0'],
      ['val exponent = 0.85 - (0.85 - WIND_FOLLOW_AT_FULL_VARIETY) * v', 'let exponent = 0.85 - (0.85 - FireModel.windFollowAtFullVariety) * v'],
      ['val floor = 0.15 + (WIND_FLOOR_AT_FULL_VARIETY - 0.15) * v', 'let floorLevel = 0.15 + (FireModel.windFloorAtFullVariety - 0.15) * v'],
      ['val followed = max(floor, min(1.0, (a / 0.85).pow(exponent)))', 'let followed = max(floorLevel, min(1.0, pow(a / 0.85, exponent)))'],
      ['val immersive = WIND_IMMERSIVE_BOOST.pow(max(0.0, min(1.0, (v - WIND_IMMERSIVE_FROM) / (1.0 - WIND_IMMERSIVE_FROM))))', 'let immersive = pow(FireModel.windImmersiveBoost, max(0.0, min(1.0, (v - FireModel.windImmersiveFrom) / (1.0 - FireModel.windImmersiveFrom))))'],
      ['return (1.0 + WIND_LIFT_AT_FULL_VARIETY * v) * immersive * followed / amplitudeScale', 'return (1.0 + FireModel.windLiftAtFullVariety * v) * immersive * followed / amplitudeScale'],
      ['* 0.5) * mult * gustVoice\n', '* 0.5) * mult * gustVoice\n'],
    ]);
    // The Immersive boost is exactly 2 dB, and Deep (variety 0.6) gets none of it.
    expect(20 * Math.log10(scalar(fire, 'WIND_IMMERSIVE_BOOST', false))).toBeCloseTo(2, 10);
    expect(scalar(fire, 'WIND_IMMERSIVE_FROM', false)).toBe(0.6);
    // Gentle keeps the wind exactly as it was, and the flames answer a gust as they always did.
    expect(fire).toMatch(/flareAmplitude = 0\.7 \+ 1\.5 \* gustAmplitude\n/);
    expect(fire).toMatch(/gustAmplitude = \(0\.55 \+ 0\.45 \* unit\(\)\) \* amplitudeScale\n/);
  });

  it('builds the pops as broadband snaps and the settles in the same eight gestures', () => {
    pairs([
      ['val dull = unit() < 0.12', 'let dull = unit() < 0.12'],
      ['val q = if (dull) 1.5 + unit() else 1.6 + 3.4 * unit()', 'let q = dull ? 1.5 + unit() : 1.6 + 3.4 * unit()'],
      ['spawn(1, logUniform(2500.0, 8000.0), 0.9, 0.25 + 0.3 * unit(), amp * 0.9, pan, (0.01 * rate).toInt())', 'spawn(1, logUniform(2500.0, 8000.0), 0.9, 0.25 + 0.3 * unit(), amp * 0.9, pan, Int(0.01 * rate))'],
      ['val q = 2.2 + 1.2 * unit()', 'let q = 2.2 + 1.2 * unit()'],
      ['spawn(2, logUniform(150.0, 260.0), 3.5, 6.0, 3.6 * mult, gauss() * 0.2, (0.3 * rate).toInt())', 'spawn(2, logUniform(150.0, 260.0), 3.5, 6.0, 3.6 * mult, gauss() * 0.2, Int(0.3 * rate))'],
      ['spawn(2, logUniform(130.0, 190.0), 9.0, 4.0, 2.0 * mult, gauss() * 0.2, (0.6 * rate).toInt())', 'spawn(2, logUniform(130.0, 190.0), 9.0, 4.0, 2.0 * mult, gauss() * 0.2, Int(0.6 * rate))'],
      ['val wetChance = if (kind == 3 || kind == 4) 0.25 else if (kind == 2) 0.4 else 0.6', 'let wetChance = (kind == 3 || kind == 4) ? 0.25 : (kind == 2 ? 0.4 : 0.6)'],
      ['spawnThump(logUniform(42.0, 68.0), 7.5, mult)', 'spawnThump(logUniform(42.0, 68.0), 7.5, mult)'],
      ['spawnThump(logUniform(60.0, 90.0), 5.0, mult)', 'spawnThump(logUniform(60.0, 90.0), 5.0, mult)'],
      ['flareUp = true; flareLeft = (1.6 + 0.8 * unit()) * rate; flarePeak = 2.6', 'flareUp = true; flareLeft = (1.6 + 0.8 * unit()) * rate; flarePeak = 2.6'],
    ]);
  });

  it('holds new settles and gusts around a recognition signal, in both engines and the scheduler', () => {
    pairs([
      ['if (salience.isSuppressed()) gustAt = i + (3.0 * rate).toLong()', 'if salience.isSuppressed() { gustAt = i + Int64(3.0 * rate) }'],
      ['if (salience.isSuppressed()) settleAt = i + (3.0 * rate).toLong()', 'if salience.isSuppressed() { settleAt = i + Int64(3.0 * rate) }'],
      ['fun isSuppressed(): Boolean = suppressed || frame < clearUntil', 'func isSuppressed() -> Bool { suppressed || frame < clearUntil }'],
    ]);
  });

  it('is the only fire in both engines: the old rhythmic fire and the ember model are gone', () => {
    for (const source of [engine, swift, fire]) {
      expect(source).not.toMatch(/FireEmberModel/);
      expect(source).not.toMatch(/fireBody|fireHiss|firePopLeft|firePopRight|nextFireWhite/);
    }
    // The old fire's fixed 1.7 s and 0.43 s sine flicker must never come back.
    expect(engine + swift + fire).not.toMatch(/2\s*\/\s*1\.7|\/\s*0\.43\b/);
    expect(engine).toContain('fireModel.render(sampleRate, intensity, presence, density, variety, worldSalience)');
    expect(swift).toContain('fireModel.render(sampleRate: sampleRate, intensity: intensity, presence: presence, density: density, variety: variety, salience: worldSalience)');
    expect(engine).toContain('fireModel.reset(activeTimeline.seed, sampleRate)');
    expect(swift).toContain('fireModel.reset(seed: activeTimeline.seed, sampleRate: sampleRate)');
  });

  it('spawns nothing from the audio loop that allocates, and never scans every voice or event each sample', () => {
    const render = fire.slice(fire.indexOf('fun render('), fire.indexOf('private fun settle('));
    expect(render).not.toMatch(/doubleArrayOf|IntArray\(|DoubleArray\(|listOf|mutableListOf|Pair\(/);
    expect(render).toContain('if (nextDue <= i) runPending()');
    expect(render).toContain('while (n < activeCount)');
  });
});
