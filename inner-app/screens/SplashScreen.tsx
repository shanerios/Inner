import React, { useEffect, useRef, useState } from 'react';
import { Animated, Pressable, View, StyleSheet, Dimensions, Image, Platform } from 'react-native';
import { BlurView } from 'expo-blur';
import WordmarkSvg from '../assets/wordmark-glow.svg';
import { Typography, _Body } from '../core/typography';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation } from '@react-navigation/native';
import * as Haptics from 'expo-haptics';
import LottieView from 'lottie-react-native';
import { StatusBar } from 'expo-status-bar';
import { Audio } from 'expo-av';
import AsyncStorage from '@react-native-async-storage/async-storage';

const Body = _Body ?? ({
  regular: { ...Typography.body },
  subtle:  { ...Typography.caption },
} as const);

export default function SplashScreen() {
  const navigation = useNavigation();
  const titleOpacity = useRef(new Animated.Value(0)).current;
  const subtitleOpacity = useRef(new Animated.Value(0)).current;
  const logoOpacity = useRef(new Animated.Value(0)).current;
  const lottieRef = useRef(null);
  // Orb animation value and guard
  const orbScale = useRef(new Animated.Value(1)).current;
  const navigating = useRef(false);
  const overlayOpacity = useRef(new Animated.Value(0)).current;
  const whooshSound = useRef<Audio.Sound | null>(null);

  const [canReturnHome, setCanReturnHome] = useState(false);
  const [showReturnHome, setShowReturnHome] = useState(false);
  const [hasUsedReturnHome, setHasUsedReturnHome] = useState(false);
  const returnHomeOpacity = useRef(new Animated.Value(0)).current;
  const returnHomeTranslateY = useRef(new Animated.Value(6)).current;
  const returnHomeHideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const ONBOARDING_KEYS = [
    // try a few plausible keys; first match wins
    'inner.hasCompletedOnboarding',
    'inner.hasCompletedOnboarding.v1',
    'inner.onboarding.complete',
    'inner.onboarding.complete.v1',
    'hasCompletedOnboarding',
  ] as const;

  const RETURN_HOME_USED_KEY = 'inner.splash.returnHome.used.v1';
  const ORB_SIZE = 180;

  // Prefer WebP on Android for size/perf, but keep a PNG fallback for devices/builds
  // where WebP decoding or asset packaging can be flaky.
  const [orbSource, setOrbSource] = useState(
    Platform.OS === 'android'
      ? require('../assets/splash.webp')
      : require('../assets/splash_ios.png')
  );

  const resolvedOrb = Image.resolveAssetSource(orbSource);

  useEffect(() => {
    // Reset animated values on mount (Fast Refresh can preserve values at 1)
    logoOpacity.setValue(0);
    titleOpacity.setValue(0);
    subtitleOpacity.setValue(0);
    orbScale.setValue(1);
    overlayOpacity.setValue(0);
    console.log('[SplashScreen] Orb resolved asset', resolvedOrb);
    Animated.sequence([
      Animated.parallel([
        Animated.timing(titleOpacity, {
          toValue: 1,
          duration: 1800,
          delay: 800,
          useNativeDriver: true,
        }),
      ]),
      Animated.timing(subtitleOpacity, {
        toValue: 1,
        duration: 3000,
        delay: 400,
        useNativeDriver: true,
      }),
    ]).start();
    return () => {
      if (returnHomeHideTimer.current) {
        clearTimeout(returnHomeHideTimer.current);
        returnHomeHideTimer.current = null;
      }
    };
  }, []);

  useEffect(() => {
    let isMounted = true;
    const loadSound = async () => {
      try {
        const { sound } = await Audio.Sound.createAsync(
          require('../assets/audio/Whoosh.aac')
        );
        if (isMounted) {
          whooshSound.current = sound;
          // Optional default volume (0..1)
          await sound.setVolumeAsync(0.9);
        }
      } catch (e) {
        // noop: fail silently if asset missing
      }
    };
    loadSound();
    return () => {
      isMounted = false;
      whooshSound.current?.unloadAsync();
    };
  }, []);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const used = await AsyncStorage.getItem(RETURN_HOME_USED_KEY);
        if (mounted) setHasUsedReturnHome(used === 'true' || used === '1');
        for (const k of ONBOARDING_KEYS) {
          const v = await AsyncStorage.getItem(k);
          if (v === 'true' || v === '1') {
            if (mounted) setCanReturnHome(true);
            return;
          }
        }
      } catch {}
    })();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (!canReturnHome) return;
    if (!hasUsedReturnHome) return;

    // Reveal after the splash has "arrived" (post title fade-in)
    const t = setTimeout(() => {
      revealReturnHome();
    }, 2600);

    return () => clearTimeout(t);
  }, [canReturnHome, hasUsedReturnHome]);

  const hideReturnHome = () => {
    if (!showReturnHome) return;

    // fade out + drift down, then unmount
    Animated.parallel([
      Animated.timing(returnHomeOpacity, {
        toValue: 0,
        duration: 450,
        useNativeDriver: true,
      }),
      Animated.timing(returnHomeTranslateY, {
        toValue: 6,
        duration: 450,
        useNativeDriver: true,
      }),
    ]).start(() => {
      setShowReturnHome(false);
    });

    if (returnHomeHideTimer.current) {
      clearTimeout(returnHomeHideTimer.current);
      returnHomeHideTimer.current = null;
    }
  };

  const revealReturnHome = () => {
    if (!canReturnHome) return;
    if (showReturnHome) return;

    setShowReturnHome(true);
    returnHomeOpacity.setValue(0);
    returnHomeTranslateY.setValue(6);

    // subtle haptic to confirm the hidden door
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    Animated.parallel([
      Animated.timing(returnHomeOpacity, {
        toValue: 1,
        duration: 500,
        useNativeDriver: true,
      }),
      Animated.timing(returnHomeTranslateY, {
        toValue: 0,
        duration: 500,
        useNativeDriver: true,
      }),
    ]).start();

    // Auto-hide after a few seconds so it feels like a passing door, not a menu.
    if (returnHomeHideTimer.current) {
      clearTimeout(returnHomeHideTimer.current);
      returnHomeHideTimer.current = null;
    }
    returnHomeHideTimer.current = setTimeout(() => {
      hideReturnHome();
    }, 5000);
  };

  const handlePress = () => {
    if (navigating.current) return;
    navigating.current = true;
    if (showReturnHome) hideReturnHome();
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (whooshSound.current) {
      whooshSound.current.replayAsync();
    }
    // Fade subtitle and overlay while orb grows
    Animated.parallel([
      Animated.timing(orbScale, { toValue: 8, duration: 700, useNativeDriver: true }),
      Animated.timing(subtitleOpacity, { toValue: 0, duration: 400, useNativeDriver: true }),
      Animated.timing(titleOpacity, { toValue: 0, duration: 400, useNativeDriver: true }),
      Animated.timing(overlayOpacity, { toValue: 1, duration: 700, useNativeDriver: true }),
    ]).start(() => {
      // Navigate after the orb "engulfs"
      // @ts-ignore
      navigation.navigate('Intro');
      navigating.current = false;
    });
  };

  const handleReturnHome = () => {
    if (navigating.current) return;
    navigating.current = true;

    if (returnHomeHideTimer.current) {
      clearTimeout(returnHomeHideTimer.current);
      returnHomeHideTimer.current = null;
    }

    // Persist that the user used the hidden door (for future optional auto-skip behavior)
    AsyncStorage.setItem(RETURN_HOME_USED_KEY, 'true').catch(() => {});

    // @ts-ignore
    navigation.reset({
      index: 0,
      routes: [{ name: 'Home' }],
    });

    // allow future taps if user comes back
    setTimeout(() => {
      navigating.current = false;
    }, 400);
  };

  return (
    <View style={{ flex: 1, backgroundColor: '#0d0d1a' }}>
      <StatusBar style="light" backgroundColor="#0d0d1a" translucent={false} />
      <LinearGradient
        colors={['#0D0C1F', '#1F233A']}
        style={StyleSheet.absoluteFill}
      />
      
      {/* Lottie Particle Background */}
      <View pointerEvents="none" style={[StyleSheet.absoluteFill, { transform: [{ scale: 1.15 }] }]}>
        <LottieView
          source={require('../assets/animations/dust-drift.json')}
          autoPlay
          loop
          speed={0.6}
          style={{ width: '100%', height: '100%' }}
        />
      </View>

      <View style={styles.content}>
        <View style={styles.stack}>
          {/* Orb (tap to begin, long-press to reveal Return Home for returning users) */}
          <Pressable
            onPress={handlePress}
            onLongPress={revealReturnHome}
            delayLongPress={850}
            hitSlop={20}
            accessibilityRole="button"
            accessibilityLabel={canReturnHome ? 'Inner orb. Tap to begin. Long press to return home.' : 'Inner orb. Tap to begin.'}
          >
            <Animated.View
              style={{
                width: ORB_SIZE,
                height: ORB_SIZE,
                opacity: titleOpacity,
                transform: [{ scale: Animated.multiply(orbScale, 1.15) }],
                marginBottom: -50,
                borderRadius: ORB_SIZE / 2,
                overflow: 'hidden',
              }}
            >
              {/* Orb interior (static for stability across devices) */}
              <Image
                pointerEvents="none"
                source={orbSource}
                style={{
                  width: '100%',
                  height: '100%',
                  opacity: 1,
                }}
                resizeMode="contain"
                onError={(e) => {
                  console.warn('[SplashScreen] Orb image failed to load', e?.nativeEvent);
                  // Fallback to PNG if WebP fails (common on some Android release builds)
                  setOrbSource(require('../assets/splash_ios.png'));
                }}
                onLoad={() => console.log('[SplashScreen] Orb image loaded')}
              />
            </Animated.View>
          </Pressable>
          {/* Wordmark (SVG) */}
          <Animated.View style={{ marginTop: 0, alignItems: 'center', opacity: titleOpacity }}>
            <View style={{ width: 650, height: 160 }}>
              <WordmarkSvg width="100%" height="100%" preserveAspectRatio="xMidYMid meet" />
            </View>
          </Animated.View>
          <Animated.Text
            style={{
              ...Typography.body,
              color: 'white',
              textAlign: 'center',
              opacity: titleOpacity,
              marginTop: 24,
            }}
            accessibilityLabel="Awaken the inner you"
            accessible={true}
          >
            Awaken the inner you.
          </Animated.Text>
          <Animated.Text
            style={{
              fontFamily: 'Inter-ExtraLight',
              fontSize: 14,
              color: '#ccc',
              textAlign: 'center',
              marginTop: 4,
              opacity: subtitleOpacity,
            }}
            accessibilityLabel="Touch the orb to continue."
            accessible={true}
          >
            Touch the orb to begin.
          </Animated.Text>
          {showReturnHome && (
            <Pressable onPress={hideReturnHome} hitSlop={10}>
              <Animated.View
                style={{
                  marginTop: 18,
                  opacity: returnHomeOpacity,
                  transform: [{ translateY: returnHomeTranslateY }],
                }}
              >
                <Pressable
                  onPress={handleReturnHome}
                  style={({ pressed }) => [
                    {
                      paddingVertical: 10,
                      paddingHorizontal: 16,
                      borderRadius: 999,
                      borderWidth: 1,
                      borderColor: 'rgba(207,195,224,0.38)',
                      backgroundColor: pressed ? 'rgba(15, 12, 36, 0.85)' : 'rgba(15, 12, 36, 0.65)',
                    },
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel="Return Home"
                >
                  <Animated.Text
                    style={{
                      fontFamily: 'CalSans-SemiBold',
                      fontSize: 13,
                      letterSpacing: 0.35,
                      color: 'rgba(244,241,255,0.86)',
                      textAlign: 'center',
                    }}
                  >
                    Return Home
                  </Animated.Text>
                </Pressable>
              </Animated.View>
            </Pressable>
          )}
        </View>
      </View>
      {/* Dim/Blur Overlay during transition */}
      <Animated.View
        pointerEvents="none"
        style={[StyleSheet.absoluteFill, { opacity: overlayOpacity }]}>
        <BlurView intensity={75} tint="dark" style={StyleSheet.absoluteFill} />
        <View style={[StyleSheet.absoluteFill, { backgroundColor: '#000', opacity: 0.9 }]} />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  stack: {
    alignItems: 'center',
  },
});
