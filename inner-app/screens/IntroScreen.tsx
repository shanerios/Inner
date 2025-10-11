import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ImageBackground,
  TouchableOpacity,
  Animated,
  Dimensions,
  Switch,
  AccessibilityInfo,
  Easing,
} from 'react-native';
import { Audio } from 'expo-av';
import * as Haptics from 'expo-haptics';
import { StatusBar } from 'expo-status-bar';
import { useNavigation } from '@react-navigation/native';

import Wordmark from '../assets/images/wordmark.svg';


const { width } = Dimensions.get('window');
const WORDMARK_RATIO = 528 / 96.8; // original width:height ratio
const WORDMARK_TARGET = 370; // ~30% smaller than 528
const wordmarkWidth = Math.round(Math.min(WORDMARK_TARGET, width * 0.78));
const wordmarkHeight = Math.round(wordmarkWidth / WORDMARK_RATIO);

const captions = [
  { time: 2, text: 'A sacred space' },
  { time: 3.7, text: 'to remember' },
  { time: 5.2, text: 'who you are.' },
  { time: 7, text: 'To return to center.' },
  { time: 10.1, text: 'To lift the veil' },
  { time: 11.7, text: 'on the deeper self.' },
  { time: 14, text: 'through gentle ritual,' },
  { time: 16.5, text: 'living sound,' },
  { time: 18.3, text: 'and stillness.' },
  { time: 20.5, text: 'When you are ready' },
  { time: 22.5, text: 'Enter.' },
];

