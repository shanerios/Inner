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
  Image,
  Animated,
  Easing,
  TextInput,
  Platform,
  KeyboardAvoidingView,
  Keyboard,
  TouchableWithoutFeedback,
  ImageSourcePropType,
  useWindowDimensions,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
const AnimatedLinear = Animated.createAnimatedComponent(LinearGradient as any);
import * as Haptics from 'expo-haptics';
import { useNavigation } from '@react-navigation/native';

import { useBreath } from '../core/BreathProvider';
import { Typography, Body as _Body } from '../core/typography';
import { useScale } from '../utils/scale';

// Safe fallback so hot reloads never break Body usage
const Body = _Body ?? ({
  regular: { ...Typography.body },
  subtle:  { ...Typography.caption },
} as const);

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
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const { scale, verticalScale, matchesCompactLayout } = useScale();
  const orbDiameter = useMemo(() => {
    const base = scale(180);
    const maxByWidth = windowWidth * 0.5;
    if (matchesCompactLayout) {
      // Keep the orb visually contained on short devices (e.g. SE class).
      return Math.min(base, scale(156), maxByWidth);
    }
    return Math.min(base, maxByWidth);
  }, [scale, windowWidth, matchesCompactLayout]);
  const namePromptLift = verticalScale(6);
  const namePromptDismissShift = verticalScale(4);
  const journeyPromptDrift = verticalScale(10);
  const namePromptLiftRef = useRef(namePromptLift);
  namePromptLiftRef.current = namePromptLift;

  const styles = useMemo(
    () =>
      StyleSheet.create({
        container: {
          flex: 1,
          justifyContent: 'space-between',
          alignItems: 'center',
          paddingVertical: verticalScale(60),
          paddingHorizontal: scale(20),
          backgroundColor: '#0d0d1a',
        },
        centerContent: {
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          alignSelf: 'stretch',
          paddingTop: verticalScale(200),
        },
        descriptionWrapper: {
          marginTop: verticalScale(48),
          marginBottom: verticalScale(32),
          alignSelf: 'center',
        },
        symbol: {
          width: '100%',
          height: '100%',
          opacity: 0.9,
        },
        orbWrapper: {
          opacity: 0.9,
          overflow: 'hidden',
          marginBottom: verticalScale(16),
          zIndex: 10,
          elevation: 0,
        },
        buttonContainer: {
          alignItems: 'center',
        },
        primaryButton: {
          backgroundColor: '#CFC3E0',
          paddingVertical: verticalScale(14),
          paddingHorizontal: scale(40),
          borderRadius: scale(24),
          marginBottom: verticalScale(12),
          shadowColor: '#000',
          shadowOffset: { width: 0, height: verticalScale(4) },
          shadowOpacity: 0.25,
          shadowRadius: scale(4),
          elevation: 5,
        },
        cardContainer: {
          flexDirection: 'row',
          flexWrap: 'wrap',
          justifyContent: 'center',
          marginTop: verticalScale(12),
        },
        intentionCard: {
          backgroundColor: 'rgba(240, 238, 248, 0.1)',
          borderColor: '#F0EEF8',
          borderWidth: 1,
          borderRadius: scale(12),
          paddingVertical: verticalScale(10),
          paddingHorizontal: scale(16),
          marginHorizontal: scale(8),
          marginVertical: verticalScale(8),
          width: scale(160),
          shadowColor: '#F0EEF8',
          shadowOffset: { width: 0, height: 0 },
          shadowRadius: scale(12),
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
          width: scale(90),
          zIndex: 3,
        },
        tempOverlay: {
          position: 'absolute',
          top: 0,
          right: 0,
          bottom: 0,
          left: 0,
          pointerEvents: 'none',
          zIndex: 2,
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
          backgroundColor: 'transparent',
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
          paddingTop: verticalScale(8),
          paddingBottom: verticalScale(14),
          paddingHorizontal: scale(14),
          borderRadius: scale(18),
          backgroundColor: 'rgba(0,0,0,0.18)',
          borderWidth: 1,
          borderColor: 'rgba(255,255,255,0.12)',
          shadowColor: '#000',
          shadowOffset: { width: 0, height: verticalScale(12) },
          shadowOpacity: 0.22,
          shadowRadius: scale(22),
          elevation: 10,
        },
        nameInput: {
          backgroundColor: 'rgba(255,255,255,0.06)',
          color: '#F0EEF8',
          borderRadius: scale(12),
          paddingVertical: verticalScale(12),
          paddingHorizontal: scale(12),
          borderWidth: 1,
          borderColor: 'rgba(255,255,255,0.10)',
          alignSelf: 'stretch',
        },
        nameActions: {
          marginTop: verticalScale(10),
          flexDirection: 'row',
          justifyContent: 'center',
          alignItems: 'center',
          gap: scale(16),
        },
        nameSaveBtn: {
          backgroundColor: '#CFC3E0',
          paddingVertical: verticalScale(8),
          paddingHorizontal: scale(20),
          borderRadius: scale(14),
          borderWidth: 1,
          borderColor: 'rgba(255,255,255,0.20)',
        },
        nameSkipBtn: {
          paddingVertical: verticalScale(8),
          paddingHorizontal: scale(18),
          borderRadius: scale(14),
          borderWidth: 1,
          borderColor: 'rgba(255,255,255,0.14)',
          backgroundColor: 'rgba(255,255,255,0.06)',
        },
        wakeChipsRow: {
          flexDirection: 'row',
          flexWrap: 'nowrap',
          justifyContent: 'center',
          gap: scale(6),
          marginBottom: verticalScale(4),
        },
        wakeChip: {
          paddingVertical: verticalScale(4),
          paddingHorizontal: scale(9),
          borderRadius: scale(20),
          borderWidth: 1,
          borderColor: 'rgba(255,255,255,0.14)',
          backgroundColor: 'rgba(255,255,255,0.06)',
        },
        wakeChipSelected: {
          backgroundColor: '#CFC3E0',
          borderColor: 'rgba(255,255,255,0.20)',
        },
      }),
    [scale, verticalScale],
  );

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
  const namePromptTranslate = useRef(new Animated.Value(namePromptLift)).current;
  const namePromptRevealTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Wake time prompt state
  const [showWakePrompt, setShowWakePrompt] = useState(false);
  const [selectedWakeChip, setSelectedWakeChip] = useState<string | null>(null);
  const [customWakeTime, setCustomWakeTime] = useState('');
  const [showCustomInput, setShowCustomInput] = useState(false);
  const wakePromptOpacity = useRef(new Animated.Value(0)).current;
  const wakePromptTranslate = useRef(new Animated.Value(namePromptLift)).current;
  const wakePromptRevealTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [existingName, nameDismissed, existingWake, wakeDismissed] = await Promise.all([
          AsyncStorage.getItem('profileName'),
          AsyncStorage.getItem('namePromptDismissed'),
          AsyncStorage.getItem('wakeTime'),
          AsyncStorage.getItem('wakePromptDismissed'),
        ]);
        if (cancelled) return;
        const willShowName = !existingName && nameDismissed !== 'true';
        const willShowWake = !existingWake && wakeDismissed !== 'true';
        if (willShowName) {
          namePromptRevealTimeoutRef.current = setTimeout(() => {
            if (cancelled) return;
            setShowNamePrompt(true);
            namePromptOpacity.setValue(0);
            namePromptTranslate.setValue(namePromptLiftRef.current);
            Animated.parallel([
              Animated.timing(namePromptOpacity, { toValue: 1, duration: 600, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
              Animated.timing(namePromptTranslate, { toValue: 0, duration: 600, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
            ]).start();
          }, 2000);
          // Wake prompt follows after name prompt dismisses via triggerWakePrompt()
        } else if (willShowWake) {
          wakePromptRevealTimeoutRef.current = setTimeout(() => {
            if (cancelled) return;
            setShowWakePrompt(true);
            wakePromptOpacity.setValue(0);
            wakePromptTranslate.setValue(namePromptLiftRef.current);
            Animated.parallel([
              Animated.timing(wakePromptOpacity, { toValue: 1, duration: 600, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
              Animated.timing(wakePromptTranslate, { toValue: 0, duration: 600, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
            ]).start();
          }, 2000);
        }
      } catch {}
    })();
    return () => {
      cancelled = true;
      if (namePromptRevealTimeoutRef.current) {
        clearTimeout(namePromptRevealTimeoutRef.current);
        namePromptRevealTimeoutRef.current = null;
      }
      if (wakePromptRevealTimeoutRef.current) {
        clearTimeout(wakePromptRevealTimeoutRef.current);
        wakePromptRevealTimeoutRef.current = null;
      }
    };
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

  const journeyPromptTranslateY = useMemo(
    () =>
      breath.interpolate({
        inputRange: [0, 1],
        outputRange: [journeyPromptDrift, 0],
      }),
    [breath, journeyPromptDrift],
  );

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

  const triggerWakePrompt = async () => {
    try {
      const [existingWake, wakeDismissed] = await Promise.all([
        AsyncStorage.getItem('wakeTime'),
        AsyncStorage.getItem('wakePromptDismissed'),
      ]);
      if (existingWake || wakeDismissed === 'true') return;
    } catch {}
    wakePromptRevealTimeoutRef.current = setTimeout(() => {
      setShowWakePrompt(true);
      wakePromptOpacity.setValue(0);
      wakePromptTranslate.setValue(namePromptLiftRef.current);
      Animated.parallel([
        Animated.timing(wakePromptOpacity, { toValue: 1, duration: 600, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
        Animated.timing(wakePromptTranslate, { toValue: 0, duration: 600, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      ]).start();
    }, 1000);
  };

  const persistName = async () => {
    const trimmed = nameValue.trim();
    if (trimmed.length > 0) {
      try { await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch {}
      try { await AsyncStorage.setItem('profileName', trimmed); } catch {}
    }
    Animated.parallel([
      Animated.timing(namePromptOpacity, { toValue: 0, duration: 420, easing: Easing.out(Easing.quad), useNativeDriver: true }),
      Animated.timing(namePromptTranslate, { toValue: -namePromptDismissShift, duration: 420, easing: Easing.out(Easing.quad), useNativeDriver: true }),
    ]).start(() => { setShowNamePrompt(false); triggerWakePrompt(); });
  };

  const skipName = async () => {
    try { await AsyncStorage.setItem('namePromptDismissed', 'true'); } catch {}
    Animated.parallel([
      Animated.timing(namePromptOpacity, { toValue: 0, duration: 320, easing: Easing.out(Easing.quad), useNativeDriver: true }),
      Animated.timing(namePromptTranslate, { toValue: -namePromptDismissShift, duration: 320, easing: Easing.out(Easing.quad), useNativeDriver: true }),
    ]).start(() => { setShowNamePrompt(false); triggerWakePrompt(); });
  };

  const dismissWakePrompt = () => {
    Animated.parallel([
      Animated.timing(wakePromptOpacity, { toValue: 0, duration: 420, easing: Easing.out(Easing.quad), useNativeDriver: true }),
      Animated.timing(wakePromptTranslate, { toValue: -namePromptDismissShift, duration: 420, easing: Easing.out(Easing.quad), useNativeDriver: true }),
    ]).start(() => setShowWakePrompt(false));
  };

  const persistWakeTime = async () => {
    const timeToSave = selectedWakeChip === 'Other' ? customWakeTime.trim() : selectedWakeChip;
    if (timeToSave && timeToSave.length > 0) {
      try { await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch {}
      try { await AsyncStorage.setItem('wakeTime', timeToSave); } catch {}
    }
    dismissWakePrompt();
  };

  const skipWake = async () => {
    try { await AsyncStorage.setItem('wakePromptDismissed', 'true'); } catch {}
    dismissWakePrompt();
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
            {
              color: '#F0EEF8',
              textAlign: 'center',
              marginTop: verticalScale(60),
              marginBottom: verticalScale(12),
              opacity: titleOpacity,
            }
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
            marginTop: verticalScale(4),
            marginBottom: verticalScale(8),
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
              width: orbDiameter,
              height: orbDiameter,
              borderRadius: orbDiameter / 2,
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
          <Animated.View style={{ opacity: Animated.multiply(descriptionOpacity, (showNamePrompt || showWakePrompt) ? 0.35 : 1) }}>
            <View
              style={styles.descriptionSheenHost}
              onLayout={e => setDescWidth(e.nativeEvent.layout.width)}
            >
              <Text
                style={[
                  Body.regular,
                  {
                    fontFamily: 'Inter-ExtraLight',
                    letterSpacing: scale(0.3),
                    color: '#F0EEF8',
                    textAlign: 'center',
                    opacity: 0.85,
                    paddingHorizontal: scale(10),
                  },
                ]}
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
          style={[
            styles.nameOverlayWrap,
            {
              top: Math.max(verticalScale(148), Math.round(windowHeight * 0.22) + verticalScale(24)),
            },
          ]}
          pointerEvents="box-none"
        >
          <Animated.View
            style={[
              styles.nameOverlay,
              { opacity: namePromptOpacity, transform: [{ translateY: namePromptTranslate }] },
            ]}
          >
            <View style={styles.nameBackdrop}>
              <Text
                style={[Typography.subtle, { color: '#D6D3E6', marginBottom: verticalScale(6), textAlign: 'center' }]}
              >
                How should Inner refer to you?
              </Text>
              <TextInput
                value={nameValue}
                onChangeText={setNameValue}
                placeholder="Your name (optional)"
                placeholderTextColor="rgba(240,238,248,0.5)"
                style={[styles.nameInput, windowHeight < 720 && { paddingVertical: verticalScale(10) }]}
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
                  hitSlop={{
                    top: verticalScale(8),
                    bottom: verticalScale(8),
                    left: scale(8),
                    right: scale(8),
                  }}
                >
                  <Text style={[Typography.subtle, { color: '#1F233A' }]}>Save</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={skipName}
                  style={styles.nameSkipBtn}
                  accessibilityRole="button"
                  accessibilityLabel="Skip name"
                  accessibilityHint="You can add a name later in Settings"
                  hitSlop={{
                    top: verticalScale(8),
                    bottom: verticalScale(8),
                    left: scale(8),
                    right: scale(8),
                  }}
                >
                  <Text style={[Typography.subtle, { fontFamily: 'Inter-ExtraLight', color: '#F0EEF8', opacity: 0.85 }]}>Skip</Text>
                </TouchableOpacity>
              </View>
            </View>
          </Animated.View>
        </KeyboardAvoidingView>
      )}

      {showWakePrompt && (
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={[
            styles.nameOverlayWrap,
            {
              top: Math.max(verticalScale(148), Math.round(windowHeight * 0.22) + verticalScale(24)),
            },
          ]}
          pointerEvents="box-none"
        >
          <Animated.View
            style={[
              styles.nameOverlay,
              { opacity: wakePromptOpacity, transform: [{ translateY: wakePromptTranslate }] },
            ]}
          >
            <View style={styles.nameBackdrop}>
              <Text
                style={[Typography.subtle, { color: '#D6D3E6', marginBottom: verticalScale(4), textAlign: 'center' }]}
              >
                When do you return from sleep?
              </Text>
              <Text
                style={[Typography.subtle, { fontFamily: 'Inter-ExtraLight', color: '#D6D3E6', opacity: 0.65, marginBottom: verticalScale(10), textAlign: 'center' }]}
              >
                A reminder will meet you at the threshold.
              </Text>
              <View style={styles.wakeChipsRow}>
                {(['6am', '7am', '8am', '9am', 'Other'] as const).map(chip => (
                  <TouchableOpacity
                    key={chip}
                    style={[styles.wakeChip, selectedWakeChip === chip && styles.wakeChipSelected]}
                    onPress={() => {
                      setSelectedWakeChip(chip);
                      setShowCustomInput(chip === 'Other');
                    }}
                    accessibilityRole="button"
                    accessibilityLabel={chip === 'Other' ? 'Enter custom wake time' : `Select ${chip} wake time`}
                  >
                    <Text style={[Typography.subtle, { color: selectedWakeChip === chip ? '#1F233A' : '#F0EEF8', opacity: selectedWakeChip === chip ? 1 : 0.8 }]}>
                      {chip}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
              {showCustomInput && (
                <TextInput
                  value={customWakeTime}
                  onChangeText={setCustomWakeTime}
                  placeholder="e.g. 10am, 6:30am"
                  placeholderTextColor="rgba(240,238,248,0.5)"
                  style={[styles.nameInput, { marginTop: verticalScale(8) }]}
                  autoCapitalize="none"
                  autoCorrect={false}
                  returnKeyType="done"
                  onSubmitEditing={persistWakeTime}
                  accessibilityLabel="Custom wake time"
                  accessibilityHint="Enter a time in any format, e.g. 10am"
                />
              )}
              <View style={styles.nameActions}>
                <TouchableOpacity
                  onPress={persistWakeTime}
                  style={styles.nameSaveBtn}
                  accessibilityRole="button"
                  accessibilityLabel="Save wake time"
                  hitSlop={{ top: verticalScale(8), bottom: verticalScale(8), left: scale(8), right: scale(8) }}
                >
                  <Text style={[Typography.subtle, { color: '#1F233A' }]}>Save</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={skipWake}
                  style={styles.nameSkipBtn}
                  accessibilityRole="button"
                  accessibilityLabel="Skip wake time"
                  accessibilityHint="You can set a wake time later in Settings"
                  hitSlop={{ top: verticalScale(8), bottom: verticalScale(8), left: scale(8), right: scale(8) }}
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
          <Text
            style={[
              Body.subtle,
              {
                fontFamily: 'Inter-ExtraLight',
                fontSize: scale(14),
                color: '#F0EEF8',
                opacity: 0.7,
              },
            ]}
          >
            Change Paths
          </Text>
        </TouchableOpacity>
      </View>
      </ImageBackground>
      </TouchableWithoutFeedback>
    </View>
  );
}