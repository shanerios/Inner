import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  Image,
  ImageBackground,
  Pressable,
  useWindowDimensions,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { Audio } from 'expo-av';
import LottieView from 'lottie-react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useIntention } from '../core/IntentionProvider';
import { registerPracticeActivity } from '../core/DailyRitual';
import { saveThreadSignature } from '../src/core/threading/ThreadEngine';

const AnimatedLottieView = Animated.createAnimatedComponent(LottieView);

type InnerFlameScreenProps = {
  navigation: any;
};

const INNER_FLAME_COMPLETED_KEY = 'inner_ritual_inner_flame_completed';
const INNER_FLAME_PREROLL_HEARD_KEY = 'inner_ritual_inner_flame_preroll_heard';
const INNER_FLAME_EARLY_COMPLETE_MS = 45000; // allow early completion credit after ~45s of exercise

const INTENTION_AURA: Record<string, string> = {
  calm: 'rgba(123,209,200,0.9)',
  clarity: 'rgba(255,201,121,0.9)',
  reawakening: 'rgba(197,155,255,0.9)',
  grounding: 'rgba(167,139,109,0.9)',
  expansion: 'rgba(155,167,255,0.9)',
  healing: 'rgba(255,157,182,0.9)',
};

const DEFAULT_AURA = '#5B4BFF';

