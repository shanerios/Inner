import { describe, expect, it, jest } from '@jest/globals';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { execFileSync } from 'child_process';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('expo-av', () => ({ Audio: { Sound: { createAsync: jest.fn() } } }));

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

  describe('--write', () => {
    const source = (inside: string) => `export const VOICE_TRIM_DB: Record<string, number> = {\n  // voice-trim:begin\n${inside}  // voice-trim:end\n};\nexport const OTHER = 1;\n`;

    it('replaces only the block between the markers, with the measured trims', () => {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'voice-measure-'));
      writeWav(path.join(dir, 'voice-prep-water-1.wav'), [tone(3, 0.1)]);
      writeWav(path.join(dir, 'voice-prep-water-2.wav'), [tone(3, 0.05)]);
      const file = path.join(dir, 'voiceGuidance.ts');
      fs.writeFileSync(file, source("  'old-1': 9.9,\n"));
      const output = run(dir, '--target', '-24', '--write', '--trim-file', file);
      const written = fs.readFileSync(file, 'utf8');
      expect(output).toContain('Wrote 2 trims');
      expect(written).toMatch(/\/\/ voice-trim:begin\n  'water-1': -?[0-9.]+,\n  'water-2': -?[0-9.]+,\n  \/\/ voice-trim:end/);
      expect(written).not.toContain('old-1');
      expect(written.endsWith('export const OTHER = 1;\n')).toBe(true);
      // The file stays valid TypeScript when evaluated.
      const table = new Function(`${written.replace(/export const (\w+)(: [^=]+)? =/g, 'var $1 =')}; return VOICE_TRIM_DB;`)();
      expect(Object.keys(table)).toEqual(['water-1', 'water-2']);
    });

    it('is repeatable: running it twice gives the same file', () => {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'voice-measure-'));
      writeWav(path.join(dir, 'voice-prep-water-1.wav'), [tone(3, 0.1)]);
      const file = path.join(dir, 'voiceGuidance.ts');
      fs.writeFileSync(file, source(''));
      run(dir, '--write', '--trim-file', file);
      const once = fs.readFileSync(file, 'utf8');
      run(dir, '--write', '--trim-file', file);
      expect(fs.readFileSync(file, 'utf8')).toBe(once);
    });

    it('refuses a file without the markers and leaves it unchanged', () => {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'voice-measure-'));
      writeWav(path.join(dir, 'voice-prep-water-1.wav'), [tone(3, 0.1)]);
      const file = path.join(dir, 'other.ts');
      fs.writeFileSync(file, 'export const VOICE_TRIM_DB = {};\n');
      expect(() => run(dir, '--write', '--trim-file', file)).toThrow();
      expect(fs.readFileSync(file, 'utf8')).toBe('export const VOICE_TRIM_DB = {};\n');
    });

    it('leaves clips that are already on target out of the table', () => {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'voice-measure-'));
      writeWav(path.join(dir, 'voice-prep-water-1.wav'), [tone(3, 0.1)]);
      const target = loudness.measureClip(path.join(dir, 'voice-prep-water-1.wav')).atMixLu;
      writeWav(path.join(dir, 'voice-prep-water-2.wav'), [tone(3, 0.05)]);
      const file = path.join(dir, 'voiceGuidance.ts');
      fs.writeFileSync(file, source("  'old-1': 9.9,\n"));
      run(dir, '--target', String(target), '--write', '--trim-file', file);
      const written = fs.readFileSync(file, 'utf8');
      expect(written).not.toContain('water-1');
      expect(written).not.toContain('-0.0');
      expect(written).toContain("'water-2':");
    });

    it('does not touch any file unless asked', () => {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'voice-measure-'));
      writeWav(path.join(dir, 'voice-prep-water-1.wav'), [tone(3, 0.1)]);
      const file = path.join(dir, 'voiceGuidance.ts');
      fs.writeFileSync(file, source(''));
      run(dir, '--trim-file', file);
      expect(fs.readFileSync(file, 'utf8')).toBe(source(''));
    });

    it('leaves the real source with its markers in place', () => {
      const real = fs.readFileSync(path.join(ROOT, 'core/audio/voiceGuidance.ts'), 'utf8');
      expect(real).toContain('// voice-trim:begin');
      expect(real.indexOf('// voice-trim:begin')).toBeLessThan(real.indexOf('// voice-trim:end'));
    });
  });
});

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { planGain } = require('../../../scripts/normalize-voice-clips') as {
  planGain(measurement: { atMixLu: number; peakDb: number }, target: number): { gainDb: number; limited: boolean };
};
const NORMALIZE = path.join(ROOT, 'scripts/normalize-voice-clips.js');
const hasFfmpeg = (() => { try { execFileSync('ffmpeg', ['-version'], { stdio: 'ignore' }); return true; } catch { return false; } })();

