import { describe, expect, it } from '@jest/globals';
import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.resolve(__dirname, '../../..');
const kotlin = fs.readFileSync(path.join(ROOT, 'modules/inner-audio/android/src/main/java/expo/modules/inneraudio/ProceduralAudioEngine.kt'), 'utf8');
const swift = fs.readFileSync(path.join(ROOT, 'modules/inner-audio/ios/InnerAudioModule.swift'), 'utf8');

/** The body of the engine's top-level reset, which ends at the first closing brace indented two spaces. */
function resetBody(source: string, signature: string): string {
  const start = source.indexOf(signature);
  expect(start).toBeGreaterThan(-1);
  const end = source.indexOf('\n  }\n', start);
  expect(end).toBeGreaterThan(start);
  return source.slice(start, end);
}

function envelopes(source: string): string[] {
  return [...source.matchAll(/^ {2}private var (\w+Envelope) = 0\.0$/gm)].map(match => match[1]);
}

describe('engine reset clears every world envelope', () => {
  // A world whose envelope survives reset() starts the next session already faded in, and a different
  // world's next session then carries its tail: an Ocean session after an Abyssal one heard the Abyssal bed.
  it('Kotlin', () => {
    const body = resetBody(kotlin, '  fun reset() {');
    const names = envelopes(kotlin);
    expect(names).toEqual(expect.arrayContaining(['oceanEnvelope', 'abyssalEnvelope', 'templeSpaceEnvelope']));
    for (const name of names) expect(body).toMatch(new RegExp(`\\b${name} = 0\\.0\\b`));
  });

  // The Swift engine clears its state in stop().
  it('Swift', () => {
    const body = resetBody(swift, '  func stop(reason: String = "stop_request") {');
    const names = envelopes(swift);
    expect(names).toEqual(expect.arrayContaining(['oceanEnvelope', 'abyssalEnvelope', 'templeSpaceEnvelope']));
    for (const name of names) expect(body).toMatch(new RegExp(`\\b${name} = 0\\b`));
  });
});
