import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { ENTITLEMENT_ID } from '../constants';
import Purchases from 'react-native-purchases';
import { initRevenueCatOnce } from '../../../../utils/revenueCat';
import { clearMembershipCache, resolveMembership } from '../membership';

jest.mock('../../../../utils/revenueCat', () => ({
  initRevenueCatOnce: jest.fn<() => Promise<boolean>>(),
}));

jest.mock('react-native-purchases', () => ({
  __esModule: true,
  default: { getCustomerInfo: jest.fn<() => Promise<any>>() },
}));

const active = { entitlements: { active: { [ENTITLEMENT_ID]: { isActive: true } } } };
const inactive = { entitlements: { active: {} } };

describe('resolveMembership', () => {
  beforeEach(() => clearMembershipCache());

  it('reports member when the entitlement is active', async () => {
    await expect(resolveMembership({ fetchInfo: async () => active })).resolves.toBe('member');
  });

  it('reports not_member only when the SDK confirms no active entitlement', async () => {
    await expect(resolveMembership({ fetchInfo: async () => inactive })).resolves.toBe('not_member');
  });

  it('reports unknown on SDK error, never not_member', async () => {
    await expect(resolveMembership({
      fetchInfo: async () => { throw new Error('offline'); },
    })).resolves.toBe('unknown');
  });

  it('reports unknown on timeout, never not_member', async () => {
    const hangs = () => new Promise<never>(() => {});
    await expect(resolveMembership({ fetchInfo: hangs, timeoutMs: 10 })).resolves.toBe('unknown');
  });

  it('reports unknown on a malformed response', async () => {
    await expect(resolveMembership({ fetchInfo: async () => ({} as any) })).resolves.toBe('unknown');
  });

  it('reuses a confirmed result within the cache window without re-querying', async () => {
    let clock = 0;
    const fetchInfo = jest.fn<() => Promise<any>>(async () => active);
    const now = () => clock;
    await resolveMembership({ fetchInfo, now, cacheMs: 1_000 });
    clock = 500;
    await expect(resolveMembership({ fetchInfo, now, cacheMs: 1_000 })).resolves.toBe('member');
    expect(fetchInfo).toHaveBeenCalledTimes(1);
  });

  it('never caches unknown, so the next check asks again', async () => {
    const fetchInfo = jest.fn<() => Promise<any>>()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce(active);
    await expect(resolveMembership({ fetchInfo })).resolves.toBe('unknown');
    await expect(resolveMembership({ fetchInfo })).resolves.toBe('member');
    expect(fetchInfo).toHaveBeenCalledTimes(2);
  });

  it('re-checks after the cache window so expiry is seen', async () => {
    let clock = 0;
    const fetchInfo = jest.fn<() => Promise<any>>()
      .mockResolvedValueOnce(active)
      .mockResolvedValueOnce(inactive);
    const now = () => clock;
    await resolveMembership({ fetchInfo, now, cacheMs: 1_000 });
    clock = 5_000;
    await expect(resolveMembership({ fetchInfo, now, cacheMs: 1_000 })).resolves.toBe('not_member');
  });

  describe('default SDK path', () => {
    const order: string[] = [];
    beforeEach(() => {
      order.length = 0;
      (initRevenueCatOnce as jest.Mock<() => Promise<boolean>>).mockReset();
      (Purchases.getCustomerInfo as jest.Mock<() => Promise<any>>).mockReset();
    });

    it('configures RevenueCat before asking for customer info', async () => {
      (initRevenueCatOnce as jest.Mock<() => Promise<boolean>>).mockImplementation(async () => { order.push('init'); return true; });
      (Purchases.getCustomerInfo as jest.Mock<() => Promise<any>>).mockImplementation(async () => { order.push('info'); return active; });
      await expect(resolveMembership()).resolves.toBe('member');
      expect(order).toEqual(['init', 'info']);
    });

    it('reports unknown, without querying the SDK, when RevenueCat cannot be configured', async () => {
      (initRevenueCatOnce as jest.Mock<() => Promise<boolean>>).mockResolvedValue(false);
      await expect(resolveMembership()).resolves.toBe('unknown');
      expect(Purchases.getCustomerInfo).not.toHaveBeenCalled();
    });
  });
});
