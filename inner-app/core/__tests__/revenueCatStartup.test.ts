jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'));

jest.mock('expo-crypto', () => {
  let n = 0;
  return { randomUUID: () => `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}` };
});

const calls: string[] = [];
const mockPurchases = {
  setLogLevel: jest.fn(),
  configure: jest.fn((_config: unknown) => { calls.push('configure'); }),
  getCustomerInfo: jest.fn(async () => { calls.push('getCustomerInfo'); return { entitlements: { active: { continuing_with_inner: {} } } }; }),
  getAppUserID: jest.fn(async () => { calls.push('getAppUserID'); return '$RCAnonymousID:anon'; }),
  setAttributes: jest.fn(async (_a: unknown) => { calls.push('setAttributes'); }),
  logIn: jest.fn(),
  logOut: jest.fn(),
};
jest.mock('react-native-purchases', () => ({
  __esModule: true,
  default: mockPurchases,
  LOG_LEVEL: { VERBOSE: 'VERBOSE', WARN: 'WARN' },
}));

import * as fs from 'fs';
import * as path from 'path';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';

const KEY = 'EXPO_PUBLIC_REVENUECAT_IOS_KEY';

function load() {
  jest.resetModules();
  const rc = require('../../utils/revenueCat') as typeof import('../../utils/revenueCat');
  const access = require('../../src/core/subscriptions/revenueCat') as typeof import('../../src/core/subscriptions/revenueCat');
  const aeris = require('../../src/core/aeris/aerisUsage') as typeof import('../../src/core/aeris/aerisUsage');
  const identity = require('../analyticsIdentity') as typeof import('../analyticsIdentity');
  const linking = require('../revenueCatIdentity') as typeof import('../revenueCatIdentity');
  return { rc, access, aeris, identity, linking };
}

beforeEach(() => {
  calls.length = 0;
  Object.values(mockPurchases).forEach(fn => (fn as jest.Mock).mockClear?.());
  process.env[KEY] = 'appl_test_key';
});

describe('RevenueCat startup initialization', () => {
  it('configures exactly once for concurrent startup callers, without logIn/logOut or an app user id', async () => {
    const { rc } = load();
    const results = await Promise.all([rc.initRevenueCatOnce(), rc.initRevenueCatOnce(), rc.initRevenueCatOnce()]);
    expect(results).toEqual([true, true, true]);
    expect(mockPurchases.configure).toHaveBeenCalledTimes(1);
    expect(mockPurchases.configure.mock.calls[0][0]).toEqual({ apiKey: 'appl_test_key' });
    expect(mockPurchases.logIn).not.toHaveBeenCalled();
    expect(mockPurchases.logOut).not.toHaveBeenCalled();
  });

  it('is configured synchronously, so nothing can read before it', () => {
    const { rc } = load();
    void rc.initRevenueCatOnce();
    expect(calls[0]).toBe('configure');
    expect(rc.ensureRevenueCatConfigured()).toBe(true);
    expect(mockPurchases.configure).toHaveBeenCalledTimes(1);
  });

  it('does not block: init returns a promise immediately and the warm-up does not gate configure', async () => {
    const { rc } = load();
    let release: () => void = () => {};
    mockPurchases.getCustomerInfo.mockImplementationOnce(() => new Promise(resolve => { release = () => resolve({ entitlements: { active: {} } } as any); }) as any);
    const pending = rc.initRevenueCatOnce();
    expect(mockPurchases.configure).toHaveBeenCalledTimes(1);
    expect(rc.ensureRevenueCatConfigured()).toBe(true);
    release();
    await expect(pending).resolves.toBe(true);
  });

  it('does not cache a failed initialization: a later caller retries and succeeds', async () => {
    const { rc } = load();
    delete process.env[KEY];
    expect(await rc.initRevenueCatOnce()).toBe(false);
    expect(rc.ensureRevenueCatConfigured()).toBe(false);
    expect(mockPurchases.configure).not.toHaveBeenCalled();
    process.env[KEY] = 'appl_test_key';
    expect(await rc.initRevenueCatOnce()).toBe(true);
    expect(mockPurchases.configure).toHaveBeenCalledTimes(1);
  });

  it('retries after a native configure error, and never configures twice once it succeeded', async () => {
    const { rc } = load();
    mockPurchases.configure.mockImplementationOnce(() => { throw new Error('native'); });
    expect(rc.ensureRevenueCatConfigured()).toBe(false);
    expect(rc.ensureRevenueCatConfigured()).toBe(true);
    expect(rc.ensureRevenueCatConfigured()).toBe(true);
    expect(mockPurchases.configure).toHaveBeenCalledTimes(2);
  });

  it('a warm-up failure (offline) still counts as initialized and never blocks startup', async () => {
    const { rc } = load();
    mockPurchases.getCustomerInfo.mockRejectedValueOnce(new Error('offline'));
    expect(await rc.initRevenueCatOnce()).toBe(true);
  });
});

