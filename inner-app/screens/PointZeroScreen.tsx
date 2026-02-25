import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  Easing,
  Pressable,
  Image,
  Platform,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import TrackPlayer from 'react-native-track-player';
import { Asset } from 'expo-asset';
import { Audio } from 'expo-av';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { useIntention } from '../core/IntentionProvider';
import { registerPracticeActivity } from '../core/DailyRitual';
import { saveThreadSignature } from '../src/core/threading/ThreadEngine';

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

  const accentColor =
    (intentions && intentions.length > 0 && INTENTION_AURA[intentions[0]]) ||
    DEFAULT_AURA;

  const scale = useRef(new Animated.Value(0.9)).current;
  const glowOpacity = useRef(new Animated.Value(0.3)).current;
  const [phase, setPhase] = useState<'inhale' | 'exhale' | 'hold'>('inhale');
  const holdPulse = useRef(new Animated.Value(1)).current;
  const [hasHeardPreroll, setHasHeardPreroll] = useState<boolean | null>(null);
  const [showExerciseButton, setShowExerciseButton] = useState(false);
  const [exerciseUri, setExerciseUri] = useState<string | null>(null);
  const autoReturnTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const uiOpacity = useRef(new Animated.Value(1)).current;

  const hasLoggedPracticeRef = useRef(false);
  const exerciseStartRef = useRef<number | null>(null);

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

  const playExpoSoundFromModule = async (moduleId: number, label: string) => {
    // Use iOS-friendly audio mode and play a local bundled asset via expo-av
    try {
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        interruptionModeIOS: Audio.INTERRUPTION_MODE_IOS_DO_NOT_MIX,
        playsInSilentModeIOS: true,
        shouldDuckAndroid: true,
        interruptionModeAndroid: Audio.INTERRUPTION_MODE_ANDROID_DO_NOT_MIX,
        playThroughEarpieceAndroid: false,
        staysActiveInBackground: false,
      });
    } catch (e) {
      console.log('[Point 0][expo-av] setAudioMode error', e);
    }

    // Ensure we don't have a previous sound instance hanging around
    await stopExpoSound();

    const asset = Asset.fromModule(moduleId);
    await asset.downloadAsync();
    const uri = asset.localUri ?? asset.uri;

    console.log('[Point 0][expo-av] play', { label, uri });

    const { sound } = await Audio.Sound.createAsync(
      { uri },
      { shouldPlay: true, isLooping: false, volume: 1.0 }
    );

    expoSoundRef.current = sound;
    return uri;
  };

  const logRitualCompletionOnce = () => {
    if (hasLoggedPracticeRef.current) return;
    hasLoggedPracticeRef.current = true;

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
            toValue: 0.8,
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
            toValue: 0.8,
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
            toValue: 0.3,
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

  useEffect(() => {
    if (phase !== 'hold') return;

    holdPulse.setValue(1);

    Animated.sequence([
      Animated.timing(holdPulse, {
        toValue: 1.06,
        duration: 600,
        easing: Easing.inOut(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.timing(holdPulse, {
        toValue: 1.0,
        duration: 600,
        easing: Easing.inOut(Easing.quad),
        useNativeDriver: true,
      }),
    ]).start();
  }, [phase, holdPulse]);

  // Audio: first-time auto preroll, then push-to-play exercise; later visits = exercise button immediately
  useEffect(() => {
    let cancelled = false;

    const startPointZeroAudio = async () => {
      try {
        console.log('[Point 0] init audio effect');
        const stored = await AsyncStorage.getItem(POINT_ZERO_PREROLL_DONE);
        const alreadyHeard = stored === 'true';

        // Pre-cache exercise audio so it starts smoothly when the user taps the CTA
        try {
          const exerciseAsset = Asset.fromModule(
            require('../assets/audio/point_zero_exercise.m4a')
          );
          await exerciseAsset.downloadAsync();

          const exUri = exerciseAsset.localUri ?? exerciseAsset.uri;

          if (!cancelled) {
            setExerciseUri(exUri);
            console.log('[Point 0] Exercise audio pre-cached', {
              uri: exUri,
              localUri: exerciseAsset.localUri,
              uriRaw: exerciseAsset.uri,
            });
          }
        } catch (e) {
          console.log('[Point 0] exercise pre-cache error', e);
        }

        if (cancelled) return;

        setHasHeardPreroll(alreadyHeard);
        setShowExerciseButton(alreadyHeard);

        if (!alreadyHeard) {
          console.log('[Point 0] First-time preroll starting');

          // First time: auto-play preroll only
          if (Platform.OS === 'ios') {
            await playExpoSoundFromModule(
              require('../assets/audio/point_zero_preroll.m4a'),
              'preroll'
            );
          } else {
            await TrackPlayer.reset();
            await TrackPlayer.setVolume(1.0);

            const prerollAsset = Asset.fromModule(
              require('../assets/audio/point_zero_preroll.m4a')
            );
            await prerollAsset.downloadAsync();

            const prerollUri = prerollAsset.localUri ?? prerollAsset.uri;

            console.log('[Point 0] preroll uri', {
              uri: prerollUri,
              localUri: prerollAsset.localUri,
              uriRaw: prerollAsset.uri,
            });

            await TrackPlayer.add({
              id: 'point_zero_preroll',
              url: prerollUri,
              title: 'Point 0 – Intro',
            });

            if (cancelled) return;
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
      }
    };

    startPointZeroAudio();

    return () => {
      cancelled = true;
      TrackPlayer.stop().catch(() => {});
      stopExpoSound().catch(() => {});
      if (autoReturnTimeoutRef.current) {
        clearTimeout(autoReturnTimeoutRef.current);
        autoReturnTimeoutRef.current = null;
      }
    };
  }, []);

  const handleDone = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    // If the user has been in the exercise long enough, count it as a completed ritual
    if (exerciseStartRef.current) {
      const elapsed = Date.now() - exerciseStartRef.current;
      if (elapsed >= POINT_ZERO_EARLY_COMPLETE_MS) {
        logRitualCompletionOnce();
      }
    }
    try {
      await TrackPlayer.stop();
      await stopExpoSound();
    } catch (e) {
      console.log('[Point 0] handleDone stop error', e);
    }
    navigation.navigate('Home');
  };

  const handleStartExercise = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
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
        await playExpoSoundFromModule(
          require('../assets/audio/point_zero_exercise.m4a'),
          'exercise'
        );
      } else {
        await TrackPlayer.reset();
        await TrackPlayer.setVolume(1.0);

        let uriToUse = exerciseUri;
        if (!uriToUse) {
          const exerciseAsset = Asset.fromModule(
            require('../assets/audio/point_zero_exercise.m4a')
          );
          await exerciseAsset.downloadAsync();
          uriToUse = exerciseAsset.localUri ?? exerciseAsset.uri;
        }

        console.log('[Point 0] exercise uri', { uri: uriToUse });

        await TrackPlayer.add({
          id: 'point_zero_exercise',
          url: uriToUse!,
          title: 'Point 0',
        });

        await TrackPlayer.play();
      }
      console.log('[Point 0] Exercise playback started');

      exerciseStartRef.current = Date.now();

      // Schedule auto-return 67 seconds after starting the exercise
      if (autoReturnTimeoutRef.current) {
        clearTimeout(autoReturnTimeoutRef.current);
      }
      autoReturnTimeoutRef.current = setTimeout(() => {
        console.log('[Point 0] Auto-return after exercise');
        logRitualCompletionOnce();
        navigation.navigate('Home');
      }, 67000);
    } catch (e) {
      console.log('[Point 0] exercise start error', e);
    }
  };

  return (
    <LinearGradient
      colors={['#0D0C1F', '#1F233A']}
      style={styles.container}
    >
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
            styles.orbGlow,
            {
              opacity: glowOpacity,
              backgroundColor: accentColor,
              shadowColor: accentColor,
              transform: [{ scale }, { scale: holdPulse }],
            },
          ]}
        />
        <Animated.View
          style={[
            styles.orbCore,
            {
              transform: [{ scale }],
            },
          ]}
        >
          <Image
            source={require('../assets/splash_ios.png')}
            style={styles.innerOrbImage}
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
                {hasHeardPreroll ? 'Begin Point 0' : 'Start the exercise'}
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
    </LinearGradient>
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
  orbGlow: {
    position: 'absolute',
    width: 220,
    height: 220,
    borderRadius: 110,
    opacity: 0.35,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 40,
  },
  orbCore: {
    width: 180,
    height: 180,
    borderRadius: 90,
    backgroundColor: '#070716',
    borderWidth: 1,
    borderColor: 'rgba(181,169,255,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  innerOrbImage: {
    width: 220,
    height: 220,
    opacity: 0.65,
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
    borderRadius: 999,
    backgroundColor: '#CFC3E0',
    borderWidth: 1,
    borderColor: 'rgba(24,22,42,0.85)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  doneLabel: {
    fontFamily: 'CalSans-SemiBold',
    fontSize: 15,
    color: '#171727',
    letterSpacing: 0.2,
  },
  footerNote: {
    fontFamily: 'Inter-ExtraLight',
    fontSize: 11,
    color: '#8E88C8',
    textAlign: 'center',
  },
});