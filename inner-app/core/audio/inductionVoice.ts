import { Asset } from 'expo-asset';
import { Platform } from 'react-native';
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

export type InductionVoiceResolution = { clips: InductionVoiceClip[] | null; failure?: string };

// React Native's own naming for a bundled file in a release build on Android. The Gradle step that copies the file into
// the app uses the same function, so the name always matches the resource that was shipped.
const { getAndroidResourceIdentifier } = require('@react-native/assets-registry/path-support') as {
  getAndroidResourceIdentifier: (asset: unknown) => string;
};
const { getAssetByID } = require('@react-native/assets-registry/registry') as { getAssetByID: (id: number) => unknown };

/**
 * Where the engine can read one clip. On Android in a release build the Expo asset layer gave these new files no
 * address at all, so the clip is named by its raw resource and the native module copies it to a file itself. Anywhere
 * the asset has a real address (a development server, or iOS) it is downloaded to the cache as usual.
 */
async function clipLocation(id: InductionVoiceClipId): Promise<{ uri: string; how: string }> {
  const asset = Asset.fromModule(VOICE_ASSETS[id]);
  if (Platform.OS === 'android' && !(asset.uri || '').includes(':')) {
    return { uri: getAndroidResourceIdentifier(getAssetByID(VOICE_ASSETS[id])), how: 'resource' };
  }
  await asset.downloadAsync();
  return { uri: asset.localUri ?? asset.uri, how: 'download' };
}

/**
 * The clips as local files for the engine, or null when any cannot be reached. All or nothing: a half-voiced
 * Induction would be stranger than one with its on-screen words only. Never throws; says in a few words which clip
 * failed and why, for the journey's record.
 */
export async function resolveInductionVoiceClips(): Promise<InductionVoiceResolution> {
  const clips: InductionVoiceClip[] = [];
  for (const id of Object.values(INDUCTION_VOICE_CLIP_IDS)) {
    try {
      const { uri, how } = await clipLocation(id);
      if (!uri) return { clips: null, failure: `${id}: no uri (${how})` };
      clips.push({ id, uri, gain: INDUCTION_VOICE_GAIN });
    } catch (error) {
      return { clips: null, failure: `${id}: ${String((error as Error)?.message ?? error).slice(0, 160)}` };
    }
  }
  return { clips };
}
