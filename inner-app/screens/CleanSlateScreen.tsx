import React, { useRef, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  Easing,
  Pressable,
  Image,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Audio } from 'expo-av';
import * as Haptics from 'expo-haptics';
import { useIntention } from '../core/IntentionProvider';
import { registerPracticeActivity } from '../core/DailyRitual';
import { saveThreadSignature } from '../src/core/threading/ThreadEngine';

const CLEAN_SLATE_PREROLL_DONE = 'inner_clean_slate_preroll_done_v2';
const CLEAN_SLATE_PREROLL_MS = 28000;  // ~28s micro prelude
const CLEAN_SLATE_EARLY_COMPLETE_MS = 45000; // allow ~75% credit

// Intention-aware glow colors, slightly lighter than Point 0
const INTENTION_AURA: Record<string, string> = {
  calm: 'rgba(123,209,200,0.95)',
  clarity: 'rgba(255,201,121,0.95)',
  reawakening: 'rgba(197,155,255,0.95)',
  grounding: 'rgba(167,139,109,0.95)',
  expansion: 'rgba(155,167,255,0.95)',
  healing: 'rgba(255,157,182,0.95)',
};

const DEFAULT_AURA = '#6C63FF';

export default function CleanSlateScreen({ navigation }: any) {
  const { intentions } = useIntention();

  const accentColor =
    (intentions && intentions.length > 0 && INTENTION_AURA[intentions[0]]) ||
    DEFAULT_AURA;

  const scale = useRef(new Animated.Value(1)).current;
  const sweepOpacity = useRef(new Animated.Value(0)).current;
  const sweepTranslate = useRef(new Animated.Value(0)).current;

  const [phase, setPhase] = useState<'gather' | 'sweep' | 'empty'>('gather');
  const [showExerciseButton, setShowExerciseButton] = useState(false);
  const [hasHeardPreroll, setHasHeardPreroll] = useState<boolean | null>(null);

  const prerollSoundRef = useRef<Audio.Sound | null>(null);
  const exerciseSoundRef = useRef<Audio.Sound | null>(null);
  const prerollFailsafeRef = useRef<NodeJS.Timeout | null>(null);

  const autoReturnRef = useRef<NodeJS.Timeout | null>(null);
  const uiOpacity = useRef(new Animated.Value(1)).current;

  const hasLoggedPracticeRef = useRef(false);
  const exerciseStartRef = useRef<number | null>(null);

  const logRitualCompletionOnce = () => {
    if (hasLoggedPracticeRef.current) return;
    hasLoggedPracticeRef.current = true;
    try {
      registerPracticeActivity('ritual');
    } catch (e) {
      console.log('[Clean Slate] streak log error', e);
    }

    // Journey Threading v1: record this ritual as the last completed step
    try {
      saveThreadSignature({
        type: 'ritual',
        id: 'cleanSlate',
        mood: 'reflective',
        timestamp: Date.now(),
      });
    } catch (e) {
      console.log('[Clean Slate] thread save error', e);
    }
  };

  // ---------------------------
  // SWEEP MOTION LOOP (pendulum)
  // 4s left, 6s right, continuous
  // ---------------------------
  useEffect(() => {
    const amplitude = 40; // widen the sweep; adjust if needed

    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(sweepTranslate, {
          toValue: -amplitude,
          duration: 4000,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(sweepTranslate, {
          toValue: amplitude,
          duration: 6000,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ]),
      { resetBeforeIteration: false }
    );

    anim.start();

    return () => {
      anim.stop();
    };
  }, [sweepTranslate]);

  // ---------------------------
  // PHASE TEXT LOOP
  // 4s "Gather…", 6s "Sweep…"
  // ---------------------------
  useEffect(() => {
    let cancelled = false;

    const loopPhases = () => {
      if (cancelled) return;

      setPhase('gather');

      setTimeout(() => {
        if (cancelled) return;

        setPhase('sweep');

        setTimeout(() => {
          if (cancelled) return;
          loopPhases();
        }, 6000); // match rightward sweep
      }, 4000); // match leftward sweep
    };

    loopPhases();

    return () => {
      cancelled = true;
    };
  }, []);

  // -----------------------------------
  // AUDIO HANDLING: preroll → exercise
  // InnerFlame-style (expo-av) for iOS stability
  // -----------------------------------
  useEffect(() => {
    let cancelled = false;

    const initAudio = async () => {
      try {
        await Audio.setAudioModeAsync({
          playsInSilentModeIOS: true,
          allowsRecordingIOS: false,
          staysActiveInBackground: false,
          shouldDuckAndroid: true,
        });

        const stored = await AsyncStorage.getItem(CLEAN_SLATE_PREROLL_DONE);
        const already = stored === 'true';

        setHasHeardPreroll(already);
        setShowExerciseButton(already);

        if (already) return;

        // Cleanup any previous instances
        try {
          await prerollSoundRef.current?.unloadAsync();
        } catch {}
        prerollSoundRef.current = null;

        const { sound } = await Audio.Sound.createAsync(
          require('../assets/audio/clean_slate_pre.m4a'),
          { shouldPlay: true },
          (status) => {
            if (cancelled) return;
            if (!status.isLoaded) return;

            // If preroll ends naturally, reveal CTA
            if (status.didJustFinish) {
              if (prerollFailsafeRef.current) {
                clearTimeout(prerollFailsafeRef.current);
                prerollFailsafeRef.current = null;
              }
              setShowExerciseButton(true);
              setHasHeardPreroll(true);
              AsyncStorage.setItem(CLEAN_SLATE_PREROLL_DONE, 'true').catch(() => {});
            }
          }
        );

        prerollSoundRef.current = sound;

        // Failsafe: if iOS status callbacks don’t fire, reveal CTA after expected preroll duration
        prerollFailsafeRef.current = setTimeout(() => {
          if (cancelled) return;
          setShowExerciseButton(true);
          setHasHeardPreroll(true);
          AsyncStorage.setItem(CLEAN_SLATE_PREROLL_DONE, 'true').catch(() => {});
        }, CLEAN_SLATE_PREROLL_MS + 1000);
      } catch (e) {
        console.log('[Clean Slate] audio init error', e);
        // fail-open: allow user to begin even if preroll fails
        if (!cancelled) {
          setShowExerciseButton(true);
          setHasHeardPreroll(true);
        }
      }
    };

    initAudio();

    return () => {
      cancelled = true;

      if (prerollFailsafeRef.current) {
        clearTimeout(prerollFailsafeRef.current);
        prerollFailsafeRef.current = null;
      }

      if (autoReturnRef.current) {
        clearTimeout(autoReturnRef.current);
        autoReturnRef.current = null;
      }

      prerollSoundRef.current?.unloadAsync().catch(() => {});
      prerollSoundRef.current = null;

      exerciseSoundRef.current?.unloadAsync().catch(() => {});
      exerciseSoundRef.current = null;
    };
  }, []);

  // -----------------------------
  // CTA: start exercise playback
  // -----------------------------
  const handleBegin = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    // Fade UI
    Animated.timing(uiOpacity, {
      toValue: 0.75,
      duration: 600,
      easing: Easing.inOut(Easing.quad),
      useNativeDriver: true,
    }).start();

    // Stop/unload preroll
    try {
      await prerollSoundRef.current?.stopAsync();
    } catch {}
    try {
      await prerollSoundRef.current?.unloadAsync();
    } catch {}
    prerollSoundRef.current = null;

    // (Re)start exercise
    try {
      if (exerciseSoundRef.current) {
        await exerciseSoundRef.current.replayAsync();
      } else {
        const { sound } = await Audio.Sound.createAsync(
          require('../assets/audio/clean_slate_exercise.m4a'),
          { shouldPlay: true },
          (status) => {
            if (!status.isLoaded) return;
            if (status.didJustFinish) {
              // If the user stays through it, count completion
              logRitualCompletionOnce();
              navigation.navigate('Home');
            }
          }
        );
        exerciseSoundRef.current = sound;
      }
    } catch (e) {
      console.log('[Clean Slate] exercise load/play error', e);
      // fail-open: still let them return
    }

    exerciseStartRef.current = Date.now();

    // Auto-return after ~65 seconds to match the exercise audio
    if (autoReturnRef.current) clearTimeout(autoReturnRef.current);
    autoReturnRef.current = setTimeout(() => {
      logRitualCompletionOnce();
      navigation.navigate('Home');
    }, 67000);
  };

  const handleDone = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    // early completion credit
    if (exerciseStartRef.current) {
      const elapsed = Date.now() - exerciseStartRef.current;
      if (elapsed >= CLEAN_SLATE_EARLY_COMPLETE_MS) {
        logRitualCompletionOnce();
      }
    }

    try {
      await prerollSoundRef.current?.stopAsync();
    } catch {}
    try {
      await prerollSoundRef.current?.unloadAsync();
    } catch {}
    prerollSoundRef.current = null;

    try {
      await exerciseSoundRef.current?.stopAsync();
    } catch {}
    try {
      await exerciseSoundRef.current?.unloadAsync();
    } catch {}
    exerciseSoundRef.current = null;

    navigation.navigate('Home');
  };

  // -----------------------------
  // RENDER
  // -----------------------------
  return (
    <LinearGradient colors={['#0D0C1F', '#1F233A']} style={styles.container}>

      {/* Semi-opaque background layer */}
      <Image
        source={require('../assets/images/clean_slate_bg.webp')}
        style={styles.bgImage}
        resizeMode="cover"
      />

      {/* Vignette overlay */}
      <LinearGradient
        colors={['rgba(0,0,0,0.0)', 'rgba(0,0,0,0.35)', 'rgba(0,0,0,0.0)']}
        style={styles.vignetteOverlay}
        pointerEvents="none"
      />

      <View style={styles.content}>
        {/* Header */}
        <Animated.View style={[styles.header, { opacity: uiOpacity }]}>
          <Text style={styles.title}>Clean Slate</Text>
          <Text style={styles.subtitle}>
            Sweep the clutter. Clear the field. Begin again.
          </Text>
        </Animated.View>

        {/* Orb + Sweep */}
        <View style={styles.orbContainer}>
          {/* Glow */}
          <Animated.View
            style={[
              styles.orbGlow,
              {
                backgroundColor: accentColor,
                shadowColor: accentColor,
                transform: [{ translateX: sweepTranslate }],
              },
            ]}
          />

          {/* Sweep layer */}
          <Animated.View
            style={[
              styles.sweepLayer,
              {
                opacity: 0.25,
                transform: [{ translateX: sweepTranslate }],
                backgroundColor: accentColor,
              },
            ]}
          />

          {/* Orb core */}
          <Animated.View
            style={[
              styles.orbCore,
              { transform: [{ translateX: sweepTranslate }] },
            ]}
          >
            <Image
              source={require('../assets/splash_ios.png')}
              style={styles.innerOrb}
            />
          </Animated.View>
        </View>

        {/* Phase text */}
        <Animated.View style={[styles.phaseContainer, { opacity: uiOpacity }]}>
          <Text style={styles.phaseLabel}>
            {phase === 'gather'
              ? 'Gather…'
              : phase === 'sweep'
              ? 'Sweep…'
              : 'Empty.'}
          </Text>
        </Animated.View>

        {/* Footer */}
        <Animated.View style={[styles.footer, { opacity: uiOpacity }]}>
          <View style={styles.beginButtonSlot}>
            {showExerciseButton && (
              <Pressable onPress={handleBegin} style={styles.beginButton}>
                <Text style={styles.beginLabel}>Begin Clean Slate</Text>
              </Pressable>
            )}
          </View>

          <Pressable onPress={handleDone} style={styles.returnButton}>
            <Text style={styles.returnLabel}>Return centered</Text>
          </Pressable>
        </Animated.View>
      </View>

    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
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
    color: '#F4F1FF',
    marginBottom: 6,
  },
  subtitle: {
    fontFamily: 'Inter-ExtraLight',
    fontSize: 13,
    color: '#CFC7F0',
    textAlign: 'center',
  },
  orbContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  orbGlow: {
    position: 'absolute',
    width: 210,
    height: 210,
    borderRadius: 105,
    opacity: 0.35,
    shadowRadius: 36,
    shadowOpacity: 0.8,
  },
  sweepLayer: {
    position: 'absolute',
    width: 200,
    height: 200,
    borderRadius: 100,
    opacity: 0,
  },
  orbCore: {
    width: 170,
    height: 170,
    borderRadius: 85,
    backgroundColor: '#070716',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(181,169,255,0.5)',
  },
  innerOrb: {
    width: 175,
    height: 175,
    opacity: 0.65,
    transform: [{ translateX: 1 }],
  },
  phaseContainer: {
    alignItems: 'center',
    marginBottom: 20,
  },
  phaseLabel: {
    fontFamily: 'Inter-ExtraLight',
    fontSize: 16,
    color: '#F2EEFF',
  },
  footer: {
    alignItems: 'center',
  },
  beginButtonSlot: {
    height: 52, // reserve vertical space for the CTA, whether visible or not
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  beginButton: {
    minWidth: 200,
    paddingVertical: 10,
    paddingHorizontal: 24,
    borderRadius: 999,
    backgroundColor: '#CFC3E0',
    borderWidth: 1,
    borderColor: 'rgba(24,22,42,0.85)',
    marginBottom: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  beginLabel: {
    fontFamily: 'CalSans-SemiBold',
    fontSize: 15,
    color: '#171727',
  },
  returnButton: {
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  returnLabel: {
    fontFamily: 'CalSans-SemiBold',
    fontSize: 14,
    color: '#CFC3E0',
    textAlign: 'center',
  },
  bgImage: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    opacity: 0.25,
    width: '100%',
    height: '100%',
  },
  vignetteOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
});