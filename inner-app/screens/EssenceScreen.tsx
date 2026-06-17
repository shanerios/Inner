import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { useEffect, useState, useRef, useMemo, useCallback } from 'react';
import { useIntention } from '../core/IntentionProvider';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useFocusEffect } from '@react-navigation/native';
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
  Animated,
  Easing,
  TextInput,
  Platform,
  KeyboardAvoidingView,
  Keyboard,
  TouchableWithoutFeedback,
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

export default function EssenceScreen() {
  const navigation = useNavigation();
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const { scale, verticalScale, matchesCompactLayout } = useScale();

  const bgPlayer = useVideoPlayer(require('../assets/videos/essence_bg.mp4'), player => {
    player.loop = true;
    player.muted = true;
    player.play();
  });

  useFocusEffect(
    useCallback(() => {
      bgPlayer.play();
      return () => { bgPlayer.pause(); };
    }, [bgPlayer])
  );
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
          backgroundColor: 'rgba(207,195,224,0.16)',
          paddingVertical: verticalScale(14),
          paddingHorizontal: scale(40),
          borderRadius: 12,
          marginBottom: verticalScale(12),
          borderWidth: 1,
          borderColor: 'rgba(255,255,255,0.12)',
          alignItems: 'center',
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
          width: '84%',
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
          width: '90%',
          paddingTop: verticalScale(10),
          paddingBottom: verticalScale(10),
          paddingHorizontal: scale(20),
          borderRadius: 12,
          backgroundColor: 'rgba(8,5,3,0.6)',
          borderWidth: 1,
          borderColor: 'rgba(180,140,80,0.3)',
          shadowColor: '#000',
          shadowOffset: { width: 0, height: verticalScale(12) },
          shadowOpacity: 0.4,
          shadowRadius: scale(22),
          elevation: 10,
          alignItems: 'center',
        },
        nameInput: {
          backgroundColor: 'transparent',
          color: 'rgba(255,255,255,0.85)',
          borderRadius: 0,
          borderWidth: 0,
          borderBottomWidth: 1,
          borderBottomColor: 'rgba(180,140,80,0.4)',
          paddingVertical: verticalScale(2),
          paddingHorizontal: scale(4),
          fontSize: scale(18),
          textAlign: 'center',
          alignSelf: 'stretch',
          marginBottom: verticalScale(12),
        },
        nameActions: {
          marginTop: verticalScale(4),
          flexDirection: 'row',
          justifyContent: 'center',
          alignItems: 'center',
          gap: scale(20),
        },
        nameSaveBtn: {
          borderWidth: 1,
          borderColor: 'rgba(200,160,80,0.6)',
          backgroundColor: 'rgba(180,140,80,0.15)',
          borderRadius: 6,
          paddingVertical: verticalScale(11),
          paddingHorizontal: scale(32),
          alignItems: 'center',
        },
        nameSkipBtn: {
          paddingVertical: verticalScale(8),
          paddingHorizontal: scale(12),
        },
        wakeChipsRow: {
          flexDirection: 'row',
          flexWrap: 'nowrap',
          justifyContent: 'center',
          gap: scale(6),
          marginBottom: verticalScale(8),
        },
        wakeChip: {
          paddingVertical: verticalScale(5),
          paddingHorizontal: scale(10),
          borderRadius: 6,
          borderWidth: 1,
          borderColor: 'rgba(180,140,80,0.3)',
          backgroundColor: 'transparent',
        },
        wakeChipSelected: {
          backgroundColor: 'rgba(180,140,80,0.15)',
          borderColor: 'rgba(200,160,80,0.6)',
        },
      }),
    [scale, verticalScale],
  );

  const { intentions: ctxIntentions } = useIntention?.() || { intentions: [] as string[] };

  const [userIntentions, setUserIntentions] = useState<string[]>([]);
  const effectiveIntentions = (ctxIntentions && ctxIntentions.length > 0) ? ctxIntentions : userIntentions;
  const [personalizedAffirmation, setPersonalizedAffirmation] = useState<string | null>(null);

  const titleOpacity = useRef(new Animated.Value(0)).current;
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
    ]).start();

    return () => {
      titleOpacity.stopAnimation();
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
      <View style={{ flex: 1 }}>
        {/* Looping video background */}
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
          colors={['rgba(0,0,0,0.55)', 'transparent']}
          style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '20%' }}
          pointerEvents="none"
        />

        {/* Bottom gradient */}
        <LinearGradient
          colors={['transparent', 'rgba(0,0,0,0.6)']}
          style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: '20%' }}
          pointerEvents="none"
        />

        {/* Title + subtitle — upper ~25% of screen */}
        <View style={{ paddingTop: verticalScale(72), paddingHorizontal: scale(24), alignItems: 'center' }}>
          <Animated.Text
            style={[
              Typography.display,
              {
                color: '#F0EEF8',
                textAlign: 'center',
                marginBottom: verticalScale(10),
                opacity: titleOpacity,
              }
            ]}
            accessibilityLabel="Take a moment to center yourself"
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
                opacity: Animated.multiply(journeyPromptOpacity, titleOpacity),
                transform: [{ translateY: journeyPromptTranslateY }],
              }
            ]}
            accessible
            accessibilityRole="text"
            accessibilityLabel="The orb breathes with you."
          >
            The orb breathes with you.
          </Animated.Text>
        </View>

        {/* Empty middle — video does the work */}
        <View style={{ flex: 1 }} />

      {showNamePrompt && (
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={[
            styles.nameOverlayWrap,
            {
              top: Math.max(verticalScale(148), Math.round(windowHeight * 0.52) + verticalScale(24)),
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
              <Text style={{ color: 'rgba(255,255,255,0.85)', fontSize: scale(16), fontWeight: '500', textAlign: 'center', marginBottom: 8, letterSpacing: 0.3 }}>
                How should I know you?
              </Text>
              <Text style={{ color: 'rgba(255,255,255,0.4)', fontSize: scale(10), textAlign: 'center', marginBottom: verticalScale(24), lineHeight: scale(18) }}>
                Used to greet you. Optional.
              </Text>
              <TextInput
                value={nameValue}
                onChangeText={setNameValue}
                placeholder="Your name"
                placeholderTextColor="rgba(180,140,80,0.4)"
                style={styles.nameInput}
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
                  hitSlop={{ top: verticalScale(8), bottom: verticalScale(8), left: scale(8), right: scale(8) }}
                >
                  <Text style={{ color: 'rgba(220,185,100,1)', fontSize: scale(14), letterSpacing: 1 }}>Save</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={skipName}
                  style={styles.nameSkipBtn}
                  accessibilityRole="button"
                  accessibilityLabel="Skip name"
                  accessibilityHint="You can add a name later in Settings"
                  hitSlop={{ top: verticalScale(8), bottom: verticalScale(8), left: scale(8), right: scale(8) }}
                >
                  <Text style={{ color: 'rgba(255,255,255,0.25)', fontSize: scale(12), letterSpacing: 0.5 }}>Skip</Text>
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
              top: Math.max(verticalScale(148), Math.round(windowHeight * 0.52) + verticalScale(24)),
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
              <Text style={{ color: 'rgba(255,255,255,0.85)', fontSize: scale(16), fontWeight: '500', textAlign: 'center', marginBottom: 8, letterSpacing: 0.3 }}>
                When do you return from sleep?
              </Text>
              <Text style={{ color: 'rgba(255,255,255,0.4)', fontSize: scale(10), textAlign: 'center', marginBottom: verticalScale(20), lineHeight: scale(19) }}>
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
                    <Text style={{ color: selectedWakeChip === chip ? 'rgba(220,185,100,1)' : 'rgba(255,255,255,0.55)', fontSize: scale(12), letterSpacing: 0.5 }}>
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
                  placeholderTextColor="rgba(180,140,80,0.4)"
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
                  <Text style={{ color: 'rgba(220,185,100,1)', fontSize: scale(14), letterSpacing: 1 }}>Save</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={skipWake}
                  style={styles.nameSkipBtn}
                  accessibilityRole="button"
                  accessibilityLabel="Skip wake time"
                  accessibilityHint="You can set a wake time later in Settings"
                  hitSlop={{ top: verticalScale(8), bottom: verticalScale(8), left: scale(8), right: scale(8) }}
                >
                  <Text style={{ color: 'rgba(255,255,255,0.25)', fontSize: scale(12), letterSpacing: 0.5 }}>Skip</Text>
                </TouchableOpacity>
              </View>
            </View>
          </Animated.View>
        </KeyboardAvoidingView>
      )}

      {/* Buttons — bottom above safe area */}
      <View style={{ alignItems: 'center', paddingBottom: verticalScale(44), paddingHorizontal: scale(20) }}>
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
          <Text style={{ fontFamily: 'CalSans-SemiBold', fontSize: scale(16), color: '#F3EDE7', letterSpacing: 0.2 }}>Begin Journey</Text>
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
      </View>
      </TouchableWithoutFeedback>
    </View>
  );
}