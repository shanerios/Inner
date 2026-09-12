import React, { useEffect, useRef, useState } from 'react';
import {
  Alert,
  View,
  Text,
  StyleSheet,
  Animated,
  Easing,
  Pressable,
  Image,
  Platform,
} from 'react-native';
import { useVideoPlayer, VideoView } from '../core/memorySafeVideo';
import AsyncStorage from '@react-native-async-storage/async-storage';
import TrackPlayer from 'react-native-track-player';
import { getRitualAudioUri } from '../core/ritualAudio';
import { Audio, InterruptionModeAndroid, InterruptionModeIOS } from 'expo-av';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { useIntention } from '../core/IntentionProvider';
import { registerPracticeActivity } from '../core/DailyRitual';
import { saveThreadSignature } from '../src/core/threading/ThreadEngine';
import { usePostHog } from 'posthog-react-native';
import { useScale } from '../utils/scale';

type PointZeroScreenProps = {
  navigation: any;
};

const POINT_ZERO_PREROLL_DONE = 'inner_point_zero_preroll_done_v2';
const POINT_ZERO_PREROLL_DURATION_MS = 42000; // adjust to actual preroll length (ms)
const POINT_ZERO_EARLY_COMPLETE_MS = 45000; // allow early completion credit after ~45s of exercise

const INTENTION_AURA: Record<string, string> = {
  calm: 'rgba(123,209,200,0.9)',
  clarity: 'rgba(255,201,121,0.9)',
  reawakening: 'rgba(197,155,255,0.9)',
  grounding: 'rgba(167,139,109,0.9)',
  expansion: 'rgba(155,167,255,0.9)',
  healing: 'rgba(255,157,182,0.9)',
};

const DEFAULT_AURA = '#5B4BFF';

