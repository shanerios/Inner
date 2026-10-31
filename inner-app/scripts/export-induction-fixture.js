#!/usr/bin/env node
/**
 * Writes the Induction's compiled timeline as a JSON fixture for the Android engine tests, so the real engine can
 * render exactly what the app plays. Run after changing core/audio/inductionJourney.ts:
 *   node scripts/export-induction-fixture.js
 * A jest test fails when the checked-in fixture no longer matches the TypeScript.
 */
require('sucrase/register');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const { INDUCTION_JOURNEY } = require(path.join(root, 'core/audio/inductionJourney.ts'));
const { compileAudioJourneyTimeline } = require(path.join(root, 'core/audio/timeline.ts'));
const { DEFAULT_PROCEDURAL_AUDIO_CONFIG } = require(path.join(root, 'core/audio/config.ts'));

/** The Bell's playback gain: its trim in recognitionSignals.ts (-3.1 dB), at the default personal level. */
const BELL_GAIN = 10 ** (-3.1 / 20);

function buildFixture() {
  const compiled = compileAudioJourneyTimeline(INDUCTION_JOURNEY.timeline, DEFAULT_PROCEDURAL_AUDIO_CONFIG);
  return {
    title: compiled.title,
    seed: compiled.seed,
    fadeInMs: compiled.fadeInMs,
    totalDurationMs: compiled.totalDurationMs,
    bellGain: BELL_GAIN,
    initialConfig: DEFAULT_PROCEDURAL_AUDIO_CONFIG,
    stages: compiled.stages,
  };
}

module.exports = { buildFixture };

if (require.main === module) {
  const target = path.join(root, 'modules/inner-audio/android/src/test/resources/induction-fixture.json');
  fs.writeFileSync(target, `${JSON.stringify(buildFixture(), null, 2)}\n`);
  console.log(`wrote ${path.relative(root, target)}`);
}
