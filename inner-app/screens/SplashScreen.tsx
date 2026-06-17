import React, { useEffect, useRef, useState } from 'react';
import { Animated, Pressable, View, StyleSheet, Image, Platform, Text, Dimensions } from 'react-native';
import { BlurView } from 'expo-blur';
import WordmarkSvg from '../assets/wordmark-glow.svg';
import { Typography, _Body } from '../core/typography';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useNavigation } from '@react-navigation/native';
import * as Haptics from 'expo-haptics';
import { StatusBar } from 'expo-status-bar';
import { Audio } from 'expo-av';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';
import { usePostHog } from 'posthog-react-native';

const Body = _Body ?? ({
  regular: { ...Typography.body },
  subtle:  { ...Typography.caption },
} as const);

const SPLASH_TIMESTAMP_KEY = 'inner.splash.lastOpenTimestamp';
const USER_ID_KEY = 'inner.user.id';
const TWO_HOURS_MS = 2 * 60 * 60 * 1000;

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');
// Scale needed to cover the full screen from the orb's center position.
// Uses screen diagonal so it works on any device size.
const ORB_SIZE = Math.round(SCREEN_W * 0.38); // ~38% of screen width, scales across all devices
const ORB_EFFECTIVE_RADIUS = (ORB_SIZE / 2) * 1.15;
const ENGULF_SCALE = Math.ceil(
  Math.sqrt(SCREEN_W ** 2 + SCREEN_H ** 2) / ORB_EFFECTIVE_RADIUS
) + 1;

console.log('[Engulf] ENGULF_SCALE:', ENGULF_SCALE, 'ORB_EFFECTIVE_RADIUS:', ORB_EFFECTIVE_RADIUS);

