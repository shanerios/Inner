import { describe, expect, it } from '@jest/globals';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { execFileSync } from 'child_process';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const loudness = require('../../../scripts/lib/loudness') as {
  measureClip(file: string): { atMixLu: number; fileLufs: number; peakDb: number; seconds: number; rate: number; channels: number };
  PLAYBACK_FACTOR: number;
};

const ROOT = path.resolve(__dirname, '../../..');
const SCRIPT = path.join(ROOT, 'scripts/measure-voice-clips.js');

function writeWav(file: string, samples: Float64Array[], rate = 44_100, bits = 16): void {
  const channels = samples.length;
  const frames = samples[0].length;
  const bytes = bits / 8;
  const data = Buffer.alloc(frames * channels * bytes);
  for (let i = 0; i < frames; i += 1) {
    for (let c = 0; c < channels; c += 1) {
      const value = Math.max(-1, Math.min(1, samples[c][i]));
      if (bits === 16) data.writeInt16LE(Math.round(value * 32767), (i * channels + c) * 2);
      else data.writeIntLE(Math.round(value * 8388607), (i * channels + c) * 3, 3);
    }
  }
  const header = Buffer.alloc(44);
  header.write('RIFF', 0); header.writeUInt32LE(36 + data.length, 4); header.write('WAVE', 8);
  header.write('fmt ', 12); header.writeUInt32LE(16, 16); header.writeUInt16LE(1, 20); header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(rate, 24); header.writeUInt32LE(rate * channels * bytes, 28); header.writeUInt16LE(channels * bytes, 32); header.writeUInt16LE(bits, 34);
  header.write('data', 36); header.writeUInt32LE(data.length, 40);
  fs.writeFileSync(file, Buffer.concat([header, data]));
}

const tone = (seconds: number, amplitude: number, rate = 44_100) =>
  Float64Array.from({ length: Math.floor(seconds * rate) }, (_, i) => Math.sin((2 * Math.PI * 440 * i) / rate) * amplitude);


describe('voice loudness measurement', () => {
  it('reproduces the levels the recognition signals were set from', () => {
    // The same values the signal-level test pins, measured through this tool.
    const sounds = path.join(ROOT, 'assets/sounds');
    expect(loudness.measureClip(path.join(sounds, 'signal_bell.wav')).atMixLu).toBeCloseTo(-18.4, 0);
    expect(loudness.measureClip(path.join(sounds, 'signal_chimes.wav')).atMixLu).toBeCloseTo(-25.2, 0);
    expect(loudness.measureClip(path.join(sounds, 'signal_droplets.wav')).atMixLu).toBeCloseTo(-24.0, 0);
  });

  it('reads twice the amplitude as 6 dB louder, and applies the engine playback factor', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'voice-measure-'));
    writeWav(path.join(dir, 'quiet.wav'), [tone(3, 0.05)]);
    writeWav(path.join(dir, 'loud.wav'), [tone(3, 0.1)]);
    const quiet = loudness.measureClip(path.join(dir, 'quiet.wav'));
    const loud = loudness.measureClip(path.join(dir, 'loud.wav'));
    expect(loud.fileLufs - quiet.fileLufs).toBeCloseTo(6.02, 1);
    expect(quiet.atMixLu - quiet.fileLufs).toBeCloseTo(20 * Math.log10(loudness.PLAYBACK_FACTOR), 1);
    expect(quiet.peakDb).toBeCloseTo(20 * Math.log10(0.05), 1);
    expect(quiet.channels).toBe(1);
    expect(quiet.rate).toBe(44_100);
  });

  it('measures a stereo clip as the single centered channel the engine plays', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'voice-measure-'));
    const samples = tone(3, 0.1);
    writeWav(path.join(dir, 'mono.wav'), [samples]);
    writeWav(path.join(dir, 'stereo.wav'), [samples, samples]);
    expect(loudness.measureClip(path.join(dir, 'stereo.wav')).atMixLu).toBeCloseTo(loudness.measureClip(path.join(dir, 'mono.wav')).atMixLu, 1);
  });

  it('gives the same level at any sample rate', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'voice-measure-'));
    writeWav(path.join(dir, 'a.wav'), [tone(3, 0.1, 44_100)], 44_100);
    writeWav(path.join(dir, 'b.wav'), [tone(3, 0.1, 24_000)], 24_000);
    expect(loudness.measureClip(path.join(dir, 'a.wav')).atMixLu).toBeCloseTo(loudness.measureClip(path.join(dir, 'b.wav')).atMixLu, 0);
  });

  it('explains a file it cannot read instead of guessing', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'voice-measure-'));
    writeWav(path.join(dir, 'deep.wav'), [tone(1, 0.1)], 44_100, 24);
    fs.writeFileSync(path.join(dir, 'text.wav'), 'not audio');
    expect(() => loudness.measureClip(path.join(dir, 'deep.wav'))).toThrow(/16-bit PCM/);
    expect(() => loudness.measureClip(path.join(dir, 'text.wav'))).toThrow(/not a WAV/);
  });
});

describe('the measuring command', () => {
  const run = (...args: string[]) => execFileSync('node', [SCRIPT, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });

  it('suggests the trim that brings each clip to the target', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'voice-measure-'));
    writeWav(path.join(dir, 'voice-prep-water-1.wav'), [tone(3, 0.1)]);
    writeWav(path.join(dir, 'voice-prep-water-2.wav'), [tone(3, 0.05)]);
    const first = loudness.measureClip(path.join(dir, 'voice-prep-water-1.wav'));
    const output = run(dir, '--target', '-24');
    const expected = (-24 - first.atMixLu).toFixed(1);
    expect(output).toContain(`'water-1': ${expected},`);
    // The quieter clip needs about 6 dB more.
    const trims = Object.fromEntries([...output.matchAll(/'(water-\d)': (-?[0-9.]+),/g)].map(match => [match[1], Number(match[2])]));
    expect(trims['water-2'] - trims['water-1']).toBeCloseTo(6.0, 0);
    expect(output).toContain('-21.5');
  });

  it('flags a clip that needs more than the app can apply, skips other files, and reports unreadable ones', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'voice-measure-'));
    writeWav(path.join(dir, 'voice-prep-water-1.wav'), [tone(3, 0.001)]);
    writeWav(path.join(dir, 'notes.wav'), [tone(1, 0.1)]);
    writeWav(path.join(dir, 'voice-prep-water-3.wav'), [tone(1, 0.1)], 44_100, 24);
    const output = run(dir);
    expect(output).toMatch(/beyond the \+\/-6 dB the app can apply/);
    expect(output).toContain('Skipped');
    expect(output).toContain('notes.wav');
    expect(output).toContain('Could not read');
    expect(output).toContain('16-bit PCM');
  });

  it('projects the size of a full set and suggests a lower rate when it is heavy', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'voice-measure-'));
    writeWav(path.join(dir, 'voice-prep-water-1.wav'), [tone(10, 0.1)]);
    const output = run(dir);
    expect(output).toMatch(/A full set of 33 would be about \d+ MB/);
    expect(output).toContain('24 kHz mono');
  });

  it('exits with a usage message for a missing folder', () => {
    expect(() => run('/no/such/folder')).toThrow();
    expect(() => run()).toThrow();
  });
});
