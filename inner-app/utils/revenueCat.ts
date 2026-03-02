import Purchases, { LOG_LEVEL } from 'react-native-purchases';
import { Platform } from 'react-native';

// ── RevenueCat init (must be ready BEFORE any paywall calls) ──────────────────
let __rcInitPromise: Promise<boolean> | null = null;

export function initRevenueCatOnce(): Promise<boolean> {
  if (__rcInitPromise) return __rcInitPromise;

  __rcInitPromise = (async () => {
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
        console.warn('[RevenueCat] Missing API key for platform:', Platform.OS);
        return false;
      }

      // Configure creates the singleton. This MUST happen before any SDK calls.
      Purchases.configure({ apiKey });
      if (__DEV__) console.log('[RevenueCat] configured for', Platform.OS);

      // Optional: touch the SDK once to ensure the singleton is actually usable.
      // (Do not block app startup on network; this will be fast if offline.)
      try {
        await Purchases.getCustomerInfo();
      } catch {}

      return true;
    } catch (e) {
      console.log('[RevenueCat] configure error', e);
      return false;
    }
  })();

  return __rcInitPromise;
}
