// screens/OnboardingFlow.tsx
import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Animated, Easing, TextInput, TouchableOpacity } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import { Audio } from 'expo-av';
import { LinearGradient } from 'expo-linear-gradient';
import LottieView from 'lottie-react-native';


const INTENTIONS_ROUTE = 'Intention'; // <-- set to your existing intentions route name

type Props = { navigation?: any; onComplete?: () => void };

export default function OnboardingFlow({ navigation, onComplete }: Props) {
  const insets = useSafeAreaInsets();
  const [phase, setPhase] = useState<'call' | 'breath' | 'name'>('call');
  const [showCTA, setShowCTA] = useState(false);
  const [name, setName] = useState('');
  const fogOpacity = useRef(new Animated.Value(1)).current; // start under veil
  const orbScale   = useRef(new Animated.Value(0.92)).current;
  const textOpacity= useRef(new Animated.Value(0)).current;

  const toneRef = useRef<Audio.Sound | null>(null);

  useEffect(() => {
    // prepare ambient tone (quiet)
    (async () => {
      try {
        toneRef.current = new Audio.Sound();
        await toneRef.current.loadAsync(require('../assets/audio/Homepage_Hum.mp3'));
        await toneRef.current.setIsLoopingAsync(true);
        await toneRef.current.setVolumeAsync(0.12);
        await toneRef.current.playAsync();
      } catch {}
    })();
    return () => { toneRef.current?.unloadAsync().catch(() => {}); };
  }, []);

  useEffect(() => {
    // PHASE 1: “The Call” — slow reveal from black → fog → orb idle
    Animated.sequence([
      Animated.timing(fogOpacity, { toValue: 0.7, duration: 1200, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      Animated.timing(textOpacity, { toValue: 1,    duration: 900,  easing: Easing.out(Easing.cubic), useNativeDriver: true }),
    ]).start(() => {
      // Hold readable for ~2s, then proceed to breath
      const t = setTimeout(() => setPhase('breath'), 2000);
      // cleanup in case of unmount
      return () => clearTimeout(t);
    });
  }, []);

  useEffect(() => {
    if (phase !== 'breath') return;
    // PHASE 2: “Breath Gate” — orb breath loop, CTA appears
    const loop = () => {
      Animated.sequence([
        Animated.timing(orbScale, { toValue: 1.08, duration: 2400, easing: Easing.inOut(Easing.cubic), useNativeDriver: true }),
        Animated.timing(orbScale, { toValue: 0.96, duration: 2400, easing: Easing.inOut(Easing.cubic), useNativeDriver: true }),
      ]).start(({ finished }) => finished && loop());
    };
    const ctaTimer = setTimeout(() => setShowCTA(true), 3600);
    loop();
    return () => clearTimeout(ctaTimer);
  }, [phase, orbScale]);

  const proceedToName = async () => {
    try { await Haptics.selectionAsync(); } catch {}
    // Gentle thicken veil, then show name input
    Animated.parallel([
      Animated.timing(textOpacity, { toValue: 0, duration: 300, useNativeDriver: true }),
      Animated.timing(fogOpacity, { toValue: 0.9, duration: 400, useNativeDriver: true }),
    ]).start(() => setPhase('name'));
  };

  const complete = async () => {
    try { await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch {}
    if (name.trim()) await AsyncStorage.setItem('profileName', name.trim());
    await AsyncStorage.setItem('hasInitiated', 'true');

    // Cinematic: veil thickens, then we route into your regular onboarding (intentions)
    Animated.timing(fogOpacity, { toValue: 1, duration: 900, easing: Easing.inOut(Easing.cubic), useNativeDriver: true })
      .start(() => {
        if (navigation?.replace) {
          navigation.replace(INTENTIONS_ROUTE);
        } else {
          onComplete?.();
        }
      });
  };

  return (
    <View style={styles.container} onStartShouldSetResponder={() => { if (phase === 'breath' && !showCTA) { setShowCTA(true); } return false; }}>
      {/* Ambient fog & vignette */}
      <LinearGradient
        colors={['rgba(6,6,15,1)', 'rgba(6,6,15,0.6)', 'rgba(6,6,15,1)']}
        start={{ x: 0.5, y: 0 }} end={{ x: 0.5, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <Animated.View style={[StyleSheet.absoluteFill, { opacity: 0.45 }]}> 
        <LottieView
          source={require('../assets/animations/dust-drift.json')}
          autoPlay loop
          style={StyleSheet.absoluteFill}
        />
      </Animated.View>

      {/* Orb */}
      <Animated.View style={[StyleSheet.absoluteFillObject, { justifyContent: 'center', alignItems: 'center', transform: [{ scale: orbScale }] }]}> 
        <Animated.Image
          source={require('../assets/images/orb-enhanced.png')}
          resizeMode="contain"
          style={{ width: 240, height: 240, opacity: 1 }}
        />
      </Animated.View>

      {/* Phase content */}
      {phase === 'call' && (
        <Animated.Text style={[styles.callText, { opacity: textOpacity }]}> 
          Close your eyes… breathe in… you are entering Inner.
        </Animated.Text>
      )}

      {phase === 'breath' && showCTA && (
        <View style={[styles.ctaWrap, { paddingBottom: insets.bottom + 20 }]}> 
          <Text style={styles.ctaHelper}>Follow the breath for a moment, then continue.</Text>
          <TouchableOpacity style={styles.cta} onPress={proceedToName} activeOpacity={0.9}>
            <Text style={styles.ctaText}>I’m Ready</Text>
          </TouchableOpacity>
        </View>
      )}

      {phase === 'name' && (
        <View style={{ marginTop: 24, width: '80%', alignItems: 'center' }}>
          <Text style={styles.prompt}>Before you continue inward, how should I know you?</Text>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="Your name (optional)"
            placeholderTextColor="rgba(240,238,248,0.5)"
            style={styles.input}
            autoCapitalize="words"
            autoCorrect={false}
            returnKeyType="done"
          />
          <TouchableOpacity
            style={[styles.cta, { marginTop: 14, opacity: 1 }]}
            onPress={complete}
            activeOpacity={0.9}
          >
            <Text style={styles.ctaText}>Enter</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Veil (topmost fog) */}
      <Animated.View
        pointerEvents="none"
        style={[StyleSheet.absoluteFill, { opacity: fogOpacity, backgroundColor: 'rgba(8,8,16,0.85)' }]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0b0b16', alignItems: 'center', justifyContent: 'center' },
  line: { color: '#EDEAF6', fontSize: 16, letterSpacing: 0.2, textAlign: 'center', paddingHorizontal: 28, opacity: 0.9 },
  prompt: { color: '#EDEAF6', fontSize: 16, textAlign: 'center', marginBottom: 12, opacity: 0.9 },
  input: {
    width: '100%',
    paddingVertical: 12, paddingHorizontal: 14,
    borderRadius: 12, color: '#F0EEF8',
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
  },
  cta: {
    backgroundColor: '#CFC3E0', paddingVertical: 10, paddingHorizontal: 24,
    borderRadius: 16, borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)',
  },
  ctaText: { color: '#1F233A', fontSize: 16, fontWeight: '600' },
  subtle: { marginTop: 10, color: '#B9B5C9', fontSize: 12, opacity: 0.85, textAlign: 'center' },

  callText: { 
    position: 'absolute',
    top: 56,
    left: 24,
    right: 24,
    textAlign: 'center',
    color: '#EDEAF6',
    fontSize: 16,
    letterSpacing: 0.2,
    opacity: 0.9,
  },
  ctaWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  ctaHelper: {
    marginBottom: 10,
    color: '#B9B5C9',
    fontSize: 12,
    opacity: 0.85,
    textAlign: 'center',
  },
});