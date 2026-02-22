import { Platform } from "react-native";
import { openPaywall } from './paywallController';

let presenting = false;

export async function safePresentPaywall(onSuccess?: () => void): Promise<void> {
  if (presenting) return;
  presenting = true;

  try {
    openPaywall(
      onSuccess,
      () => { presenting = false; } // release exactly on dismiss
    );
  } catch (e) {
    presenting = false;
    console.log('[Paywall] openPaywall failed', e);
  }
}
