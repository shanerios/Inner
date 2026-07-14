import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { secureGetItem, secureSetItem } from '../secureStorage';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

jest.mock('expo-secure-store', () => ({
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'whenUnlockedThisDeviceOnly',
  getItemAsync: require('jest-mock').fn(),
  setItemAsync: require('jest-mock').fn(),
}));

describe('secureStorage', () => {
  let secureKey: string | null;

  beforeEach(() => {
    secureKey = null;
    jest.clearAllMocks();
    (SecureStore.getItemAsync as any).mockImplementation(async () => secureKey);
    (SecureStore.setItemAsync as any).mockImplementation(async (_name: string, value: string) => {
      secureKey = value;
    });
  });

  it('stores ciphertext and returns the original value', async () => {
    await secureSetItem('private', 'a sensitive journal entry');
    const raw = await AsyncStorage.getItem('private');

    expect(raw).toMatch(/^enc:v1:/);
    expect(raw).not.toContain('sensitive journal');
    await expect(secureGetItem('private')).resolves.toBe('a sensitive journal entry');
  });

  it('migrates a legacy plaintext value on first read', async () => {
    await AsyncStorage.setItem('legacy', 'old private text');

    await expect(secureGetItem('legacy')).resolves.toBe('old private text');
    const migrated = await AsyncStorage.getItem('legacy');
    expect(migrated).toMatch(/^enc:v1:/);
    expect(migrated).not.toContain('old private text');
  });
});
