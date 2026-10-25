import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { ENTITLEMENT_ID } from '../constants';
import { clearMembershipCache, resolveMembership } from '../membership';

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
});
