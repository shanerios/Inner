/**
 * paywallController.ts
 *
 * Imperative bridge that navigates to PaywallScreen from non-React call sites.
 * Uses a navigation ref so it works anywhere without needing a component context.
 *
 * Usage:
 *   // Anywhere:
 *   openPaywall(() => refreshEntitlement(), undefined, 'chamber');
 */

import { navigationRef } from '../../navigation/navigationRef';

export type PaywallTrigger = 'chamber' | 'garden' | 'settings';

// ── Pending callback store ───────────────────────────────────────────────────
// Since React Navigation params can't carry functions, we stash callbacks here
// and PaywallScreen reads them on mount via consumePendingCallbacks().

let _pendingOnSuccess: (() => void) | undefined;
let _pendingOnDismiss: (() => void) | undefined;
let _pendingTrigger: PaywallTrigger = 'chamber';

export function openPaywall(
  onSuccess?: () => void,
  onDismiss?: () => void,
  trigger: PaywallTrigger = 'chamber',
): void {
  _pendingOnSuccess = onSuccess;
  _pendingOnDismiss = onDismiss;
  _pendingTrigger = trigger;

  if (navigationRef.isReady()) {
    // @ts-ignore — PaywallScreen is registered in App.tsx navigator
    navigationRef.navigate('Paywall');
  } else if (__DEV__) {
    console.warn('[Paywall] openPaywall() called before navigation was ready.');
  }
}

/** Called by PaywallScreen on mount to retrieve and clear the pending callbacks. */
export function consumePendingCallbacks(): {
  onSuccess: (() => void) | undefined;
  onDismiss: (() => void) | undefined;
  trigger: PaywallTrigger;
} {
  const result = {
    onSuccess: _pendingOnSuccess,
    onDismiss: _pendingOnDismiss,
    trigger: _pendingTrigger,
  };
  _pendingOnSuccess = undefined;
  _pendingOnDismiss = undefined;
  _pendingTrigger = 'chamber';
  return result;
}

// Kept for backward compatibility — no longer needed but avoids import errors.
export function registerPaywallController(_fn: unknown): void {}
