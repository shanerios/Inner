import { describe, expect, it } from '@jest/globals';
import * as fs from 'fs';
import * as path from 'path';
import { INDUCTION_JOURNEY } from '../inductionJourney';
import { INDUCTION_VOICE_CLIP_IDS } from '../inductionVoiceIds';

const ROOT = path.resolve(__dirname, '../../..');

/** What the engine's WAV reader needs to know about a file: PCM 16-bit, and how long it is. */
function wavInfo(file: string) {
  const bytes = fs.readFileSync(file);
  expect(bytes.toString('ascii', 0, 4)).toBe('RIFF');
  expect(bytes.toString('ascii', 8, 12)).toBe('WAVE');
  let format = { audioFormat: 0, channels: 0, sampleRate: 0, bits: 0 };
  let dataBytes = 0;
  for (let offset = 12; offset + 8 <= bytes.length;) {
    const id = bytes.toString('ascii', offset, offset + 4);
    const size = bytes.readUInt32LE(offset + 4);
    if (id === 'fmt ') {
      format = { audioFormat: bytes.readUInt16LE(offset + 8), channels: bytes.readUInt16LE(offset + 10), sampleRate: bytes.readUInt32LE(offset + 12), bits: bytes.readUInt16LE(offset + 22) };
    } else if (id === 'data') {
      dataBytes = size;
    }
    offset += 8 + size + (size % 2);
  }
  return { ...format, seconds: dataBytes / (format.sampleRate * format.channels * (format.bits / 8)) };
}

describe('The Induction voice', () => {
  const ids = Object.values(INDUCTION_VOICE_CLIP_IDS);

  it('ships a recording for every clip the timeline speaks, and for nothing else', () => {
    const spoken: string[] = [];
    for (const item of INDUCTION_JOURNEY.timeline.stages) {
      for (const event of item.spatialEvents ?? []) if (event.type === 'voice') spoken.push(event.clipId);
    }
    expect([...spoken].sort()).toEqual([...ids].sort());
    const shipped = fs.readdirSync(path.join(ROOT, 'assets/voice')).filter(name => name.startsWith('induction-')).map(name => name.replace(/\.wav$/, ''));
    expect(shipped.sort()).toEqual([...ids].sort());
  });

  it('keeps each recording mono 16-bit PCM and inside the engine’s twenty-second limit, with room for its lead-in', () => {
    for (const id of ids) {
      const info = wavInfo(path.join(ROOT, `assets/voice/${id}.wav`));
      expect(info.audioFormat).toBe(1);
      expect(info.channels).toBe(1);
      expect(info.bits).toBe(16);
      expect(info.seconds).toBeGreaterThan(1);
      expect(info.seconds).toBeLessThanOrEqual(20);
    }
  });

  it('lets each spoken clip finish before the next sound it could collide with', () => {
    let offset = 0;
    const starts: Array<{ clipId: string; atMs: number }> = [];
    const sounds: number[] = [];
    for (const item of INDUCTION_JOURNEY.timeline.stages) {
      for (const event of item.spatialEvents ?? []) {
        if (event.type === 'voice') starts.push({ clipId: event.clipId, atMs: offset + event.atMs });
        else sounds.push(offset + event.atMs);
      }
      offset += item.durationMs;
    }
    // Spoken in time order, whatever the order the ids were declared in.
    starts.sort((a, b) => a.atMs - b.atMs);
    // The engine begins a clip 0.4 s after its time, and ignores one that would overlap another still speaking.
    const ends = starts.map(start => start.atMs + 400 + wavInfo(path.join(ROOT, `assets/voice/${start.clipId}.wav`)).seconds * 1_000);
    for (let index = 1; index < starts.length; index += 1) expect(ends[index - 1]).toBeLessThan(starts[index].atMs);
    // Nothing else in the journey sounds over a voice, until the clip's own end.
    for (const [index, start] of starts.entries()) {
      for (const sound of sounds) expect(sound > start.atMs && sound < ends[index]).toBe(false);
    }
    expect(ends[ends.length - 1]).toBeLessThan(INDUCTION_JOURNEY.timeline.stages.reduce((sum, item) => sum + item.durationMs, 0));
  });

  it('names each bundled clip the way React Native does, which is how the native module finds it', () => {
    const { getAndroidResourceIdentifier } = require('@react-native/assets-registry/path-support');
    const names = Object.values(INDUCTION_VOICE_CLIP_IDS).map(id => getAndroidResourceIdentifier({
      httpServerLocation: '/assets/assets/voice', name: id, type: 'wav', scales: [1],
    }));
    expect(names).toEqual(['assets_voice_inductionopen1', 'assets_voice_inductionopen2', 'assets_voice_inductioncue1', 'assets_voice_inductioncue2', 'assets_voice_inductionclose']);
  });

  it('has the Android module turn a bundled clip’s resource name into a cache file for the engine', () => {
    const module = fs.readFileSync(path.join(ROOT, 'modules/inner-audio/android/src/main/java/expo/modules/inneraudio/InnerAudioModule.kt'), 'utf8');
    expect(module).toContain('ProceduralAudioEngine.setVoiceClips(clips.map { materializeBundledClip(it) })');
    expect(module).toContain('if (clip.uri.isEmpty() || clip.uri.contains(":")) return clip');
    expect(module).toContain('context.resources.getIdentifier(clip.uri, "raw", context.packageName)');
    const loader = fs.readFileSync(path.join(ROOT, 'core/audio/inductionVoice.ts'), 'utf8');
    expect(loader).toContain("Platform.OS === 'android' && !(asset.uri || '').includes(':')");
    expect(loader).toContain('getAndroidResourceIdentifier(getAssetByID(VOICE_ASSETS[id]))');
  });
});
