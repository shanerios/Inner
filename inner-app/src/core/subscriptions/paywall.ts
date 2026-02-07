import RevenueCatUI, { PAYWALL_RESULT } from 'react-native-purchases-ui';
import { ENTITLEMENT_ID } from './constants';

export async function presentInnerPaywallIfNeeded(): Promise<boolean> {
  const res = await RevenueCatUI.presentPaywallIfNeeded({
    requiredEntitlementIdentifier: ENTITLEMENT_ID,
  });

  return (
    res === PAYWALL_RESULT.PURCHASED ||
    res === PAYWALL_RESULT.RESTORED
  );
}