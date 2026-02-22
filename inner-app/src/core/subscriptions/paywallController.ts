/**
 * paywallController.ts
 *
 * Imperative bridge between non-React call sites (safePresentPaywall, gate.ts, etc.)
 * and the <PaywallModal> component mounted at the App root.
 *
 * Usage:
 *   // In App.tsx (once, on mount):
 *   registerPaywallController((onSuccess) => { setPaywallVisible(true); ... });
 *
 *   // Anywhere else:
 *   openPaywall(() => refreshEntitlement());
 */

type ShowPaywallFn = (onSuccess?: () => void) => void;

let _showPaywall: ShowPaywallFn | null = null;

export function registerPaywallController(fn: ShowPaywallFn): void {
  _showPaywall = fn;
}

export function openPaywall(onSuccess?: () => void): void {
  if (_showPaywall) {
    _showPaywall(onSuccess);
  } else if (__DEV__) {
    console.warn('[Paywall] openPaywall() called before controller was registered.');
  }
}
