import { describe, expect, it, jest } from '@jest/globals';
import * as fs from 'fs';
import * as path from 'path';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('expo-av', () => ({ Audio: { Sound: { createAsync: jest.fn() } } }));

import {
  RECOGNITION_SIGNAL_TRIM_DB,
  RECOGNITION_SIGNALS,
  recognitionSignalGain,
  type RecognitionSignalId,
} from '../../recognitionSignals';

/**
 * Recognition Signals must arrive at the mix at similar loudness. Ascending Tone
 * is synthesized natively (so its level is measured from the engine and recorded
 * below); the other three are WAV assets, measured here directly from the files.
 */

const ROOT = path.resolve(__dirname, '../../..');
const SOUNDS = path.join(ROOT, 'assets/sounds');
const ENGINE_RATE = 48_000;
/** Native engines play WAV signals at file level x this factor (Kotlin nextCue / Swift nextCue). */
const WAV_PLAYBACK_FACTOR = 1.45;
/** Ascending Tone as the engine synthesizes it, before trim. Re-measure if the native constants change. */
const ASCENDING_SYNTH_LU = -4.9;
/** Every signal should land in -21 to -22 LU at the mix: centre, and the half-width allowed around it. */
const TARGET_LU = -21.5;
const TARGET_HALF_WINDOW_DB = 0.75;

const WAV_FILES: Partial<Record<RecognitionSignalId, string>> = {
  bell: 'signal_bell.wav',
  chimes: 'signal_chimes.wav',
  droplets: 'signal_droplets.wav',
};

function readMonoWav(file: string): { samples: Float64Array; rate: number } {
  const buffer = fs.readFileSync(file);
  let offset = 12;
  let rate = 0;
  let dataStart = -1;
  let dataSize = 0;
  while (offset + 8 <= buffer.length) {
    const id = buffer.toString('ascii', offset, offset + 4);
    const size = buffer.readUInt32LE(offset + 4);
    const body = offset + 8;
    if (id === 'fmt ') {
      expect(buffer.readUInt16LE(body)).toBe(1); // PCM
      expect(buffer.readUInt16LE(body + 2)).toBe(1); // mono
      expect(buffer.readUInt16LE(body + 14)).toBe(16); // 16-bit
      rate = buffer.readUInt32LE(body + 4);
    } else if (id === 'data') {
      dataStart = body;
      dataSize = size;
    }
    offset = body + size + (size & 1);
  }
  const count = dataSize / 2;
  const samples = new Float64Array(count);
  for (let i = 0; i < count; i += 1) samples[i] = buffer.readInt16LE(dataStart + i * 2) / 32768;
  return { samples, rate };
}

/** Linear resample to the engine rate, as the native cue path does. */
function toEngineRate(samples: Float64Array, rate: number): Float64Array {
  const count = Math.floor((samples.length / rate) * ENGINE_RATE);
  const out = new Float64Array(count);
  for (let i = 0; i < count; i += 1) {
    const position = (i * rate) / ENGINE_RATE;
    const lower = Math.min(samples.length - 1, Math.floor(position));
    const upper = Math.min(samples.length - 1, lower + 1);
    const fraction = position - lower;
    out[i] = samples[lower] * (1 - fraction) + samples[upper] * fraction;
  }
  return out;
}

function biquad(input: Float64Array, b: number[], a: number[]): Float64Array {
  const out = new Float64Array(input.length);
  let z1 = 0;
  let z2 = 0;
  for (let i = 0; i < input.length; i += 1) {
    const y = b[0] * input[i] + z1;
    z1 = b[1] * input[i] - a[1] * y + z2;
    z2 = b[2] * input[i] - a[2] * y;
    out[i] = y;
  }
  return out;
}

/** BS.1770 K-weighted loudness (48 kHz), gated 20 dB below the loudest 400 ms block. */
function kWeightedLoudness(samples: Float64Array): number {
  const stage1 = biquad(samples, [1.53512485958697, -2.69169618940638, 1.19839281085285], [1, -1.69065929318241, 0.73248077421585]);
  const weighted = biquad(stage1, [1, -2, 1], [1, -1.99004745483398, 0.99007225036621]);
  const block = Math.floor(0.4 * ENGINE_RATE);
  const step = Math.floor(block / 4);
  const energies: number[] = [];
  for (let start = 0; start < Math.max(1, weighted.length - block); start += step) {
    let sum = 0;
    for (let i = start; i < start + block && i < weighted.length; i += 1) sum += weighted[i] * weighted[i];
    const mean = sum / block;
    if (mean > 0) energies.push(mean);
  }
  const loudness = (energy: number) => -0.691 + 10 * Math.log10(energy);
  const loudest = Math.max(...energies.map(loudness));
  const kept = energies.filter(energy => loudness(energy) > loudest - 20);
  return loudness(kept.reduce((total, energy) => total + energy, 0) / kept.length);
}

