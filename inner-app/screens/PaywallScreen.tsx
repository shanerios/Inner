import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Linking,
  ActivityIndicator,
  Dimensions,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Purchases, { PurchasesPackage } from 'react-native-purchases';
import { usePostHog } from 'posthog-react-native';
import { initRevenueCatOnce } from '../utils/revenueCat';
import { consumePendingCallbacks, PaywallTrigger } from '../src/core/subscriptions/paywallController';

// ─── Constants ────────────────────────────────────────────────────────────────

const TERMS_URL = 'https://www.apple.com/legal/internet-services/itunes/dev/stdeula/';
const PRIVACY_URL = 'https://www.getinner.app/privacy';
const ENTITLEMENT_ID = 'continuing_with_inner';

const FEATURE_LINES = [
  'Nine chambers of guided descent',
  'Root Deep — threshold soundscapes for sleep and lucid dreaming',
  'Aeris with full pattern recognition',
];

const RC_NOT_CONFIGURED_RE = /no singleton instance|configure purchases|default instance/i;
const RC_NETWORK_RE = /network|timed?\s*out|offline|connection|could not connect|internet/i;

const sleep = (ms: number) => new Promise((res) => setTimeout(res, ms));

function toUserFacingPaywallError(err: any): string {
  const msg = String(err?.message || err || '').trim();
  if (!msg) return 'Unable to load purchase options. Please try again.';
  if (RC_NOT_CONFIGURED_RE.test(msg)) return 'Loading purchase options…';
  if (RC_NETWORK_RE.test(msg)) return 'Unable to reach the store right now. Please check your connection and try again.';
  return 'Something went wrong while loading purchase options. Please try again.';
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface PackageOption {
  pkg: PurchasesPackage;
  label: string;
  priceLabel: string;
  badge?: string;
  identifier: string;
}

// ─── Headline copy per trigger ────────────────────────────────────────────────

const HEADLINES: Record<PaywallTrigger, string> = {
  chamber: 'Turn the key.',
  garden:  'The field goes further.',
  settings: 'Continue with Inner',
};

// ─── Component ────────────────────────────────────────────────────────────────

export default function PaywallScreen() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const posthog = usePostHog();

  // Read stashed callbacks from paywallController on mount
  const callbacksRef = useRef(consumePendingCallbacks());
  const { onSuccess: onPurchaseSuccess, onDismiss, trigger } = callbacksRef.current;

  const [packages, setPackages] = useState<PackageOption[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [purchasing, setPurchasing] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const offeringRetryRef = useRef(0);
  const purchaseRetryRef = useRef(0);
  const paywallViewTrackedRef = useRef(false);

  // ── Video background ──────────────────────────────────────────────────────

  const bgPlayer = useVideoPlayer(require('../assets/videos/paywall_bg.mp4'), player => {
    player.loop = true;
    player.muted = true;
    // Muted decorative video must not claim exclusive AVAudioSession ownership —
    // the default 'doNotMix' mode fights TrackPlayer's session on background/lock.
    player.audioMixingMode = 'mixWithOthers';
    player.play();
  });

  useFocusEffect(
    useCallback(() => {
      bgPlayer.play();
      return () => { bgPlayer.pause(); };
    }, [bgPlayer])
  );

  // ── Dismiss ───────────────────────────────────────────────────────────────

  const dismiss = useCallback(() => {
    onDismiss?.();
    navigation.goBack();
  }, [onDismiss, navigation]);

  // ── Load offerings ────────────────────────────────────────────────────────

  const fetchOfferings = useCallback(async () => {
    setLoading(true);
    setError(null);
    setInfo(null);
    setPackages([]);
    setSelectedIndex(0);

    let keepLoading = false;

    try {
      const rcOk = await initRevenueCatOnce();

      if (!rcOk) {
        setInfo('Loading purchase options…');
        keepLoading = true;
        if (offeringRetryRef.current < 10) {
          offeringRetryRef.current += 1;
          setTimeout(() => { fetchOfferings(); }, 350);
        } else {
          keepLoading = false;
          setInfo('Purchase options are temporarily unavailable. Please try again.');
        }
        return;
      }

      const offerings = await Purchases.getOfferings();
      const current = offerings.current;

      if (!current) {
        setInfo('Purchase options are temporarily unavailable. Please try again.');
        return;
      }

      const mapped: PackageOption[] = current.availablePackages.map((pkg) => {
        const product = pkg.product;
        const id = pkg.packageType;
        let label = product.title || id;
        let priceLabel = product.priceString;
        let badge: string | undefined;

        const idLower = pkg.identifier.toLowerCase();
        if (id === 'ANNUAL' || idLower.includes('annual') || idLower.includes('year')) {
          label = 'Yearly';
          priceLabel = `${product.priceString}/yr`;
          badge = 'Best Value';
        } else if (id === 'MONTHLY' || idLower.includes('month')) {
          label = 'Monthly';
          priceLabel = `${product.priceString}/mo`;
        } else if (id === 'LIFETIME' || idLower.includes('lifetime')) {
          label = 'Lifetime';
          priceLabel = product.priceString;
        }

        return { pkg, label, priceLabel, badge, identifier: pkg.identifier };
      });

      const order = ['yearly', 'annual', 'monthly', 'lifetime'];
      mapped.sort((a, b) => {
        const ai = order.findIndex((o) => a.identifier.toLowerCase().includes(o));
        const bi = order.findIndex((o) => b.identifier.toLowerCase().includes(o));
        return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
      });

      setPackages(mapped);
      setSelectedIndex(0);
    } catch (e: any) {
      const msg = String(e?.message || '');
      if (RC_NOT_CONFIGURED_RE.test(msg) && offeringRetryRef.current < 10) {
        offeringRetryRef.current += 1;
        setInfo('Loading purchase options…');
        keepLoading = true;
        setTimeout(() => { fetchOfferings(); }, 350);
        return;
      }
      setInfo(toUserFacingPaywallError(e));
    } finally {
      if (!keepLoading) setLoading(false);
    }
  }, []);

  useEffect(() => {
    offeringRetryRef.current = 0;
    purchaseRetryRef.current = 0;

    if (!paywallViewTrackedRef.current) {
      posthog.capture('paywall_viewed', { source: trigger ?? 'unspecified' });
      paywallViewTrackedRef.current = true;
    }

    (async () => {
      await sleep(50);
      await fetchOfferings();
    })();

    return () => {
      paywallViewTrackedRef.current = false;
    };
  }, []);

  // ── Purchase ──────────────────────────────────────────────────────────────

  const handleContinue = async () => {
    if (packages.length === 0) return;
    setPurchasing(true);
    setError(null);
    setInfo(null);

    try {
      const selected = packages[selectedIndex];
      const { customerInfo } = await Purchases.purchasePackage(selected.pkg);
      const entitlements = customerInfo.entitlements.active;

      if (entitlements && entitlements[ENTITLEMENT_ID]) {
        posthog.capture('purchase_success', {
          entitlement: ENTITLEMENT_ID,
          product_id: selected.pkg.product.identifier,
          package_identifier: selected.identifier,
        });
        onPurchaseSuccess?.();
        navigation.goBack();
        return;
      }

      setError('Purchase completed, but access could not be verified yet. Please try again in a moment, or restore purchases.');
    } catch (e: any) {
      if (e?.userCancelled) {
        posthog.capture('purchase_cancelled', {
          entitlement: ENTITLEMENT_ID,
          package_identifier: packages[selectedIndex]?.identifier,
        });
        return;
      }

      const msg = String(e?.message || '');
      if (RC_NOT_CONFIGURED_RE.test(msg) && purchaseRetryRef.current < 1) {
        purchaseRetryRef.current += 1;
        await sleep(400);
        await fetchOfferings();
        setError('Purchase system is still initializing. Please tap Continue again.');
        return;
      }

      setError(toUserFacingPaywallError(e));
    } finally {
      setPurchasing(false);
    }
  };

  // ── Restore ───────────────────────────────────────────────────────────────

  const handleRestore = async () => {
    setRestoring(true);
    setError(null);
    setInfo(null);
    try {
      const customerInfo = await Purchases.restorePurchases();
      const entitlements = customerInfo.entitlements.active;
      if (entitlements && entitlements[ENTITLEMENT_ID]) {
        onPurchaseSuccess?.();
        navigation.goBack();
      } else {
        setError('No active subscription found for this Apple ID.');
      }
    } catch (e: any) {
      setError(toUserFacingPaywallError(e));
    } finally {
      setRestoring(false);
    }
  };

  const handleRetryOfferings = async () => {
    offeringRetryRef.current = 0;
    await fetchOfferings();
  };

  const headline = HEADLINES[trigger] ?? HEADLINES.chamber;
  const isCtaDisabled = purchasing || loading || packages.length === 0;

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <View style={styles.container}>
      {/* Video background */}
      <VideoView
        player={bgPlayer}
        contentFit="cover"
        style={StyleSheet.absoluteFill}
        nativeControls={false}
        allowsFullscreen={false}
        allowsPictureInPicture={false}
      />

      {/* Top gradient */}
      <LinearGradient
        colors={['rgba(0,0,0,0.9)', 'transparent']}
        style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '35%' }}
        pointerEvents="none"
      />

      {/* Bottom gradient */}
      <LinearGradient
        colors={['transparent', 'rgba(0,0,0,0.9)']}
        style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: '45%' }}
        pointerEvents="none"
      />

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingTop: insets.top + 8, paddingBottom: insets.bottom + 24 },
        ]}
        showsVerticalScrollIndicator={false}
        bounces={false}
      >
        {/* ── Top zone: text content (upper 30%) ── */}
        <View style={styles.topZone}>
          <View style={styles.headerGroup}>
            <Text style={styles.eyebrow}>WHAT LIES BEYOND</Text>
            <Text style={styles.subtext}>{"What you've felt is only the surface."}</Text>
            {trigger === 'settings' ? (
              <View style={{ alignItems: 'center', marginBottom: 10 }}>
                <Text style={styles.headlineSubtle}>Continue with</Text>
                <Text style={styles.headlineLarge}>Inner</Text>
              </View>
            ) : (
              <Text style={styles.headline}>{headline}</Text>
            )}
          </View>

          <View style={styles.features}>
            {FEATURE_LINES.map((line, i) => (
              <Text key={i} style={styles.featureLine}>{line}</Text>
            ))}
          </View>
        </View>

        {/* ── Middle zone: empty (40%) — video shows through ── */}
        <View style={styles.middleZone} />

        {/* ── Bottom zone: pricing + CTA ── */}
        <View style={styles.bottomZone}>
          {/* Pricing rows */}
          {loading ? (
            <View style={styles.loadingWrap}>
              <ActivityIndicator color="#F59E0B" size="small" />
              <Text style={styles.infoText}>{info || 'Loading purchase options…'}</Text>
            </View>
          ) : packages.length === 0 ? (
            <View style={styles.loadingWrap}>
              <Text style={styles.infoText}>{info || 'Purchase options are temporarily unavailable. Please try again.'}</Text>
              <TouchableOpacity onPress={handleRetryOfferings} style={styles.retryButton}>
                <Text style={styles.retryButtonText}>Try again</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.packagesContainer}>
              {packages.map((option, index) => {
                const isSelected = index === selectedIndex;
                return (
                  <TouchableOpacity
                    key={option.identifier}
                    style={[styles.packageRow, isSelected && styles.packageRowSelected]}
                    onPress={() => setSelectedIndex(index)}
                    activeOpacity={0.8}
                  >
                    {option.badge && (
                      <View style={styles.badge}>
                        <Text style={styles.badgeText}>{option.badge}</Text>
                      </View>
                    )}
                    <Text style={[styles.packageLabel, isSelected && styles.packageLabelSelected]}>
                      {option.label}
                    </Text>
                    <Text style={[styles.packagePrice, isSelected && styles.packagePriceSelected]}>
                      {option.priceLabel}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          )}

          {/* Error */}
          {!!error && (
            <Text style={styles.errorText}>{error}</Text>
          )}

          {/* Continue / amber CTA */}
          <TouchableOpacity
            style={[styles.continueButton, isCtaDisabled && styles.continueButtonDisabled]}
            onPress={handleContinue}
            disabled={isCtaDisabled}
            activeOpacity={0.85}
          >
            {purchasing ? (
              <ActivityIndicator color="#000" />
            ) : (
              <Text style={styles.continueButtonText}>Continue</Text>
            )}
          </TouchableOpacity>

          {/* Maybe Later */}
          <TouchableOpacity onPress={dismiss} activeOpacity={0.7} style={styles.maybeLater}>
            <Text style={styles.maybeLaterText}>Maybe Later</Text>
          </TouchableOpacity>

          {/* Footer: restore + legal links */}
          <View style={styles.footer}>
            <TouchableOpacity onPress={handleRestore} disabled={restoring} activeOpacity={0.7}>
              <Text style={styles.footerLink}>{restoring ? 'Restoring...' : 'Restore Purchases'}</Text>
            </TouchableOpacity>
            <Text style={styles.footerSep}>·</Text>
            <TouchableOpacity onPress={() => Linking.openURL(TERMS_URL).catch(() => {})} activeOpacity={0.7}>
              <Text style={styles.footerLink}>Terms</Text>
            </TouchableOpacity>
            <Text style={styles.footerSep}>·</Text>
            <TouchableOpacity onPress={() => Linking.openURL(PRIVACY_URL).catch(() => {})} activeOpacity={0.7}>
              <Text style={styles.footerLink}>Privacy</Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.legalText}>
            Continuing with Inner is an auto-renewable subscription. Subscriptions will renew until canceled. Cancel anytime.
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const { height: SCREEN_H } = Dimensions.get('window');

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a080e',
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 24,
  },

  // Top zone
  topZone: {
    minHeight: SCREEN_H * 0.42,
    justifyContent: 'space-between',
  },
  headerGroup: {
    gap: 0,
  },
  eyebrow: {
    fontSize: 11,
    letterSpacing: 2,
    color: 'rgba(255,255,255,0.7)',
    fontFamily: 'Inter-ExtraLight',
    textTransform: 'uppercase',
    alignSelf: 'center',
    marginBottom: 100,
  },
  headline: {
    fontSize: 32,
    fontWeight: '700',
    color: '#ffffff',
    alignSelf: 'center',
    textAlign: 'center',
    marginBottom: 10,
    maxWidth: 300,
    letterSpacing: -0.3,
  },
  headlineSubtle: {
    fontSize: 18,
    fontWeight: '400',
    color: 'rgba(255,255,255,0.8)',
  },
  headlineLarge: {
    fontSize: 46,
    fontWeight: '700',
    color: '#ffffff',
  },
  subtext: {
    fontSize: 10,
    letterSpacing: 2,
    color: 'rgba(255,255,255,0.6)',
    textTransform: 'uppercase',
    alignSelf: 'center',
    lineHeight: 22,
    marginBottom: 10,
    maxWidth: 180,
    textAlign: 'center',
  },
  features: {
    gap: 20,
    maxWidth: 280,
    alignSelf: 'center',
  },
  featureLine: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.75)',
    lineHeight: 20,
    textAlign: 'center',
  },

  // Middle zone — intentionally empty
  middleZone: {
    height: SCREEN_H * 0.13,
  },

  // Bottom zone
  bottomZone: {
    minHeight: SCREEN_H * 0.30,
    justifyContent: 'flex-end',
  },
  loadingWrap: {
    alignItems: 'center',
    marginBottom: 16,
    gap: 8,
  },
  infoText: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.6)',
    textAlign: 'center',
    lineHeight: 18,
  },
  retryButton: {
    marginTop: 4,
    borderRadius: 999,
    paddingHorizontal: 18,
    paddingVertical: 8,
    backgroundColor: 'rgba(255,255,255,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
  },
  retryButtonText: {
    color: '#F59E0B',
    fontSize: 14,
    fontWeight: '600',
  },

  // Packages
  packagesContainer: {
    gap: 10,
    marginBottom: 16,
    maxWidth: 260,
    alignSelf: 'center',
    width: '100%',
  },
  packageRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(0,0,0,0.35)',
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
    position: 'relative',
  },
  packageRowSelected: {
    borderColor: 'rgba(251,191,36,0.7)',
  },
  packageLabel: {
    fontSize: 15,
    fontWeight: '500',
    color: 'rgba(255,255,255,0.85)',
  },
  packageLabelSelected: {
    color: '#ffffff',
    fontWeight: '600',
  },
  packagePrice: {
    fontSize: 15,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.7)',
  },
  packagePriceSelected: {
    color: '#F59E0B',
  },
  badge: {
    position: 'absolute',
    top: -10,
    right: 12,
    backgroundColor: '#F59E0B',
    borderRadius: 20,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  badgeText: {
    color: '#000',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.3,
  },

  // Error
  errorText: {
    fontSize: 13,
    color: '#ff6b6b',
    textAlign: 'center',
    marginBottom: 10,
    lineHeight: 18,
  },

  // CTA
  continueButton: {
    backgroundColor: '#F59E0B',
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    marginBottom: 12,
  },
  continueButtonDisabled: {
    opacity: 0.55,
  },
  continueButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#000',
  },

  // Maybe Later
  maybeLater: {
    alignItems: 'center',
    paddingVertical: 6,
    marginBottom: 16,
  },
  maybeLaterText: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.4)',
  },

  // Footer
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
    marginBottom: 12,
  },
  footerLink: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.4)',
  },
  footerSep: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.25)',
  },
  legalText: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.3)',
    textAlign: 'center',
    lineHeight: 16,
  },
});
