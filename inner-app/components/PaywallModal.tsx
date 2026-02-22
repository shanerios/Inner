import React, { useState, useEffect, useRef } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Animated,
  Linking,
  ActivityIndicator,
  Platform,
  Dimensions,
} from 'react-native';
import Purchases, { PurchasesPackage } from 'react-native-purchases';

// ─── Types ───────────────────────────────────────────────────────────────────

interface PaywallModalProps {
  visible: boolean;
  onClose: () => void;
  onPurchaseSuccess?: () => void;
}

interface PackageOption {
  pkg: PurchasesPackage;
  label: string;
  priceLabel: string;
  badge?: string;
  identifier: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const TERMS_URL = 'https://www.apple.com/legal/internet-services/itunes/dev/stdeula/';   // ← update if needed
const PRIVACY_URL = 'https://www.getinner.app/privacy'; // ← update if needed

const FEATURES = [
  { icon: '♪', label: 'Chambers 5–9' },
  { icon: '🎧', label: '"Deeper" soundscapes' },
  { icon: '🧠', label: 'Future content' },
];

// ─── Component ────────────────────────────────────────────────────────────────

export default function PaywallModal({
  visible,
  onClose,
  onPurchaseSuccess,
}: PaywallModalProps) {
  const [packages, setPackages] = useState<PackageOption[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [purchasing, setPurchasing] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Entrance animation
  const slideAnim = useRef(new Animated.Value(60)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;

  // ── Load offerings ──────────────────────────────────────────────────────────

  useEffect(() => {
    if (!visible) return;

    // Animate in
    slideAnim.setValue(60);
    fadeAnim.setValue(0);
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 280,
        useNativeDriver: true,
      }),
      Animated.spring(slideAnim, {
        toValue: 0,
        tension: 60,
        friction: 10,
        useNativeDriver: true,
      }),
    ]).start();

    fetchOfferings();
  }, [visible]);

  const fetchOfferings = async () => {
    setLoading(true);
    setError(null);
    try {
      const offerings = await Purchases.getOfferings();
      const current = offerings.current;
      if (!current) {
        setError('No offerings available.');
        setLoading(false);
        return;
      }

      const mapped: PackageOption[] = current.availablePackages.map((pkg) => {
        const product = pkg.product;
        const id = pkg.packageType; // 'ANNUAL', 'MONTHLY', 'LIFETIME', etc.

        let label = product.title || id;
        let priceLabel = product.priceString;
        let badge: string | undefined;

        // Normalize labels based on package type or identifier
        const idLower = pkg.identifier.toLowerCase();
        if (id === 'ANNUAL' || idLower.includes('annual') || idLower.includes('year')) {
          label = 'Yearly';
          priceLabel = `${product.priceString}/yr`;
          badge = '29% Off';
        } else if (id === 'MONTHLY' || idLower.includes('month')) {
          label = 'Monthly';
          priceLabel = `${product.priceString}/mo`;
        } else if (id === 'LIFETIME' || idLower.includes('lifetime')) {
          label = 'Lifetime';
          priceLabel = product.priceString;
        }

        return { pkg, label, priceLabel, badge, identifier: pkg.identifier };
      });

      // Sort: Yearly first, Monthly second, Lifetime third
      const order = ['yearly', 'annual', 'monthly', 'lifetime'];
      mapped.sort((a, b) => {
        const ai = order.findIndex((o) => a.identifier.toLowerCase().includes(o));
        const bi = order.findIndex((o) => b.identifier.toLowerCase().includes(o));
        return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
      });

      setPackages(mapped);
      // Default select yearly (index 0)
      setSelectedIndex(0);
    } catch (e: any) {
      setError(e?.message || 'Failed to load offerings.');
    } finally {
      setLoading(false);
    }
  };

  // ── Purchase ────────────────────────────────────────────────────────────────

  const handleContinue = async () => {
    if (packages.length === 0) return;
    setPurchasing(true);
    setError(null);
    try {
      const selected = packages[selectedIndex];
      const { customerInfo } = await Purchases.purchasePackage(selected.pkg);
      const entitlements = customerInfo.entitlements.active;
      if (Object.keys(entitlements).length > 0) {
        onPurchaseSuccess?.();
        onClose();
      }
    } catch (e: any) {
      if (!e.userCancelled) {
        setError(e?.message || 'Purchase failed. Please try again.');
      }
    } finally {
      setPurchasing(false);
    }
  };

  // ── Restore ─────────────────────────────────────────────────────────────────

  const handleRestore = async () => {
    setRestoring(true);
    setError(null);
    try {
      const customerInfo = await Purchases.restorePurchases();
      const entitlements = customerInfo.entitlements.active;
      if (Object.keys(entitlements).length > 0) {
        onPurchaseSuccess?.();
        onClose();
      } else {
        setError('No previous purchases found.');
      }
    } catch (e: any) {
      setError(e?.message || 'Restore failed. Please try again.');
    } finally {
      setRestoring(false);
    }
  };

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={styles.overlay}>
        <Animated.View
          style={[
            styles.sheet,
            {
              opacity: fadeAnim,
              transform: [{ translateY: slideAnim }],
            },
          ]}
        >
          <ScrollView
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
            bounces={false}
          >
            {/* ── Header ── */}
            <Text style={styles.title}>Continuing with Inner</Text>
            <Text style={styles.subtitle}>
              A gentle continuation into deeper categories, deeper Chambers, and a deeper experience.
            </Text>

            {/* ── Features ── */}
            <View style={styles.featuresContainer}>
              {FEATURES.map((f, i) => (
                <View key={i} style={styles.featureRow}>
                  <Text style={styles.featureIcon}>{f.icon}</Text>
                  <Text style={styles.featureLabel}>{f.label}</Text>
                </View>
              ))}
            </View>

            {/* ── Package Options ── */}
            {loading ? (
              <ActivityIndicator color="#9b8ec4" size="large" style={{ marginVertical: 32 }} />
            ) : packages.length === 0 ? (
              <Text style={styles.errorText}>
                {error || 'No packages available.'}
              </Text>
            ) : (
              <View style={styles.packagesContainer}>
                {packages.map((option, index) => {
                  const isSelected = index === selectedIndex;
                  return (
                    <TouchableOpacity
                      key={option.identifier}
                      style={[
                        styles.packageCard,
                        isSelected && styles.packageCardSelected,
                      ]}
                      onPress={() => setSelectedIndex(index)}
                      activeOpacity={0.8}
                    >
                      {/* Badge */}
                      {option.badge && (
                        <View style={styles.badge}>
                          <Text style={styles.badgeText}>{option.badge}</Text>
                        </View>
                      )}

                      {/* Radio + Label */}
                      <View style={styles.packageLeft}>
                        <View style={[styles.radio, isSelected && styles.radioSelected]}>
                          {isSelected && <View style={styles.radioInner} />}
                        </View>
                        <Text
                          style={[
                            styles.packageLabel,
                            isSelected && styles.packageLabelSelected,
                          ]}
                        >
                          {option.label}
                        </Text>
                      </View>

                      {/* Price */}
                      <Text
                        style={[
                          styles.packagePrice,
                          isSelected && styles.packagePriceSelected,
                        ]}
                      >
                        {option.priceLabel}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}

            {/* ── Legal ── */}
            <Text style={styles.legalText}>
              Continuing with Inner is an auto-renewable subscription. Subscriptions will renew until canceled. Cancel anytime.
            </Text>

            {/* ── Error ── */}
            {error && packages.length > 0 && (
              <Text style={styles.errorText}>{error}</Text>
            )}

            {/* ── Continue Button ── */}
            <TouchableOpacity
              style={[styles.continueButton, (purchasing || loading) && styles.continueButtonDisabled]}
              onPress={handleContinue}
              disabled={purchasing || loading || packages.length === 0}
              activeOpacity={0.85}
            >
              {purchasing ? (
                <ActivityIndicator color="#1a1a2e" />
              ) : (
                <Text style={styles.continueButtonText}>Continue</Text>
              )}
            </TouchableOpacity>

            {/* ── Maybe Later ── */}
            <TouchableOpacity onPress={onClose} activeOpacity={0.7} style={styles.maybeLater}>
              <Text style={styles.maybeLaterText}>Maybe Later</Text>
            </TouchableOpacity>

            {/* ── Footer Links ── */}
            <View style={styles.footer}>
              <TouchableOpacity
                onPress={handleRestore}
                disabled={restoring}
                activeOpacity={0.7}
              >
                <Text style={styles.footerLink}>
                  {restoring ? 'Restoring...' : 'Restore Purchases'}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity onPress={() => Linking.openURL(TERMS_URL)} activeOpacity={0.7}>
                <Text style={styles.footerLink}>Terms</Text>
              </TouchableOpacity>

              <TouchableOpacity onPress={() => Linking.openURL(PRIVACY_URL)} activeOpacity={0.7}>
                <Text style={styles.footerLink}>Privacy</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </Animated.View>
      </View>
    </Modal>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#12122a',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    maxHeight: SCREEN_HEIGHT * 0.95,
    paddingBottom: Platform.OS === 'ios' ? 34 : 24, // safe area
  },
  scrollContent: {
    paddingHorizontal: 24,
    paddingTop: 36,
    paddingBottom: 12,
  },

  // ── Header ──
  title: {
    fontSize: 32,
    fontWeight: '800',
    color: '#ffffff',
    marginBottom: 12,
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 15,
    color: 'rgba(255,255,255,0.6)',
    lineHeight: 22,
    marginBottom: 28,
    textAlign: 'center',
  },

  // ── Features ──
  featuresContainer: {
    marginBottom: 28,
    gap: 14,
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  featureIcon: {
    fontSize: 20,
    width: 28,
    textAlign: 'center',
  },
  featureLabel: {
    fontSize: 16,
    fontWeight: '700',
    color: '#ffffff',
  },

  // ── Packages ──
  packagesContainer: {
    gap: 12,
    marginBottom: 20,
  },
  packageCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 14,
    paddingHorizontal: 18,
    paddingVertical: 18,
    borderWidth: 1.5,
    borderColor: 'transparent',
    position: 'relative',
  },
  packageCardSelected: {
    backgroundColor: '#ffffff',
    borderColor: '#ffffff',
  },
  packageLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  radio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioSelected: {
    borderColor: '#12122a',
  },
  radioInner: {
    width: 11,
    height: 11,
    borderRadius: 6,
    backgroundColor: '#12122a',
  },
  packageLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.85)',
  },
  packageLabelSelected: {
    color: '#12122a',
  },
  packagePrice: {
    fontSize: 16,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.85)',
  },
  packagePriceSelected: {
    color: '#12122a',
  },
  badge: {
    position: 'absolute',
    top: -12,
    alignSelf: 'center',
    left: '50%',
    marginLeft: -30,
    backgroundColor: '#7c6fcd',
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 3,
    zIndex: 10,
  },
  badgeText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.3,
  },

  // ── Legal ──
  legalText: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.4)',
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 20,
  },

  // ── Error ──
  errorText: {
    fontSize: 13,
    color: '#ff6b6b',
    textAlign: 'center',
    marginBottom: 12,
  },

  // ── Continue Button ──
  continueButton: {
    backgroundColor: '#c4b8f0',
    borderRadius: 50,
    paddingVertical: 17,
    alignItems: 'center',
    marginBottom: 14,
  },
  continueButtonDisabled: {
    opacity: 0.6,
  },
  continueButtonText: {
    fontSize: 17,
    fontWeight: '800',
    color: '#12122a',
    letterSpacing: 0.2,
  },

  // ── Maybe Later ──
  maybeLater: {
    alignItems: 'center',
    paddingVertical: 8,
    marginBottom: 20,
  },
  maybeLaterText: {
    fontSize: 15,
    color: 'rgba(255,255,255,0.5)',
  },

  // ── Footer ──
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 24,
  },
  footerLink: {
    fontSize: 13,
    color: '#9b8ec4',
    fontWeight: '500',
  },
});