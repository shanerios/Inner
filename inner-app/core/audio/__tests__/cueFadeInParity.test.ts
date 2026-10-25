import { describe, expect, it } from '@jest/globals';
import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.resolve(__dirname, '../../..');
const kotlin = fs.readFileSync(path.join(ROOT, 'modules/inner-audio/android/src/main/java/expo/modules/inneraudio/ProceduralAudioEngine.kt'), 'utf8');
const records = fs.readFileSync(path.join(ROOT, 'modules/inner-audio/android/src/main/java/expo/modules/inneraudio/Records.kt'), 'utf8');
const swift = fs.readFileSync(path.join(ROOT, 'modules/inner-audio/ios/InnerAudioModule.swift'), 'utf8');

describe('cue fade-in: both engines apply the same optional fade to a cue', () => {
  it('reads cueFadeInMs from the cue event, bounded to 0-500 ms, defaulting to none', () => {
    expect(records).toContain('@Field var cueFadeInMs: Double = 0.0');
    expect(swift).toContain('@Field var cueFadeInMs = 0.0');
    expect(kotlin).toContain('cueFadeInMs = clamp(event.cueFadeInMs, 0.0, 500.0)');
    expect(swift).toContain('cueFadeInMs: clamp(event.cueFadeInMs, 0, 500)');
  });

  it('starts only timeline cues with a fade; previews and manual cues start with none', () => {
    expect(kotlin).toContain('startCue(cueEvent?.signalGainScale ?: 1.0, cueEvent?.cueFadeInMs ?: 0.0)');
    expect(swift).toContain('startCue(gainScale: cueEvent?.signalGainScale ?? 1, fadeInMs: cueEvent?.cueFadeInMs ?? 0)');
    expect(kotlin).toContain('private fun startCue(gainScale: Double = 1.0, fadeInMs: Double = 0.0)');
    expect(swift).toContain('private func startCue(gainScale: Double = 1, fadeInMs: Double = 0)');
  });

  it('uses the same raised-cosine, exactly 1.0 when no fade is requested, on both cue paths', () => {
    expect(kotlin).toContain('if (activeCueFadeFrames <= 0.0 || cueElapsedFrames >= activeCueFadeFrames) return 1.0');
    expect(swift).toContain('if activeCueFadeFrames <= 0 || cueElapsedFrames >= activeCueFadeFrames { return 1 }');
    expect(kotlin).toContain('0.5 - 0.5 * cos(Math.PI * cueElapsedFrames / activeCueFadeFrames)');
    expect(swift).toContain('0.5 - 0.5 * cos(Double.pi * cueElapsedFrames / activeCueFadeFrames)');
    expect(kotlin.match(/\* fade[,)]/g)?.length).toBeGreaterThanOrEqual(4);
    expect(swift.match(/\* fade[,)]/g)?.length).toBeGreaterThanOrEqual(4);
  });
});
