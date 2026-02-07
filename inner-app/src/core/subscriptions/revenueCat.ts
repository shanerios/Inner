import Purchases from 'react-native-purchases';
import { ENTITLEMENT_ID } from './constants';

export async function hasInnerAccess(): Promise<boolean> {
  try {
    const info = await Purchases.getCustomerInfo();
    return Boolean(info.entitlements.active[ENTITLEMENT_ID]);
  } catch (e) {
    console.log('[RevenueCat] entitlement check failed', e);
    return false;
  }
}