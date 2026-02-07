import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Dimensions,
  ImageBackground,
  Image,
  Animated,
  Easing,
} from 'react-native';
import { useIntention } from '../core/IntentionProvider';
import { Typography, Body as _Body } from '../core/typography';
import * as Haptics from 'expo-haptics';
import { useNavigation } from '@react-navigation/native';
import { useRoute } from '@react-navigation/native';
import { Asset } from 'expo-asset';
import { getNudge } from '../src/core/language/nudgeLibrary';
import { getIntentions, getIntentionSetAt, getLastNudgeShownAt, setLastNudgeShownAt } from '../core/session';

const Body = _Body ?? ({
  regular: { ...Typography.body },
  subtle:  { ...Typography.caption },
} as const);

const { width } = Dimensions.get('window');


const intentions = [
  { id: 'calm', title: 'Calm', description: 'Release the weight, return to stillness' },
  { id: 'clarity', title: 'Clarity', description: 'Part the haze, let vision sharpen' },
  { id: 'grounding', title: 'Grounding', description: 'Root deep into the present' },
  { id: 'healing', title: 'Healing', description: 'Mend the unseen, restore balance' },
  { id: 'reawakening', title: 'Reawakening', description: 'Stir the dormant self into light' },
  { id: 'expansion', title: 'Expansion', description: 'Open wide to growth and possibility' },
];

// Aura color mapping for selected-state tinting (subtle, brand-aligned)
const AURA_TINTS: Record<string, string> = {
  calm: 'rgba(132, 169, 255, 0.22)',        // soft blue
  clarity: 'rgba(123, 232, 201, 0.22)',     // mint
  grounding: 'rgba(196, 154, 108, 0.22)',   // earth
  healing: 'rgba(120, 217, 168, 0.22)',     // green
  reawakening: 'rgba(255, 183, 213, 0.22)', // rose
  expansion: 'rgba(207, 195, 224, 0.22)',   // lavender (brand CTA)
};

const AURA_BORDERS: Record<string, string> = {
  calm: '#84A9FF',
  clarity: '#7BE8C9',
  grounding: '#C49A6C',
  healing: '#78D9A8',
  reawakening: '#FFB7D5',
  expansion: '#CFC3E0',
};

