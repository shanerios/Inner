import Purchases from 'react-native-purchases';
import { ENTITLEMENT_ID } from './constants';

// getCustomerInfo() can hang rather than reject (e.g. SDK never configured,
// dead network) — bound it so callers gating a tap always get an answer
// instead of leaving the UI looking unresponsive.
const ENTITLEMENT_CHECK_TIMEOUT_MS = 5000;

export async function hasInnerAccess(): Promise<boolean> {
  try {
    const info = await Promise.race([
      Purchases.getCustomerInfo(),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('RevenueCat entitlement check timed out')), ENTITLEMENT_CHECK_TIMEOUT_MS)
      ),
    ]);
    return Boolean(info.entitlements.active[ENTITLEMENT_ID]);
  } catch (e) {
    if (__DEV__) console.log('[RevenueCat] entitlement check failed', e);
    return false;
  }
}