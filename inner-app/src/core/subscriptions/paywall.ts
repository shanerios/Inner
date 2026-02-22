import { openPaywall } from './paywallController';
import Purchases from 'react-native-purchases';
import { ENTITLEMENT_ID } from './constants';

/**
 * Present the paywall if the user doesn't already have the required entitlement.
 * Returns true if the user purchased or restored during the session.
 *
 * onSuccess is called immediately after a successful purchase/restore inside
 * PaywallModal, before the modal closes.
 */
export function presentInnerPaywallIfNeeded(onSuccess?: () => void): void {
  openPaywall(onSuccess);
}
