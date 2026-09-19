import { describe, expect, it } from '@jest/globals';
import * as fs from 'fs';
import * as path from 'path';
import { IDENTITY_FEEL_VARIETY } from '../identityArc';

const ROOT = path.resolve(__dirname, '../../..');
const kotlinDir = path.join(ROOT, 'modules/inner-audio/android/src/main/java/expo/modules/inneraudio');
const gestures = fs.readFileSync(path.join(kotlinDir, 'IdentityGestures.kt'), 'utf8');
const model = fs.readFileSync(path.join(kotlinDir, 'CosmicModel.kt'), 'utf8');
const swift = fs.readFileSync(path.join(ROOT, 'modules/inner-audio/ios/InnerAudioModule.swift'), 'utf8');

const kotlinHas = (line: string) => gestures.includes(line) || model.includes(line);
const pairs = (list: Array<[string, string]>) => {
  for (const [kotlinLine, swiftLine] of list) {
    expect(`${kotlinLine}: ${kotlinHas(kotlinLine)}`).toBe(`${kotlinLine}: true`);
    expect(`${swiftLine}: ${swift.includes(swiftLine)}`).toBe(`${swiftLine}: true`);
  }
};
const numbers = (text: string) => text.split(',').map(part => Number(part.trim().split('/').reduce((a, b) => String(Number(a) / Number(b)))));

