import AsyncStorage from '@react-native-async-storage/async-storage';
import { getOrCreateAnalyticsUserId } from './analyticsIdentity';

/**
 * Links the RevenueCat customer to the PostHog person so RevenueCat's server-side PostHog events
 * (rc_initial_purchase_event, rc_renewal_event, ...) land on the same person as the app's events.
 *
 * It only sets the `$posthogUserId` subscriber attribute. It never calls logIn, never changes the
 * RevenueCat app user ID, and never touches purchases, offerings or entitlements. The value comes from
 * the shared resolver SplashScreen also uses for posthog.identify(), so it is always the same UUID.
 */

export const POSTHOG_USER_ID_ATTRIBUTE = '$posthogUserId';
/** `${revenueCatAppUserId}|${posthogId}` last attached, so the call repeats only when either changes. */
export const LINKED_PAIR_KEY = 'inner.analytics.rcLinkedPair';

type PurchasesLike = {
  getAppUserID: () => Promise<string>;
  setAttributes: (attributes: { [key: string]: string | null }) => Promise<void>;
};

type StorageLike = {
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, value: string) => Promise<void>;
};

export type LinkResult = 'linked' | 'unchanged' | 'no_identity' | 'in_flight' | 'failed';

let inFlight: Promise<LinkResult> | null = null;

/** Test seam. */
export function resetRevenueCatIdentityForTests() {
  inFlight = null;
}

/**
 * Call only after Purchases.configure(). Safe to call repeatedly and concurrently; resolves (never
 * rejects) so callers can fire and forget without delaying startup or a purchase.
 */
export function linkPostHogIdentity(
  purchases: PurchasesLike,
  storage: StorageLike = AsyncStorage,
  resolveUserId: () => Promise<string | null> = getOrCreateAnalyticsUserId,
): Promise<LinkResult> {
  if (inFlight) return Promise.resolve('in_flight');
  inFlight = (async (): Promise<LinkResult> => {
    try {
      // The one shared resolver: it returns the existing UUID, or creates it once for both this link and
      // posthog.identify(), whichever runs first. There is never a second identity.
      const posthogId = await resolveUserId();
      if (!posthogId) return 'no_identity';

      const appUserId = await purchases.getAppUserID();
      const pair = `${appUserId}|${posthogId}`;
      if ((await storage.getItem(LINKED_PAIR_KEY)) === pair) return 'unchanged';

      await purchases.setAttributes({ [POSTHOG_USER_ID_ATTRIBUTE]: posthogId });
      await storage.setItem(LINKED_PAIR_KEY, pair);
      return 'linked';
    } catch {
      // Attribute linking is best effort. The next configure retries it.
      return 'failed';
    } finally {
      inFlight = null;
    }
  })();
  return inFlight;
}