function wavLevelAtMix(id: RecognitionSignalId): number {
  const { samples, rate } = readMonoWav(path.join(SOUNDS, WAV_FILES[id]!));
  const scaled = toEngineRate(samples, rate).map(value => value * WAV_PLAYBACK_FACTOR);
  return kWeightedLoudness(scaled);
}

function levelAtMix(id: RecognitionSignalId): number {
  return id === 'ascending' ? ASCENDING_SYNTH_LU : wavLevelAtMix(id);
}

describe('recognition signal loudness', () => {
  it('measures the WAV signals the way the engine rendered them', () => {
    // Values from rendering each signal through the real Kotlin engine.
    expect(wavLevelAtMix('bell')).toBeCloseTo(-18.4, 0);
    expect(wavLevelAtMix('chimes')).toBeCloseTo(-25.2, 0);
    expect(wavLevelAtMix('droplets')).toBeCloseTo(-24.0, 0);
  });

  it('defines a trim for every signal, within what the native engines allow', () => {
    for (const { id } of RECOGNITION_SIGNALS) {
      expect(Number.isFinite(RECOGNITION_SIGNAL_TRIM_DB[id])).toBe(true);
      // Native engines clamp gain to [0, 2] (+6 dB).
      expect(recognitionSignalGain(id)).toBeGreaterThan(0);
      expect(recognitionSignalGain(id)).toBeLessThanOrEqual(2);
    }
  });

  it('converts trims to linear gain', () => {
    expect(recognitionSignalGain('ascending')).toBeCloseTo(0.1479, 3);
    expect(recognitionSignalGain('bell')).toBeCloseTo(0.6998, 3);
    expect(recognitionSignalGain('chimes')).toBeCloseTo(1.531, 3);
    expect(recognitionSignalGain('droplets')).toBeCloseTo(1.3335, 3);
  });

  it('brings Ascending Tone far below its untrimmed level, which read as an alarm', () => {
    expect(RECOGNITION_SIGNAL_TRIM_DB.ascending).toBeLessThan(-12);
  });

  it('lands every signal in the -21 to -22 LU target window', () => {
    for (const { id } of RECOGNITION_SIGNALS) {
      const level = levelAtMix(id) + RECOGNITION_SIGNAL_TRIM_DB[id];
      expect(Math.abs(level - TARGET_LU)).toBeLessThanOrEqual(TARGET_HALF_WINDOW_DB);
    }
  });

  it('would fail without the trims (the original 20 dB spread)', () => {
    const levels = RECOGNITION_SIGNALS.map(({ id }) => levelAtMix(id));
    expect(Math.max(...levels) - Math.min(...levels)).toBeGreaterThan(15);
  });
});

describe('native cue constants', () => {
  const kotlin = fs.readFileSync(path.join(ROOT, 'modules/inner-audio/android/src/main/java/expo/modules/inneraudio/ProceduralAudioEngine.kt'), 'utf8');
  const swift = fs.readFileSync(path.join(ROOT, 'modules/inner-audio/ios/InnerAudioModule.swift'), 'utf8');

  it('keep the synthesized-cue output gain identical on both platforms and equal to what was measured', () => {
    const kotlinGain = Number(/CUE_OUTPUT_GAIN\s*=\s*([0-9.]+)/.exec(kotlin)?.[1]);
    const swiftGain = Number(/cueOutputGain\s*=\s*([0-9.]+)/.exec(swift)?.[1]);
    expect(kotlinGain).toBe(swiftGain);
    // ASCENDING_SYNTH_LU above was measured at this value; if it changes, re-measure and update both.
    expect(kotlinGain).toBe(0.2925);
  });

  it('apply the same playback factor to WAV signals on both platforms', () => {
    expect(kotlin).toMatch(/sample \* 1\.45 \* activeCueGain/);
    expect(swift).toMatch(/sample \* 1\.45 \* activeCueGain/);
  });

  it('apply the per-signal gain to the synthesized cue on both platforms', () => {
    expect(kotlin).toMatch(/CUE_OUTPUT_GAIN \* activeCueGain/);
    expect(swift).toMatch(/cueOutputGain \* activeCueGain/);
  });

  it('bound the per-signal gain identically on both platforms', () => {
    expect(kotlin).toMatch(/clamp\(gain, 0\.0, 2\.0\)/);
    expect(swift).toMatch(/min\(2, max\(0, gain\)\)/);
  });
});
