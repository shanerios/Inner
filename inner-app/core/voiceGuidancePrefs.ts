import AsyncStorage from '@react-native-async-storage/async-storage';

export const VOICE_GUIDANCE_KEY = 'inner.voiceGuidance.enabled.v1';

type Storage = Pick<typeof AsyncStorage, 'getItem' | 'setItem'>;

/** Spoken preparation guidance. On unless the practitioner turned it off. */
export async function getVoiceGuidanceEnabled(storage: Storage = AsyncStorage): Promise<boolean> {
  try {
    return (await storage.getItem(VOICE_GUIDANCE_KEY)) !== 'off';
  } catch {
    return true;
  }
}

export async function setVoiceGuidanceEnabled(enabled: boolean, storage: Storage = AsyncStorage): Promise<void> {
  try {
    await storage.setItem(VOICE_GUIDANCE_KEY, enabled ? 'on' : 'off');
  } catch {
    // A preference that cannot be saved just falls back to its default.
  }
}
