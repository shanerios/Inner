import Purchases, { LOG_LEVEL } from 'react-native-purchases';
import { Platform } from 'react-native';
import { linkPostHogIdentity } from '../core/revenueCatIdentity';

// ── RevenueCat init ───────────────────────────────────────────────────────────
// Configured once from the App startup effect, and again on demand by any reader or paywall that gets
// there first. Configuring is a synchronous native call, so "configured" is true the moment the first
// caller returns: nothing has to wait for it, and nothing can read before it.
let __rcConfigured = false;
let __rcMissingKeyWarned = false;
let __rcInitPromise: Promise<boolean> | null = null;

/**
 * Configures the SDK exactly once. Returns whether the SDK is configured. A failure (missing key, native
 * error) is not remembered, so the next caller tries again; a success is never repeated.
 */
export function ensureRevenueCatConfigured(): boolean {
  if (__rcConfigured) return true;
  try {
    // Verbose logs in dev only
    Purchases.setLogLevel(__DEV__ ? LOG_LEVEL.VERBOSE : LOG_LEVEL.WARN);

    const apiKey =
      Platform.OS === 'android'
        ? process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY
        : process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY;

    // Safe log presence of env keys (do NOT log raw key)
    if (__DEV__) {
      console.log('[RC ENV] iOS key present?', !!process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY);
      console.log('[RC ENV] Android key present?', !!process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY);
    }

    if (!apiKey) {
      if (!__rcMissingKeyWarned) {
        __rcMissingKeyWarned = true;
        console.warn('[RevenueCat] Missing API key for platform:', Platform.OS);
      }
      return false;
    }

    // Configure creates the singleton. This MUST happen before any SDK calls. It never passes an
    // appUserID, so the SDK keeps using its own persisted anonymous ID.
    Purchases.configure({ apiKey });
    __rcConfigured = true;
    if (__DEV__) console.log('[RevenueCat] configured for', Platform.OS);

    // Attach the PostHog identity as a subscriber attribute. Fire and forget: never awaited, so it
    // cannot delay startup or a purchase, and it never changes the RevenueCat app user ID.
    void linkPostHogIdentity(Purchases).then(result => {
      if (__DEV__) console.log('[RevenueCat] PostHog identity link:', result);
    });
    return true;
  } catch (e) {
    console.log('[RevenueCat] configure error', e);
    return false;
  }
}

export function initRevenueCatOnce(): Promise<boolean> {
  if (__rcInitPromise) return __rcInitPromise;

  const attempt = (async () => {
    if (!ensureRevenueCatConfigured()) return false;

    // Optional: touch the SDK once to ensure the singleton is actually usable.
    // (Do not block app startup on network; this will be fast if offline.)
    try {
      await Purchases.getCustomerInfo();
    } catch {}

    return true;
  })();
  __rcInitPromise = attempt;
  // A failed attempt is not cached, so a later caller (for example the paywall) can retry.
  void attempt.then(ok => {
    if (!ok && __rcInitPromise === attempt) __rcInitPromise = null;
  });
  return attempt;
}

/**
 * For entitlement and identity reads. Makes sure the SDK is configured first (a no-op once it is), then
 * reads. It never waits on the network or on init, so the existing timeouts and fail-closed behaviour of
 * each caller are unchanged.
 */
export function getCustomerInfoReady() {
  ensureRevenueCatConfigured();
  return Purchases.getCustomerInfo();
}

export function getAppUserIdReady() {
  ensureRevenueCatConfigured();
  return Purchases.getAppUserID();
}

/** Test seam. */
export function resetRevenueCatInitForTests() {
  __rcConfigured = false;
  __rcMissingKeyWarned = false;
  __rcInitPromise = null;
}
