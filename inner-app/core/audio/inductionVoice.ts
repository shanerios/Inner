import { Asset } from 'expo-asset';
import { INDUCTION_VOICE_CLIP_IDS, INDUCTION_VOICE_GAIN, type InductionVoiceClipId } from './inductionVoiceIds';

export { INDUCTION_VOICE_CLIP_IDS, INDUCTION_VOICE_GAIN, type InductionVoiceClipId };

/**
 * The Induction's spoken lines. They ship inside the app, so the first experience never waits on the network, and the
 * engine plays them the same way it plays the preparation voice: by clip id, from a local file.
 *
 * Each file is mono 16-bit PCM and under the engine's twenty-second limit (core/audio/__tests__/inductionVoice.test.ts
 * reads the shipped files to keep it so).
 */

const VOICE_ASSETS: Record<InductionVoiceClipId, number> = {
  'induction-open-1': require('../../assets/voice/induction-open-1.wav'),
  'induction-open-2': require('../../assets/voice/induction-open-2.wav'),
  'induction-cue-1': require('../../assets/voice/induction-cue-1.wav'),
  'induction-cue-2': require('../../assets/voice/induction-cue-2.wav'),
  'induction-close': require('../../assets/voice/induction-close.wav'),
};

export type InductionVoiceClip = { id: string; uri: string; gain: number };

/**
 * The clips as local files for the engine, or null when any cannot be reached. All or nothing: a half-voiced
 * Induction would be stranger than one with its on-screen words only. Never throws.
 */
export async function resolveInductionVoiceClips(): Promise<InductionVoiceClip[] | null> {
  try {
    const clips: InductionVoiceClip[] = [];
    for (const id of Object.values(INDUCTION_VOICE_CLIP_IDS)) {
      const asset = Asset.fromModule(VOICE_ASSETS[id]);
      await asset.downloadAsync();
      const uri = asset.localUri ?? asset.uri;
      if (!uri) return null;
      clips.push({ id, uri, gain: INDUCTION_VOICE_GAIN });
    }
    return clips;
  } catch {
    return null;
  }
}
