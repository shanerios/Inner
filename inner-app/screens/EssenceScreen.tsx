import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { useEffect, useState, useRef, useMemo } from 'react';
import { useIntention } from '../core/IntentionProvider';
const affirmationMap: { [key: string]: string } = {
  calm: 'You are embracing calm and inviting peace into your being.',
  clarity: 'Clarity guides your every step as your path becomes illuminated.',
  grounding: 'You are rooted, steady, and supported by the earth beneath you.',
  healing: 'You are in a sacred space of healing and wholeness.',
  reawakening: 'You are remembering your truth and awakening your inner light.',
  expansion: 'You are opening to new dimensions of growth and cosmic awareness.',
};
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ImageBackground,
  Dimensions,
  Image,
  Animated,
  Easing,
  TextInput,
  Platform,
  KeyboardAvoidingView,
  Keyboard,
  TouchableWithoutFeedback,
  ImageSourcePropType,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
const AnimatedLinear = Animated.createAnimatedComponent(LinearGradient as any);
import * as Haptics from 'expo-haptics';
import { useNavigation } from '@react-navigation/native';

import { useBreath } from '../core/BreathProvider';
import { Typography, Body as _Body } from '../core/typography';

// Safe fallback so hot reloads never break Body usage
const Body = _Body ?? ({
  regular: { ...Typography.body },
  subtle:  { ...Typography.caption },
} as const);


const { width, height } = Dimensions.get('window');

// Unified breath timing so all cues stay in sync
// Changing INHALE_MS or EXHALE_MS will automatically re-sync scale, glow, and sheen animations
const INHALE_MS = 4000;  // 4s inhale
const EXHALE_MS = 6000;  // 6s exhale
const CYCLE_MS  = INHALE_MS + EXHALE_MS; // 10s total

// Orb assets (prefer WebP on Android, fallback to PNG if decoding/packaging fails in release)
const ORB_WEBP = require('../assets/splash.webp');
const ORB_PNG = require('../assets/splash_ios.png');

