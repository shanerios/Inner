jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'));

import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import {
  ANALYTICS_USER_ID_KEY,
  getOrCreateAnalyticsUserId,
  resetAnalyticsIdentityForTests,
} from '../analyticsIdentity';
import * as fs from 'fs';
import * as path from 'path';

function storageWith(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial));
  return {
    values,
    getItem: jest.fn(async (key: string) => values.get(key) ?? null),
    setItem: jest.fn(async (key: string, value: string) => { values.set(key, value); }),
  };
}

beforeEach(() => resetAnalyticsIdentityForTests());

describe('shared analytics identity', () => {
  it('keeps the existing UUID and never generates another', async () => {
    const storage = storageWith({ [ANALYTICS_USER_ID_KEY]: 'existing' });
    const makeId = jest.fn(() => 'new');
    expect(await getOrCreateAnalyticsUserId(storage, makeId)).toBe('existing');
    expect(makeId).not.toHaveBeenCalled();
    expect(storage.setItem).not.toHaveBeenCalled();
  });

  it('creates and persists once for a new install', async () => {
    const storage = storageWith();
    const makeId = jest.fn(() => 'created');
    expect(await getOrCreateAnalyticsUserId(storage, makeId)).toBe('created');
    expect(storage.values.get(ANALYTICS_USER_ID_KEY)).toBe('created');
    expect(await getOrCreateAnalyticsUserId(storage, makeId)).toBe('created');
    expect(makeId).toHaveBeenCalledTimes(1);
  });

  it('gives concurrent callers (Splash and RevenueCat at startup) the same single identity', async () => {
    const storage = storageWith();
    let n = 0;
    const makeId = jest.fn(() => `id-${++n}`);
    const ids = await Promise.all([
      getOrCreateAnalyticsUserId(storage, makeId),
      getOrCreateAnalyticsUserId(storage, makeId),
      getOrCreateAnalyticsUserId(storage, makeId),
    ]);
    expect(new Set(ids).size).toBe(1);
    expect(makeId).toHaveBeenCalledTimes(1);
    expect(storage.setItem).toHaveBeenCalledTimes(1);
  });

  it('returns null when storage fails, caches nothing, and recovers on the next call', async () => {
    const storage = storageWith();
    storage.getItem.mockRejectedValueOnce(new Error('disk'));
    expect(await getOrCreateAnalyticsUserId(storage, () => 'a')).toBeNull();
    expect(await getOrCreateAnalyticsUserId(storage, () => 'a')).toBe('a');
  });

  it('never returns an ID it could not persist', async () => {
    const storage = storageWith();
    storage.setItem.mockRejectedValueOnce(new Error('full'));
    expect(await getOrCreateAnalyticsUserId(storage, () => 'unsaved')).toBeNull();
    expect(storage.values.has(ANALYTICS_USER_ID_KEY)).toBe(false);
  });

  it('is the only identity source SplashScreen uses, and keeps the existing storage key', () => {
    const splash = fs.readFileSync(path.join(__dirname, '../../screens/SplashScreen.tsx'), 'utf8');
    expect(splash).toContain('getOrCreateAnalyticsUserId()');
    expect(splash).toContain('posthog?.identify(userId)');
    expect(splash).not.toMatch(/randomUUID|inner\.user\.id/);
    expect(ANALYTICS_USER_ID_KEY).toBe('inner.user.id');
  });
});