export default function SplashScreen() {
  const navigation = useNavigation();
  const posthog = usePostHog();
  const titleOpacity = useRef(new Animated.Value(0)).current;
  const subtitleOpacity = useRef(new Animated.Value(0)).current;
  const logoOpacity = useRef(new Animated.Value(0)).current;
  const orbOpacity = useRef(new Animated.Value(0)).current;
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

  // Video state
  const [showVideo, setShowVideo] = useState(false);
  // After video ends/skip, show the static final frame PNG behind the orb UI
  const [showFinalFrame, setShowFinalFrame] = useState(false);
  const [showSkip, setShowSkip] = useState(false);
  const [uiReady, setUiReady] = useState(false);
  const skipTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const ONBOARDING_KEYS = [
    'inner.hasCompletedOnboarding',
    'inner.hasCompletedOnboarding.v1',
    'inner.onboarding.complete',
    'inner.onboarding.complete.v1',
    'hasCompletedOnboarding',
  ] as const;

  const RETURN_HOME_USED_KEY = 'inner.splash.returnHome.used.v1';

  const [orbSource, setOrbSource] = useState(
    Platform.OS === 'android'
      ? require('../assets/splash.webp')
      : require('../assets/splash_ios.png')
  );

  const resolvedOrb = Image.resolveAssetSource(orbSource);

  const videoPlayer = useVideoPlayer(require('../assets/images/splash-intro.mp4'), player => {
    player.loop = false;
    player.muted = false;
  });

  const fadeInUI = () => {
    setUiReady(true);
    titleOpacity.setValue(0);
    subtitleOpacity.setValue(0);
    orbOpacity.setValue(0);
    Animated.sequence([
      Animated.parallel([
        Animated.timing(titleOpacity, {
          toValue: 1,
          duration: 1800,
          delay: 800,
          useNativeDriver: true,
        }),
        Animated.timing(logoOpacity, {
          toValue: 1,
          duration: 1800,
          delay: 800,
          useNativeDriver: true,
        }),
        Animated.timing(orbOpacity, {
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
  };

  const handleVideoEnd = () => {
    if (skipTimerRef.current) {
      clearTimeout(skipTimerRef.current);
      skipTimerRef.current = null;
    }
    setShowSkip(false);
    setShowVideo(false);
    setShowFinalFrame(true);
    fadeInUI();
  };

  const handleSkip = () => {
    videoPlayer.pause();
    handleVideoEnd();
  };

  useEffect(() => {
    logoOpacity.setValue(0);
    titleOpacity.setValue(0);
    subtitleOpacity.setValue(0);
    orbOpacity.setValue(0);
    orbScale.setValue(1);
    overlayOpacity.setValue(0);
    console.log('[SplashScreen] Orb resolved asset', resolvedOrb);

    (async () => {
      const now = Date.now();

      // User ID init
      try {
        let userId = await AsyncStorage.getItem(USER_ID_KEY);
        if (!userId) {
          userId = Crypto.randomUUID();
          await AsyncStorage.setItem(USER_ID_KEY, userId);
        }
        posthog?.identify(userId);
      } catch {}

      // Timestamp check
      try {
        const raw = await AsyncStorage.getItem(SPLASH_TIMESTAMP_KEY);
        await AsyncStorage.setItem(SPLASH_TIMESTAMP_KEY, String(now));
        const last = raw ? parseInt(raw, 10) : 0;
        const shouldPlayVideo = !raw || (now - last) > TWO_HOURS_MS;
        if (shouldPlayVideo) {
          setShowFinalFrame(true);
          setShowVideo(true);
          skipTimerRef.current = setTimeout(() => setShowSkip(true), 2000);
        } else {
          // Under 2h: skip video entirely, show final frame as background
          setShowFinalFrame(true);
          fadeInUI();
        }
      } catch {
        setShowFinalFrame(true);
        fadeInUI();
      }
    })();

    return () => {
      if (returnHomeHideTimer.current) {
        clearTimeout(returnHomeHideTimer.current);
        returnHomeHideTimer.current = null;
      }
      if (skipTimerRef.current) {
        clearTimeout(skipTimerRef.current);
        skipTimerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!showVideo) return;
    videoPlayer.play();

    const endSub = videoPlayer.addListener('playToEnd', () => {
      handleVideoEnd();
    });

    return () => {
      endSub.remove();
    };
  }, [showVideo]);

  useEffect(() => {
    let isMounted = true;
    const loadSound = async () => {
      try {
        const { sound } = await Audio.Sound.createAsync(
          require('../assets/audio/Whoosh.aac')
        );
        if (isMounted) {
          whooshSound.current = sound;
          await sound.setVolumeAsync(0.9);
        }
      } catch (e) {
        // noop
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
    if (!uiReady) return;

    const t = setTimeout(() => {
      revealReturnHome();
    }, 2600);

    return () => clearTimeout(t);
  }, [canReturnHome, hasUsedReturnHome, uiReady]);

  const hideReturnHome = () => {
    if (!showReturnHome) return;

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
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    if (whooshSound.current) {
      whooshSound.current.replayAsync();
    }
    Animated.parallel([
      Animated.timing(orbScale, { 
        toValue: ENGULF_SCALE, 
        duration: 1400, 
        useNativeDriver: true 
      }),
      Animated.timing(subtitleOpacity, { 
        toValue: 0, 
        duration: 300, 
        useNativeDriver: true 
      }),
      Animated.timing(titleOpacity, { 
        toValue: 0, 
        duration: 300, 
        useNativeDriver: true 
      }),
      Animated.timing(overlayOpacity, { 
        toValue: 1, 
        duration: 450, 
        delay: 1250,
        useNativeDriver: true 
      }),
      // No fade-out for orbOpacity here; orb remains visible while scaling.
    ]).start(() => {
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

    AsyncStorage.setItem(RETURN_HOME_USED_KEY, 'true').catch(() => {});

    // @ts-ignore
    navigation.reset({
      index: 0,
      routes: [{ name: 'Home' }],
    });

    setTimeout(() => {
      navigating.current = false;
    }, 400);
  };

  return (
    <View style={{ flex: 1, backgroundColor: '#0d0d1a' }}>
      <StatusBar style="light" backgroundColor="#0d0d1a" translucent={false} />

      {/* Static final frame — shown after video ends and on 2h throttle path */}
      {showFinalFrame && (
        <View style={StyleSheet.absoluteFill} pointerEvents="none">
          <Image
            source={require('../assets/images/final-frame.png')}
            style={{ width: '100%', height: '100%' }}
            resizeMode="cover"
          />
        </View>
      )}

      {/* Intro video — unmounts when done so final-frame PNG takes over */}
      {showVideo && (
        <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
          <VideoView
            player={videoPlayer}
            contentFit="cover"
            style={StyleSheet.absoluteFill}
            nativeControls={false}
            allowsFullscreen={false}
            allowsPictureInPicture={false}
          />
        </View>
      )}

      {/* Skip button */}
      {showVideo && showSkip && (
        <Pressable
          onPress={handleSkip}
          hitSlop={16}
          accessibilityRole="button"
          accessibilityLabel="Skip intro"
          style={styles.skipButton}
        >
          <Text style={styles.skipText}>skip</Text>
        </Pressable>
      )}

      {/* Orb — absolutely positioned so scale origin is fixed on screen (no drift) */}
      <Pressable
        onPress={handlePress}
        onLongPress={revealReturnHome}
        delayLongPress={850}
        hitSlop={20}
        accessibilityRole="button"
        accessibilityLabel={canReturnHome ? 'Inner orb. Tap to begin. Long press to return home.' : 'Inner orb. Tap to begin.'}
        style={[
          styles.orbPressable,
          { pointerEvents: showVideo ? 'none' : 'auto' } as any,
        ]}
      >
        <Animated.View
          style={{
            width: ORB_SIZE,
            height: ORB_SIZE,
            opacity: orbOpacity,
            // Only scale here — no translate — so the expand originates from this fixed screen position
            transform: [{ scale: Animated.multiply(orbScale, 1.15) }],
          }}
        >
          <Image
            pointerEvents="none"
            source={orbSource}
            style={{ width: '100%', height: '100%', borderRadius: ORB_SIZE / 2, opacity: 1 }}
            resizeMode="contain"
            onError={(e) => {
              console.warn('[SplashScreen] Orb image failed to load', e?.nativeEvent);
              setOrbSource(require('../assets/splash_ios.png'));
            }}
            onLoad={() => console.log('[SplashScreen] Orb image loaded')}
          />
        </Animated.View>
      </Pressable>

      {/* Wordmark — absolutely positioned, independent of everything */}
      <Animated.View style={[styles.wordmarkWrapper, { opacity: titleOpacity }]}>
        <View style={{ width: 650, height: 160 }}>
          <WordmarkSvg width="100%" height="100%" preserveAspectRatio="xMidYMid meet" />
        </View>
      </Animated.View>

      {/* Tagline — absolutely positioned, independent of wordmark and orb */}
      <Animated.View style={[styles.taglineWrapper, { opacity: titleOpacity }]}>
        <Animated.Text
          style={{
            ...Typography.body,
            color: 'white',
            textAlign: 'center',
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
      </Animated.View>

      {/* Return Home — absolutely positioned so it never shifts the orb */}
      {showReturnHome && (
        <Pressable
          onPress={hideReturnHome}
          hitSlop={10}
          style={styles.returnHomeWrapper}
        >
          <Animated.View
            style={{
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
  orbPressable: {
    position: 'absolute',
    left: SCREEN_W / 2 - ORB_SIZE / 2 + 5,
    top: SCREEN_H * 0.37 - ORB_SIZE / 2,
  },
  wordmarkWrapper: {
    position: 'absolute',
    bottom: SCREEN_H * 0.44,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  taglineWrapper: {
    position: 'absolute',
    bottom: SCREEN_H * 0.22,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  returnHomeWrapper: {
    position: 'absolute',
    bottom: SCREEN_H * 0.16,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  skipButton: {
    position: 'absolute',
    bottom: 48,
    right: 28,
  },
  skipText: {
    fontFamily: 'Inter-ExtraLight',
    fontSize: 13,
    color: 'rgba(255,255,255,0.45)',
    letterSpacing: 0.5,
  },
});
