import { describe, expect, it } from '@jest/globals';
import * as fs from 'fs';
import * as path from 'path';
import { IDENTITY_FEEL_VARIETY } from '../identityArc';

const ROOT = path.resolve(__dirname, '../../..');
const kotlinDir = path.join(ROOT, 'modules/inner-audio/android/src/main/java/expo/modules/inneraudio');
const gestures = fs.readFileSync(path.join(kotlinDir, 'IdentityGestures.kt'), 'utf8');
const model = fs.readFileSync(path.join(kotlinDir, 'AbyssalModel.kt'), 'utf8');
const swift = fs.readFileSync(path.join(ROOT, 'modules/inner-audio/ios/InnerAudioModule.swift'), 'utf8');

const pairs = (list: Array<[string, string]>) => {
  for (const [kotlinLine, swiftLine] of list) {
    expect(`${kotlinLine.length ? 'K' : ''}${gestures.includes(kotlinLine) || model.includes(kotlinLine)}`).toBe('Ktrue');
    expect(swift).toContain(swiftLine);
  }
};

describe('whale gestures: Kotlin and Swift draw the same appearance and shape the water the same way', () => {
  it('uses the same salt and kind count, dealt from the same shuffled bag', () => {
    pairs([
      ['const val WHALE_SALT = 0x5768616cL', 'static let whaleSalt: UInt64 = 0x5768616c'],
      ['const val WHALE_KINDS = 7', 'static let whaleKinds = 7'],
      ['kind = IdentityGestures.kind(seed, salt, index, IdentityGestures.WHALE_KINDS)', 'kind = IdentityGestures.kind(seed: seed, salt: salt, index: index, kinds: IdentityGestures.whaleKinds)'],
    ]);
  });

  it('draws every trait the same way', () => {
    pairs([
      ['callLevel = 1.0 + variety * (u(0) - 0.5) * 0.24', 'callLevel = 1.0 + variety * (u(0) - 0.5) * 0.24'],
      ['durationScale = 1.0 + variety * (u(1) - 0.5) * 0.2', 'durationScale = 1.0 + variety * (u(1) - 0.5) * 0.2'],
      ['durationScale *= 1.0 + 0.3 * variety', 'durationScale *= 1.0 + 0.3 * variety'],
      ['companions = if (u(2) < 0.25 + 0.5 * variety) 2 else 1', 'companions = u(2) < 0.25 + 0.5 * variety ? 2 : 1'],
      ['callFar = 0.95 * variety', 'callFar = 0.95 * variety'],
      ['callLevel *= 1.0 - 0.4 * variety', 'callLevel *= 1.0 - 0.4 * variety'],
      ['answerLevel = 1.0 + variety', 'answerLevel = 1.0 + variety'],
      ['answerBright = 1.0 + 0.9 * variety', 'answerBright = 1.0 + 0.9 * variety'],
      ['callLevel = 0.0; answerLevel = 1.0 + 0.35 * variety', 'answerLevel = 1.0 + 0.35 * variety'],
      ['durationScale *= 1.0 + variety; callLevel *= 0.9; echoSend = 0.6 * variety', 'echoSend = 0.6 * variety'],
    ]);
  });

  it('bends the call, answer, companions and room the same way', () => {
    pairs([
      ['creatureStartHz *= 1.25', 'creatureStartHz *= 1.25'],
      ['creatureEndHz = max(38.0, creatureEndHz * 0.72)', 'creatureEndHz = max(38, creatureEndHz * 0.72)'],
      ['creatureEndHz = creatureStartHz * 1.05', 'creatureEndHz = creatureStartHz * 1.05'],
      ['if (g.answerNear) responsePan *= 0.3', 'if g.answerNear { responsePan *= 0.3 }'],
      ['companionCountdown[0] = rate * (1.5 + 2.0 * draw(10))', 'companionCountdown[0] = rate * (1.5 + 2.0 * draw(10))'],
      ['companionStartHz[0] = 62.0 + 30.0 * draw(12)', 'companionStartHz[0] = 62.0 + 30.0 * draw(12)'],
      ['companionFar[0] = 0.75', 'companionFar[0] = 0.75'],
      ['companionCountdown[1] = rate * (4.0 + 3.0 * draw(15))', 'companionCountdown[1] = rate * (4.0 + 3.0 * draw(15))'],
      ['companionStartHz[1] = 110.0 + 30.0 * draw(17)', 'companionStartHz[1] = 110.0 + 30.0 * draw(17)'],
      ['companionFar[1] = 0.92', 'companionFar[1] = 0.92'],
      ['1.0 - exp(-PI * 2.0 * (1_200.0 - 850.0 * distance) / rate)', '1.0 - exp(-Double.pi * 2 * (1_200.0 - 850.0 * distance) / rate)'],
      ['val echoLength = min(echoSize - 1, max(1, (rate * 4.6).toInt()))', 'let echoLength = min(echoSize - 1, max(1, Int(rate * 4.6)))'],
      ['callEchoLeft[callEchoIndex] = left * g.echoSend + callEchoDampRight * 0.62', 'callEchoLeft[callEchoIndex] = left * g.echoSend + callEchoDampRight * 0.62'],
      ['extraLeft += tapLeft * 0.8 + tapLong * 0.4', 'extraLeft += tapLeft * 0.8 + tapLong * 0.4'],
      ['* (0.55 + 0.25 * variety) / max(g.callLevel, 0.05)', '* (0.55 + 0.25 * variety) / max(g.callLevel, 0.05)'],
    ]);
  });

  it('keeps the water\'s other random details on their own schedule at every variety', () => {
    // The answer draws at its original moment; only when it is heard is delayed.
    pairs([
      ['if (responseLag > 0.0) responseWaiting = true else responseActive = true', 'if responseLag > 0 { responseWaiting = true } else { responseActive = true }'],
      ['responseLag = max(0.0, creatureDuration - oldDuration)', 'responseLag = max(0, creatureDuration - oldDuration)'],
      // A longer or shorter call must not move the next one.
      ['creatureCountdown -= creatureDuration - oldDuration', 'creatureCountdown -= creatureDuration - oldDuration'],
    ]);
    // Gestures take their randomness from the night's seed, never from the model's own stream.
    const begin = model.slice(model.indexOf('private fun beginGesture'), model.indexOf('private fun farCoefficient'));
    expect(begin).not.toContain('unit()');
    const shape = model.slice(model.indexOf('private fun shapeGestures'), model.indexOf('private fun nextBubbleTrail'));
    expect(shape).not.toContain('unit()');
    expect(model).toContain('gestureSeed = seed xor 0x57484c45L');
    expect(swift).toContain('gestureSeed = seed ^ 0x57484c45');
  });

  it('shortens the silences between calls only from variety 0.6, so Gentle and Deep are unchanged', () => {
    expect(IDENTITY_FEEL_VARIETY.gentle).toBeLessThanOrEqual(0.6);
    expect(IDENTITY_FEEL_VARIETY.deep).toBeLessThanOrEqual(0.6);
    expect(IDENTITY_FEEL_VARIETY.immersive).toBeGreaterThan(0.6);
    expect(model).toContain('(1.0 - 0.5 * ((variety - 0.6) / 0.4).coerceIn(0.0, 1.0))');
    expect(swift).toContain('(1.0 - 0.5 * min(1, max(0, (variety - 0.6) / 0.4)))');
  });

  it('does no work at variety 0, and answers with the original expression', () => {
    pairs([
      ['if (variety <= 0.0) {\n      creatureLeft = (callLeft + answerLeft) * presence', 'if variety <= 0 {\n      return ((callLeft + answerLeft) * presence'],
      ['if (variety <= 0.0) { gesture.neutral(); return }', 'if variety <= 0 { gesture.neutral(); return }'],
    ]);
  });

  it('clears the gesture state, echo and room when the model resets', () => {
    pairs([
      ['callEchoLeft.fill(0.0); callEchoRight.fill(0.0); callEchoIndex = 0', 'for i in callEchoLeft.indices { callEchoLeft[i] = 0; callEchoRight[i] = 0 }'],
      ['farRoom.fill(0.0); farRoomIndex = 0', 'farRoomIndex = 0'],
      ['gesture.neutral(); callCount = 0L; gestureIndex = 0L', 'gesture.neutral(); callCount = 0; gestureIndex = 0'],
    ]);
  });
});
