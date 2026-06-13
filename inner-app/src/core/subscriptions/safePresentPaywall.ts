import { openPaywall, PaywallTrigger } from './paywallController';

let presenting = false;

export async function safePresentPaywall(
  onSuccess?: () => void,
  trigger: PaywallTrigger = 'chamber',
): Promise<void> {
  if (presenting) return;
  presenting = true;

  try {
    openPaywall(
      onSuccess,
      () => { presenting = false; }, // release exactly on dismiss
      trigger,
    );
  } catch (e) {
    presenting = false;
    if (__DEV__) console.log('[Paywall] openPaywall failed', e);
  }
}
