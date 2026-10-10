import { describe, expect, it, jest } from '@jest/globals';
import { VOICE_GUIDANCE_KEY, getVoiceGuidanceEnabled, setVoiceGuidanceEnabled } from '../voiceGuidancePrefs';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    getItem: jest.fn(async (key: string) => values.get(key) ?? null),
    setItem: jest.fn(async (key: string, value: string) => { values.set(key, value); }),
  };
}

describe('voice guidance preference', () => {
  it('is on by default', async () => {
    expect(await getVoiceGuidanceEnabled(memoryStorage() as any)).toBe(true);
  });

  it('remembers off and on', async () => {
    const storage = memoryStorage();
    await setVoiceGuidanceEnabled(false, storage as any);
    expect(storage.setItem).toHaveBeenCalledWith(VOICE_GUIDANCE_KEY, 'off');
    expect(await getVoiceGuidanceEnabled(storage as any)).toBe(false);
    await setVoiceGuidanceEnabled(true, storage as any);
    expect(await getVoiceGuidanceEnabled(storage as any)).toBe(true);
  });

  it('stays on when storage fails, and never throws', async () => {
    const broken = { getItem: jest.fn(async () => { throw new Error('no'); }), setItem: jest.fn(async () => { throw new Error('no'); }) };
    expect(await getVoiceGuidanceEnabled(broken as any)).toBe(true);
    await expect(setVoiceGuidanceEnabled(false, broken as any)).resolves.toBeUndefined();
  });
});