export default function EssenceScreen() {
  const navigation = useNavigation();

  // Orb source with safe fallback (Android release builds can be flaky with WebP on some devices)
  const [orbSource, setOrbSource] = useState<ImageSourcePropType>(
    Platform.OS === 'android' ? ORB_WEBP : ORB_PNG
  );

  const handleOrbError = (e: any) => {
    // If WebP fails, fall back to PNG
    if (orbSource === ORB_WEBP) {
      console.warn('[EssenceScreen] Orb WebP failed; falling back to PNG', e?.nativeEvent);
      setOrbSource(ORB_PNG);
    } else {
      console.warn('[EssenceScreen] Orb image failed to load', e?.nativeEvent);
    }
  };

  const { intentions: ctxIntentions } = useIntention?.() || { intentions: [] as string[] };

  const [userIntentions, setUserIntentions] = useState<string[]>([]);
  const effectiveIntentions = (ctxIntentions && ctxIntentions.length > 0) ? ctxIntentions : userIntentions;
  const [personalizedAffirmation, setPersonalizedAffirmation] = useState<string | null>(null);

  // Breathing sheen setup
  const sheenX = useRef(new Animated.Value(0)).current;
  const [descWidth, setDescWidth] = useState(0);

  useEffect(() => {
    // animate a soft sheen left → right once per breath cycle, during exhale
    const run = () => {
      if (!descWidth) return;
      const sweepDuration = Math.min(1800, EXHALE_MS - 400); // keep sweep within exhale window
      sheenX.setValue(-descWidth);
      Animated.sequence([
        Animated.delay(INHALE_MS), // wait through inhale
        Animated.timing(sheenX, {
          toValue: descWidth,
          duration: sweepDuration,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.delay(CYCLE_MS - INHALE_MS - sweepDuration), // rest until next cycle
      ]).start(({ finished }) => { if (finished) run(); });
    };
    run();
    return () => { sheenX.stopAnimation(); };
  }, [descWidth]);
  const titleOpacity = useRef(new Animated.Value(0)).current;
  const descriptionOpacity = useRef(new Animated.Value(0)).current;
  // Name capture prompt (optional, one-time)
  const [showNamePrompt, setShowNamePrompt] = useState(false);
  const [nameValue, setNameValue] = useState('');
  const namePromptOpacity = useRef(new Animated.Value(0)).current;
  const namePromptTranslate = useRef(new Animated.Value(6)).current;
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [existingName, dismissed] = await Promise.all([
          AsyncStorage.getItem('profileName'),
          AsyncStorage.getItem('namePromptDismissed'),
        ]);
        if (cancelled) return;
        if (!existingName && dismissed !== 'true') {
          const t = setTimeout(() => {
            if (cancelled) return;
            setShowNamePrompt(true);
            namePromptOpacity.setValue(0);
            namePromptTranslate.setValue(6);
            Animated.parallel([
              Animated.timing(namePromptOpacity, { toValue: 1, duration: 600, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
              Animated.timing(namePromptTranslate, { toValue: 0, duration: 600, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
            ]).start();
          }, 2000);
          return () => clearTimeout(t);
        }
      } catch {}
    })();
    return () => { cancelled = true; };
  }, []);
  // Card glow animation for intention cards
  const cardGlowAnim = useRef(new Animated.Value(0)).current;

  // Shared breath (0 → exhale, 1 → inhale)
  const breath = useBreath();

  // Local breath fallback (ensures orb breath animates even if provider isn’t driving updates here)
const localBreath = useRef(new Animated.Value(0)).current;

useEffect(() => {
  const loop = Animated.loop(
    Animated.sequence([
      Animated.timing(localBreath, {
        toValue: 1,
        duration: INHALE_MS,
        easing: Easing.inOut(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.timing(localBreath, {
        toValue: 0,
        duration: EXHALE_MS,
        easing: Easing.inOut(Easing.quad),
        useNativeDriver: true,
      }),
    ])
  );

  loop.start();
  return () => loop.stop();
}, []);
  // Essence orb breath scale (matches Home orb amplitude feel)
  const orbScale = localBreath.interpolate({ inputRange: [0, 1], outputRange: [1.0, 1.12] });
  // Particle veil “glow” breath (subtle)
  const particlesOpacity = breath.interpolate({ inputRange: [0, 1], outputRange: [0.30, 0.40] });

  // Micro color temperature shift (very subtle): cool on exhale → warm on inhale
  const warmTintOpacity = breath.interpolate({ inputRange: [0, 1], outputRange: [0.00, 0.10] }); // up to 10% on inhale
  const coolTintOpacity = breath.interpolate({ inputRange: [0, 1], outputRange: [0.10, 0.00] }); // up to 10% on exhale

  // Prompt opacity/position synced to breath (never fully disappears)
  const journeyPromptOpacity = useMemo(() => breath.interpolate({
    inputRange: [0, 1], // 0 = exhale, 1 = inhale
    outputRange: [0.25, 0.5],
  }), [breath]);

  const journeyPromptTranslateY = useMemo(() => breath.interpolate({
    inputRange: [0, 1],
    outputRange: [10, 0],
  }), [breath]);

  // Navigation guard to prevent double presses re-triggering the fog
  const isNavigatingRef = useRef(false);

  useEffect(() => {
    // Card glow animation loop
    Animated.loop(
      Animated.sequence([
        Animated.timing(cardGlowAnim, {
          toValue: 1,
          duration: 3000,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: false,
        }),
        Animated.timing(cardGlowAnim, {
          toValue: 0,
          duration: 3000,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: false,
        }),
      ])
    ).start();
    Animated.sequence([
      Animated.delay(4000),
      Animated.timing(titleOpacity, {
        toValue: 1,
        duration: 4000,
        useNativeDriver: true,
      }),
      Animated.timing(descriptionOpacity, {
        toValue: 1,
        duration: 800,
        useNativeDriver: true,
      }),
    ]).start();

    return () => {
      titleOpacity.stopAnimation();
      descriptionOpacity.stopAnimation();
    };
  }, []);

  useEffect(() => {
    const loadIntentions = async () => {
      if (ctxIntentions && ctxIntentions.length > 0) {
        // Context provides intentions; mirror into local state for cards/affirmation
        setUserIntentions(ctxIntentions);
        const messages = ctxIntentions.map((i: string) => affirmationMap[i]).filter(Boolean);
        setPersonalizedAffirmation(messages.join(' '));
        return;
      }
      // Fallback: read from AsyncStorage for older flows
      const raw = await AsyncStorage.getItem('userIntentions');
      const alt = !raw ? await AsyncStorage.getItem('intentions') : null; // legacy key support
      const stored = raw || alt;
      if (stored) {
        try {
          const parsed = JSON.parse(stored);
          if (Array.isArray(parsed)) {
            setUserIntentions(parsed);
            const messages = parsed.map((i: string) => affirmationMap[i]).filter(Boolean);
            setPersonalizedAffirmation(messages.join(' '));
          }
        } catch {}
      }
    };
    loadIntentions();
  }, [ctxIntentions]);

  const persistName = async () => {
    const trimmed = nameValue.trim();
    if (trimmed.length > 0) {
      try { await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch {}
      try { await AsyncStorage.setItem('profileName', trimmed); } catch {}
    }
    Animated.parallel([
      Animated.timing(namePromptOpacity, { toValue: 0, duration: 420, easing: Easing.out(Easing.quad), useNativeDriver: true }),
      Animated.timing(namePromptTranslate, { toValue: -4, duration: 420, easing: Easing.out(Easing.quad), useNativeDriver: true }),
    ]).start(() => setShowNamePrompt(false));
  };

  const skipName = async () => {
    try { await AsyncStorage.setItem('namePromptDismissed', 'true'); } catch {}
    Animated.parallel([
      Animated.timing(namePromptOpacity, { toValue: 0, duration: 320, easing: Easing.out(Easing.quad), useNativeDriver: true }),
      Animated.timing(namePromptTranslate, { toValue: -4, duration: 320, easing: Easing.out(Easing.quad), useNativeDriver: true }),
    ]).start(() => setShowNamePrompt(false));
  };

  return (
    <View style={{ flex: 1, backgroundColor: '#0d0d1a' }}>
      <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
      <ImageBackground
        source={require('../assets/images/essence-bg.png')} // Your softened cosmic image
        defaultSource={require('../assets/images/essence-bg.png')}
        style={styles.container}
        imageStyle={{ backgroundColor: '#0d0d1a' }}
        fadeDuration={0}
        renderToHardwareTextureAndroid
        needsOffscreenAlphaCompositing
        resizeMode="cover"
      >
      <Animated.Image
        source={require('../assets/images/particle-overlay.png')}
        style={[styles.particleOverlay, { opacity: particlesOpacity }]}
        resizeMode="cover"
        pointerEvents="none"
        accessible={false}
        fadeDuration={0}
      />
      {/* Micro color temperature overlays (subtle) */}
      <Animated.View
        pointerEvents="none"
        style={[
          styles.tempOverlay,
          { backgroundColor: 'rgba(120,170,255,0.10)', opacity: coolTintOpacity } // cool blue on exhale
        ]}
      />
      <Animated.View
        pointerEvents="none"
        style={[
          styles.tempOverlay,
          { backgroundColor: 'rgba(255,190,120,0.10)', opacity: warmTintOpacity } // warm amber on inhale
        ]}
      />
      <Animated.Text
          style={[
            Typography.display,
            { color: '#F0EEF8', textAlign: 'center', marginTop: 60, marginBottom: 12, opacity: titleOpacity }
          ]}
          accessibilityLabel="Take a moment to recenter yourself"
          accessible
          accessibilityRole="header"
        >
          Take a moment to center yourself.
      </Animated.Text>
      <Animated.Text
        style={[
          Typography.body,
          {
            fontStyle: 'italic',
            color: '#F0EEF8',
            textAlign: 'center',
            marginTop: 4,
            marginBottom: 8,
            zIndex: 2,
            opacity: Animated.multiply(journeyPromptOpacity, titleOpacity),
            transform: [{ translateY: journeyPromptTranslateY }]
          }
        ]}
        accessible
        accessibilityRole="text"
        accessibilityLabel="The orb breathes with you."
      >
        The orb breathes with you.
      </Animated.Text>
      <View style={styles.centerContent}>
        <Animated.View
          style={[
            styles.orbWrapper,
            {
              transform: [{ scale: orbScale }],
            },
          ]}
        >
          {/* Orb interior (static for stability across devices) */}
          <Image
            pointerEvents="none"
            source={orbSource}
            style={{ width: '100%', height: '100%', opacity: 1 }}
            resizeMode="contain"
            onLoad={() => {
              if (__DEV__) {
                console.log('[EssenceScreen] Orb image loaded', orbSource === ORB_WEBP ? 'webp' : 'png');
              }
            }}
            onError={handleOrbError}
          />
        </Animated.View>
      </View>

      {!!personalizedAffirmation && (
        <View style={styles.descriptionWrapper}>
          <Animated.View style={{ opacity: Animated.multiply(descriptionOpacity, showNamePrompt ? 0.35 : 1) }}>
            <View
              style={styles.descriptionSheenHost}
              onLayout={e => setDescWidth(e.nativeEvent.layout.width)}
            >
              <Text
                style={[Body.regular, { fontFamily: 'Inter-ExtraLight', letterSpacing: 0.3, color: '#F0EEF8', textAlign: 'center', opacity: 0.85, paddingHorizontal: 10 }]}
                accessible
                accessibilityRole="text"
                accessibilityLabel={`Your affirmations: ${personalizedAffirmation}`}
              >
                {personalizedAffirmation}
              </Text>
              {/* Breathing sheen overlay */}
              {descWidth > 0 && (
                <AnimatedLinear
                  pointerEvents="none"
                  colors={[
                    'rgba(255,255,255,0)',
                    'rgba(255,255,255,0.35)',
                    'rgba(255,255,255,0)'
                  ]}
                  start={{ x: 0, y: 0.5 }}
                  end={{ x: 1, y: 0.5 }}
                  style={[
                    styles.sheen,
                    { transform: [{ translateX: sheenX }] }
                  ]}
                />
              )}
            </View>
          </Animated.View>
        </View>
      )}

      {showNamePrompt && (
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={[styles.nameOverlayWrap, { top: Math.max(148, Math.round(height * 0.22) + 24) }]}
          pointerEvents="box-none"
        >
          <Animated.View
            style={[
              styles.nameOverlay,
              { opacity: namePromptOpacity, transform: [{ translateY: namePromptTranslate }] },
            ]}
          >
            <View style={styles.nameBackdrop}>
              <Text style={[Typography.subtle, { color: '#D6D3E6', marginBottom: 6, textAlign: 'center' }]}>How should Inner refer to you?</Text>
              <TextInput
                value={nameValue}
                onChangeText={setNameValue}
                placeholder="Your name (optional)"
                placeholderTextColor="rgba(240,238,248,0.5)"
                style={[styles.nameInput, height < 720 && { paddingVertical: 10 }]}
                autoCapitalize="words"
                autoCorrect={false}
                returnKeyType="done"
                onSubmitEditing={persistName}
                accessibilityLabel="Your name (optional)"
                accessibilityHint="Used to greet you on Home. You can change it later."
              />
              <View style={styles.nameActions}>
                <TouchableOpacity
                  onPress={persistName}
                  style={styles.nameSaveBtn}
                  accessibilityRole="button"
                  accessibilityLabel="Save your name"
                  accessibilityHint="Inner will greet you using this name"
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Text style={[Typography.subtle, { color: '#1F233A' }]}>Save</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={skipName}
                  style={styles.nameSkipBtn}
                  accessibilityRole="button"
                  accessibilityLabel="Skip name"
                  accessibilityHint="You can add a name later in Settings"
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Text style={[Typography.subtle, { fontFamily: 'Inter-ExtraLight', color: '#F0EEF8', opacity: 0.85 }]}>Skip</Text>
                </TouchableOpacity>
              </View>
            </View>
          </Animated.View>
        </KeyboardAvoidingView>
      )}

      <View style={styles.buttonContainer}>
        <TouchableOpacity
          onPress={async () => {
            if (isNavigatingRef.current) return;
            isNavigatingRef.current = true;
            await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            // Mark onboarding complete so returning users can use the hidden “Return Home” door on Splash.
            // We write both keys to remain compatible with existing Splash key probes.
            try {
              await AsyncStorage.setItem('inner.onboarding.complete.v1', 'true');
              await AsyncStorage.setItem('inner.onboarding.completed.v1', 'true');
            } catch {}
            console.log('[FOG] Essence: show(1)');
            (globalThis as any).__fog?.show(1);
            // Add a boost mid-transition to eliminate the ghosting effect
            setTimeout(() => {
              console.log('[FOG] Essence: boost() mid-fade');
              (globalThis as any).__fog?.boost(0.12, 900);
            }, 950);
            setTimeout(() => {
              console.log('[FOG] Essence: navigating → Home(fogStart)');
              // @ts-ignore
              navigation.replace('Home', { fogStart: true });
            }, 1900);
          }}
          style={styles.primaryButton}
          accessibilityLabel="Begin your journey based on your intentions"
          accessibilityRole="button"
          accessible
        >
          <Text style={[Typography.title, { color: '#1F233A' }]}>Begin Journey</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          accessibilityLabel="Reselect or change your paths"
          accessibilityRole="button"
          accessible
        >
          <Text style={[Body.subtle, { fontFamily: 'Inter-ExtraLight', fontSize: 14, color: '#F0EEF8', opacity: 0.70 }]}>Change Paths</Text>
        </TouchableOpacity>
      </View>
      </ImageBackground>
      </TouchableWithoutFeedback>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 60,
    paddingHorizontal: 20,
    backgroundColor: '#0d0d1a',
  },
  centerContent: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center', // centers orb + breath block vertically
    alignSelf: 'stretch',
    paddingTop: 200,           // push a touch lower; adjust 40–100 to taste
  },
  descriptionWrapper: {
    marginTop: 48,
    marginBottom: 32,
    alignSelf: 'center',
  },
  symbol: {
    width: '100%',
    height: '100%',
    opacity: 0.9,
  },
  orbWrapper: {
    width: 180,
    height: 180,
    opacity: 0.9,
    borderRadius: 90,
    overflow: 'hidden',
    marginBottom: 16,

    // Keep above overlays
    zIndex: 10,
    elevation: 0,
  },
  buttonContainer: {
    alignItems: 'center',
  },
  primaryButton: {
    backgroundColor: '#CFC3E0',
    paddingVertical: 14,
    paddingHorizontal: 40,
    borderRadius: 24,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
  cardContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    marginTop: 12,
  },
  intentionCard: {
    backgroundColor: 'rgba(240, 238, 248, 0.1)',
    borderColor: '#F0EEF8',
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 16,
    margin: 8,
    width: 160,
    // Soft glow shadow
    shadowColor: '#F0EEF8',
    shadowOffset: { width: 0, height: 0 },
    shadowRadius: 12,
    // shadowOpacity is animated
  },
  particleOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 0,
  },
  descriptionSheenHost: {
    alignSelf: 'center',
    position: 'relative',
    overflow: 'hidden',
  },
  sheen: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 90, // width of the sheen band; adjust 70–120
    zIndex: 3,
  },
  tempOverlay: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    pointerEvents: 'none',
    zIndex: 2, // orb is forced above with zIndex 10
  },
  nameOverlayWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 3,
  },
  nameOverlay: {
    width: '86%',
    backgroundColor: 'transparent', // remove panel
    borderRadius: 0,
    paddingVertical: 0,
    paddingHorizontal: 0,
    borderWidth: 0,
    borderColor: 'transparent',
    shadowColor: 'transparent',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0,
    shadowRadius: 0,
    elevation: 0,
    alignItems: 'center',
  },
  nameBackdrop: {
    width: '92%',
    paddingTop: 8,
    paddingBottom: 14,
    paddingHorizontal: 14,
    borderRadius: 18,
    backgroundColor: 'rgba(0,0,0,0.18)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',

    //soft lift
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.22,
    shadowRadius: 22,
    elevation: 10,
  },
  nameInput: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    color: '#F0EEF8',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    alignSelf: 'stretch',
  },
  nameActions: {
    marginTop: 10,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 16,
  },
  nameSaveBtn: {
    backgroundColor: '#CFC3E0',
    paddingVertical: 8,
    paddingHorizontal: 20,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.20)',
  },
  nameSkipBtn: {
    paddingVertical: 8,
    paddingHorizontal: 18,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
});