jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'));

import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import {
  LINKED_PAIR_KEY,
  linkPostHogIdentity,
  POSTHOG_USER_ID_ATTRIBUTE,
  resetRevenueCatIdentityForTests,
} from '../revenueCatIdentity';
import { ANALYTICS_USER_ID_KEY, resetAnalyticsIdentityForTests } from '../analyticsIdentity';

function storageWith(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial));
  return {
    values,
    getItem: jest.fn(async (key: string) => values.get(key) ?? null),
    setItem: jest.fn(async (key: string, value: string) => { values.set(key, value); }),
  };
}

function purchasesWith(appUserId = '$RCAnonymousID:abc') {
  return {
    getAppUserID: jest.fn(async () => appUserId),
    setAttributes: jest.fn(async (_attributes: { [key: string]: string | null }) => {}),
  };
}

const resolves = (id: string | null) => jest.fn(async () => id);

beforeEach(() => {
  resetRevenueCatIdentityForTests();
  resetAnalyticsIdentityForTests();
});

describe('RevenueCat to PostHog identity link', () => {
  it('sets only $posthogUserId, using the shared analytics identity', async () => {
    const storage = storageWith();
    const purchases = purchasesWith();
    expect(await linkPostHogIdentity(purchases, storage, resolves('uuid-1'))).toBe('linked');
    expect(purchases.setAttributes).toHaveBeenCalledTimes(1);
    expect(purchases.setAttributes).toHaveBeenCalledWith({ [POSTHOG_USER_ID_ATTRIBUTE]: 'uuid-1' });
    expect(POSTHOG_USER_ID_ATTRIBUTE).toBe('$posthogUserId');
  });

  it('sends nothing when no identity can be resolved, and never logs in or changes the app user id', async () => {
    const storage = storageWith();
    const purchases: any = { ...purchasesWith(), logIn: jest.fn(), logOut: jest.fn() };
    expect(await linkPostHogIdentity(purchases, storage, resolves(null))).toBe('no_identity');
    expect(purchases.setAttributes).not.toHaveBeenCalled();
    expect(await linkPostHogIdentity(purchases, storage, resolves('uuid-1'))).toBe('linked');
    expect(purchases.logIn).not.toHaveBeenCalled();
    expect(purchases.logOut).not.toHaveBeenCalled();
  });

  it('is idempotent for the same customer and identity', async () => {
    const storage = storageWith();
    const purchases = purchasesWith();
    await linkPostHogIdentity(purchases, storage, resolves('uuid-1'));
    expect(await linkPostHogIdentity(purchases, storage, resolves('uuid-1'))).toBe('unchanged');
    expect(purchases.setAttributes).toHaveBeenCalledTimes(1);
  });

  it('re-links when the RevenueCat customer changes (reinstall or restore on a new customer)', async () => {
    const storage = storageWith();
    await linkPostHogIdentity(purchasesWith('$RCAnonymousID:one'), storage, resolves('uuid-1'));
    const second = purchasesWith('$RCAnonymousID:two');
    expect(await linkPostHogIdentity(second, storage, resolves('uuid-1'))).toBe('linked');
    expect(second.setAttributes).toHaveBeenCalledWith({ [POSTHOG_USER_ID_ATTRIBUTE]: 'uuid-1' });
    expect(storage.values.get(LINKED_PAIR_KEY)).toBe('$RCAnonymousID:two|uuid-1');
  });

  it('collapses concurrent calls into one attribute write', async () => {
    const storage = storageWith();
    const purchases = purchasesWith();
    const results = await Promise.all([
      linkPostHogIdentity(purchases, storage, resolves('uuid-1')),
      linkPostHogIdentity(purchases, storage, resolves('uuid-1')),
    ]);
    expect(results.sort()).toEqual(['in_flight', 'linked']);
    expect(purchases.setAttributes).toHaveBeenCalledTimes(1);
  });

  it('resolves failed, retries next time, and never rejects when RevenueCat throws', async () => {
    const storage = storageWith();
    const purchases = purchasesWith();
    purchases.setAttributes.mockRejectedValueOnce(new Error('not configured'));
    await expect(linkPostHogIdentity(purchases, storage, resolves('uuid-1'))).resolves.toBe('failed');
    expect(storage.values.has(LINKED_PAIR_KEY)).toBe(false);
    expect(await linkPostHogIdentity(purchases, storage, resolves('uuid-1'))).toBe('linked');
  });

  it('survives storage and resolver failures without throwing', async () => {
    const storage = { getItem: jest.fn(async () => { throw new Error('disk'); }), setItem: jest.fn(async () => {}) };
    await expect(linkPostHogIdentity(purchasesWith(), storage as any, resolves('uuid-1'))).resolves.toBe('failed');
    const boom = jest.fn(async () => { throw new Error('resolver'); });
    await expect(linkPostHogIdentity(purchasesWith(), storageWith(), boom as any)).resolves.toBe('failed');
  });

  it('links the very UUID that is persisted for posthog.identify, even when it is created at that moment', async () => {
    const storage = storageWith();
    const purchases = purchasesWith();
    const { getOrCreateAnalyticsUserId } = require('../analyticsIdentity');
    const fromSplash = getOrCreateAnalyticsUserId(storage, () => 'fresh-uuid');
    const result = await linkPostHogIdentity(purchases, storage, () => getOrCreateAnalyticsUserId(storage, () => 'second-uuid'));
    expect(result).toBe('linked');
    expect(await fromSplash).toBe('fresh-uuid');
    expect(purchases.setAttributes).toHaveBeenCalledWith({ [POSTHOG_USER_ID_ATTRIBUTE]: 'fresh-uuid' });
    expect(storage.values.get(ANALYTICS_USER_ID_KEY)).toBe('fresh-uuid');
  });
});