export default function IntroScreen() {
  const navigation = useNavigation();
  const soundRef = useRef<Audio.Sound | null>(null);
  const [currentCaption, setCurrentCaption] = useState('');
  const [showCaptions, setShowCaptions] = useState(true);
  const [isMuted, setIsMuted] = useState(false);
  const captionAnim = useRef(new Animated.Value(0)).current;
  const wordmarkFadeAnim = useRef(new Animated.Value(0)).current;
  const ctaFadeAnim = useRef(new Animated.Value(0)).current;
  const ctaScale = useRef(new Animated.Value(1)).current;
  const [ctaPressed, setCtaPressed] = useState(false);
  const lastCaptionRef = useRef<string | null>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const emberHapticTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const emberHapticIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const triggerEmberHaptic = async () => {
    try {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } catch {}
  };

  // Ember portal overlay animation values
  const emberOpacity = useRef(new Animated.Value(0)).current;
  const emberScale   = useRef(new Animated.Value(1)).current;

  // Button background color follows the portal's ember call
  const buttonBg = emberOpacity.interpolate({
    inputRange: [0, 1],
    outputRange: ['#CFC3E0', '#FFB86C'], // base → ember
  });


  const stopAudioAndNavigate = async () => {
    if (soundRef.current) {
      await soundRef.current.stopAsync();
      await soundRef.current.unloadAsync();
      soundRef.current = null;
    }
    navigation.navigate('Intention');
  };

  const playVoice = async () => {
    const { sound } = await Audio.Sound.createAsync(
      require('../assets/audio/Inner_Intro_Brand-64k.m4a')
    );
    soundRef.current = sound;
    // Set intro voiceover volume to 60% before playback
    await sound.setVolumeAsync(isMuted ? 0 : 0.6);
    await sound.playAsync();

    const start = Date.now();
    intervalRef.current = setInterval(() => {
      const elapsed = (Date.now() - start) / 1000;
      let activeCaption: { time: number; text: string } | null = null;
      for (let i = captions.length - 1; i >= 0; i--) {
        if (elapsed >= captions[i].time) {
          activeCaption = captions[i];
          break;
        }
      }
      if (activeCaption && activeCaption.text !== lastCaptionRef.current) {
        lastCaptionRef.current = activeCaption.text;
        animateCaptionChange(activeCaption.text);
      }
    }, 400);
  };

  const animateCaptionChange = (newText: string) => {
    Animated.timing(captionAnim, {
      toValue: 0,
      duration: 300,
      useNativeDriver: true,
    }).start(() => {
      setCurrentCaption(newText);
      Animated.timing(captionAnim, {
        toValue: 1,
        duration: 500,
        useNativeDriver: true,
      }).start();
    });
  };

  useEffect(() => {
    // Fade in the wordmark slightly after arrival
    const wordmarkTimer = setTimeout(() => {
      Animated.timing(wordmarkFadeAnim, {
        toValue: 1,
        duration: 1800,
        useNativeDriver: true,
      }).start();
    }, 4800);

    const ctaTimer = setTimeout(() => {
      Animated.timing(ctaFadeAnim, {
        toValue: 1,
        duration: 1200,
        useNativeDriver: true,
      }).start();
    }, 5200); // ~400ms after wordmark, near voice start

    // "The Call" – ember flicker animation (22s cycle)
    const EMBER_TOTAL = 22000;
    const t70 = 15400; // ~70%
    const t74 = 880;   // +4%
    const t76 = 440;   // +2%
    const t82 = 1320;  // +6%
    const tRest = EMBER_TOTAL - (t70 + t74 + t76 + t82);

    const runEmber = () => {
      Animated.loop(
        Animated.sequence([
          Animated.delay(t70),
          // Bloom starts
          Animated.parallel([
            Animated.timing(emberOpacity, { toValue: 0.85, duration: t74, useNativeDriver: true, easing: Easing.inOut(Easing.ease) }),
            Animated.timing(emberScale,   { toValue: 1.012, duration: t74, useNativeDriver: true, easing: Easing.inOut(Easing.ease) }),
          ]),
          // Quick bright flash + slight outward pulse
          Animated.parallel([
            Animated.timing(emberOpacity, { toValue: 1.0, duration: t76, useNativeDriver: true, easing: Easing.inOut(Easing.ease) }),
            Animated.timing(emberScale,   { toValue: 1.02, duration: t76, useNativeDriver: true, easing: Easing.inOut(Easing.ease) }),
          ]),
          // Fade back to calm state
          Animated.parallel([
            Animated.timing(emberOpacity, { toValue: 0, duration: t82, useNativeDriver: true, easing: Easing.inOut(Easing.ease) }),
            Animated.timing(emberScale,   { toValue: 1.0, duration: t82, useNativeDriver: true, easing: Easing.inOut(Easing.ease) }),
          ]),
          Animated.delay(tRest),
        ])
      ).start();

      // Schedule haptic to hit exactly at the bright flash each cycle
      if (emberHapticTimeoutRef.current) clearTimeout(emberHapticTimeoutRef.current);
      if (emberHapticIntervalRef.current) clearInterval(emberHapticIntervalRef.current);

      emberHapticTimeoutRef.current = setTimeout(() => {
        triggerEmberHaptic();
        emberHapticIntervalRef.current = setInterval(triggerEmberHaptic, EMBER_TOTAL);
      }, t70 + t74);
    };

    // Start ember after brief arrival pause (so it feels natural)
    const emberTimer = setTimeout(runEmber, 2000);

    // Delay audio + captions by 5s so The Call can land first
    const voiceTimer = setTimeout(playVoice, 3500);

    return () => {
      clearTimeout(wordmarkTimer);
      clearTimeout(emberTimer);
      clearTimeout(voiceTimer);
      clearTimeout(ctaTimer);
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (emberHapticTimeoutRef.current) clearTimeout(emberHapticTimeoutRef.current);
      if (emberHapticIntervalRef.current) clearInterval(emberHapticIntervalRef.current);
      if (soundRef.current) {
        soundRef.current.unloadAsync();
        soundRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (soundRef.current) {
      soundRef.current.setVolumeAsync(isMuted ? 0 : 1);
    }
  }, [isMuted]);

  // New useEffect for continuous breathing animation on CTA button
  useEffect(() => {
    const breathingAnimation = Animated.loop(
      Animated.sequence([
        Animated.timing(ctaScale, {
          toValue: 1.05,
          duration: 2000,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(ctaScale, {
          toValue: 1.0,
          duration: 2000,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    );
    breathingAnimation.start();

    return () => {
      breathingAnimation.stop();
    };
  }, [ctaScale]);

  return (
    <View style={{ flex: 1, backgroundColor: '#0d0d1a' }}>
      <ImageBackground
        source={require('../assets/images/intro-deep-blue.png')}
        style={styles.container}
        imageStyle={styles.bgImage}
        fadeDuration={0}
      >
        <StatusBar style="light" backgroundColor="#0d0d1a" translucent={false} />
        {/* Ember overlay (The Call) fills full screen */}
        <View style={styles.overlayContainer} pointerEvents="none" collapsable={false}>
          <Animated.Image
            source={require('../assets/images/intro-sacred-ember.png')}
            style={[styles.overlayImage, { opacity: emberOpacity, transform: [{ scale: emberScale }] }]}
            resizeMode="cover"
            accessible={false}
          />
        </View>

        {/* Content wrapper holds padding/centering so overlay isn't cropped */}
        <View style={styles.content}>
          {/* Header group: keeps greeting + wordmark close */}
          <View style={[styles.headerGroup, { height: wordmarkHeight + 24 }]}>
            {/* Wordmark behind the text */}
            <Animated.View
              style={[styles.wordmarkWrap, { opacity: wordmarkFadeAnim }]}
              pointerEvents="none"
              accessible
              accessibilityRole="image"
              accessibilityLabel="Inner wordmark"
            >
              <Wordmark width={wordmarkWidth} height={wordmarkHeight} />
            </Animated.View>
          </View>

          <View style={styles.captionBox}>
            {showCaptions && (
              <Animated.Text style={[styles.caption, { opacity: captionAnim }]}>
                {currentCaption}
              </Animated.Text>
            )}
          </View>

          <Animated.View style={[styles.buttons, { opacity: ctaFadeAnim }]}>
            <View style={styles.primaryButtonWrap}>
              <Animated.View style={{ transform: [{ scale: ctaScale }], backgroundColor: buttonBg, borderRadius: 24, overflow: 'hidden' }}>
                <TouchableOpacity
                  onPress={async () => {
                    setCtaPressed(true);
                    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                    setCtaPressed(false);
                    stopAudioAndNavigate();
                  }}
                  style={[styles.primaryButton, { backgroundColor: 'transparent' }]}
                  accessibilityRole="button"
                  accessibilityLabel="Move inward. Begin your inner journey."
                >
                  <Text style={styles.primaryText}>Move Inward</Text>
                </TouchableOpacity>
              </Animated.View>
            </View>
            <TouchableOpacity
              onPress={async () => {
                await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                stopAudioAndNavigate();
              }}
              accessibilityRole="button"
              accessibilityLabel="Skip intro and continue to next screen."
            >
              <Text style={styles.skipText}>skip</Text>
            </TouchableOpacity>
          </Animated.View>
        </View>

        {/* Caption Toggle (Right) */}
        <View style={styles.accessibilityToggleRight}>
          <Switch
            value={showCaptions}
            onValueChange={(value) => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              setShowCaptions(value);
            }}
            thumbColor={showCaptions ? '#fff' : '#888'}
            trackColor={{ false: '#555', true: '#ccc' }}
            accessibilityRole="switch"
            accessibilityLabel="Captions toggle"
            accessibilityHint="Turn on or off the on-screen captions for this intro."
          />
          <Text style={styles.toggleLabel}>Captions</Text>
        </View>

        {/* Mute Toggle (Left) */}
        <View style={styles.accessibilityToggleLeft}>
          <Switch
            value={!isMuted}
            onValueChange={(value) => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              setIsMuted(!value);
            }}
            thumbColor={!isMuted ? '#fff' : '#888'}
            trackColor={{ false: '#555', true: '#ccc' }}
            accessibilityRole="switch"
            accessibilityLabel="Audio toggle"
            accessibilityHint="Mute or unmute the voice audio."
          />
          <Text style={styles.toggleLabel}>Audio</Text>
        </View>
      </ImageBackground>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0d0d1a',
  },
  bgImage: {
    resizeMode: 'cover',
  },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 60, // move header higher on screen
    paddingBottom: 60,
  },
  fill: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    width: '100%',
    height: '100%',
  },
  headerText: {
    fontSize: 24,
    color: 'white',
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: 2,
    zIndex: 1,
  },
  wordmarkText: {
    fontSize: 42,
    color: 'white',
    fontWeight: '700',
    textAlign: 'center',
    marginTop: 8,
    letterSpacing: 1,
  },
  captionBox: {
    justifyContent: 'center',
    alignItems: 'center',
    height: 120,
    width: width * 0.8,
  },
  caption: {
    fontSize: 20,
    color: 'white',
    textAlign: 'center',
    fontStyle: 'italic',
  },
  buttons: {
    alignItems: 'center',
  },
  primaryButton: {
    backgroundColor: '#CFC3E0',
    paddingVertical: 14,
    paddingHorizontal: 28,
    borderRadius: 24,
  },
  primaryButtonWrap: {
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  primaryButtonEmber: {
    backgroundColor: '#FFB86C',
  },
  primaryText: {
    color: '#1F233A',
    fontSize: 20,
    fontWeight: '600',
  },
  skipText: {
    color: 'white',
    fontSize: 16,
    marginTop: 10,
    opacity: 0.7,
  },
  accessibilityToggleRight: {
    position: 'absolute',
    bottom: 20,
    right: 20,
    alignItems: 'center',
  },
  accessibilityToggleLeft: {
    position: 'absolute',
    bottom: 20,
    left: 20,
    alignItems: 'center',
  },
  toggleLabel: {
    fontSize: 12,
    color: '#ccc',
    marginTop: 0,
  },
  overlayContainer: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  overlayImage: {
    width: '100%',
    height: '100%',
  },
  headerGroup: {
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    height: 80, // space for overlapped wordmark
    marginBottom: 24, // pushes content below (further from portal)
  },
  wordmarkWrap: {
    position: 'absolute',
    top: 0, // re-center wordmark now that text is gone
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 0,
  },
});