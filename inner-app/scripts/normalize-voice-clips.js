#!/usr/bin/env node
'use strict';
/**
 * Writes level-matched copies of recorded voice clips to a NEW folder. Originals are never touched.
 *
 *   npm run voice:normalize -- <input folder> <output folder> [--target -24] [--rate 24000]
 *
 * Each clip gets one fixed gain, computed from how loud it plays inside the app (the same measurement
 * as `voice:measure`), so the voice is not compressed or reshaped. With --rate the copies are also
 * converted to that sample rate (mono, 16-bit, with dither) to shrink the download. Needs ffmpeg.
 */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { measureClip } = require('./lib/loudness');

const DEFAULT_TARGET_LU = -24;
const PEAK_CEILING_DB = -1;
const ACCEPTABLE_ERROR_LU = 0.5;
const NAME = /^voice-prep-[a-z]+(?:-[a-z]+)*-[123]\.wav$/;

function takeOption(args, name) {
  const index = args.indexOf(name);
  if (index < 0) return undefined;
  const value = args[index + 1];
  args.splice(index, 2);
  return value;
}

/** The gain that brings a clip to the target, held back if it would push the peak past the ceiling. */
function planGain(measurement, target) {
  const wanted = target - measurement.atMixLu;
  const headroom = PEAK_CEILING_DB - measurement.peakDb;
  return wanted <= headroom
    ? { gainDb: wanted, limited: false }
    : { gainDb: Math.max(0, headroom), limited: true };
}

function ffmpegAvailable() {
  const result = spawnSync('ffmpeg', ['-version'], { encoding: 'utf8' });
  return result.status === 0;
}

function convert(input, output, gainDb, rate) {
  const resample = rate ? `aresample=${rate}:dither_method=triangular` : 'aresample=dither_method=triangular';
  const result = spawnSync('ffmpeg', [
    '-y', '-hide_banner', '-loglevel', 'error', '-i', input,
    '-af', `volume=${gainDb.toFixed(3)}dB,${resample}`,
    '-ac', '1', '-c:a', 'pcm_s16le', output,
  ], { encoding: 'utf8' });
  if (result.status !== 0) throw new Error((result.stderr || 'ffmpeg failed').trim());
}

const fixed = (value, digits = 1) => (Number.isFinite(value) ? value.toFixed(digits) : '-inf');
const signed = value => `${value >= 0 ? '+' : ''}${fixed(value)}`;

function main() {
  const args = process.argv.slice(2);
  const targetText = takeOption(args, '--target');
  const rateText = takeOption(args, '--rate');
  const target = targetText === undefined ? DEFAULT_TARGET_LU : Number(targetText);
  const rate = rateText === undefined ? undefined : Number(rateText);
  const [inputFolder, outputFolder] = args;
  if (!inputFolder || !outputFolder || !Number.isFinite(target) || (rate !== undefined && !(rate >= 8000 && rate <= 96000))) {
    console.error('Usage: npm run voice:normalize -- <input folder> <output folder> [--target -24] [--rate 24000]');
    process.exit(2);
  }
  const input = path.resolve(inputFolder);
  const output = path.resolve(outputFolder);
  if (!fs.existsSync(input) || !fs.statSync(input).isDirectory()) { console.error(`Not a folder: ${inputFolder}`); process.exit(2); }
  if (output === input || output.startsWith(input + path.sep)) {
    console.error('The output folder must be a different folder, outside the input folder, so the originals are never overwritten.');
    process.exit(2);
  }
  if (!ffmpegAvailable()) {
    console.error('ffmpeg is needed for this and was not found. Install it (for example `brew install ffmpeg`), or match the levels in your audio editor.');
    process.exit(3);
  }

  const files = fs.readdirSync(input).filter(name => NAME.test(name)).sort();
  if (!files.length) { console.error(`No voice-prep-*.wav clips found in ${inputFolder}.`); process.exit(1); }
  fs.mkdirSync(output, { recursive: true });

  const rows = [];
  const problems = [];
  for (const file of files) {
    try {
      const before = measureClip(path.join(input, file));
      const plan = planGain(before, target);
      convert(path.join(input, file), path.join(output, file), plan.gainDb, rate);
      const after = measureClip(path.join(output, file));
      rows.push({ file, before, after, plan, error: after.atMixLu - target });
    } catch (error) {
      problems.push(`${file}: ${error.message}`);
    }
  }

  console.log(`\nLevel-matched copies in ${outputFolder}  (target ${fixed(target)} LU at the mix${rate ? `, ${rate} Hz mono` : ''})\n`);
  console.log(['clip'.padEnd(34), 'before'.padStart(8), 'gain dB'.padStart(8), 'after'.padStart(8), 'off target'.padStart(11), 'peak dB'.padStart(8), 'notes'].join('  '));
  for (const row of rows) {
    const notes = [];
    if (row.plan.limited) notes.push('held back to keep the peak under -1 dB');
    if (Math.abs(row.error) > ACCEPTABLE_ERROR_LU) notes.push('not on target');
    console.log([
      row.file.replace(/\.wav$/, '').padEnd(34), fixed(row.before.atMixLu).padStart(8), signed(row.plan.gainDb).padStart(8),
      fixed(row.after.atMixLu).padStart(8), signed(row.error).padStart(11), fixed(row.after.peakDb).padStart(8), notes.join('; '),
    ].join('  '));
  }
  const errors = rows.map(row => Math.abs(row.error));
  const beforeSpread = Math.max(...rows.map(row => row.before.atMixLu)) - Math.min(...rows.map(row => row.before.atMixLu));
  const afterSpread = Math.max(...rows.map(row => row.after.atMixLu)) - Math.min(...rows.map(row => row.after.atMixLu));
  const inputBytes = files.reduce((total, file) => total + fs.statSync(path.join(input, file)).size, 0);
  const outputBytes = rows.reduce((total, row) => total + fs.statSync(path.join(output, row.file)).size, 0);
  console.log(`\n${rows.length} clips. Spread before ${fixed(beforeSpread)} dB, after ${fixed(afterSpread)} dB. Worst miss ${fixed(Math.max(...errors))} LU.`);
  console.log(`Size ${fixed(inputBytes / 1048576, 1)} MB -> ${fixed(outputBytes / 1048576, 1)} MB.`);
  if (problems.length) { console.log('\nCould not process:'); problems.forEach(problem => console.log(`  ${problem}`)); }
  console.log(`\nYour originals were not changed. Next, run:\n  npm run voice:measure -- "${outputFolder}" --write\nso the in-app trims match these copies, then upload the copies.\n`);
  if (problems.length) process.exit(1);
}

if (require.main === module) main();
module.exports = { planGain };
