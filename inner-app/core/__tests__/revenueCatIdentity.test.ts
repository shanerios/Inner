jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'));

import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import {
  ANALYTICS_USER_ID_KEY,
  LINKED_PAIR_KEY,
  linkPostHogIdentity,
  POSTHOG_USER_ID_ATTRIBUTE,
  resetRevenueCatIdentityForTests,
} from '../revenueCatIdentity';

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

beforeEach(() => resetRevenueCatIdentityForTests());

describe('RevenueCat to PostHog identity link', () => {
  it('sets only $posthogUserId, using the existing install UUID', async () => {
    const storage = storageWith({ [ANALYTICS_USER_ID_KEY]: 'uuid-1' });
    const purchases = purchasesWith();
    expect(await linkPostHogIdentity(purchases, storage)).toBe('linked');
    expect(purchases.setAttributes).toHaveBeenCalledTimes(1);
    expect(purchases.setAttributes).toHaveBeenCalledWith({ [POSTHOG_USER_ID_ATTRIBUTE]: 'uuid-1' });
    expect(POSTHOG_USER_ID_ATTRIBUTE).toBe('$posthogUserId');
  });

  it('never generates an identity, and never logs in or changes the app user id', async () => {
    const storage = storageWith();
    const purchases: any = { ...purchasesWith(), logIn: jest.fn(), logOut: jest.fn() };
    expect(await linkPostHogIdentity(purchases, storage)).toBe('no_identity');
    expect(purchases.setAttributes).not.toHaveBeenCalled();
    expect(storage.setItem).not.toHaveBeenCalled();
    storage.values.set(ANALYTICS_USER_ID_KEY, 'uuid-1');
    await linkPostHogIdentity(purchases, storage);
    expect(purchases.logIn).not.toHaveBeenCalled();
    expect(purchases.logOut).not.toHaveBeenCalled();
    expect(storage.values.get(ANALYTICS_USER_ID_KEY)).toBe('uuid-1');
  });

  it('is idempotent for the same customer and identity', async () => {
    const storage = storageWith({ [ANALYTICS_USER_ID_KEY]: 'uuid-1' });
    const purchases = purchasesWith();
    await linkPostHogIdentity(purchases, storage);
    expect(await linkPostHogIdentity(purchases, storage)).toBe('unchanged');
    expect(purchases.setAttributes).toHaveBeenCalledTimes(1);
  });

  it('re-links when the RevenueCat customer changes (reinstall or restore on a new customer)', async () => {
    const storage = storageWith({ [ANALYTICS_USER_ID_KEY]: 'uuid-1' });
    await linkPostHogIdentity(purchasesWith('$RCAnonymousID:one'), storage);
    const second = purchasesWith('$RCAnonymousID:two');
    expect(await linkPostHogIdentity(second, storage)).toBe('linked');
    expect(second.setAttributes).toHaveBeenCalledWith({ [POSTHOG_USER_ID_ATTRIBUTE]: 'uuid-1' });
    expect(storage.values.get(LINKED_PAIR_KEY)).toBe('$RCAnonymousID:two|uuid-1');
  });

  it('collapses concurrent calls into one attribute write', async () => {
    const storage = storageWith({ [ANALYTICS_USER_ID_KEY]: 'uuid-1' });
    const purchases = purchasesWith();
    const results = await Promise.all([
      linkPostHogIdentity(purchases, storage),
      linkPostHogIdentity(purchases, storage),
    ]);
    expect(results.sort()).toEqual(['in_flight', 'linked']);
    expect(purchases.setAttributes).toHaveBeenCalledTimes(1);
  });

  it('resolves failed, retries next time, and never rejects when RevenueCat throws', async () => {
    const storage = storageWith({ [ANALYTICS_USER_ID_KEY]: 'uuid-1' });
    const purchases = purchasesWith();
    purchases.setAttributes.mockRejectedValueOnce(new Error('not configured'));
    await expect(linkPostHogIdentity(purchases, storage)).resolves.toBe('failed');
    expect(storage.values.has(LINKED_PAIR_KEY)).toBe(false);
    expect(await linkPostHogIdentity(purchases, storage)).toBe('linked');
  });

  it('survives storage failures without throwing', async () => {
    const storage = { getItem: jest.fn(async () => { throw new Error('disk'); }), setItem: jest.fn(async () => {}) };
    await expect(linkPostHogIdentity(purchasesWith(), storage as any)).resolves.toBe('failed');
  });

  it('does not depend on PostHog being available', async () => {
    // The helper takes no analytics client at all: with analytics disabled the link still resolves.
    const storage = storageWith({ [ANALYTICS_USER_ID_KEY]: 'uuid-1' });
    await expect(linkPostHogIdentity(purchasesWith(), storage)).resolves.toBe('linked');
  });
});

describe('wiring', () => {
  const fs = require('fs');
  const path = require('path');
  const source = fs.readFileSync(path.join(__dirname, '../../utils/revenueCat.ts'), 'utf8') as string;

  it('links only after configure, without awaiting it, and without logIn', () => {
    const configureAt = source.indexOf('Purchases.configure({ apiKey })');
    const linkAt = source.indexOf('linkPostHogIdentity(Purchases)');
    expect(configureAt).toBeGreaterThan(-1);
    expect(linkAt).toBeGreaterThan(configureAt);
    expect(source).not.toMatch(/await\s+linkPostHogIdentity/);
    expect(source).not.toMatch(/logIn\(|logOut\(/);
  });

  it('uses the same storage key SplashScreen identifies with', () => {
    const splash = fs.readFileSync(path.join(__dirname, '../../screens/SplashScreen.tsx'), 'utf8') as string;
    expect(splash).toContain(`const USER_ID_KEY = '${ANALYTICS_USER_ID_KEY}'`);
    expect(splash).toContain('posthog?.identify(userId)');
  });
});