export default function IntentionScreen() {
  const navigation = useNavigation();
  const { setIntentions } = useIntention();

  const route = useRoute<any>();
  const fromSettings = route?.params?.fromSettings === true;

  const [retuneNudge, setRetuneNudge] = useState<string | null>(null);

  // Return ritual header (only when arriving via Settings → Change Intentions)
  const returnHeaderOpacity = useRef(new Animated.Value(0)).current;
  const returnHeaderTranslateY = useRef(new Animated.Value(-6)).current;

  const [selectedIntentions, setSelectedIntentions] = useState<string[]>([]);
  const scaleAnimRefs = useRef<{ [key: string]: Animated.Value }>({});
  // Initialize refs once on first render
  if (Object.keys(scaleAnimRefs.current).length === 0) {
    intentions.forEach(({ id }) => {
      scaleAnimRefs.current[id] = new Animated.Value(1);
    });
  }

  // Lotus pulse (subtle brand continuity)
  const lotusScale = useRef(new Animated.Value(1)).current;
  const lotusReveal = useRef(new Animated.Value(0)).current; // 0->1 on first reveal
  const lotusPulse = useRef(new Animated.Value(1)).current;   // 0..1 loop driver
  const lotusPulseOpacity = lotusPulse.interpolate({ inputRange: [0, 1], outputRange: [0.92, 1] });

  // Mandala overlay (appears only after first selection)
  const mandalaOpacity = useRef(new Animated.Value(0)).current;

  // CTA enable reveal
  const ctaEnabledAnim = useRef(new Animated.Value(0)).current; // 0 = disabled, 1 = enabled

  const glowAnimRefs = useRef<{ [key: string]: Animated.Value }>({});
  if (Object.keys(glowAnimRefs.current).length === 0) {
    intentions.forEach(({ id }) => {
      glowAnimRefs.current[id] = new Animated.Value(0); // 0 off, 1 on
    });
  }

  const ensureEssenceAssets = async () => {
    try {
      await Asset.loadAsync([
        require('../assets/images/essence-bg.png'),
        require('../assets/images/particle-overlay.png'),
        // add any additional images used on Essence here
      ]);
    } catch (e) {
      console.log('Essence asset prefetch error', e);
    }
  };


  // Mount: fade-in lotus (noticeable) then start slow pulse (scale + opacity)
  React.useEffect(() => {
    // ensure starting values
    lotusReveal.setValue(0);
    lotusScale.setValue(0.85);
    lotusPulse.setValue(1);

    // one-shot reveal (slower + slight scale ease)
    Animated.timing(lotusReveal, {
      toValue: 1,
      duration: 1400,
      delay: 1200,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();

    Animated.timing(lotusScale, {
      toValue: 1,
      duration: 1400,
      delay: 1200,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();

    // slow breathing loop (scale), start near end of reveal
    const scalePulse = Animated.loop(
      Animated.sequence([
        Animated.timing(lotusScale, { toValue: 1.03, duration: 4200, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(lotusScale, { toValue: 0.99, duration: 4200, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ])
    );

    // opacity pulse driver (0..1 maps to 0.92..1 via interpolate)
    const opacityPulse = Animated.loop(
      Animated.sequence([
        Animated.timing(lotusPulse, { toValue: 0, duration: 4200, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(lotusPulse, { toValue: 1, duration: 4200, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ])
    );

    const startPulseTimeout = setTimeout(() => {
      scalePulse.start();
      opacityPulse.start();
    }, 1400 + 1200 - 150);

    // Initialize CTA state based on current selection
    ctaEnabledAnim.setValue(0);
    // Mandala starts hidden until user selects an intention
    mandalaOpacity.setValue(0);

    return () => {
      clearTimeout(startPulseTimeout);
      try { scalePulse.stop(); } catch {}
      try { opacityPulse.stop(); } catch {}
    };
  }, []);

  // Fade mandala in after first intention is selected (and back out if cleared)
  React.useEffect(() => {
    const shouldShow = selectedIntentions.length > 0;
    Animated.timing(mandalaOpacity, {
      toValue: shouldShow ? 1 : 0,
      duration: shouldShow ? 420 : 220,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [selectedIntentions.length, mandalaOpacity]);

  // If we came from Settings, reveal a brief re-entry header (ritual framing)
  React.useEffect(() => {
    if (!fromSettings) return;

    returnHeaderOpacity.setValue(0);
    returnHeaderTranslateY.setValue(-6);

    Animated.parallel([
      Animated.timing(returnHeaderOpacity, {
        toValue: 1,
        duration: 700,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(returnHeaderTranslateY, {
        toValue: 0,
        duration: 700,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();
  }, [fromSettings, returnHeaderOpacity, returnHeaderTranslateY]);

  // Nudge engine: show a single gentle reflection (cooldown controlled)
  useEffect(() => {
    if (!fromSettings) {
      setRetuneNudge(null);
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        const [savedIntentions, setAt, lastShown] = await Promise.all([
          getIntentions(),
          getIntentionSetAt(),
          getLastNudgeShownAt(),
        ]);

        // DEV override: simulate time-in-intention so nudges are easy to test
        const DEV_DAYS_OVERRIDE = __DEV__ ? 8 : null;

        const intentionSetAt =
          DEV_DAYS_OVERRIDE != null
            ? Date.now() - DEV_DAYS_OVERRIDE * 24 * 60 * 60 * 1000
            : setAt ?? Date.now();

        const nudge = getNudge({
          intentions: (savedIntentions as any) ?? [],
          intentionSetAt,
          lastNudgeShownAt: lastShown ?? undefined,
          cooldownDays: __DEV__ ? 0 : 7,
        });

        if (cancelled) return;

        if (nudge?.text) {
          setRetuneNudge(nudge.text);
          // Stamp as shown so we don’t repeat too often
          await setLastNudgeShownAt(Date.now());
        } else {
          setRetuneNudge(null);
        }
      } catch (e) {
        if (!cancelled) setRetuneNudge(null);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [fromSettings]);

  const toggleIntention = (id: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const isSelected = selectedIntentions.includes(id);
    const anim = scaleAnimRefs.current[id];
    const glow = glowAnimRefs.current[id];

    Animated.sequence([
      Animated.timing(anim, {
        toValue: isSelected ? 1 : 0.95,
        duration: 100,
        useNativeDriver: true,
      }),
      Animated.spring(anim, {
        toValue: 1,
        friction: 5,
        useNativeDriver: true,
      }),
    ]).start();

    if (isSelected) {
      // deselect
      setSelectedIntentions(prev => {
        const next = prev.filter(i => i !== id);
        Animated.timing(glow, { toValue: 0, duration: 220, useNativeDriver: true }).start();
        // update CTA anim based on next length
        Animated.timing(ctaEnabledAnim, { toValue: next.length > 0 ? 1 : 0, duration: 220, useNativeDriver: true }).start();
        return next;
      });
    } else if (selectedIntentions.length < 2) {
      // select
      setSelectedIntentions(prev => {
        const next = [...prev, id];
        if (prev.length === 0) {
          // Fire-and-forget prefetch once on first selection
          ensureEssenceAssets();
        }
        Animated.timing(glow, { toValue: 1, duration: 260, useNativeDriver: true }).start();
        Animated.timing(ctaEnabledAnim, { toValue: 1, duration: 260, useNativeDriver: true }).start();
        return next;
      });
    }
  };

  const handleContinue = async () => {
    await setIntentions(selectedIntentions);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    // Start (or continue) preloading but don't block UI for too long
    const preload = ensureEssenceAssets();
    await Promise.race([
      preload,
      new Promise((res) => setTimeout(res, 300)), // cap waiting to ~300ms for snappy UX
    ]);
    navigation.navigate('EssenceScreen');
  };

  return (
    <ImageBackground
      source={require('../assets/images/portal-closeup.png')}
      defaultSource={require('../assets/images/portal-closeup.png')}
      style={styles.container}
      imageStyle={{ backgroundColor: '#0d0d1a' }}
      fadeDuration={0}
      renderToHardwareTextureAndroid
      needsOffscreenAlphaCompositing
    >
      <View
        accessible={true}
        accessibilityLabel="Intention selection screen"
        accessibilityHint="Select up to two intentions to personalize your journey"
        style={{ alignItems: 'center' }}
      >
        <Animated.View style={{ opacity: Animated.multiply(lotusReveal, lotusPulseOpacity), transform: [{ scale: lotusScale }] }}>
          <View style={styles.orbStack} pointerEvents="none">
            <Image
              source={require('../assets/splash.webp')}
              style={styles.orbBaseImage}
            />
            <Animated.Image
              source={require('../assets/images/orb-player-mandala.webp')}
              style={[
                styles.orbMandalaImage,
                {
                  opacity: mandalaOpacity.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0, 0.6],
                  }),
                  transform: [{ scale: 0.985 }],
                },
              ]}
            />
          </View>
        </Animated.View>
        {fromSettings && (
          <Animated.View
            style={{
              opacity: returnHeaderOpacity,
              transform: [{ translateY: returnHeaderTranslateY }],
              marginTop: 10,
              marginBottom: 12,
              paddingVertical: 12,
              paddingHorizontal: 14,
              borderRadius: 14,
              backgroundColor: 'rgba(15, 12, 36, 0.96)',
              borderWidth: 1,
              borderColor: 'rgba(207,195,224,0.45)',
              maxWidth: 340,
              alignSelf: 'center',
            }}
          >
            <Text
              style={{
                fontFamily: 'CalSans-SemiBold',
                fontSize: 20,
                letterSpacing: 0.4,
                color: '#F4F1FF',
                textAlign: 'center',
                marginBottom: 4,
              }}
            >
              Re-tune Intentions
            </Text>
            <Text
              style={{
                fontFamily: 'Inter-ExtraLight',
                fontSize: 13,
                lineHeight: 18,
                color: '#DCD5F0',
                textAlign: 'center',
              }}
            >
              {retuneNudge ?? 'Every intention quietly colors everything inside Inner. Adjust them when your inner tuning shifts.'}
            </Text>
          </Animated.View>
        )}
        {!fromSettings && <Text style={styles.title}>Set your path.</Text>}

        <Text style={styles.helperText}>
          {fromSettings
            ? selectedIntentions.length < 2
              ? 'Select up to 2 intentions to re-tune your experience.'
              : 'Your field is set.'
            : selectedIntentions.length < 2
              ? 'Select up to 2 intentions to shape your path '
              : 'Your path is set.'}
        </Text>

        {!fromSettings && (
          <Text
            style={styles.explainText}
            accessibilityRole="text"
            accessibilityLabel="Intentions personalize your experience. Colors, sound, and guidance adapt to what you choose."
          >
            Your intentions gently tune your Inner experience. Colors, sound, and guidance adapt to support what you choose. You can change your intentions anytime.
          </Text>
        )}

        <View style={styles.grid}>
          {intentions.map((intention) => {
            const isSelected = selectedIntentions.includes(intention.id);
            const isMaxSelected =
              selectedIntentions.length >= 2 && !isSelected;

            return (
              <TouchableOpacity
                key={intention.id}
                onPress={() => toggleIntention(intention.id)}
                disabled={isMaxSelected}
                style={[
                  styles.card,
                  isSelected && [
                    styles.cardSelected,
                    { borderColor: AURA_BORDERS[intention.id] || '#CFC3E0' },
                  ],
                  isMaxSelected && styles.cardDimmed,
                ]}
                accessibilityLabel={`${intention.title} intention`}
                accessibilityHint="Double tap to select or deselect this intention"
                accessibilityRole="button"
              >
                {/* selection glow layer (tinted by intention) */}
                <Animated.View
                  style={[
                    styles.cardGlow,
                    { backgroundColor: AURA_TINTS[intention.id] || 'rgba(207,195,224,0.22)', opacity: glowAnimRefs.current[intention.id] },
                  ]}
                />
                {isSelected && (
                  <View style={styles.checkmark}>
                    <Text style={styles.checkmarkText}>✓</Text>
                  </View>
                )}
                <Animated.View
                  style={{
                    transform: [{ scale: scaleAnimRefs.current[intention.id] }],
                    alignItems: 'center',
                  }}
                >
                  <Text style={styles.cardText}>{intention.title}</Text>
                  <Text style={styles.cardDescription}>{intention.description}</Text>
                </Animated.View>
              </TouchableOpacity>
            );
          })}
        </View>

        <Animated.View style={{ opacity: ctaEnabledAnim, transform: [{ scale: ctaEnabledAnim.interpolate({ inputRange: [0, 1], outputRange: [0.98, 1] }) }] }}>
          <TouchableOpacity
            onPress={handleContinue}
            disabled={selectedIntentions.length === 0}
            style={[
              styles.primaryButton,
              selectedIntentions.length === 0 && styles.disabledButton,
            ]}
            accessibilityLabel="Continue"
            accessibilityHint="Double tap to continue once you've selected your intentions"
            accessibilityRole="button"
          >
            <Text style={styles.primaryText}>Move Inward</Text>
          </TouchableOpacity>
        </Animated.View>
      </View>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    backgroundColor: '#0d0d1a',
  },
  title: {
    ...Typography.title,
    color: 'white',
    marginBottom: 10,
  },
  helperText: {
    ...Body.regular,
    fontFamily: 'Inter-ExtraLight',
    color: 'white',
    fontSize: 12,
    marginBottom: 20,
    opacity: 0.7,
  },
  explainText: {
    ...Body.subtle,
    fontFamily: 'Inter-ExtraLight',
    color: 'white',
    opacity: 0.68,
    textAlign: 'center',
    marginBottom: 24,
    maxWidth: 320,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    marginBottom: 40,
  },
  card: {
    width: width * 0.4,
    padding: 16,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
    margin: 6,
    position: 'relative',
  },
  cardGlow: {
    position: 'absolute',
    left: -4,
    right: -4,
    top: -4,
    bottom: -4,
    borderRadius: 16,
    backgroundColor: 'rgba(195, 164, 242, 0.22)', // soft lavender brand glow
  },
  cardSelected: {
    backgroundColor: 'rgba(255,255,255,0.22)',
    borderColor: '#CFC3E0',
    borderWidth: 2,
  },
  cardDimmed: {
    opacity: 0.4,
  },
  cardText: {
    ...Typography.body,
    color: 'white',
    textAlign: 'center',
  },
  cardDescription: {
    ...Typography.caption,
    fontFamily: 'Inter-ExtraLight',
    color: 'white',
    textAlign: 'center',
    marginTop: 4,
    opacity: 0.7,
  },
  checkmark: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: 'rgba(0,0,0,0.4)',
    borderRadius: 16,
    paddingHorizontal: 6,
    paddingVertical: 2,
    zIndex: 1,
  },
  checkmarkText: {
    color: 'white',
    fontSize: 14,
  },
  primaryButton: {
    backgroundColor: '#CFC3E0',
    paddingVertical: 16,
    paddingHorizontal: 32,
    borderRadius: 24,
    borderWidth: 0,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 5,
  },
  orbStack: {
    width: 200,
    height: 200,
    marginBottom: 0,
    alignSelf: 'center',
    position: 'relative',
  },
  orbBaseImage: {
    width: '100%',
    height: '100%',
    resizeMode: 'contain',
  },
  orbMandalaImage: {
    position: 'absolute',
    left: 0,
    top: 0,
    width: '100%',
    height: '100%',
    resizeMode: 'contain',
  },
  primaryText: {
    ...Typography.title,
    color: '#1F233A',
  },
  disabledButton: {
    opacity: 0.3,
  },
});
