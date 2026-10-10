#!/usr/bin/env node
'use strict';
/**
 * Measures recorded voice clips the way the engine will play them, and suggests the trim each needs.
 *
 *   npm run voice:measure -- <folder> [--target -24] [--write]
 *
 * "At the mix" is the level the clip reaches inside the app, in the same units the recognition signals
 * were set in. The recognition signals sit at -21.5 LU; speech reads best a little under them, so the
 * default target is -24 LU. Adjust with --target. Trims go in VOICE_TRIM_DB in core/audio/voiceGuidance.ts.
 *
 * With --write, the measured trims are written into VOICE_TRIM_DB (between its voice-trim markers) in
 * core/audio/voiceGuidance.ts, replacing whatever was there. --trim-file <path> writes to another file.
 *
 * The engine adds its own lead-in and fades, so a clip does not need padding at either end.
 */
const fs = require('fs');
const path = require('path');
const { measureClip } = require('./lib/loudness');

const SIGNAL_TARGET_LU = -21.5;
const DEFAULT_TARGET_LU = -24;
const MAX_TRIM_DB = 6;
const PACK_CLIP_COUNT = 33;
const HEAVY_PACK_MB = 15;
const NAME = /^voice-prep-([a-z]+(?:-[a-z]+)*)-([123])\.wav$/;

const DEFAULT_TRIM_FILE = path.join(__dirname, '..', 'core', 'audio', 'voiceGuidance.ts');
const TRIM_BEGIN = '// voice-trim:begin';
const TRIM_END = '// voice-trim:end';

function takeOption(args, name, hasValue) {
  const index = args.indexOf(name);
  if (index < 0) return undefined;
  const value = hasValue ? args[index + 1] : true;
  args.splice(index, hasValue ? 2 : 1);
  return value;
}

function parseArguments(argv) {
  const args = argv.slice(2);
  const targetText = takeOption(args, '--target', true);
  const trimFile = takeOption(args, '--trim-file', true) ?? DEFAULT_TRIM_FILE;
  const write = takeOption(args, '--write', false) === true;
  return { folder: args[0], target: targetText === undefined ? DEFAULT_TARGET_LU : Number(targetText), write, trimFile };
}

/** Replaces the lines between the voice-trim markers with the measured trims. */
function writeTrims(file, rows) {
  const source = fs.readFileSync(file, 'utf8');
  const begin = source.indexOf(TRIM_BEGIN);
  const end = source.indexOf(TRIM_END);
  if (begin < 0 || end < begin) throw new Error(`${file} has no ${TRIM_BEGIN} / ${TRIM_END} markers`);
  // A clip already at the target needs no trim; an absent key means none, so zeros are left out.
  const lines = rows
    .filter(row => row.trim.toFixed(1).replace('-', '') !== '0.0')
    .map(row => `  '${row.key}': ${row.trim.toFixed(1)},`)
    .join('\n');
  const next = `${source.slice(0, begin + TRIM_BEGIN.length)}\n${lines}${lines ? '\n' : ''}  ${source.slice(end)}`;
  fs.writeFileSync(file, next);
}

const fixed = (value, digits = 1) => (Number.isFinite(value) ? value.toFixed(digits) : '-inf');
const median = values => { const sorted = [...values].sort((a, b) => a - b); const mid = Math.floor(sorted.length / 2); return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2; };