export default function InnerFlameScreen({ navigation }: InnerFlameScreenProps) {
  const glowScale = useRef(new Animated.Value(0.96)).current;
  const glowOpacity = useRef(new Animated.Value(0.35)).current;

  const [hasHeardPreroll, setHasHeardPreroll] = useState(false);
  const [isExercisePlaying, setIsExercisePlaying] = useState(false);

  const prerollSoundRef = useRef<Audio.Sound | null>(null);
  const exerciseSoundRef = useRef<Audio.Sound | null>(null);

  const { intentions } = useIntention();

  const emberTint =
    (intentions && intentions.length > 0 && INTENTION_AURA[intentions[0]]) ||
    DEFAULT_AURA;

  // Caption breathing / fade-in
  const captionOpacity = useRef(new Animated.Value(0)).current;

  // Ember drift offset (tied loosely to breath cycle)
  const emberDriftOffset = useRef(new Animated.Value(0)).current;

  // Ember field "respiration" (expansion / contraction)
  const emberBreathScale = useRef(new Animated.Value(1)).current;

  // Heat shimmer ring animation
  const shimmerOpacity = useRef(new Animated.Value(0.1)).current;
  const shimmerScale = useRef(new Animated.Value(0.4)).current;

  // Track ritual completion / timing
  const hasLoggedPracticeRef = useRef(false);
  const exerciseStartRef = useRef<number | null>(null);

  const logRitualCompletionOnce = () => {
    if (hasLoggedPracticeRef.current) return;
    hasLoggedPracticeRef.current = true;
    try {
      registerPracticeActivity('ritual');
    } catch (e) {
      console.log('[INNER FLAME] streak log error', e);
    }

    // Journey Threading v1: record this ritual as the last completed step
    try {
      saveThreadSignature({
        type: 'ritual',
        id: 'innerFlame',
        mood: 'activated',
        timestamp: Date.now(),
      });
    } catch (e) {
      console.log('[INNER FLAME] thread save error', e);
    }
  };

  // CTA scale bounce
  const beginScale = useRef(new Animated.Value(1)).current;

  const { height, width } = useWindowDimensions();
  // Treat true tablets (e.g., iPad sizes) as large screens, but exclude big phones
  const isLargeScreen = Math.min(width, height) >= 768;
  // Negative value to nudge the orb upward; ~9% of screen height
  const orbOffset = -height * 0.09;

  // Glow / pulse for the ember orb
  useEffect(() => {
    const glowAnim = Animated.loop(
      Animated.sequence([
        Animated.parallel([
          Animated.timing(glowScale, {
            toValue: 1.04,
            duration: 3200,
            useNativeDriver: true,
          }),
          Animated.timing(glowOpacity, {
            toValue: 0.5,
            duration: 3200,
            useNativeDriver: true,
          }),
        ]),
        Animated.parallel([
          Animated.timing(glowScale, {
            toValue: 0.96,
            duration: 3200,
            useNativeDriver: true,
          }),
          Animated.timing(glowOpacity, {
            toValue: 0.3,
            duration: 3200,
            useNativeDriver: true,
          }),
        ]),
      ])
    );

    glowAnim.start();
    return () => {
      glowAnim.stop();
    };
  }, [glowScale, glowOpacity]);

  // Load and optionally auto-play Inner Flame preroll on first visit
  useEffect(() => {
    let isMounted = true;

    const loadPreroll = async () => {
      try {
        const heardFlag = await AsyncStorage.getItem(INNER_FLAME_PREROLL_HEARD_KEY);
        if (!isMounted) return;

        // If preroll already heard before, don't auto-play; just show CTA
        if (heardFlag === 'true') {
          setHasHeardPreroll(true);
          return;
        }

        await Audio.setAudioModeAsync({
          playsInSilentModeIOS: true,
          allowsRecordingIOS: false,
          staysActiveInBackground: false,
          shouldDuckAndroid: true,
        });

        const { sound } = await Audio.Sound.createAsync(
          require('../assets/audio/inner_flame_preroll.m4a'),
          { shouldPlay: true },
          status => {
            if (!status.isLoaded) return;
            if (status.didJustFinish) {
              // Mark preroll as heard so future visits skip auto-play
              AsyncStorage.setItem(INNER_FLAME_PREROLL_HEARD_KEY, 'true').catch(() => {});
              setHasHeardPreroll(true);
            }
          }
        );

        prerollSoundRef.current = sound;
      } catch (e) {
        console.warn('[INNER FLAME] preroll load error', e);
        // If preroll fails to load/play, still allow user to start the ritual
        setHasHeardPreroll(true);
      }
    };

    loadPreroll();

    return () => {
      isMounted = false;
      if (prerollSoundRef.current) {
        prerollSoundRef.current.unloadAsync().catch(() => {});
        prerollSoundRef.current = null;
      }
      if (exerciseSoundRef.current) {
        exerciseSoundRef.current.unloadAsync().catch(() => {});
        exerciseSoundRef.current = null;
      }
    };
  }, []);

  // Ember drift: subtle vertical motion loosely synced with the breath cycle
  useEffect(() => {
    const driftAnim = Animated.loop(
      Animated.sequence([
        // Inhale: embers rise a bit faster
        Animated.timing(emberDriftOffset, {
          toValue: -8,
          duration: 2400,
          useNativeDriver: true,
        }),
        // Hold: keep position
        Animated.delay(1200),
        // Exhale: drift settles a bit lower
        Animated.timing(emberDriftOffset, {
          toValue: 0,
          duration: 3200,
          useNativeDriver: true,
        }),
      ])
    );

    driftAnim.start();
    return () => {
      driftAnim.stop();
    };
  }, [emberDriftOffset]);

  // Caption fade-in + breathing (inhale/hold/exhale pattern)
  useEffect(() => {
    Animated.timing(captionOpacity, {
      toValue: 1,
      duration: 700,
      useNativeDriver: true,
    }).start(() => {
      Animated.loop(
        Animated.sequence([
          // Inhale: go to full opacity
          Animated.timing(captionOpacity, {
            toValue: 1,
            duration: 3200,
            useNativeDriver: true,
          }),
          // Hold: stay at full opacity
          Animated.delay(1600),
          // Exhale: fade down gently
          Animated.timing(captionOpacity, {
            toValue: 0.25,
            duration: 3200,
            useNativeDriver: true,
          }),
        ])
      ).start();
    });
  }, [captionOpacity]);

  // Ember respiration: subtle expansion/contraction synced with breath
  useEffect(() => {
    const emberBreath = Animated.loop(
      Animated.sequence([
        // Inhale: expand slightly
        Animated.timing(emberBreathScale, {
          toValue: 1.06,
          duration: 3200,
          useNativeDriver: true,
        }),
        // Hold
        Animated.delay(1600),
        // Exhale: return to baseline
        Animated.timing(emberBreathScale, {
          toValue: 1,
          duration: 3200,
          useNativeDriver: true,
        }),
      ])
    );

    emberBreath.start();
    return () => {
      emberBreath.stop();
    };
  }, [emberBreathScale]);

  // Heat shimmer ring: subtle pulse around the orb
  useEffect(() => {
    const shimmerAnim = Animated.loop(
      Animated.sequence([
        // Inhale: shimmer brightens and expands a touch
        Animated.parallel([
          Animated.timing(shimmerOpacity, {
            toValue: 0.1,
            duration: 3200,
            useNativeDriver: true,
          }),
          Animated.timing(shimmerScale, {
            toValue: 1.2,
            duration: 3200,
            useNativeDriver: true,
          }),
        ]),
        // Hold
        Animated.delay(1600),
        // Exhale: shimmer softens back down
        Animated.parallel([
          Animated.timing(shimmerOpacity, {
            toValue: 0.05,
            duration: 3200,
            useNativeDriver: true,
          }),
          Animated.timing(shimmerScale, {
            toValue: 0.7,
            duration: 3200,
            useNativeDriver: true,
          }),
        ]),
      ])
    );

    shimmerAnim.start();
    return () => {
      shimmerAnim.stop();
    };
  }, [shimmerOpacity, shimmerScale]);

  const handleBegin = async () => {
    // Subtle scale bounce on press
    Animated.sequence([
      Animated.timing(beginScale, {
        toValue: 0.97,
        duration: 80,
        useNativeDriver: true,
      }),
      Animated.timing(beginScale, {
        toValue: 1.03,
        duration: 120,
        useNativeDriver: true,
      }),
      Animated.timing(beginScale, {
        toValue: 1,
        duration: 80,
        useNativeDriver: true,
      }),
    ]).start();

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    try {
      // Stop preroll if it is still playing
      if (prerollSoundRef.current) {
        try {
          await prerollSoundRef.current.stopAsync();
        } catch {
          // ignore
        }
      }

      // If exercise sound already created, replay it; otherwise create and play
      if (exerciseSoundRef.current) {
        exerciseStartRef.current = Date.now();
        await exerciseSoundRef.current.replayAsync();
        setIsExercisePlaying(true);
      } else {
        exerciseStartRef.current = Date.now();
        const { sound } = await Audio.Sound.createAsync(
          require('../assets/audio/inner_flame_exercise.m4a'),
          { shouldPlay: true },
          status => {
            if (!status.isLoaded) return;

            if (status.didJustFinish) {
              // Exercise naturally completed: mark as finished and return Home
              setIsExercisePlaying(false);

              AsyncStorage.setItem(INNER_FLAME_COMPLETED_KEY, 'true').catch(() => {});
              logRitualCompletionOnce();

              // Small safety: defer navigation slightly to avoid race conditions
              setTimeout(() => {
                navigation.navigate('Home');
              }, 200);
            }
          }
        );
        exerciseSoundRef.current = sound;
        setIsExercisePlaying(true);
      }
    } catch (e) {
      console.warn('[INNER FLAME] exercise audio error', e);
    }
  };

  const handleReturn = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    // Early completion credit if user has been in the exercise long enough
    if (exerciseStartRef.current) {
      const elapsed = Date.now() - exerciseStartRef.current;
      if (elapsed >= INNER_FLAME_EARLY_COMPLETE_MS) {
        logRitualCompletionOnce();
      }
    }

    try {
      // Stop any audio that might be playing
      if (exerciseSoundRef.current) {
        try {
          await exerciseSoundRef.current.stopAsync();
        } catch {
          // ignore
        }
      }
      if (prerollSoundRef.current) {
        try {
          await prerollSoundRef.current.stopAsync();
        } catch {
          // ignore
        }
      }

      await AsyncStorage.setItem(INNER_FLAME_COMPLETED_KEY, 'true');
    } catch (e) {
      // Fail silently for now; we can add logging later if needed
      console.warn('[INNER FLAME] return error', e);
    }
    navigation.navigate('Home');
  };

  return (
    <ImageBackground
      source={require('../assets/images/inner_flame_bg.png')}
      style={styles.container}
      resizeMode="cover"
    >
      <LinearGradient
        colors={['rgba(18,8,22,0.45)', 'rgba(58,23,16,0.8)']}
        style={styles.overlay}
      >
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>Inner Flame</Text>
          <Text style={styles.subtitle}>
            Reignite the quiet spark at the center of your chest. Breathe warmth in, and let it spread through your whole field.
          </Text>
        </View>

        {/* Orb / Ember */}
        <View style={styles.orbContainer}>
          <View
            style={[
              styles.orbStack,
              {
                marginTop: isLargeScreen ? orbOffset - 80 : orbOffset,
              },
            ]}
          >
            {/* Ember ash particles (Lottie) */}
            <AnimatedLottieView
              source={require('../assets/fx/inner_flame_embers.json')}
              autoPlay
              loop
              style={[
                styles.emberParticles,
                isLargeScreen && { width: 720, height: 720, opacity: 0.75 },
                {
                  transform: [
                    { translateY: emberDriftOffset },
                    { scale: emberBreathScale },
                  ],
                },
              ]}
            />

            {/* Heat shimmer ring (placeholder PNG, animated) */}
            <Animated.Image
              source={require('../assets/images/inner_flame_heat_ring.png')}
              style={[
                styles.shimmerRing,
                isLargeScreen && { width: 610, height: 610 },
                {
                  opacity: shimmerOpacity,
                  transform: [{ scale: shimmerScale }],
                  tintColor: emberTint,
                },
              ]}
              resizeMode="contain"
            />

            {/* Ember orb glow layer (tinted copy) */}
            <Animated.Image
              source={require('../assets/images/orb_inner_flame.png')}
              style={[
                styles.innerOrbGlow,
                isLargeScreen && { width: 580, height: 580 },
                {
                  opacity: glowOpacity,
                  transform: [{ scale: glowScale }],
                  tintColor: emberTint,
                },
              ]}
              resizeMode="contain"
            />

            {/* Ember orb core */}
            <Image
              source={require('../assets/images/orb_inner_flame.png')}
              style={[
                styles.innerOrb,
                isLargeScreen && { width: 580, height: 580 },
              ]}
              resizeMode="contain"
            />
          </View>
        </View>

        {/* Footer / caption + CTAs */}
        <View style={styles.footer}>
          <Animated.Text
            style={[styles.orbCaption, { opacity: captionOpacity }]}
          >
            Inhale to gather warmth.
            {'\n'}
            Hold to let it build.
            {'\n'}
            Exhale to send it through your body.
          </Animated.Text>

          <View style={styles.beginButtonSlot}>
            {hasHeardPreroll && (
              <Animated.View style={{ transform: [{ scale: beginScale }] }}>
                <Pressable
                  onPress={handleBegin}
                  disabled={isExercisePlaying}
                  style={[
                    styles.beginButton,
                    isExercisePlaying && { opacity: 0.7 },
                  ]}
                >
                  <Text style={styles.beginLabel}>Begin Inner Flame</Text>
                </Pressable>
              </Animated.View>
            )}
          </View>

          <Pressable onPress={handleReturn} style={styles.returnButton}>
            <Text style={styles.returnLabel}>Return centered</Text>
          </Pressable>
        </View>
      </LinearGradient>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  overlay: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 64,
    paddingBottom: 32,
    justifyContent: 'space-between',
  },
  header: {
    alignItems: 'center',
  },
  title: {
    fontFamily: 'CalSans-SemiBold',
    fontSize: 22,
    color: '#FFE9CF',
    marginBottom: 6,
  },
  subtitle: {
    fontFamily: 'Inter-ExtraLight',
    fontSize: 13,
    color: '#F0D7C3',
    textAlign: 'center',
  },
  orbContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center'
  },
  orbStack: {
    width: 240,
    height: 240,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emberParticles: {
    position: 'absolute',
    width: 420,
    height: 420,
    opacity: 0.6,
  },
  shimmerRing: {
    position: 'absolute',
    width: 390,
    height: 390,
    opacity: 0.3,
  },
  innerOrbGlow: {
    position: 'absolute',
    width: 350,
    height: 350,
    opacity: 0.01,
  },
  orbCore: {
    width: 0,
    height: 0,
  },
  innerOrb: {
    width: 350,
    height: 350,
    opacity: 0.95,
  },
  orbCaption: {
    marginBottom: 20,
    fontFamily: 'Inter-ExtraLight',
    fontSize: 14,
    color: '#FBE5D4',
    textAlign: 'center',
    lineHeight: 20,
  },
  footer: {
    alignItems: 'center',
    marginTop: 24,
  },
  beginButtonSlot: {
    height: 52, // reserve vertical space for the CTA, whether visible or not
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  beginButton: {
    minWidth: 220,
    paddingVertical: 10,
    paddingHorizontal: 24,
    borderRadius: 999,
    backgroundColor: '#FAD0A2',
    borderWidth: 1,
    borderColor: 'rgba(24,22,42,0.9)',
    marginBottom: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  beginLabel: {
    fontFamily: 'CalSans-SemiBold',
    fontSize: 15,
    color: '#241014',
  },
  returnButton: {
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  returnLabel: {
    fontFamily: 'CalSans-SemiBold',
    fontSize: 14,
    color: '#FFE9CF',
    textAlign: 'center',
  },
});