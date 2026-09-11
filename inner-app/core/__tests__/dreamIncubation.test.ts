import { describe, expect, it, jest } from '@jest/globals';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

import { clearDreamSeed, loadDreamSeed, saveDreamSeed } from '../dreamIncubation';

function memoryStorage() {
  let value: string | null = null;
  return {
    getItem: async () => value,
    setItem: async (_key: string, next: string) => { value = next; },
    removeItem: async () => { value = null; },
  };
}

describe('dream incubation seed', () => {
  it('normalizes and stores a private seed', async () => {
    const storage = memoryStorage();
    await expect(saveDreamSeed('  the   house by the sea  ', storage as any, () => 42)).resolves.toEqual({
      text: 'the house by the sea', createdAt: 42,
    });
    await expect(loadDreamSeed(storage as any)).resolves.toEqual({ text: 'the house by the sea', createdAt: 42 });
  });

  it('clears a seed', async () => {
    const storage = memoryStorage();
    await saveDreamSeed('A red door', storage as any);
    await clearDreamSeed(storage as any);
    await expect(loadDreamSeed(storage as any)).resolves.toBeNull();
  });
});
