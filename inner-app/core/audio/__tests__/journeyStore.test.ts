import { describe, expect, it, jest } from '@jest/globals';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

import { deleteAudioJourney, loadAudioJourneys, saveAudioJourney } from '../journeyStore';

function memoryStorage(initial: string | null = null) {
  let value = initial;
  return {
    getItem: async () => value,
    setItem: async (_key: string, next: string) => { value = next; },
  };
}

const journey = {
  id: 'evening', title: 'Evening Flow', loop: false,
  stages: [{ id: 'arrive', label: 'Arrive', durationMs: 60_000, transitionMs: 15_000, target: { binauralDeltaHz: 6 } }],
};

describe('audio journey store', () => {
  it('saves versioned definitions and updates without replacing createdAt', async () => {
    const storage = memoryStorage();
    await saveAudioJourney(journey, storage as any, () => 10);
    const updated = await saveAudioJourney({ ...journey, title: 'Evening Flow II' }, storage as any, () => 20);
    expect(updated).toHaveLength(1);
    expect(updated[0]).toEqual(expect.objectContaining({ schemaVersion: 1, createdAt: 10, updatedAt: 20, title: 'Evening Flow II' }));
  });

  it('filters malformed definitions and deletes valid ones', async () => {
    const storage = memoryStorage(JSON.stringify([{ schemaVersion: 1, id: '', title: '', stages: [] }]));
    expect(await loadAudioJourneys(storage as any)).toEqual([]);
    const saved = await saveAudioJourney(journey, storage as any, () => 10);
    expect(await deleteAudioJourney(saved[0].id, storage as any)).toEqual([]);
  });
});
