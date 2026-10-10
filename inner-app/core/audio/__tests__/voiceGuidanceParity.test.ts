import { describe, expect, it } from '@jest/globals';
import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.resolve(__dirname, '../../..');
const kotlin = fs.readFileSync(path.join(ROOT, 'modules/inner-audio/android/src/main/java/expo/modules/inneraudio/ProceduralAudioEngine.kt'), 'utf8');
const swift = fs.readFileSync(path.join(ROOT, 'modules/inner-audio/ios/InnerAudioModule.swift'), 'utf8');
const kotlinRecords = fs.readFileSync(path.join(ROOT, 'modules/inner-audio/android/src/main/java/expo/modules/inneraudio/Records.kt'), 'utf8');
const kotlinModule = fs.readFileSync(path.join(ROOT, 'modules/inner-audio/android/src/main/java/expo/modules/inneraudio/InnerAudioModule.kt'), 'utf8');

const number = (source: string, pattern: RegExp) => Number(source.match(pattern)?.[1].replace(/_/g, ''));

describe('voice guidance: both engines play and mix a recorded clip the same way', () => {
  const constants: Array<[string, string, number]> = [
    ['VOICE_PLAYBACK_FACTOR', 'voicePlaybackFactor', 1.45],
    ['VOICE_LEAD_IN_SECONDS', 'voiceLeadInSeconds', 0.4],
    ['VOICE_FADE_IN_SECONDS', 'voiceFadeInSeconds', 0.04],
    ['VOICE_FADE_OUT_SECONDS', 'voiceFadeOutSeconds', 0.08],
    ['VOICE_BED_DUCK', 'voiceBedDuck', 0.708],
    ['VOICE_DUCK_ATTACK_SECONDS', 'voiceDuckAttackSeconds', 0.4],
    ['VOICE_DUCK_RELEASE_SECONDS', 'voiceDuckReleaseSeconds', 1.5],
    ['MAX_VOICE_CLIPS', 'maxVoiceClips', 40],
    ['MAX_VOICE_SECONDS', 'maxVoiceSeconds', 20],
  ];

  it.each(constants)('uses the same %s on both platforms', (kotlinName, swiftName, expected) => {
    expect(number(kotlin, new RegExp(`private const val ${kotlinName} = ([0-9_.]+)`))).toBe(expected);
    expect(number(swift, new RegExp(`private static let ${swiftName} = ([0-9_.]+)`))).toBe(expected);
  });

  it('plays voice at the same factor as recognition signals', () => {
    expect(number(kotlin, /private const val VOICE_PLAYBACK_FACTOR = ([0-9.]+)/)).toBe(1.45);
    expect(kotlin).toContain('activeCueSamplesLeft[lower] * (1 - fraction)');
    expect(kotlin).toContain('left * 1.45 * activeCueGain');
  });

  it('mixes the voice after the bed is eased down, ahead of the master gain and limiter', () => {
    expect(kotlin).toContain('(leftCarrier + leftEntrainment + shapedNoiseLeft + shapedEnvironmentLeft) * voiceBedGain + cue.first + voice) * gains[3]');
    expect(swift).toContain('(leftCarrier + leftEntrainment + shapedNoiseLeft + shapedEnvironmentLeft) * voiceBedGain + cue.left + voice) * gains[3]');
    expect(kotlin).toContain('(rightCarrier + rightEntrainment + shapedNoiseRight + shapedEnvironmentRight) * voiceBedGain + cue.second + voice) * gains[3]');
    expect(swift).toContain('(rightCarrier + rightEntrainment + shapedNoiseRight + shapedEnvironmentRight) * voiceBedGain + cue.right + voice) * gains[3]');
  });

  it('starts a clip once, reporting an unloaded clip or one that would overlap', () => {
    for (const source of [kotlin, swift]) {
      expect(source).toContain('"voice_clip_started"');
      expect(source).toContain('"voice_clip_missing"');
      expect(source).toContain('"voice_clips_loaded"');
      expect(source).toContain('"not_loaded"');
      expect(source).toContain('"overlap"');
      expect(source).toContain('"invalid_clip"');
    }
  });

  it('reads only voice events for the voice slot, so cues and swooshes are never mistaken for it', () => {
    expect(kotlin).toContain('if (event.type != "voice" || event.atMs < 0 || event.clipId.isEmpty()) return@mapNotNull null');
    expect(swift).toContain('guard event.type == "voice", event.atMs >= 0, !event.clipId.isEmpty else { return nil }');
    expect(kotlin).toContain('if (event.type != "cue" || event.atMs < 0) return@mapNotNull null');
    expect(kotlin).toContain('if (event.type != "swoosh" || event.atMs < 0 || event.durationMs < 500) return@mapNotNull null');
  });

  it('stops a clip and resets the bed on a seek or restart, and on reset', () => {
    for (const source of [kotlin, swift]) {
      expect(source.match(/voiceBedGain = 1(\.0)?\n/g)?.length).toBeGreaterThanOrEqual(2);
    }
  });

  it('exposes setVoiceClips to JavaScript on both platforms', () => {
    expect(kotlinModule).toContain('AsyncFunction("setVoiceClips")');
    expect(swift).toContain('AsyncFunction("setVoiceClips")');
    expect(kotlinRecords).toContain('class VoiceClipRecord');
    expect(swift).toContain('struct VoiceClipRecord: Record');
    expect(kotlinRecords).toContain('@Field var clipId: String');
    expect(swift).toContain('@Field var clipId = ""');
  });
});
