import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * The single place the install-scoped analytics identity is read or created. SplashScreen passes it to
 * posthog.identify() and the RevenueCat link sends the same value as `$posthogUserId`, so the two can
 * never disagree. It is a random UUID: nothing personal and nothing derived from user content.
 */

/** Existing key. Existing installs keep their UUID. */
export const ANALYTICS_USER_ID_KEY = 'inner.user.id';

type StorageLike = {
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, value: string) => Promise<void>;
};

let resolved: string | null = null;
let pending: Promise<string | null> | null = null;

function defaultMakeId(): string {
  // Loaded lazily so tests and non-native contexts can inject their own generator.
  return (require('expo-crypto') as typeof import('expo-crypto')).randomUUID();
}

/** Test seam. */
export function resetAnalyticsIdentityForTests() {
  resolved = null;
  pending = null;
}

/**
 * Returns the persisted UUID, creating it once if the install has none. Concurrent callers share one
 * read-or-create, and a successful result is memoised for the process. Resolves null (never throws) if
 * storage fails, in which case nothing is cached and the next call tries again; an ID that could not be
 * persisted is never returned, so a later launch cannot end up with a different identity.
 */
export function getOrCreateAnalyticsUserId(
  storage: StorageLike = AsyncStorage,
  makeId: () => string = defaultMakeId,
): Promise<string | null> {
  if (resolved) return Promise.resolve(resolved);
  if (pending) return pending;
  pending = (async () => {
    try {
      const existing = await storage.getItem(ANALYTICS_USER_ID_KEY);
      if (existing) {
        resolved = existing;
        return existing;
      }
      const created = makeId();
      await storage.setItem(ANALYTICS_USER_ID_KEY, created);
      resolved = created;
      return created;
    } catch {
      return null;
    } finally {
      pending = null;
    }
  })();
  return pending;
}
