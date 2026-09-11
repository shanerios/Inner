import AsyncStorage from '@react-native-async-storage/async-storage';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { clearPrivateUserData } from '../privacyData';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

jest.mock('expo-secure-store', () => ({
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'whenUnlockedThisDeviceOnly',
  getItemAsync: require('jest-mock').fn(),
  setItemAsync: require('jest-mock').fn(),
}));

describe('clearPrivateUserData', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
  });

  it('removes journals and Aeris history while preserving preferences', async () => {
    await AsyncStorage.multiSet([
      ['journal:index', JSON.stringify(['one', 'two'])],
      ['journal:one', 'encrypted-one'],
      ['journal:two', 'encrypted-two'],
      ['aerisHistory', 'encrypted-history'],
      ['aerisHistoryDate', '2026-07-13'],
      ['inner.lucid-signal.learning.v1', '{"schemaVersion":1,"nights":[]}'],
      ['inner.lucid-signal.plan.v1', 'gentle'],
      ['inner.dream-incubation.seed.v1', '{"text":"A red door","createdAt":1}'],
      ['inner.recognition-signal.v1', 'droplets'],
      ['inner.journey-memory.v1', '{"schemaVersion":1,"sessions":[]}'],
      ['profileName', 'preserved'],
    ]);

    await clearPrivateUserData();

    await expect(AsyncStorage.getItem('journal:index')).resolves.toBeNull();
    await expect(AsyncStorage.getItem('journal:one')).resolves.toBeNull();
    await expect(AsyncStorage.getItem('aerisHistory')).resolves.toBeNull();
    await expect(AsyncStorage.getItem('inner.lucid-signal.learning.v1')).resolves.toBeNull();
    await expect(AsyncStorage.getItem('inner.lucid-signal.plan.v1')).resolves.toBeNull();
    await expect(AsyncStorage.getItem('inner.dream-incubation.seed.v1')).resolves.toBeNull();
    await expect(AsyncStorage.getItem('inner.recognition-signal.v1')).resolves.toBeNull();
    await expect(AsyncStorage.getItem('inner.journey-memory.v1')).resolves.toBeNull();
    await expect(AsyncStorage.getItem('profileName')).resolves.toBe('preserved');
  });
});
