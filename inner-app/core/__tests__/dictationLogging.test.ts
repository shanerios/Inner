import { describe, expect, it } from '@jest/globals';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Dictated dreams are the most sensitive data in the app, and the speech library writes what it hears
 * to the Android system log. A patch keeps the words out of it; these checks fail if an install or an
 * upgrade ever brings the logging back.
 */
const ROOT = path.resolve(__dirname, '../..');
const SERVICE = path.join(ROOT, 'node_modules/expo-speech-recognition/android/src/main/java/expo/modules/speechrecognition/ExpoSpeechService.kt');
const PATCH = path.join(ROOT, 'patches/expo-speech-recognition+2.1.5.patch');

const logCalls = () => fs.readFileSync(SERVICE, 'utf8').split('\n').filter(line => /\blog\(/.test(line) && !/fun log\(/.test(line));

describe('dictation never reaches the system log', () => {
  it('logs only how many results arrived, never what they said', () => {
    const calls = logCalls();
    expect(calls.length).toBeGreaterThan(5);
    for (const line of calls) {
      expect(line).not.toMatch(/\$\{?(resultsList|nonEmptyStrings|partialResultsList|transcript|transcripts|results)\b(?!\.size)/);
      expect(line).not.toMatch(/joinToString/);
      expect(line).not.toMatch(/\$\{?strings\b(?!\.size)/);
    }
  });

  it('records a count for each kind of result', () => {
    const calls = logCalls().join('\n');
    expect(calls).toContain('log("onResults(), count: ${resultsList.size}")');
    expect(calls).toContain('log("onPartialResults(), count: ${nonEmptyStrings.size}")');
    expect(calls).toContain('log("onSegmentResults(), count: ${resultsList.size}")');
    expect(calls).toContain('log("biasing strings: ${strings.size} provided")');
  });

  it('is carried by a patch that touches only those four lines, applied on every install', () => {
    const patch = fs.readFileSync(PATCH, 'utf8');
    expect(patch.length).toBeLessThan(10_000);
    expect(patch.match(/^diff --git /gm)).toHaveLength(1);
    expect(patch.match(/^@@ /gm)).toHaveLength(4);
    expect(patch).not.toMatch(/\/build\//);
    expect((patch.match(/^-[^-]/gm) ?? []).length).toBe(4);
    expect((patch.match(/^\+[^+]/gm) ?? []).length).toBe(4);
    const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
    expect(pkg.scripts.postinstall).toContain('patch-package');
  });

  it('is tied to the version it was made for, so an upgrade has to be re-checked', () => {
    const installed = JSON.parse(fs.readFileSync(path.join(ROOT, 'node_modules/expo-speech-recognition/package.json'), 'utf8')).version;
    expect(path.basename(PATCH)).toBe(`expo-speech-recognition+${installed}.patch`);
  });
});
