import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { useEffect, useState, useRef, useMemo } from 'react';
import { useIntention } from '../core/IntentionProvider';
import { useVideoPlayer, VideoView } from '../core/memorySafeVideo';
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
    // Muted decorative video must not claim exclusive AVAudioSession ownership —
    // the default 'doNotMix' mode fights TrackPlayer's session on background/lock.
    player.audioMixingMode = 'mixWithOthers';
    player.play();
  });

  const journeyPromptDrift = verticalScale(10);

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
      }),
    [scale, verticalScale],
  );

  const { intentions: ctxIntentions } = useIntention?.() || { intentions: [] as string[] };

  const [userIntentions, setUserIntentions] = useState<string[]>([]);
  const effectiveIntentions = (ctxIntentions && ctxIntentions.length > 0) ? ctxIntentions : userIntentions;
  const [personalizedAffirmation, setPersonalizedAffirmation] = useState<string | null>(null);

  const titleOpacity = useRef(new Animated.Value(0)).current;
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
              console.log('[FOG] Essence: navigating → Home');
              // The paywall no longer gates entry; it opens from gated content.
              (navigation as any).reset({ index: 0, routes: [{ name: 'Home', params: { fogStart: true } }] });
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
