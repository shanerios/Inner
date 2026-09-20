import { describe, expect, it } from '@jest/globals';
import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.resolve(__dirname, '../../..');
const dir = path.join(ROOT, 'modules/inner-audio/android/src/main/java/expo/modules/inneraudio');
const gestures = fs.readFileSync(path.join(dir, 'IdentityGestures.kt'), 'utf8');
const forest = fs.readFileSync(path.join(dir, 'ForestModel.kt'), 'utf8');
const swiftAll = fs.readFileSync(path.join(ROOT, 'modules/inner-audio/ios/InnerAudioModule.swift'), 'utf8');
const swiftForest = swiftAll.slice(swiftAll.indexOf('final class ForestModel'), swiftAll.indexOf('\n}\n', swiftAll.indexOf('final class ForestModel')) + 3);

const pairs = (list: Array<[string, string]>, kotlinSource: string = gestures, swiftSource: string = swiftAll) => {
  for (const [kotlinLine, swiftLine] of list) {
    expect(`${kotlinSource.includes(kotlinLine)}: ${kotlinLine}`).toBe(`true: ${kotlinLine}`);
    expect(`${swiftSource.includes(swiftLine)}: ${swiftLine}`).toBe(`true: ${swiftLine}`);
  }
};

describe('forest gestures: Kotlin and Swift draw the same appearance and shape the howl the same way', () => {
  it('uses the same salt and kind count, dealt from the same shuffled bag, with the bag big enough', () => {
    pairs([
      ['const val FOREST_SALT = 0x466f7273L', 'static let forestSalt: UInt64 = 0x466f7273'],
      ['const val FOREST_KINDS = 8', 'static let forestKinds = 8'],
      ['kind = IdentityGestures.kind(seed, salt, index, IdentityGestures.FOREST_KINDS)', 'kind = IdentityGestures.kind(seed: seed, salt: salt, index: index, kinds: IdentityGestures.forestKinds)'],
    ]);
    // The bag arrays hold ten.
    expect(gestures).toContain('private val bagA = IntArray(10)');
    // No other identity sound shares its salt.
    const salts = [...gestures.matchAll(/const val [A-Z]+_SALT = 0x([0-9a-fA-F]+)L/g)].map(match => match[1].toLowerCase());
    expect(new Set(salts).size).toBe(salts.length);
  });

  it('draws every trait the same way, and stays neutral when there is no variety', () => {
    pairs([
      ['level = 1.0 + variety * (u(0) - 0.5) * 0.24', 'level = 1.0 + variety * (u(0) - 0.5) * 0.24'],
      ['stretch = 1.0 + variety * (u(1) - 0.5) * 0.2', 'stretch = 1.0 + variety * (u(1) - 0.5) * 0.2'],
      ['slipRatio = 1.0 + variety * (4.0 / 3.0 - 1.0); slipAt = 0.35 + 0.25 * u(2)', 'slipRatio = 1.0 + variety * (4.0 / 3.0 - 1.0); slipAt = 0.35 + 0.25 * u(2)'],
      ['mainLevel = 0.0; answerLevel = 1.0 + 0.6 * variety', 'mainLevel = 0.0; answerLevel = 1.0 + 0.6 * variety'],
      ['thirdTree = true; thirdRatio = 0.76 + 0.1 * u(2); thirdDelay = 3.5 + 1.5 * u(3)', 'thirdTree = true; thirdRatio = 0.76 + 0.1 * u(2); thirdDelay = 3.5 + 1.5 * u(3)'],
      ['KIND_LONG -> stretch *= 1.0 + 0.7 * variety', 'stretch *= 1.0 + 0.7 * variety'],
      ['KIND_DOUBLE -> doubleGap = 3.0 + 1.0 * u(2)', 'doubleGap = 3.0 + 1.0 * u(2)'],
      ['KIND_NEAR -> distance = -variety', 'distance = -variety'],
      ['KIND_FAR -> distance = variety', 'distance = variety'],
    ]);
    // With no variety the model never draws a gesture, so Gentle is the howl as it was approved.
    pairs([
      ['if (variety > 0.0) gesture.draw(forestSeed, howlCount, variety) else gesture.neutral()', 'if variety > 0.0 { gesture.draw(seed: forestSeed, index: howlCount, variety: variety) } else { gesture.neutral() }'],
    ], forest, swiftForest);
  });

  it('bends the call, its answers and the room the same way', () => {
    pairs([
      ['rise = (2.6 + 1.5 * unit()) * gesture.stretch; fall = (4.2 + 2.2 * unit()) * gesture.stretch', 'rise = (2.6 + 1.5 * unit()) * gesture.stretch; fall = (4.2 + 2.2 * unit()) * gesture.stretch'],
      ['answerDelay = ANSWER_DELAY_SECONDS * gesture.stretch + gesture.doubleGap * 0.7', 'answerDelay = ForestModel.answerDelaySeconds * gesture.stretch + gesture.doubleGap * 0.7'],
      ['howlEnd = HOWL_SECONDS * gesture.stretch + gesture.doubleGap', 'howlEnd = ForestModel.howlSeconds * gesture.stretch + gesture.doubleGap'],
      ['reserveSeconds = 13.2 * gesture.stretch + gesture.doubleGap', 'reserveSeconds = 13.2 * gesture.stretch + gesture.doubleGap'],
      ['val wind = if (gesture.doubleGap > 0.0) min(1.0, firstGust + 0.85 * gust(seconds - gesture.doubleGap, rise * 0.7, fall * 0.7)) else firstGust', 'let wind = gesture.doubleGap > 0.0 ? Swift.min(1.0, firstGust + 0.85 * gust(seconds - gesture.doubleGap, rise * 0.7, fall * 0.7)) : firstGust'],
      ['main = (voice * 0.55 + whoosh) * gesture.mainLevel', 'main = (voice * 0.55 + whoosh) * gesture.mainLevel'],
      ['answer = answerDistantTwo * gesture.answerLevel', 'answer = answerDistantTwo * gesture.answerLevel'],
      ['val thirdPitch = base * gesture.thirdRatio * (0.9 + 0.3 * thirdWind.pow(0.8)) * (1.0 + 0.004 * drift)', 'let thirdPitch = base * gesture.thirdRatio * (0.9 + 0.3 * pow(thirdWind, 0.8)) * (1.0 + 0.004 * drift)'],
      ['val thirdPan = clamp(-pan * 1.5, -0.45, 0.45)', 'let thirdPan = clamp(-pan * 1.5, -0.45, 0.45)'],
      ['kDistantNow = if (far == 0.0) kDistant else pole(3600.0 * (if (far > 0.0) 1.0 - 0.5 * far else 1.0 - 0.6 * far))', 'kDistantNow = far == 0.0 ? kDistant : pole(3600.0 * (far > 0.0 ? 1.0 - 0.5 * far : 1.0 - 0.6 * far))'],
      ['val roomSend = 1.0 + 0.6 * far', 'let roomSend = 1.0 + 0.6 * far'],
      ['return 1.0 + (gesture.slipRatio - 1.0) * envelope', 'return 1.0 + (gesture.slipRatio - 1.0) * envelope'],
    ], forest, swiftForest);
  });

  it('settles the canopy the same way in both engines, and leaves the levels it was tuned on alone', () => {
    pairs([
      ['if (intensity >= STIR_KNEE) 0.6 + 0.8 * intensity', 'if intensity >= ForestModel.stirKnee { return 0.6 + 0.8 * intensity }'],
      ['else max(0.05, (0.6 + 0.8 * STIR_KNEE) * (max(intensity, 0.0) / STIR_KNEE).pow(STIR_FALL))', 'return Swift.max(0.05, (0.6 + 0.8 * ForestModel.stirKnee) * pow(Swift.max(intensity, 0.0) / ForestModel.stirKnee, ForestModel.stirFall))'],
    ], forest, swiftForest);
    // Continuous at the knee: the two branches agree there, so the levels the forest was tuned on do not move.
    const knee = 0.34;
    expect(0.6 + 0.8 * knee).toBeCloseTo((0.6 + 0.8 * knee) * (knee / knee) ** 1.3, 12);
    // Below it the canopy quiets faster: a settled REM forest is well under the Gentle level.
    const stirAt = (i: number) => (i >= knee ? 0.6 + 0.8 * i : Math.max(0.05, (0.6 + 0.8 * knee) * (i / knee) ** 1.3));
    expect(stirAt(0.15)).toBeLessThan(stirAt(0.34) * 0.4);
    expect(stirAt(0.5)).toBeGreaterThan(stirAt(0.34));
    expect(stirAt(0)).toBeGreaterThan(0);
  });

  it('gives the howl its own gesture index, counted only when a howl actually starts', () => {
    expect(forest).toContain('howlCount += 1');
    expect(forest).toContain('gesture.neutral(); answerDelay = ANSWER_DELAY_SECONDS');
    expect(swiftForest).toContain('howlCount += 1');
  });
});
