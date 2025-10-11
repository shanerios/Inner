import React, { useEffect, useRef } from 'react';
import { Animated, Pressable, View, StyleSheet, Dimensions } from 'react-native';
import { BlurView } from 'expo-blur';
import WordmarkSvg from '../assets/wordmark-glow.svg';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation } from '@react-navigation/native';
import * as Haptics from 'expo-haptics';
import LottieView from 'lottie-react-native';
import { StatusBar } from 'expo-status-bar';
import { Audio } from 'expo-av';

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

  useEffect(() => {
    // Reset animated values on mount (Fast Refresh can preserve values at 1)
    logoOpacity.setValue(0);
    titleOpacity.setValue(0);
    subtitleOpacity.setValue(0);
    orbScale.setValue(1);
    overlayOpacity.setValue(0);
    Animated.sequence([
      Animated.parallel([
        Animated.timing(logoOpacity, {
          toValue: 1,
          duration: 2400,
          delay: 2000, // fade in after 2 seconds
          useNativeDriver: true,
        }),
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

  const handlePress = () => {
    if (navigating.current) return;
    navigating.current = true;
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

  return (
    <Pressable onPress={handlePress} style={{ flex: 1, backgroundColor: '#0d0d1a' }}>
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
          {/* Orb */}
          <Animated.Image
            source={require('../assets/orb.png')}
            style={{
              width: 180,
              height: 180,
              opacity: logoOpacity,
              transform: [{ scale: orbScale }],
              marginBottom: -50,
            }}
            resizeMode="cover"
            accessibilityLabel="Inner orb"
          />
          {/* Wordmark (SVG) */}
          <Animated.View style={{ marginTop: 0, alignItems: 'center', opacity: titleOpacity }}>
            <View style={{ width: 650, height: 160 }}>
              <WordmarkSvg width="100%" height="100%" preserveAspectRatio="xMidYMid meet" />
            </View>
          </Animated.View>
          <Animated.Text
            style={{
              fontSize: 16,
              color: 'white',
              fontFamily: 'CalSans',
              textAlign: 'center',
              opacity: titleOpacity,
              marginTop: 24,
            }}
            accessibilityLabel="Rediscover the inner you"
            accessible={true}
          >
            Awaken the inner you.
          </Animated.Text>
          <Animated.Text
            style={{
              fontSize: 12,
              color: '#ccc',
              fontFamily: 'CalSans',
              textAlign: 'center',
              marginTop: 16,
              opacity: subtitleOpacity,
            }}
            accessibilityLabel="Touch the orb to continue."
            accessible={true}
          >
            Touch the orb to begin.
          </Animated.Text>
        </View>
      </View>
      {/* Dim/Blur Overlay during transition */}
      <Animated.View
        pointerEvents="none"
        style={[StyleSheet.absoluteFill, { opacity: overlayOpacity }]}>
        <BlurView intensity={75} tint="dark" style={StyleSheet.absoluteFill} />
        <View style={[StyleSheet.absoluteFill, { backgroundColor: '#000', opacity: 0.9 }]} />
      </Animated.View>
    </Pressable>
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
