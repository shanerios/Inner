import { isLifetimePackage, paywallLegalCopy } from '../paywallDisclosure';

describe('paywallLegalCopy', () => {
  const yearly = { isLifetime: false, trialDays: 7, priceLabel: '$59.99/yr' };

  it('names the App Store account settings on iOS', () => {
    const copy = paywallLegalCopy({ platform: 'ios', ...yearly });
    expect(copy).toContain('App Store account settings');
    expect(copy).not.toContain('Google Play');
  });

  it('names Google Play account settings on Android', () => {
    const copy = paywallLegalCopy({ platform: 'android', ...yearly });
    expect(copy).toContain('Google Play account settings');
    expect(copy).not.toContain('App Store');
  });

  it('keeps the trial length, price and 24-hour cancellation terms', () => {
    const copy = paywallLegalCopy({ platform: 'ios', ...yearly });
    expect(copy).toContain('Try free for 7 days, then $59.99/yr');
    expect(copy).toContain('at least 24 hours before the trial ends');
  });

  it('keeps the auto-renewal disclosure for a subscription without a trial', () => {
    const copy = paywallLegalCopy({ platform: 'ios', isLifetime: false, trialDays: null, priceLabel: '$9.99/mo' });
    expect(copy).toBe('Inner: Deeper is an auto-renewable subscription. Subscriptions will renew until canceled. Cancel anytime.');
  });

  it('describes Lifetime as a one-time purchase that does not renew, on both platforms', () => {
    for (const platform of ['ios', 'android']) {
      const copy = paywallLegalCopy({ platform, isLifetime: true, trialDays: null, priceLabel: '$249.99' });
      expect(copy).toContain('one-time purchase');
      expect(copy).toContain('does not renew');
      expect(copy).not.toMatch(/auto-renewable/);
    }
  });

  it('shows the matching terms as the selected plan changes', () => {
    const plans = [
      { name: 'yearly', isLifetime: false, trialDays: 7, priceLabel: '$59.99/yr' },
      { name: 'monthly', isLifetime: false, trialDays: 7, priceLabel: '$9.99/mo' },
      { name: 'lifetime', isLifetime: true, trialDays: null, priceLabel: '$249.99' },
      { name: 'yearly', isLifetime: false, trialDays: 7, priceLabel: '$59.99/yr' },
    ];
    const copies = plans.map((p) => paywallLegalCopy({ platform: 'ios', ...p }));
    expect(copies[0]).toContain('$59.99/yr');
    expect(copies[1]).toContain('$9.99/mo');
    expect(copies[2]).toContain('one-time purchase');
    expect(copies[3]).toBe(copies[0]);
  });
});

describe('isLifetimePackage', () => {
  it('recognises the Lifetime plan by package type or identifier', () => {
    expect(isLifetimePackage({ packageType: 'LIFETIME', identifier: '$rc_lifetime' })).toBe(true);
    expect(isLifetimePackage({ packageType: 'CUSTOM', identifier: 'inner_Lifetime' })).toBe(true);
  });
  it('does not treat subscriptions as Lifetime', () => {
    expect(isLifetimePackage({ packageType: 'ANNUAL', identifier: '$rc_annual' })).toBe(false);
    expect(isLifetimePackage({ packageType: 'MONTHLY', identifier: '$rc_monthly' })).toBe(false);
    expect(isLifetimePackage(null)).toBe(false);
  });
});
