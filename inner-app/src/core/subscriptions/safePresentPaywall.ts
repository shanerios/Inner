import { Platform } from "react-native";
import { openPaywall } from './paywallController';

let presenting = false;

export async function safePresentPaywall(onSuccess?: () => void): Promise<void> {
  if (presenting) return;
  presenting = true;

  try {
    openPaywall(onSuccess);
  } finally {
    // Release the lock after a moment (prevents rapid taps reopening the modal)
    setTimeout(() => {
      presenting = false;
    }, Platform.OS === "ios" ? 900 : 600);
  }
}