export default function PointZeroScreen({ navigation }: PointZeroScreenProps) {
  const { intentions } = useIntention();
  const posthog = usePostHog();

  const {
    scale: uiScale,
    verticalScale,
    width: windowWidth,
    height: windowHeight,
    matchesCompactLayout,
  } = useScale();

  const accentColor =
    (intentions && intentions.length > 0 && INTENTION_AURA[intentions[0]]) ||
    DEFAULT_AURA;

  const scale = useRef(new Animated.Value(0.9)).current;
  const glowOpacity = useRef(new Animated.Value(0.8)).current;
  const [phase, setPhase] = useState<'inhale' | 'exhale' | 'hold'>('inhale');
  const [hasHeardPreroll, setHasHeardPreroll] = useState<boolean | null>(null);
  const [showExerciseButton, setShowExerciseButton] = useState(false);
  const audioActiveRef = useRef(true);
  const audioLoadingRef = useRef(false);
  const [audioLoading, setAudioLoading] = useState(false);
  const autoReturnTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const uiOpacity = useRef(new Animated.Value(1)).current;

  const hasLoggedPracticeRef = useRef(false);
  const exerciseStartRef = useRef<number | null>(null);
  const ritualStartedTrackedRef = useRef(false);

  const expoSoundRef = useRef<Audio.Sound | null>(null);

  const stopExpoSound = async () => {
    try {
      const s = expoSoundRef.current;
      if (s) {
        await s.stopAsync();
        await s.unloadAsync();
      }
    } catch {}
    expoSoundRef.current = null;
  };

  const playExpoSoundFromUri = async (uri: string, label: string) => {
    // Play the verified local cache file with the existing iOS audio mode.
    try {
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        interruptionModeIOS: InterruptionModeIOS.DoNotMix,
        playsInSilentModeIOS: true,
        shouldDuckAndroid: true,
        interruptionModeAndroid: InterruptionModeAndroid.DoNotMix,
        playThroughEarpieceAndroid: false,
        staysActiveInBackground: false,
      });
    } catch (e) {
      console.log('[Point 0][expo-av] setAudioMode error', e);
    }

    // Ensure we don't have a previous sound instance hanging around
    await stopExpoSound();

    if (!audioActiveRef.current) return;

    if (__DEV__) console.log('[Point 0][expo-av] play', { label, uri });

    const { sound } = await Audio.Sound.createAsync(
      { uri },
      { shouldPlay: false, isLooping: false, volume: 1.0 }
    );

    if (!audioActiveRef.current) { await sound.unloadAsync(); return; }
    expoSoundRef.current = sound;
    await sound.playAsync();
    return uri;
  };

  const logRitualCompletionOnce = () => {
    if (hasLoggedPracticeRef.current) return;
    hasLoggedPracticeRef.current = true;
    posthog.capture('daily_ritual_completed', {
      ritual_id: 'point_zero',
      completion_type: 'completed',
    });
    try {
      registerPracticeActivity('ritual');
    } catch (e) {
      console.log('[Point 0] streak log error', e);
    }
    // Journey Threading v1: record this ritual as the last completed step
    try {
      saveThreadSignature({
        type: 'ritual',
        id: 'pointZero',
        mood: 'grounded',
        timestamp: Date.now(),
      });
    } catch (e) {
      console.log('[Point 0] thread save error', e);
    }
  };

  // Breathing loop animation
  useEffect(() => {
    const breathing = Animated.loop(
      Animated.sequence([
        // Inhale: 4 seconds
        Animated.parallel([
          Animated.timing(scale, {
            toValue: 1.06,
            duration: 4000,
            easing: Easing.inOut(Easing.quad),
            useNativeDriver: true,
          }),
          Animated.timing(glowOpacity, {
            toValue: 1.0,
            duration: 4000,
            easing: Easing.inOut(Easing.quad),
            useNativeDriver: true,
          }),
        ]),

        // Hold: 4 seconds
        Animated.parallel([
          Animated.timing(scale, {
            toValue: 1.06,
            duration: 4000,
            easing: Easing.linear,
            useNativeDriver: true,
          }),
          Animated.timing(glowOpacity, {
            toValue: 1.0,
            duration: 4000,
            easing: Easing.linear,
            useNativeDriver: true,
          }),
        ]),

        // Exhale: 8 seconds
        Animated.parallel([
          Animated.timing(scale, {
            toValue: 0.9,
            duration: 8000,
            easing: Easing.inOut(Easing.quad),
            useNativeDriver: true,
          }),
          Animated.timing(glowOpacity, {
            toValue: 0.8,
            duration: 8000,
            easing: Easing.inOut(Easing.quad),
            useNativeDriver: true,
          }),
        ]),
      ]),
    );

    breathing.start();

    return () => {
      breathing.stop();
    };
  }, [scale, glowOpacity]);

  // Simple inhale / hold / exhale phase text toggle
  useEffect(() => {
    let cancelled = false;

    const loop = () => {
      if (cancelled) return;

      setPhase('inhale');
      setTimeout(() => {
        if (cancelled) return;

        setPhase('hold');
        setTimeout(() => {
          if (cancelled) return;

          setPhase('exhale');
          setTimeout(loop, 8000); // exhale
        }, 4000); // hold
      }, 4000); // inhale
    };

    loop();
    return () => { cancelled = true };
  }, []);


  // Audio: first-time auto preroll, then push-to-play exercise; later visits = exercise button immediately
  useEffect(() => {
    let cancelled = false;

    audioActiveRef.current = true;
    const startPointZeroAudio = async () => {
      try {
        console.log('[Point 0] init audio effect');
        const stored = await AsyncStorage.getItem(POINT_ZERO_PREROLL_DONE);
        const alreadyHeard = stored === 'true';

        if (cancelled) return;

        setHasHeardPreroll(alreadyHeard);
        setShowExerciseButton(alreadyHeard);

        if (!alreadyHeard) {
          console.log('[Point 0] First-time preroll starting');

          const prerollUri = await getRitualAudioUri('point_zero_preroll');
          if (!audioActiveRef.current) return;
          // First time: auto-play preroll only
          if (Platform.OS === 'ios') {
            await playExpoSoundFromUri(
              prerollUri,
              'preroll'
            );
          } else {
            await TrackPlayer.reset();
            await TrackPlayer.setVolume(1.0);

            await TrackPlayer.add({
              id: 'point_zero_preroll',
              url: prerollUri,
              title: 'Point 0 – Intro',
            });

            if (cancelled) return;
            if (!audioActiveRef.current) return;
          await TrackPlayer.play();
          }

          // After preroll duration, mark as done and reveal exercise button
          setTimeout(async () => {
            if (cancelled) return;
            console.log('[Point 0] Preroll window complete, revealing exercise button');
            setShowExerciseButton(true);
            setHasHeardPreroll(true);
            try {
              await AsyncStorage.setItem(POINT_ZERO_PREROLL_DONE, 'true');
            } catch (e) {
              console.log('[Point 0] preroll flag write error', e);
            }
          }, POINT_ZERO_PREROLL_DURATION_MS);
        }
      } catch (e) {
        console.log('[Point 0] audio init error', e);
        if (audioActiveRef.current) setShowExerciseButton(true);
      }
    };

    startPointZeroAudio();

    return () => {
      cancelled = true;
      audioActiveRef.current = false;
      TrackPlayer.stop().catch(() => {});
      stopExpoSound().catch(() => {});
      if (autoReturnTimeoutRef.current) {
        clearTimeout(autoReturnTimeoutRef.current);
        autoReturnTimeoutRef.current = null;
      }
    };
  }, []);

  const handleDone = async () => {
    audioActiveRef.current = false;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (!ritualStartedTrackedRef.current) {
      posthog.capture('daily_ritual_started', {
        ritual_id: 'point_zero',
        entry_point: 'daily_ritual_screen',
      });
      ritualStartedTrackedRef.current = true;
    }
    // If the user has been in the exercise long enough, count it as a completed ritual
    if (exerciseStartRef.current) {
      const elapsed = Date.now() - exerciseStartRef.current;
      if (elapsed >= POINT_ZERO_EARLY_COMPLETE_MS) {
        if (!hasLoggedPracticeRef.current) {
          hasLoggedPracticeRef.current = true;
          posthog.capture('daily_ritual_completed', {
            ritual_id: 'point_zero',
            completion_type: 'early_exit_credit',
          });
          try {
            registerPracticeActivity('ritual');
          } catch (e) {
            console.log('[Point 0] streak log error', e);
          }
          try {
            saveThreadSignature({
              type: 'ritual',
              id: 'pointZero',
              mood: 'grounded',
              timestamp: Date.now(),
            });
          } catch (e) {
            console.log('[Point 0] thread save error', e);
          }
        }
      }
    }
    try {
      await TrackPlayer.stop();
      await stopExpoSound();
    } catch (e) {
      console.log('[Point 0] handleDone stop error', e);
    }
    navigation.popTo('Home');
  };

  const handleStartExercise = async () => {
    if (audioLoadingRef.current) return;
    audioLoadingRef.current = true;
    setAudioLoading(true);
    try {
      const exerciseUri = await getRitualAudioUri('point_zero_exercise');
      if (!audioActiveRef.current) return;

      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      if (!ritualStartedTrackedRef.current) {
        posthog.capture('daily_ritual_started', {
          ritual_id: 'point_zero',
          entry_point: 'daily_ritual_screen',
        });
        ritualStartedTrackedRef.current = true;
      }
      try {
        console.log('[Point 0] Start exercise pressed');

        // Stop any preroll sound still playing (especially on iOS expo-av path)
        await stopExpoSound();

        // Fade UI slightly while the exercise runs
        Animated.timing(uiOpacity, {
          toValue: 0.75,
          duration: 600,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }).start();

        if (Platform.OS === 'ios') {
          await playExpoSoundFromUri(
            exerciseUri,
            'exercise'
          );
        } else {
          await TrackPlayer.reset();
          await TrackPlayer.setVolume(1.0);

          await TrackPlayer.add({
            id: 'point_zero_exercise',
            url: exerciseUri,
            title: 'Point 0',
          });

          if (!audioActiveRef.current) return;
          await TrackPlayer.play();
        }
        console.log('[Point 0] Exercise playback started');

        if (!audioActiveRef.current) return;
        exerciseStartRef.current = Date.now();

        // Schedule auto-return 67 seconds after starting the exercise
        if (autoReturnTimeoutRef.current) {
          clearTimeout(autoReturnTimeoutRef.current);
        }
        autoReturnTimeoutRef.current = setTimeout(() => {
          if (!audioActiveRef.current) return;
          console.log('[Point 0] Auto-return after exercise');
          logRitualCompletionOnce();
          navigation.popTo('Home');
        }, 67000);
      } catch (e) {
        console.log('[Point 0] exercise start error', e);
        throw e;
      }
    } catch {
      if (audioActiveRef.current) Alert.alert('Audio unavailable', 'Connect to the internet and try again.');
    } finally {
      audioLoadingRef.current = false;
      if (audioActiveRef.current) setAudioLoading(false);
    }
  };

  // Video background
  const bgPlayer = useVideoPlayer(require('../assets/videos/point_zero_bg.mp4'), player => {
    player.loop = true;
    player.muted = true;
    // Muted decorative video must not claim exclusive AVAudioSession ownership —
    // the default 'doNotMix' mode fights TrackPlayer's session on background/lock.
    player.audioMixingMode = 'mixWithOthers';
    player.play();
  });

  const orbSizing = React.useMemo(() => {
    // Original visual design sizes:
    // - glow: 220
    // - core ring: 180
    // - inner orb image: 220
    const baseGlow = uiScale(220);
    const baseCore = uiScale(180);
    const baseInner = uiScale(220);

    // Clamp for short/SE-class devices so the orb doesn't dominate/clamp text.
    const widthCap = windowWidth * 0.72;
    const compactCap = matchesCompactLayout ? uiScale(190) : baseGlow;

    const glowDiameter = Math.min(baseGlow, widthCap, compactCap);
    const factor = baseGlow > 0 ? glowDiameter / baseGlow : 1;

    // Additional safety clamp by height (very short windows).
    const maxByHeight = windowHeight * 0.36;
    const heightClampedGlowDiameter = Math.min(glowDiameter, maxByHeight);
    const heightFactor = glowDiameter > 0 ? heightClampedGlowDiameter / glowDiameter : 1;

    const finalFactor = factor * heightFactor;
    const coreDiameter = baseCore * finalFactor;
    const innerDiameter = baseInner * finalFactor;
    const glowShadowRadius = uiScale(40) * finalFactor;

    return {
      glowDiameter: heightClampedGlowDiameter,
      coreDiameter,
      innerDiameter,
      glowShadowRadius,
      translateX: uiScale(1) * finalFactor, // keep the tiny visual nudge proportional
    };
  }, [uiScale, windowWidth, windowHeight, matchesCompactLayout]);

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
        colors={['rgba(0,0,0,0.65)', 'transparent']}
        style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '25%' }}
        pointerEvents="none"
      />

      {/* Bottom gradient */}
      <LinearGradient
        colors={['transparent', 'rgba(0,0,0,0.65)']}
        style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: '25%' }}
        pointerEvents="none"
      />
      {/* Title & subtitle */}
      <Animated.View style={[styles.header, { opacity: uiOpacity }]}>
        <Text style={styles.title}>Point 0</Text>
        <Text style={styles.subtitle}>
          Drop beneath the noise and land in your inner stillpoint.
        </Text>
        <Text style={styles.subtitleSmall}>
          Breathe softer than usual. Exhale a little slower than you inhale.
        </Text>
      </Animated.View>

      {/* Breathing orb */}
      <View style={styles.orbContainer}>
        <Animated.View
          style={[
            styles.orbCore,
            {
              opacity: glowOpacity,
              transform: [{ scale }],
              width: orbSizing.coreDiameter,
              height: orbSizing.coreDiameter,
              borderRadius: orbSizing.coreDiameter / 2,
            },
          ]}
        >
          <Image
            source={require('../assets/splash_ios.png')}
            style={[
              styles.innerOrbImage,
              {
                width: orbSizing.innerDiameter,
                height: orbSizing.innerDiameter,
                borderRadius: orbSizing.innerDiameter / 2,
                transform: [{ translateX: orbSizing.translateX }],
              },
            ]}
            resizeMode="contain"
          />
        </Animated.View>
      </View>

      {/* Phase text */}
      <Animated.View style={[styles.phaseContainer, { opacity: uiOpacity }]}>
        <Text style={styles.phaseLabel}>
          {phase === 'inhale'
            ? 'Inhale for 4…'
            : phase === 'hold'
            ? 'Hold for 4…'
            : 'Exhale for 8…'}
        </Text>
        <Text style={styles.phaseHint}>
          Follow the rise and fall of the orb. Let your weight sink down.
        </Text>
      </Animated.View>

      {/* Done / Return CTA */}
      <Animated.View style={[styles.footer, { opacity: uiOpacity }]}>        
        <View style={styles.exerciseButtonSlot}>
          {showExerciseButton && (
            <Pressable
              onPress={handleStartExercise}
              disabled={audioLoading}
              style={styles.doneButton}
              accessibilityRole="button"
              accessibilityLabel="Start Point 0 ritual"
              accessibilityHint={
                hasHeardPreroll
                  ? 'Begins the Point 0 grounding ritual'
                  : 'Starts the Point 0 exercise after the intro'
              }
            >
              <Text style={styles.doneLabel}>
                {audioLoading ? 'Loading audio…' : hasHeardPreroll ? 'Begin Point 0' : 'Start the exercise'}
              </Text>
            </Pressable>
          )}
        </View>

        <Pressable
          onPress={handleDone}
          style={{ marginTop: 8, paddingVertical: 6, paddingHorizontal: 12 }}
          accessibilityRole="button"
          accessibilityLabel="Return to Home"
          accessibilityHint="Leaves the ritual now and returns you to the Inner Home screen"
        >
          <Text
            style={{
              fontFamily: 'CalSans-SemiBold',
              fontSize: 14,
              color: '#CFC3E0',
              textAlign: 'center',
              letterSpacing: 0.3,
            }}
          >
            Return centered
          </Text>
        </Pressable>

        <Text style={[styles.footerNote, { marginTop: 8, maxWidth: 260 }]}>
          You can come back to Point 0 whenever you need a one-minute reset.
        </Text>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 64,
    paddingBottom: 32,
    justifyContent: 'space-between',
  },
  header: {
    alignItems: 'center',
    paddingHorizontal: 12,
  },
  title: {
    fontFamily: 'CalSans-SemiBold',
    fontSize: 22,
    color: '#F4F1FF',
    letterSpacing: 0.4,
    marginBottom: 8,
    textAlign: 'center',
  },
  subtitle: {
    fontFamily: 'Inter-ExtraLight',
    fontSize: 14,
    color: '#CFC7F0',
    textAlign: 'center',
    marginBottom: 4,
  },
  subtitleSmall: {
    fontFamily: 'Inter-ExtraLight',
    fontSize: 12,
    color: '#9D96D3',
    textAlign: 'center',
  },
  orbContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  orbCore: {
    width: 180,
    height: 180,
    borderRadius: 90,
    backgroundColor: 'transparent',
    borderWidth: 0,
    borderColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: 'rgb(160, 210, 255)',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.28,
    shadowRadius: 18,
  },
  innerOrbImage: {
    width: 180,
    height: 180,
    opacity: 1,
    // The orb asset has a tiny visual offset; nudge it so it sits centered in the ring
    transform: [{ translateX: 1 }],
  },
  phaseContainer: {
    alignItems: 'center',
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  phaseLabel: {
    fontFamily: 'Inter-ExtraLight',
    fontSize: 16,
    color: '#F2EEFF',
    marginBottom: 4,
    textAlign: 'center',
  },
  phaseHint: {
    fontFamily: 'Inter-ExtraLight',
    fontSize: 12,
    color: '#A9A3D9',
    textAlign: 'center',
  },
  footer: {
    alignItems: 'center',
  },
  exerciseButtonSlot: {
    height: 52, // reserve vertical space for the CTA, whether visible or not
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  doneButton: {
    minWidth: 200,
    paddingVertical: 10,
    paddingHorizontal: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(207,195,224,0.16)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  doneLabel: {
    fontFamily: 'CalSans-SemiBold',
    fontSize: 15,
    color: '#F3EDE7',
    letterSpacing: 0.2,
  },
  footerNote: {
    fontFamily: 'Inter-ExtraLight',
    fontSize: 11,
    color: '#8E88C8',
    textAlign: 'center',
  },
});