describe('entitlement and identity reads', () => {
  it('a read that runs before startup init configures first, so it does not fail for being early', async () => {
    const { access } = load();
    expect(await access.hasInnerAccess()).toBe(true);
    expect(calls.indexOf('configure')).toBeGreaterThanOrEqual(0);
    expect(calls.indexOf('configure')).toBeLessThan(calls.indexOf('getCustomerInfo'));
    expect(mockPurchases.configure).toHaveBeenCalledTimes(1);
  });

  it('reads after startup init reuse the same configuration', async () => {
    const { rc, access } = load();
    await rc.initRevenueCatOnce();
    await access.hasInnerAccess();
    expect(mockPurchases.configure).toHaveBeenCalledTimes(1);
  });

  it('still fails closed with no key, and for a non-subscriber', async () => {
    const { access } = load();
    delete process.env[KEY];
    mockPurchases.getCustomerInfo.mockRejectedValueOnce(new Error('There is no singleton instance'));
    expect(await access.hasInnerAccess()).toBe(false);
    process.env[KEY] = 'appl_test_key';
    mockPurchases.getCustomerInfo.mockResolvedValueOnce({ entitlements: { active: {} } } as any);
    expect(await access.hasInnerAccess()).toBe(false);
  });

  it('keeps the bounded wait: a hung SDK read resolves false after the timeout, never indefinitely', async () => {
    jest.useFakeTimers();
    try {
      const { access } = load();
      mockPurchases.getCustomerInfo.mockImplementationOnce(() => new Promise(() => {}) as any);
      const result = access.hasInnerAccess();
      await jest.advanceTimersByTimeAsync(5001);
      await expect(result).resolves.toBe(false);
    } finally {
      jest.useRealTimers();
    }
  });

  it('the Aeris user id read configures on demand and returns the anonymous RevenueCat id unchanged', async () => {
    const { aeris } = load();
    expect(await aeris.getAerisUserId()).toBe('$RCAnonymousID:anon');
    expect(calls.indexOf('configure')).toBeLessThan(calls.indexOf('getAppUserID'));
  });
});

describe('identity linking at startup', () => {
  it('links the shared UUID after configure, even when Splash creates it at the same moment', async () => {
    const { rc, identity } = load();
    const splash = identity.getOrCreateAnalyticsUserId();
    void rc.initRevenueCatOnce();
    const uuid = await splash;
    await new Promise(resolve => setTimeout(resolve, 20));
    expect(uuid).toBeTruthy();
    expect(calls.indexOf('configure')).toBeLessThan(calls.indexOf('setAttributes'));
    expect(mockPurchases.setAttributes).toHaveBeenCalledTimes(1);
    expect(mockPurchases.setAttributes).toHaveBeenCalledWith({ $posthogUserId: uuid });
  });

  it('sends only the random UUID: no personal or dream content', async () => {
    const { rc, identity } = load();
    await rc.initRevenueCatOnce();
    const uuid = await identity.getOrCreateAnalyticsUserId();
    await new Promise(resolve => setTimeout(resolve, 20));
    expect(uuid).toMatch(/^[0-9a-f-]{36}$/i);
    for (const call of mockPurchases.setAttributes.mock.calls) {
      expect(Object.keys(call[0] as object)).toEqual(['$posthogUserId']);
    }
  });
});

describe('startup wiring', () => {
  const app = fs.readFileSync(path.join(__dirname, '../../App.tsx'), 'utf8');
  it('App starts RevenueCat from a mount effect without awaiting it', () => {
    expect(app).toContain("import { initRevenueCatOnce } from './utils/revenueCat'");
    expect(app).toMatch(/useEffect\(\(\) => \{\s*initRevenueCatOnce\(\)\.catch\(\(\) => \{\}\);\s*\}, \[\]\);/);
    expect(app).not.toMatch(/await\s+initRevenueCatOnce/);
  });
  it('no screen reads entitlements or the app user id with a bare Purchases call', () => {
    const files = [
      'screens/ChambersScreen.tsx', 'screens/SoundscapesScreen.tsx', 'screens/JourneyPlayer.tsx',
      'screens/HomeScreen.tsx', 'screens/AerisScreen.tsx', 'src/core/subscriptions/revenueCat.ts', 'src/core/aeris/aerisUsage.ts',
    ];
    for (const file of files) {
      const source = fs.readFileSync(path.join(__dirname, '../..', file), 'utf8');
      expect(source).not.toMatch(/Purchases\.(getCustomerInfo|getAppUserID)\(/);
    }
  });
  it('purchase, restore and offerings code is untouched by this change', () => {
    const paywall = fs.readFileSync(path.join(__dirname, '../../screens/PaywallScreen.tsx'), 'utf8');
    expect(paywall).toContain('Purchases.purchasePackage(');
    expect(paywall).toContain('Purchases.restorePurchases()');
    expect(paywall).toContain('Purchases.getOfferings()');
    expect(paywall).not.toMatch(/logIn\(|logOut\(/);
  });
});
