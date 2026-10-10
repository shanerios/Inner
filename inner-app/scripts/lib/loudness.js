'use strict';
const fs = require('fs');

/**
 * Loudness measured the way the native engines play audio: resample to the engine rate, apply the
 * playback factor, K-weight (BS.1770) and gate 20 dB below the loudest 400 ms block. This is the
 * same method that set the recognition-signal trims, so voice and signals can be compared directly.
 */
const ENGINE_RATE = 48_000;
/** Native engines play recorded clips at file level times this factor (signals and voice alike). */
const PLAYBACK_FACTOR = 1.45;

function readWav(file) {
  const buffer = fs.readFileSync(file);
  if (buffer.length < 44 || buffer.toString('ascii', 0, 4) !== 'RIFF' || buffer.toString('ascii', 8, 12) !== 'WAVE') {
    throw new Error('not a WAV file');
  }
  let offset = 12;
  let format = 0;
  let channelCount = 0;
  let rate = 0;
  let bits = 0;
  let dataStart = -1;
  let dataSize = 0;
  while (offset + 8 <= buffer.length) {
    const id = buffer.toString('ascii', offset, offset + 4);
    const size = buffer.readUInt32LE(offset + 4);
    const body = offset + 8;
    if (body + size > buffer.length && id !== 'data') break;
    if (id === 'fmt ') {
      format = buffer.readUInt16LE(body);
      channelCount = buffer.readUInt16LE(body + 2);
      rate = buffer.readUInt32LE(body + 4);
      bits = buffer.readUInt16LE(body + 14);
    } else if (id === 'data') {
      dataStart = body;
      dataSize = Math.min(size, buffer.length - body);
    }
    offset = body + size + (size & 1);
  }
  if (format !== 1 || bits !== 16) {
    throw new Error(`needs 16-bit PCM WAV (this file is format ${format}, ${bits}-bit); export it as 16-bit PCM`);
  }
  if (channelCount !== 1 && channelCount !== 2) throw new Error(`needs mono or stereo (this file has ${channelCount} channels)`);
  if (dataStart < 0 || rate <= 0) throw new Error('no audio data found');
  const frames = Math.floor(dataSize / 2 / channelCount);
  const channels = Array.from({ length: channelCount }, () => new Float64Array(frames));
  for (let i = 0; i < frames; i += 1) {
    for (let c = 0; c < channelCount; c += 1) channels[c][i] = buffer.readInt16LE(dataStart + (i * channelCount + c) * 2) / 32768;
  }
  return { channels, rate };
}

/** What the engine plays: stereo files are averaged to one centered channel. */
function toMono(channels) {
  if (channels.length === 1) return channels[0];
  const out = new Float64Array(channels[0].length);
  for (let i = 0; i < out.length; i += 1) out[i] = (channels[0][i] + channels[1][i]) * 0.5;
  return out;
}

/** Linear resample, as the native playback path does. */
function toEngineRate(samples, rate) {
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

function biquad(input, b, a) {
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

/** BS.1770 K-weighted loudness of 48 kHz samples, gated 20 dB below the loudest 400 ms block. */
function kWeightedLoudness(samples) {
  const stage1 = biquad(samples, [1.53512485958697, -2.69169618940638, 1.19839281085285], [1, -1.69065929318241, 0.73248077421585]);
  const weighted = biquad(stage1, [1, -2, 1], [1, -1.99004745483398, 0.99007225036621]);
  const block = Math.floor(0.4 * ENGINE_RATE);
  const step = Math.floor(block / 4);
  const energies = [];
  for (let start = 0; start < Math.max(1, weighted.length - block); start += step) {
    let sum = 0;
    for (let i = start; i < start + block && i < weighted.length; i += 1) sum += weighted[i] * weighted[i];
    const mean = sum / block;
    if (mean > 0) energies.push(mean);
  }
  if (!energies.length) return -Infinity;
  const loudness = energy => -0.691 + 10 * Math.log10(energy);
  const loudest = Math.max(...energies.map(loudness));
  const kept = energies.filter(energy => loudness(energy) > loudest - 20);
  return loudness(kept.reduce((total, energy) => total + energy, 0) / kept.length);
}

const decibels = amplitude => (amplitude > 0 ? 20 * Math.log10(amplitude) : -Infinity);

/** Seconds of near-silence at the start and the end of a clip. */
function silenceAround(samples, rate, threshold = 0.01) {
  let first = 0;
  while (first < samples.length && Math.abs(samples[first]) < threshold) first += 1;
  let last = samples.length - 1;
  while (last > first && Math.abs(samples[last]) < threshold) last -= 1;
  return { head: first / rate, tail: (samples.length - 1 - last) / rate };
}

/** Everything worth knowing about one clip, including its loudness as the engine will play it. */
function measureClip(file) {
  const { channels, rate } = readWav(file);
  const mono = toMono(channels);
  const resampled = toEngineRate(mono, rate);
  const atMix = kWeightedLoudness(resampled.map(value => value * PLAYBACK_FACTOR));
  const fileLevel = kWeightedLoudness(resampled);
  let peak = 0;
  for (const channel of channels) for (let i = 0; i < channel.length; i += 1) peak = Math.max(peak, Math.abs(channel[i]));
  const { head, tail } = silenceAround(mono, rate);
  return {
    seconds: mono.length / rate,
    rate,
    channels: channels.length,
    peakDb: decibels(peak),
    fileLufs: fileLevel,
    atMixLu: atMix,
    headSeconds: head,
    tailSeconds: tail,
  };
}

module.exports = { ENGINE_RATE, PLAYBACK_FACTOR, readWav, toMono, toEngineRate, kWeightedLoudness, measureClip, decibels, silenceAround };
