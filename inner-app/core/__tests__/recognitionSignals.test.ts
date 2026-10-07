import { describe, expect, it, jest } from '@jest/globals';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('expo-av', () => ({ Audio: { Sound: { createAsync: jest.fn() } } }));

import {
  getRecognitionSignalGainScale,
  getRecognitionSignalId,
  recognitionSignalById,
  setRecognitionSignalGainScale,
  setRecognitionSignalId,
} from '../recognitionSignals';

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    getItem: async (key: string) => values.get(key) ?? null,
    setItem: async (key: string, next: string) => { values.set(key, next); },
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

  it('remembers a stepped starting level independently for each signal', async () => {
    const storage = memoryStorage();
    await setRecognitionSignalGainScale('guardian', 0.83, storage as any);
    await setRecognitionSignalGainScale('droplets', 1.12, storage as any);

    expect(await getRecognitionSignalGainScale('guardian', storage as any)).toBe(0.85);
    expect(await getRecognitionSignalGainScale('droplets', storage as any)).toBe(1.1);
    expect(await getRecognitionSignalGainScale('bell', storage as any)).toBe(1);
  });

  it('bounds malformed and out-of-range stored levels', async () => {
    const storage = memoryStorage();
    await setRecognitionSignalGainScale('guardian', 9, storage as any);
    expect(await getRecognitionSignalGainScale('guardian', storage as any)).toBe(1.2);
    await storage.setItem('inner.recognition-signal-levels.v1', '{broken');
    expect(await getRecognitionSignalGainScale('guardian', storage as any)).toBe(1);
  });
});
