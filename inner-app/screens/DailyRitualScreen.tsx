import React, { useState, useEffect, useRef } from 'react';
import { View, Text, Pressable, StyleSheet, Animated, Image, Dimensions, Easing, Platform } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import {
  markDailyMicroRitualComplete,
  getLastDailyEmotion,
} from '../core/DailyRitual';

const { height: SCREEN_HEIGHT, width: SCREEN_WIDTH } = Dimensions.get('window');
const isTablet = Math.min(SCREEN_HEIGHT, SCREEN_WIDTH) > 600;

const EMOTIONS = ['clear', 'clouded', 'heavy'] as const;
type Emotion = (typeof EMOTIONS)[number];

const EMOTION_THEME: Record<Emotion, {
  chipBg: string;
  chipBorder: string;
  chipLabel: string;
  orbTint: string;
}> = {
  clear: {
    chipBg: '#CFC3E0',
    chipBorder: '#CFC3E0',
    chipLabel: '#171727',
    orbTint: 'rgba(140, 190, 255, 0.45)',
  },
  clouded: {
    chipBg: '#B7B9F5',
    chipBorder: '#B7B9F5',
    chipLabel: '#151528',
    orbTint: 'rgba(150, 150, 255, 0.45)',
  },
  heavy: {
    chipBg: '#F2B494',
    chipBorder: '#F2B494',
    chipLabel: '#271418',
    orbTint: 'rgba(255, 140, 100, 0.45)',
  },
};

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export default function DailyRitualScreen({ navigation }: any) {
  const [selected, setSelected] = useState<Emotion | null>(null);
  const [lastEmotion, setLastEmotion] = useState<Emotion | null>(null);

  // Breathing orb scale
  const orbScale = useRef(new Animated.Value(0.96)).current;

  const orbFloat = useRef(new Animated.Value(0)).current;

  const ORB_SIZE = isTablet ? 300 : 200;
  const ORB_RADIUS = ORB_SIZE / 2;
  const ORB_SOURCE = require('../assets/splash_ios.png');


  const glintOpacity = orbScale.interpolate({
    inputRange: [0.96, 1.0, 1.04],
    outputRange: [0, 0.10, 0.20],
    extrapolate: 'clamp',
  });

  const rimOpacity = orbScale.interpolate({
    inputRange: [0.96, 1.0, 1.04],
    outputRange: [0, 0.12, 0.22],
    extrapolate: 'clamp',
  });

  const chipsOpacity = useRef(new Animated.Value(0)).current;
  const ctaOpacity = useRef(new Animated.Value(0)).current;

  const chipScale = useRef(new Animated.Value(1)).current;
  const ctaScale = useRef(new Animated.Value(1)).current;

  // Breathing animation for the orb
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(orbScale, {
          toValue: 1.04,
          duration: 2200,
          useNativeDriver: true,
        }),
        Animated.timing(orbScale, {
          toValue: 0.96,
          duration: 2200,
          useNativeDriver: true,
        }),
      ])
    );
    loop.start();
    return () => {
      loop.stop();
    };
  }, [orbScale]);

  useEffect(() => {
    const floatLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(orbFloat, {
          toValue: -6,
          duration: 4500,
          useNativeDriver: true,
        }),
        Animated.timing(orbFloat, {
          toValue: 6,
          duration: 4500,
          useNativeDriver: true,
        }),
        Animated.timing(orbFloat, {
          toValue: 0,
          duration: 4500,
          useNativeDriver: true,
        }),
      ]),
      { resetBeforeIteration: false }
    );
    floatLoop.start();
    return () => {
      floatLoop.stop();
    };
  }, [orbFloat]);

  useEffect(() => {
    Animated.sequence([
      Animated.timing(chipsOpacity, {
        toValue: 1,
        duration: 450,
        delay: 250,
        useNativeDriver: true,
      }),
      Animated.timing(ctaOpacity, {
        toValue: 1,
        duration: 450,
        delay: 120,
        useNativeDriver: true,
      }),
    ]).start();
  }, []);


  // Load yesterday's emotion (if any) for a more personal subtitle
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const prev = await getLastDailyEmotion();
        if (!cancelled && (prev === 'clear' || prev === 'clouded' || prev === 'heavy')) {
          setLastEmotion(prev as Emotion);
        }
      } catch {
        // ignore
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleEmotionSelect = (value: Emotion) => {
    setSelected(value);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    // Pulse the selected chip slightly and give the CTA a subtle activation pulse
    chipScale.setValue(0.9);
    ctaScale.setValue(0.96);

    Animated.parallel([
      Animated.spring(chipScale, {
        toValue: 1,
        friction: 5,
        tension: 120,
        useNativeDriver: true,
      }),
      Animated.spring(ctaScale, {
        toValue: 1,
        friction: 6,
        tension: 140,
        useNativeDriver: true,
      }),
    ]).start();
  };

  const handleContinue = async () => {
    // Mark today as complete and remember the selected emotion (if any)
    await markDailyMicroRitualComplete(selected || undefined);

    // Route into a matching ritual screen based on how their field feels
    if (selected === 'heavy') {
      // Heavy field → grounding reset
      navigation.replace('PointZero');
    } else if (selected === 'clouded') {
      // Clouded field → mental sweep
      navigation.replace('CleanSlate');
    } else if (selected === 'clear') {
      // Clear field → amplify with Inner Flame
      navigation.replace('InnerFlame');
    } else {
      // Safety fallback
      navigation.replace('Home');
    }
  };

  const currentTheme = selected ? EMOTION_THEME[selected] : null;

  return (
    <LinearGradient
      colors={['#0D0C1F', '#1F233A']}
      style={styles.container}
    >
      <Image
        source={require('../assets/images/arrive_bg.webp')}
        style={styles.bgImage}
        resizeMode="cover"
      />
      <LinearGradient
        colors={['transparent', 'rgba(0,0,0,0.25)']}
        style={styles.vignette}
        pointerEvents="none"
      />
      <View style={styles.content}>
        <View style={styles.topBlock}>
          <Text style={styles.title}>Arrive</Text>

          <Text style={styles.subtitle}>
            {lastEmotion
              ? lastEmotion === 'clear'
                ? 'Yesterday your field felt clear. How does it feel today?'
                : lastEmotion === 'clouded'
                ? 'Yesterday your field felt clouded. How does it feel today?'
                : 'Yesterday your field felt heavy. How does it feel today?'
              : 'Daily field observation before moving inward.'}
          </Text>
        </View>

        <View
          style={styles.orbWrapper}
          accessibilityRole="image"
          accessibilityLabel="Inner orb breathing to guide your arrival"
        >
          <Animated.View
            style={[
              styles.orbInner,
              { transform: [{ translateY: orbFloat }, { scale: orbScale }] },
            ]}
          >
            {/* Orb interior (static for stability and cross-device consistency) */}
            <Image
              pointerEvents="none"
              source={ORB_SOURCE}
              style={styles.orbImage}
              resizeMode="cover"
              onLoad={() => console.log('[DailyRitual] Orb image loaded', { platform: Platform.OS, using: 'png' })}
              onError={(e) => console.log('[DailyRitual] Orb image error', e?.nativeEvent)}
            />
            <Animated.View
              pointerEvents="none"
              style={[
                styles.orbGlint,
                { opacity: glintOpacity },
              ]}
            />
            <Animated.View
              pointerEvents="none"
              style={[
                styles.orbRimLight,
                { opacity: rimOpacity },
              ]}
            />
          </Animated.View>
        </View>

        <View style={styles.bottomCluster}>
          

          <Animated.View style={{opacity: chipsOpacity}}>
            <View style={styles.emotionGroup}>
              <Text style={styles.question}>How’s your field today?</Text>

              <View style={styles.emotionRow}>
                {EMOTIONS.map(value => {
                  const isSelected = selected === value;
                  const theme = EMOTION_THEME[value];

                  return (
                    <AnimatedPressable
                      key={value}
                      onPress={() => handleEmotionSelect(value)}
                      style={[
                        styles.emotionChip,
                        isSelected && {
                          backgroundColor: theme.chipBg,
                          borderColor: theme.chipBorder,
                          transform: [{ scale: chipScale }],
                        },
                      ]}
                      accessibilityRole="button"
                      accessibilityLabel={value}
                    >
                      <Text
                        style={[
                          styles.emotionLabel,
                          isSelected && { color: theme.chipLabel },
                        ]}
                      >
                        {value === 'clear'
                          ? 'Clear'
                          : value === 'clouded'
                          ? 'Clouded'
                          : 'Heavy'}
                      </Text>
                    </AnimatedPressable>
                  );
                })}
              </View>

              <Text style={styles.helper}>
              This quick check-in helps Inner tune today’s ritual to how your field actually feels. We only ask once per day.
            </Text>
            </View>
          </Animated.View>

          <Animated.View style={{ opacity: ctaOpacity, transform: [{ scale: ctaScale }] }}>
            <Pressable
              onPress={handleContinue}
              style={[
                styles.continueButton,
                selected && {
                  backgroundColor: currentTheme?.chipBg,
                  borderColor: currentTheme?.chipBorder,
                },
              ]}
              accessibilityRole="button"
              accessibilityLabel="Continue into Inner"
              accessibilityHint="Completes your quick check-in and routes you into a matching ritual"
            >
              <Text style={[
                styles.continueLabel,
                selected && { color: currentTheme?.chipLabel },
              ]}>
                {selected ? 'Continue' : 'Skip for now'}
              </Text>
            </Pressable>
          </Animated.View>
        </View>
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
    paddingTop: 72,
    paddingBottom: 32,
    justifyContent: 'center',
  },
  topBlock: {
    marginTop: 32,
    marginBottom: 24,
  },
  title: {
    fontFamily: 'CalSans-SemiBold',
    fontSize: 24,
    color: '#F4F1FF',
    textAlign: 'center',
    marginBottom: 4,
  },
  subtitle: {
    fontFamily: 'Inter-ExtraLight',
    fontSize: 16,
    color: '#CFC7F0',
    textAlign: 'center',
    maxWidth: 260,
    alignSelf: 'center',
    marginTop: 2,
    marginBottom: 20,
  },
  helper: {
    fontFamily: 'Inter-ExtraLight',
    fontSize: 13,
    color: '#A8A0CF',
    textAlign: 'center',
    maxWidth: 260,
    alignSelf: 'center',
    marginTop: 32,
    marginBottom: 6,
  },
  orbWrapper: {
    marginTop: 80,
    marginBottom: 12,
    alignSelf: 'center',
    alignItems: 'center',
    justifyContent: 'center',
    width: isTablet ? 300 : 200,
    height: isTablet ? 300 : 200,
  },
  orbInner: {
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
    width: isTablet ? 300 : 200,
    height: isTablet ? 300 : 200,
    borderRadius: isTablet ? 150 : 100,
    overflow: 'hidden',
  },
  orbImage: {
    width: '100%',
    height: '100%',
    opacity: 0.9,
    transform: [{ scale: 1.15 }],
  },
  orbGlint: {
    position: 'absolute',
    top: isTablet ? 48 : 32,
    left: isTablet ? 150 : 110,
    width: isTablet ? 60 : 40,
    height: isTablet ? 60 : 40,
    borderRadius: isTablet ? 120 : 80,
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
    opacity: 0,
    transform: [{ rotate: '-18deg' }],
  },
  orbRimLight: {
    position: 'absolute',
    bottom: isTablet ? 18 : 10,
    left: isTablet ? 120 : 85,
    width: isTablet ? 80 : 50,
    height: isTablet ? 16 : 10,
    borderRadius: isTablet ? 80 : 60,
    backgroundColor: 'rgba(170, 195, 255, 0.45)',
    opacity: 0,
    transform: [
      { translateX: isTablet ? -18 : -12 },
      { translateY: isTablet ? 10 : 8 },
      { scaleX: 1.2 },
    ],
  },
  emotionGroup: {
    alignItems: 'center',
    marginBottom: 30,
  },
  bottomCluster: {
    marginTop: 'auto',
  },
  question: {
    fontFamily: 'CalSans-SemiBold',
    fontSize: 18,
    color: '#EFE8FF',
    marginBottom: 16,
  },
  emotionRow: {
    flexDirection: 'row',
    gap: 8,
  },
  emotionChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(207,195,224,0.5)',
    backgroundColor: 'rgba(10,10,25,0.6)',
  },
  emotionChipSelected: {
    backgroundColor: '#CFC3E0',
    borderColor: '#CFC3E0',
  },
  emotionLabel: {
    fontFamily: 'CalSans-SemiBold',
    fontSize: 14,
    color: '#CFC3E0',
  },
  emotionLabelSelected: {
    color: '#171727',
  },
  continueButton: {
    alignSelf: 'center',
    minWidth: 200,
    paddingVertical: 10,
    paddingHorizontal: 24,
    borderRadius: 999,
    backgroundColor: '#CFC3E0',
    borderWidth: 1,
    borderColor: 'rgba(24,22,42,0.85)',
  },
  continueLabel: {
    fontFamily: 'CalSans-SemiBold',
    fontSize: 18,
    color: '#171727',
    textAlign: 'center',
  },
  vignette: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 220,
  },
  bgImage: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    opacity: 0.68,
  },
});