describe('level matching', () => {
  it('plans the gain that closes the gap to the target', () => {
    expect(planGain({ atMixLu: -27.7, peakDb: -15.6 }, -24)).toEqual({ gainDb: expect.closeTo(3.7, 5), limited: false });
    expect(planGain({ atMixLu: -23.5, peakDb: -12.7 }, -24).gainDb).toBeCloseTo(-0.5, 5);
  });

  it('holds the gain back rather than push the peak over -1 dB', () => {
    const plan = planGain({ atMixLu: -30, peakDb: -4 }, -24);
    expect(plan.limited).toBe(true);
    expect(plan.gainDb).toBeCloseTo(3, 5);
    expect(planGain({ atMixLu: -30, peakDb: 0 }, -24)).toEqual({ gainDb: 0, limited: true });
  });

  const maybe = hasFfmpeg ? describe : describe.skip;
  maybe('the normalize command (needs ffmpeg)', () => {
    const run = (...args: string[]) => execFileSync('node', [NORMALIZE, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });

    it('brings differently loud clips to the same level in a new folder and leaves the originals alone', () => {
      const input = fs.mkdtempSync(path.join(os.tmpdir(), 'voice-in-'));
      const output = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'voice-out-')), 'matched');
      writeWav(path.join(input, 'voice-prep-water-1.wav'), [tone(4, 0.2)]);
      writeWav(path.join(input, 'voice-prep-water-2.wav'), [tone(4, 0.04)]);
      writeWav(path.join(input, 'voice-prep-water-3.wav'), [tone(4, 0.09)]);
      const originals = fs.readdirSync(input).map(name => [name, fs.readFileSync(path.join(input, name))] as const);
      const before = originals.map(([name]) => loudness.measureClip(path.join(input, name)).atMixLu);
      expect(Math.max(...before) - Math.min(...before)).toBeGreaterThan(10);

      const text = run(input, output, '--target', '-24');
      const after = originals.map(([name]) => loudness.measureClip(path.join(output, name)).atMixLu);
      for (const level of after) expect(Math.abs(level - -24)).toBeLessThan(0.5);
      expect(text).toContain('Your originals were not changed');
      for (const [name, bytes] of originals) expect(fs.readFileSync(path.join(input, name)).equals(bytes)).toBe(true);
    });

    it('converts to a lower rate, mono, 16-bit, and shrinks the files', () => {
      const input = fs.mkdtempSync(path.join(os.tmpdir(), 'voice-in-'));
      const output = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'voice-out-')), 'small');
      writeWav(path.join(input, 'voice-prep-water-1.wav'), [tone(4, 0.1)], 44_100);
      run(input, output, '--rate', '24000');
      const converted = loudness.measureClip(path.join(output, 'voice-prep-water-1.wav'));
      expect(converted.rate).toBe(24_000);
      expect(converted.channels).toBe(1);
      expect(fs.statSync(path.join(output, 'voice-prep-water-1.wav')).size).toBeLessThan(fs.statSync(path.join(input, 'voice-prep-water-1.wav')).size * 0.6);
    });

    it('refuses to write into the input folder or inside it, and for bad arguments', () => {
      const input = fs.mkdtempSync(path.join(os.tmpdir(), 'voice-in-'));
      writeWav(path.join(input, 'voice-prep-water-1.wav'), [tone(2, 0.1)]);
      const before = fs.readFileSync(path.join(input, 'voice-prep-water-1.wav'));
      expect(() => run(input, input)).toThrow();
      expect(() => run(input, path.join(input, 'inside'))).toThrow();
      expect(() => run(input)).toThrow();
      expect(() => run(input, path.join(os.tmpdir(), 'x'), '--rate', '5')).toThrow();
      expect(fs.readFileSync(path.join(input, 'voice-prep-water-1.wav')).equals(before)).toBe(true);
    });
  });
});

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { buildManifest } = require('../../../scripts/voice-manifest') as {
  buildManifest(files: string[], existing: Record<string, number>, bump: string[]): { manifest: { version: number; clips: Record<string, number> }; incomplete: string[]; unknown: string[] };
};
const MANIFEST = path.join(ROOT, 'scripts/voice-manifest.js');

describe('the manifest command', () => {
  const trio = (slug: string) => [1, 2, 3].map(slot => `voice-prep-${slug}-${slot}.wav`);

  it('lists every clip at revision 1, and ignores other files', () => {
    const { manifest } = buildManifest([...trio('flying'), ...trio('familiar-person'), 'notes.txt', 'manifest.json', 'voice-prep-bad.wav'], {}, []);
    expect(Object.keys(manifest.clips)).toHaveLength(6);
    expect(manifest.clips['voice-prep-familiar-person-2']).toBe(1);
    expect(manifest.version).toBe(1);
  });

  it('keeps existing revisions and bumps only the clips asked for', () => {
    const existing = { 'voice-prep-flying-1': 3, 'voice-prep-flying-2': 1 };
    const { manifest } = buildManifest(trio('flying'), existing, ['voice-prep-flying-2']);
    expect(manifest.clips).toEqual({ 'voice-prep-flying-1': 3, 'voice-prep-flying-2': 2, 'voice-prep-flying-3': 1 });
  });

  it('warns about a sign with fewer than three clips, and about a bump for a missing clip', () => {
    const files = [...trio('flying'), 'voice-prep-water-1.wav', 'voice-prep-water-3.wav'];
    const result = buildManifest(files, {}, ['voice-prep-lost-1']);
    expect(result.incomplete).toEqual(['water (has 1, 3)']);
    expect(result.unknown).toEqual(['voice-prep-lost-1']);
  });

  it('writes a manifest the app accepts, and is repeatable', () => {
    const { parseVoiceManifest } = jest.requireActual('../voiceClips') as typeof import('../voiceClips');
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'voice-manifest-'));
    for (const name of [...trio('flying'), ...trio('generic')]) writeWav(path.join(dir, name), [tone(1, 0.1)]);
    execFileSync('node', [MANIFEST, dir], { encoding: 'utf8' });
    const first = fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8');
    const parsed = parseVoiceManifest(first);
    expect(Object.keys(parsed!.clips)).toHaveLength(6);
    execFileSync('node', [MANIFEST, dir], { encoding: 'utf8' });
    expect(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8')).toBe(first);
    execFileSync('node', [MANIFEST, dir, '--bump', 'voice-prep-flying-1'], { encoding: 'utf8' });
    expect(parseVoiceManifest(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8'))!.clips['voice-prep-flying-1']).toBe(2);
    expect(() => execFileSync('node', [MANIFEST, '/no/such/folder'], { stdio: 'ignore' })).toThrow();
  });
});