function main() {
  const { folder, target, write, trimFile } = parseArguments(process.argv);
  if (!folder || !Number.isFinite(target)) {
    console.error('Usage: npm run voice:measure -- <folder with voice-prep-*.wav> [--target -24] [--write]');
    process.exit(2);
  }
  if (!fs.existsSync(folder) || !fs.statSync(folder).isDirectory()) {
    console.error(`Not a folder: ${folder}`);
    process.exit(2);
  }
  const files = fs.readdirSync(folder).filter(name => name.toLowerCase().endsWith('.wav')).sort();
  const rows = [];
  const problems = [];
  const ignored = [];
  for (const file of files) {
    const match = NAME.exec(file);
    if (!match) { ignored.push(file); continue; }
    try {
      const full = path.join(folder, file);
      rows.push({ file, key: `${match[1]}-${match[2]}`, bytes: fs.statSync(full).size, ...measureClip(full) });
    } catch (error) {
      problems.push(`${file}: ${error.message}`);
    }
  }
  if (!rows.length) {
    console.error(`No voice-prep-*.wav clips could be measured in ${folder}.`);
    problems.forEach(problem => console.error(`  ${problem}`));
    process.exit(1);
  }

  const levels = rows.map(row => row.atMixLu);
  const mid = median(levels);
  console.log(`\nVoice clips as the engine plays them  (recognition signals sit at ${SIGNAL_TARGET_LU} LU; target for voice ${fixed(target)} LU)\n`);
  console.log(['clip'.padEnd(34), 'sec'.padStart(5), 'kHz'.padStart(5), 'ch'.padStart(3), 'peak dB'.padStart(8), 'file LUFS'.padStart(10), 'at mix LU'.padStart(10), 'trim dB'.padStart(8), 'notes'].join('  '));
  for (const row of rows) {
    const trim = target - row.atMixLu;
    const notes = [];
    if (Math.abs(row.atMixLu - mid) > 1) notes.push(`${fixed(row.atMixLu - mid, 1)} dB from the middle clip`);
    if (row.peakDb > -1) notes.push('peak very high');
    if (Math.abs(trim) > MAX_TRIM_DB) notes.push(`needs ${fixed(trim)} dB, beyond the +/-${MAX_TRIM_DB} dB the app can apply`);
    if (row.seconds > 20) notes.push('longer than 20 s, will be skipped');
    row.trim = trim;
    console.log([
      row.file.replace(/\.wav$/, '').padEnd(34), fixed(row.seconds).padStart(5), fixed(row.rate / 1000).padStart(5), String(row.channels).padStart(3),
      fixed(row.peakDb).padStart(8), fixed(row.fileLufs).padStart(10), fixed(row.atMixLu).padStart(10),
      `${trim >= 0 ? '+' : ''}${fixed(trim)}`.padStart(8), notes.join('; '),
    ].join('  '));
  }

  const spread = Math.max(...levels) - Math.min(...levels);
  console.log(`\n${rows.length} clips. Loudest to quietest: ${fixed(spread)} dB. Middle clip: ${fixed(mid)} LU (${fixed(mid - SIGNAL_TARGET_LU, 1)} dB vs the recognition signals).`);
  const unreachable = rows.filter(row => Math.abs(row.trim) > MAX_TRIM_DB);
  console.log(unreachable.length
    ? `${unreachable.length} clip(s) need more than +/-${MAX_TRIM_DB} dB; re-export those: ${unreachable.map(row => row.file).join(', ')}.`
    : 'No clip needs redoing. Each clip has its own trim, so differences between clips are evened out in the app.');
  const totalMb = rows.reduce((total, row) => total + row.bytes, 0) / 1048576;
  const projectedMb = (totalMb / rows.length) * PACK_CLIP_COUNT;
  console.log(`\nSize: ${fixed(totalMb, 1)} MB for ${rows.length} clips. A full set of ${PACK_CLIP_COUNT} would be about ${fixed(projectedMb, 0)} MB, and every user downloads all of it.`);
  if (projectedMb > HEAVY_PACK_MB) {
    const rate = rows[0].rate;
    const lowered = projectedMb * (24_000 / rate);
    console.log(`Exporting at 24 kHz mono would bring that to about ${fixed(lowered, 0)} MB, and speech holds up well at that rate.`);
  }
  if (write) {
    writeTrims(trimFile, rows);
    console.log(`\nWrote ${rows.filter(row => row.trim.toFixed(1).replace('-', '') !== '0.0').length} trims (clips already on target need none) into ${path.relative(process.cwd(), trimFile) || trimFile}.`);
  } else {
    console.log('\nTo set these levels, add to VOICE_TRIM_DB in core/audio/voiceGuidance.ts (or run again with --write):\n');
    for (const row of rows) console.log(`  '${row.key}': ${fixed(row.trim, 1)},`);
  }
  if (ignored.length) console.log(`\nSkipped (not named voice-prep-<sign>-<1|2|3>.wav): ${ignored.join(', ')}`);
  if (problems.length) { console.log('\nCould not read:'); problems.forEach(problem => console.log(`  ${problem}`)); }
  console.log('');
}

main();
