import { describe, expect, it } from '@jest/globals';
import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.resolve(__dirname, '../../..');
const kotlin = fs.readFileSync(path.join(ROOT, 'modules/inner-audio/android/src/main/java/expo/modules/inneraudio/CosmicModel.kt'), 'utf8');
const swift = fs.readFileSync(path.join(ROOT, 'modules/inner-audio/ios/InnerAudioModule.swift'), 'utf8');

const numbers = (text: string) => text.split(',').map(part => Number(part.trim()));

/** The number assigned to a named constant, e.g. `const val NAME = 0.5` or `private static let name = 0.5`. */
function scalar(source: string, name: string): number {
  const match = source.match(new RegExp(`(?:const val|static let) ${name} = (-?[0-9.]+)`));
  expect(match).not.toBeNull();
  return Number(match![1]);
}

/** The list assigned to a named constant, e.g. `doubleArrayOf(1, 2)` or `[1, 2]`. */
function list(source: string, name: string): number[] {
  const match = source.match(new RegExp(`(?:val|static let) ${name} = (?:doubleArrayOf\\(|\\[)([^)\\]]+)`));
  expect(match).not.toBeNull();
  return numbers(match![1]);
}

describe('Cosmic voice: the drone and its reverb match in Kotlin and Swift', () => {
  it('uses the same constants', () => {
    expect(scalar(swift, 'moanDetune')).toBe(scalar(kotlin, 'MOAN_DETUNE'));
    expect(scalar(swift, 'moanSpaceDecaySeconds')).toBe(scalar(kotlin, 'MOAN_SPACE_DECAY_SECONDS'));
    expect(scalar(swift, 'moanSpaceDamping')).toBe(scalar(kotlin, 'MOAN_SPACE_DAMPING'));
    expect(scalar(swift, 'moanSpaceSend')).toBe(scalar(kotlin, 'MOAN_SPACE_SEND'));
    expect(scalar(swift, 'moanSpaceWet')).toBe(scalar(kotlin, 'MOAN_SPACE_WET'));
    expect(list(swift, 'moanSpaceDelays')).toEqual(list(kotlin, 'MOAN_SPACE_DELAYS'));
    expect(list(swift, 'moanSpaceInput')).toEqual(list(kotlin, 'MOAN_SPACE_INPUT'));
    expect(list(swift, 'moanWeights')).toEqual(list(kotlin, 'MOAN_WEIGHTS'));
  });

  it('keeps the voice a slow shimmer rather than a pulse, with a deep recede', () => {
    // The two copies of each partial beat at 2 x detune x frequency: the 720 Hz partial must stay under 0.5 Hz.
    expect(2 * scalar(kotlin, 'MOAN_DETUNE') * 720).toBeLessThan(0.5);
    // A breath with no gesture keeps the designed 0.1 floor.
    expect(kotlin).toContain('0.1 + breath * 0.9 else');
    expect(swift).toContain('0.1 + breath * 0.9 : gesture.floor');
    expect(kotlin).toContain('fundamental * harmonic * (1.0 - MOAN_DETUNE) / rate');
    expect(kotlin).toContain('fundamental * harmonic * (1.0 + MOAN_DETUNE) / rate');
    expect(swift).toContain('fundamental * harmonic * (1.0 - Self.moanDetune) / rate');
    expect(swift).toContain('fundamental * harmonic * (1.0 + Self.moanDetune) / rate');
  });

  it('feeds the reverb at a steady level so the room keeps ringing as the voice recedes', () => {
    expect(kotlin).toContain('val level = envelope * distancePresence * baseLevel * gesture.level * (1.0 - 0.55 * distance)');
    expect(kotlin).toContain('renderMoanSpace((moanDistanceLeft + moanDistanceRight) * 0.5 * baseLevel * gesture.level * MOAN_SPACE_SEND * (1.0 + 1.2 * distance))');
    expect(swift).toContain('let level = envelope * distancePresence * baseLevel * gesture.level * (1.0 - 0.55 * distance)');
    expect(swift).toContain('renderMoanSpace((moanDistanceLeft + moanDistanceRight) * 0.5 * baseLevel * gesture.level * Self.moanSpaceSend * (1.0 + 1.2 * distance))');
    // The reverb input carries presence and the density gate but not the breath envelope.
    expect(kotlin).toContain('val baseLevel = (0.11 + intensity * 0.055) * identityPresence * moanGate');
    expect(swift).toContain('let baseLevel = (0.11 + intensity * 0.055) * identityPresence * moanGate');
  });

  it('mixes the wet signal into both channels and computes loop gains once, not per sample', () => {
    expect(kotlin).toContain('moanLeft + moanSpaceLeft +');
    expect(kotlin).toContain('moanRight + moanSpaceRight +');
    expect(swift).toContain('moanLeft + moanSpaceLeft +');
    expect(swift).toContain('moanRight + moanSpaceRight +');
    expect(kotlin).toMatch(/val MOAN_SPACE_GAINS = DoubleArray\(4\) \{ Math\.pow\(10\.0, -3\.0 \* MOAN_SPACE_DELAYS\[it\] \/ MOAN_SPACE_DECAY_SECONDS\) \}/);
    expect(swift).toContain('moanSpaceGains = moanSpaceDelays.map { pow(10.0, -3.0 * $0 / moanSpaceDecaySeconds) }');
    expect(kotlin).not.toMatch(/renderMoanSpace[\s\S]{0,900}Math\.pow/);
  });

  it('clears the reverb whenever the model resets, so one night never rings into the next', () => {
    expect(kotlin).toContain('for (line in moanSpaceLines) line.fill(0.0)');
    expect(kotlin).toContain('moanSpaceLeft = 0.0; moanSpaceRight = 0.0');
    expect(swift).toContain('for line in moanSpaceLines.indices { for i in moanSpaceLines[line].indices { moanSpaceLines[line][i] = 0 } }');
    expect(swift).toContain('moanSpaceLeft = 0; moanSpaceRight = 0');
  });
});
