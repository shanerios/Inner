import { Alert, Platform } from "react-native";
import Purchases from "react-native-purchases";
// If you're using RevenueCat UI:
import RevenueCatUI from "react-native-purchases-ui";


let presenting = false;

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export async function safePresentPaywall(): Promise<void> {
  if (presenting) return;
  presenting = true;

  try {
    // 1) Try to fetch offerings (StoreKit can be slow on cold start)
    let offerings: any = null;

    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        offerings = await Purchases.getOfferings();
      } catch {
        offerings = null;
      }

      if (offerings?.current) break;

      // brief backoff before retry
      if (attempt === 0) await sleep(350);
    }

    // 2) Present paywall.
    // If offerings are still unavailable, we still attempt to present inside try/catch.
    // This allows RevenueCat to use any cached paywall config while remaining crash-safe.
    // Present paywall using the installed RC UI API.
    // (Some versions export a default object with .presentPaywall rather than a named export.)
    await (RevenueCatUI as any).presentPaywall();

    // If we *still* have no offerings after presenting, we can optionally log in dev.
    if (__DEV__ && !offerings?.current) {
      console.log('[Paywall] Presented paywall without current offerings (likely cached).');
    }
  } catch (e) {
    if (__DEV__) {
      console.log("[Paywall] safePresentPaywall error:", e);
    }
    Alert.alert(
      "Membership unavailable",
      "We couldn’t open the membership screen right now. Please try again."
    );
  } finally {
    // Release the lock after a moment (prevents rapid taps)
    setTimeout(() => {
      presenting = false;
    }, Platform.OS === "ios" ? 900 : 600);
  }
}