export type PaywallPlatform = 'ios' | 'android' | string;

type PackageLike = { packageType?: string | null; identifier: string };

// Matches how PaywallScreen labels a plan "Lifetime".
export function isLifetimePackage(pkg: PackageLike | null | undefined): boolean {
  if (!pkg) return false;
  return pkg.packageType === 'LIFETIME' || pkg.identifier.toLowerCase().includes('lifetime');
}

function accountSettingsStore(platform: PaywallPlatform): string {
  return platform === 'android' ? 'Google Play' : 'App Store';
}

type DisclosureInput = {
  platform: PaywallPlatform;
  isLifetime: boolean;
  trialDays: number | null;
  priceLabel: string | null;
};

// Legal line under the purchase button. Lifetime is a one-time purchase, so it must never be
// described as an auto-renewable subscription.
export function paywallLegalCopy({ platform, isLifetime, trialDays, priceLabel }: DisclosureInput): string {
  if (isLifetime) {
    return 'Lifetime is a one-time purchase. It is not a subscription and does not renew.';
  }
  if (trialDays) {
    return `Try free for ${trialDays} days, then ${priceLabel ?? 'the plan price'} unless canceled at least 24 hours before the trial ends. Cancel anytime in your ${accountSettingsStore(platform)} account settings.`;
  }
  return 'Inner: Deeper is an auto-renewable subscription. Subscriptions will renew until canceled. Cancel anytime.';
}
