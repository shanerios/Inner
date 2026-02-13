import { Alert, Platform } from "react-native";
import Purchases from "react-native-purchases";
// If you're using RevenueCat UI:
import { presentPaywall } from "react-native-purchases-ui"; // adjust if different

let presenting = false;

export async function safePresentPaywall(): Promise<void> {
  if (presenting) return;
  presenting = true;

  try {
    // 1) Confirm RevenueCat can actually fetch products
    let offerings;
    try {
        offerings = await Purchases.getOfferings();
    } catch {
        offerings = null;
    }
    
    if (!offerings?.current) {
      Alert.alert(
        "Membership unavailable",
        "Inner couldn’t load subscriptions on this device yet. Please try again in a moment."
      );
      return;
    }

    // 2) Present paywall only when safe
    await presentPaywall();
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