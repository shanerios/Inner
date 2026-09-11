import { describe, expect, it, jest } from '@jest/globals';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('expo-av', () => ({ Audio: { Sound: { createAsync: jest.fn() } } }));

import { getRecognitionSignalId, recognitionSignalById, setRecognitionSignalId } from '../recognitionSignals';

function memoryStorage() {
  let value: string | null = null;
  return {
    getItem: async () => value,
    setItem: async (_key: string, next: string) => { value = next; },
  };
}

describe('Recognition Signals', () => {
  it('defaults malformed or missing selections to the ascending tone', async () => {
    const storage = memoryStorage();
    expect(await getRecognitionSignalId(storage as any)).toBe('ascending');
    await storage.setItem('ignored', 'unknown');
    expect(await getRecognitionSignalId(storage as any)).toBe('ascending');
  });

  it('stores a valid portable signal identity', async () => {
    const storage = memoryStorage();
    await setRecognitionSignalId('droplets', storage as any);
    expect(await getRecognitionSignalId(storage as any)).toBe('droplets');
    expect(recognitionSignalById('droplets').notificationSound).toBe('signal_droplets.wav');
  });
});
