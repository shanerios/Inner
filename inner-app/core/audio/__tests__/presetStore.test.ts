import { describe, expect, it, jest } from '@jest/globals';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

import { DEFAULT_PROCEDURAL_AUDIO_CONFIG } from '../config';
import { deleteMixerPreset, loadMixerPresets, saveMixerPreset } from '../presetStore';

function memoryStorage(initial: string | null = null) {
  let value = initial;
  return {
    getItem: async () => value,
    setItem: async (_key: string, next: string) => { value = next; },
  };
}

describe('mixer preset store', () => {
  it('saves normalized presets newest first', async () => {
    const storage = memoryStorage();
    await saveMixerPreset('  Night Mix  ', { ...DEFAULT_PROCEDURAL_AUDIO_CONFIG, carrierHz: 9000 }, storage as any, () => 42);
    const presets = await loadMixerPresets(storage as any);
    expect(presets).toHaveLength(1);
    expect(presets[0]).toEqual(expect.objectContaining({ name: 'Night Mix', createdAt: 42 }));
    expect(presets[0].config.carrierHz).toBe(2000);
  });

  it('deletes by id and safely ignores malformed storage', async () => {
    const storage = memoryStorage('{bad json');
    expect(await loadMixerPresets(storage as any)).toEqual([]);
    const saved = await saveMixerPreset('Focus', DEFAULT_PROCEDURAL_AUDIO_CONFIG, storage as any, () => 7);
    expect(await deleteMixerPreset(saved[0].id, storage as any)).toEqual([]);
  });
});
