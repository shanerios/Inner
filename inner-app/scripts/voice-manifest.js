#!/usr/bin/env node
'use strict';
/**
 * Writes manifest.json for a folder of voice clips, ready to upload next to them.
 *
 *   npm run voice:manifest -- <folder> [--bump voice-prep-water-2 ...]
 *
 * Every voice-prep-<sign>-<1|2|3>.wav in the folder is listed. A clip keeps the revision it already has
 * in the folder's manifest.json (new clips start at 1). Re-mixed a clip and re-uploaded it under the same
 * name? Pass its id to --bump so phones that already have the old recording fetch the new one.
 */
const fs = require('fs');
const path = require('path');

const NAME = /^(voice-prep-[a-z]+(?:-[a-z]+)*-([123]))\.wav$/;

function takeAll(args, name) {
  const values = [];
  for (let index = args.indexOf(name); index >= 0; index = args.indexOf(name)) {
    args.splice(index, 1);
    while (args[index] && !args[index].startsWith('--')) values.push(...args.splice(index, 1));
  }
  return values;
}

function buildManifest(files, existing, bump) {
  const clips = {};
  const unknown = bump.filter(id => !files.includes(`${id}.wav`));
  for (const file of files.sort()) {
    const match = NAME.exec(file);
    if (!match) continue;
    const id = match[1];
    const current = Number.isInteger(existing[id]) && existing[id] >= 1 ? existing[id] : 1;
    clips[id] = bump.includes(id) ? current + 1 : current;
  }
  // A sign needs all three lines before the app will use its own recording.
  const slots = {};
  for (const id of Object.keys(clips)) {
    const slug = id.replace(/^voice-prep-/, '').replace(/-[123]$/, '');
    (slots[slug] = slots[slug] || []).push(id.slice(-1));
  }
  const incomplete = Object.entries(slots).filter(([, found]) => found.length !== 3).map(([slug, found]) => `${slug} (has ${found.sort().join(', ')})`);
  return { manifest: { version: 1, clips }, incomplete, unknown };
}

function main() {
  const args = process.argv.slice(2);
  const bump = takeAll(args, '--bump');
  const folder = args[0];
  if (!folder || !fs.existsSync(folder) || !fs.statSync(folder).isDirectory()) {
    console.error('Usage: npm run voice:manifest -- <folder with voice-prep-*.wav> [--bump voice-prep-water-2 ...]');
    process.exit(2);
  }
  const file = path.join(folder, 'manifest.json');
  let existing = {};
  try { existing = JSON.parse(fs.readFileSync(file, 'utf8')).clips || {}; } catch { /* a first manifest */ }
  const { manifest, incomplete, unknown } = buildManifest(fs.readdirSync(folder), existing, bump);
  if (unknown.length) { console.error(`Not in the folder, nothing bumped: ${unknown.join(', ')}`); process.exit(1); }
  if (!Object.keys(manifest.clips).length) { console.error('No voice-prep-*.wav clips found.'); process.exit(1); }
  fs.writeFileSync(file, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`Wrote ${file} listing ${Object.keys(manifest.clips).length} clips.`);
  if (bump.length) console.log(`Bumped: ${bump.join(', ')}`);
  if (incomplete.length) console.log(`Incomplete signs (the app will use generic lines for these until all three are listed): ${incomplete.join('; ')}`);
  console.log('Upload manifest.json together with the clips.');
}

if (require.main === module) main();
module.exports = { buildManifest };
