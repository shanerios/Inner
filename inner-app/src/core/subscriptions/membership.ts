import Purchases from 'react-native-purchases';
import { initRevenueCatOnce } from '../../../utils/revenueCat';
import { ENTITLEMENT_ID } from './constants';

/**
 * Tri-state membership. `unknown` means verification failed (timeout, offline,
 * SDK error). It must never be presented as "not subscribed".
 */
export type MembershipStatus = 'member' | 'not_member' | 'unknown';

type ActiveInfo = { entitlements: { active: Record<string, unknown> } };

export const MEMBERSHIP_TIMEOUT_MS = 5_000;
/** Confirmed results are reused briefly so one screen does not query the SDK repeatedly. */
export const MEMBERSHIP_CACHE_MS = 30_000;

let confirmed: { status: 'member' | 'not_member'; at: number } | null = null;

/** Only confirmed results are cached. `unknown` is never cached. */
export function clearMembershipCache(): void {
  confirmed = null;
}

type ResolveOptions = {
  timeoutMs?: number;
  cacheMs?: number;
  now?: () => number;
  fetchInfo?: () => Promise<ActiveInfo>;
};

/** Never throws. Errors and timeouts resolve to `unknown`. */
export async function resolveMembership(options: ResolveOptions = {}): Promise<MembershipStatus> {
  const now = options.now ?? Date.now;
  const cacheMs = options.cacheMs ?? MEMBERSHIP_CACHE_MS;
  const timeoutMs = options.timeoutMs ?? MEMBERSHIP_TIMEOUT_MS;
  // RevenueCat is configured lazily (paywall entry points). A gate can run first,
  // so it must make sure the SDK exists, or every check reads as `unknown`.
  const fetchInfo = options.fetchInfo ?? (async () => {
    if (!(await initRevenueCatOnce())) throw new Error('RevenueCat is not configured');
    return Purchases.getCustomerInfo() as unknown as Promise<ActiveInfo>;
  });

  if (confirmed && now() - confirmed.at < cacheMs) return confirmed.status;

  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const info = await Promise.race([
      fetchInfo(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('membership check timed out')), timeoutMs);
      }),
    ]);
    if (!info || !info.entitlements || typeof info.entitlements.active !== 'object') {
      return 'unknown';
    }
    const status = info.entitlements.active[ENTITLEMENT_ID] ? 'member' : 'not_member';
    confirmed = { status, at: now() };
    return status;
  } catch {
    return 'unknown';
  } finally {
    if (timer) clearTimeout(timer);
  }
}