describe('Cosmic voice gestures: Kotlin and Swift draw the same breath and shape it the same way', () => {
  it('uses the same salt and kind count, and the same harmonies', () => {
    pairs([
      ['const val COSMIC_SALT = 0x436f736dL', 'static let cosmicSalt: UInt64 = 0x436f736d'],
      ['const val COSMIC_KINDS = 9', 'static let cosmicKinds = 9'],
      ['kind = IdentityGestures.kind(seed, salt, index, IdentityGestures.COSMIC_KINDS)', 'kind = IdentityGestures.kind(seed: seed, salt: salt, index: index, kinds: IdentityGestures.cosmicKinds)'],
    ]);
    const kotlinHarmony = gestures.match(/val HARMONY = doubleArrayOf\(([^)]*)\)/)![1].replace(/\.0/g, '');
    const swiftHarmony = swift.match(/static let harmony = \[([^\]]*)\]/)![1].replace(/\.0/g, '');
    expect(numbers(swiftHarmony)).toEqual(numbers(kotlinHarmony));
    expect(numbers(kotlinHarmony)).toEqual([1.5, 1.25, 1.2]);
    // The shuffled bag has room for every kind.
    expect(gestures).toContain('private val bagA = IntArray(10)');
    expect(swift).toContain('private static var bagA = [Int](repeating: 0, count: 10)');
  });

  it('draws every trait the same way', () => {
    pairs([
      ['level = 1.0 + variety * (u(0) - 0.5) * 0.24', 'level = 1.0 + variety * (u(0) - 0.5) * 0.24'],
      ['if (u(3) < 0.35 + 0.5 * variety) rootRatio = Math.pow(2.0, -(1.0 + Math.floor(u(4) * 3.0)) / 12.0)', 'if u(3) < 0.35 + 0.5 * variety { rootRatio = pow(2.0, -(1.0 + (u(4) * 3.0).rounded(.down)) / 12.0) }'],
      ['floor = DEFAULT_FLOOR - 0.07 * variety; level *= 1.0 + 0.3 * variety', 'floor = Self.defaultFloor - 0.07 * variety'],
      ['second = 0.7 * variety; secondRatio = 0.5; secondPan = 0.0', 'second = 0.7 * variety'],
      ['KIND_SINKING -> glide = (1.0 + u(5) * 2.0) * variety', 'glide = (1.0 + u(5) * 2.0) * variety'],
      ['second = 0.55 * variety', 'second = 0.55 * variety'],
      ['secondRatio = HARMONY[min(2, (u(6) * 3.0).toInt())]', 'secondRatio = Self.harmony[min(2, Int(u(6) * 3.0))]'],
      ['secondPan = (if (u(7) < 0.5) -1.0 else 1.0) * 0.6', 'secondPan = (u(7) < 0.5 ? -1.0 : 1.0) * 0.6'],
      ['KIND_DRIFT -> drift = (0.6 + 0.8 * u(8)) * variety * (if (u(9) < 0.5) -1.0 else 1.0)', 'drift = (0.6 + 0.8 * u(8)) * variety * (u(9) < 0.5 ? -1.0 : 1.0)'],
      ['circleDirection = if (u(10) < 0.5) -1.0 else 1.0', 'circleDirection = u(10) < 0.5 ? -1.0 : 1.0'],
      ['distStart = 0.85 * variety', 'distStart = 0.85 * variety'],
      ['plateau = 1.0 - 0.5 * variety', 'plateau = 1.0 - 0.5 * variety'],
      ['level *= 0.78', 'level *= 0.78'],
      ['echoSend = 0.4 * variety', 'echoSend = 0.4 * variety'],
      ['floor = 0.03', 'floor = 0.03'],
    ]);
  });

  it('sings the long deep voice two octaves below the drone, the same in both engines', () => {
    const kotlinSemitones = Number(gestures.match(/const val DEEP_ECHO_SEMITONES = ([0-9.]+)/)![1]);
    const swiftSemitones = Number(swift.match(/static let deepEchoSemitones = ([0-9.]+)/)![1]);
    expect(kotlinSemitones).toBe(24);
    expect(swiftSemitones).toBe(kotlinSemitones);
    expect(gestures).toContain('rootRatio = Math.pow(2.0, -DEEP_ECHO_SEMITONES / 12.0)');
    expect(swift).toContain('rootRatio = pow(2.0, -Self.deepEchoSemitones / 12.0)');
  });

  it('shapes the voice the same way: pitch, second voice, approach, circling, swell and echo', () => {
    pairs([
      ['fundamental *= gesture.rootRatio * Math.pow(2.0, (-gesture.glide * progress + gesture.drift * sin(PI * 2.0 * progress)) / 12.0)', 'fundamental *= gesture.rootRatio * pow(2.0, (-gesture.glide * progress + gesture.drift * sin(Double.pi * 2 * progress)) / 12.0)'],
      ['secondPhases[index] = (secondPhases[index] + PI * 2.0 * fundamental * gesture.secondRatio * harmonic / rate) % (PI * 2.0)', 'secondPhases[index] = fmod(secondPhases[index] + Double.pi * 2 * fundamental * gesture.secondRatio * harmonic / rate, Double.pi * 2)'],
      ['rawLeft += singing * gesture.second * (1.0 - gesture.secondPan)', 'rawLeft += singing * gesture.second * (1.0 - gesture.secondPan)'],
      ['distance = gesture.distStart * (1.0 - travel)', 'distance = gesture.distStart * (1.0 - travel)'],
      ['val distanceCutoff = (340.0 + breath * 960.0) * (1.0 - 0.6 * distance)', 'let distanceCutoff = (340 + breath * 960) * (1.0 - 0.6 * distance)'],
      ['gesture.circleDirection * sin(PI * 2.0 * progress) * 0.8', 'gesture.circleDirection * sin(Double.pi * 2 * progress) * 0.8'],
      ['val swell = if (gesture.plateau == 1.0) breath else Math.pow(breath, gesture.plateau)', 'let swell = gesture.plateau == 1.0 ? breath : pow(breath, gesture.plateau)'],
      ['val length = min(size - 1, max(1, (rate * 5.5).toInt()))', 'let length = min(size - 1, max(1, Int(rate * 5.5)))'],
      ['echoBufferLeft[echoIndex] = moanLeft * gesture.echoSend + echoDampRight * 0.62', 'echoBufferLeft[echoIndex] = moanLeft * gesture.echoSend + echoDampRight * 0.62'],
      ['moanEchoLeft = echoDampLeft * 0.9', 'moanEchoLeft = echoDampLeft * 0.9'],
      ['moanLeft + moanSpaceLeft + moanEchoLeft + airLeft', 'moanLeft + moanSpaceLeft + moanEchoLeft + airLeft'],
    ]);
  });

  it('does no gesture work at variety 0, so Gentle is the voice exactly as it was', () => {
    expect(IDENTITY_FEEL_VARIETY.gentle).toBe(0);
    pairs([
      ['if (variety <= 0.0) {\n      if (!gestureNeutral)', 'if variety <= 0 {\n      if !gestureNeutral'],
      ['if (variety > 0.0) {\n      // The voice calls back to itself', 'if variety > 0 {\n      // The voice calls back to itself'],
      ['const val DEFAULT_FLOOR = 0.1', 'static let defaultFloor = 0.1'],
    ]);
  });

  it('clears the gesture state, second voice and echo when the model resets', () => {
    pairs([
      ['gestureSeed = seed xor 0x436f736dL', 'gestureSeed = seed ^ 0x436f736d'],
      ['gesture.neutral(); gestureCycle = -1L; gestureNeutral = true', 'gesture.neutral(); gestureCycle = -1; gestureNeutral = true'],
      ['echoBufferLeft.fill(0.0); echoBufferRight.fill(0.0); echoIndex = 0', 'for i in echoBufferLeft.indices { echoBufferLeft[i] = 0; echoBufferRight[i] = 0 }'],
    ]);
  });
});
