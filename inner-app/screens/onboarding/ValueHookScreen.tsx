// screens/onboarding/ValueHookScreen.tsx
import React, { useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  NativeSyntheticEvent,
  NativeScrollEvent,
  useWindowDimensions,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { usePostHog } from 'posthog-react-native';
import { useScale } from '../../utils/scale';
import { markValueHookSeen } from '../../core/onboardingPrefs';

const SLIDES = [
  {
    eyebrow: 'FREQUENCY ENTRAINMENT',
    title: 'Sound tuned to your state.',
    body: "Inner's soundscapes use binaural beats to guide your brainwaves toward the states linked with lucidity and deep sleep.",
  },
  {
    eyebrow: 'WAKE NOTIFICATIONS',
    title: 'Timed to your natural rhythm.',
    body: 'A quiet cue arrives near your REM window. It\'s just enough to nudge awareness back, without pulling you fully from sleep.',
  },
  {
    eyebrow: 'WORKING TOGETHER',
    title: 'Entrainment sets the state. The cue meets it.',
    body: 'The two are built to overlap so the moment you’re most receptive is the same moment that Inner reaches you.',
  },
];

export default function ValueHookScreen() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const { scale, verticalScale } = useScale();
  const { width } = useWindowDimensions();
  const posthog = usePostHog();

  const [index, setIndex] = useState(0);
  const scrollRef = useRef<ScrollView>(null);

  const styles = useMemo(
    () =>
      StyleSheet.create({
        container: { flex: 1, backgroundColor: '#0d0d1a' },
        slide: {
          width,
          paddingHorizontal: scale(32),
          alignItems: 'center',
          justifyContent: 'center',
        },
        eyebrow: {
          fontFamily: 'Inter-ExtraLight',
          fontSize: scale(11),
          letterSpacing: 2,
          color: 'rgba(207,195,224,0.85)',
          textTransform: 'uppercase',
          marginBottom: verticalScale(18),
          textAlign: 'center',
        },
        title: {
          fontFamily: 'CalSans-SemiBold',
          fontSize: scale(24),
          color: '#F0EEF8',
          textAlign: 'center',
          marginBottom: verticalScale(16),
          lineHeight: verticalScale(32),
        },
        body: {
          fontFamily: 'Inter-ExtraLight',
          fontSize: scale(14),
          color: 'rgba(240,238,248,0.7)',
          textAlign: 'center',
          lineHeight: verticalScale(22),
          maxWidth: scale(300),
        },
        dotsRow: {
          flexDirection: 'row',
          justifyContent: 'center',
          gap: 8,
          marginBottom: verticalScale(24),
        },
        dot: {
          width: 6,
          height: 6,
          borderRadius: 3,
          backgroundColor: 'rgba(255,255,255,0.2)',
        },
        dotActive: {
          backgroundColor: '#CFC3E0',
          width: 18,
        },
        footer: {
          paddingHorizontal: scale(24),
          paddingBottom: insets.bottom + verticalScale(20),
        },
        cta: {
          backgroundColor: 'rgba(207,195,224,0.16)',
          paddingVertical: verticalScale(14),
          borderRadius: 12,
          borderWidth: 1,
          borderColor: 'rgba(255,255,255,0.12)',
          alignItems: 'center',
        },
        ctaText: {
          fontFamily: 'CalSans-SemiBold',
          color: '#F3EDE7',
          fontSize: scale(16),
          letterSpacing: 0.2,
        },
        skip: {
          alignItems: 'center',
          paddingTop: verticalScale(12),
        },
        skipText: {
          fontFamily: 'Inter-ExtraLight',
          color: 'rgba(240,238,248,0.4)',
          fontSize: scale(13),
        },
      }),
    [scale, verticalScale, width, insets.bottom],
  );

  const onMomentumEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const next = Math.round(e.nativeEvent.contentOffset.x / width);
    if (next !== index) {
      setIndex(next);
      Haptics.selectionAsync().catch(() => {});
    }
  };

  const isLast = index === SLIDES.length - 1;

  const finish = async () => {
    try { await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch {}
    await markValueHookSeen();
    posthog.capture('onboarding_value_hook_completed');
    (navigation as any).navigate('Intention');
  };

  const goNext = () => {
    if (isLast) {
      finish();
      return;
    }
    const next = index + 1;
    scrollRef.current?.scrollTo({ x: next * width, animated: true });
    setIndex(next);
  };

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={['rgba(20,16,36,1)', 'rgba(10,9,18,1)']}
        style={StyleSheet.absoluteFill}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
      />

      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={onMomentumEnd}
        style={{ flex: 1, marginTop: insets.top + verticalScale(40) }}
      >
        {SLIDES.map((s, i) => (
          <View key={i} style={styles.slide}>
            <Text style={styles.eyebrow}>{s.eyebrow}</Text>
            <Text style={styles.title}>{s.title}</Text>
            <Text style={styles.body}>{s.body}</Text>
          </View>
        ))}
      </ScrollView>

      <View style={styles.dotsRow}>
        {SLIDES.map((_, i) => (
          <View key={i} style={[styles.dot, i === index && styles.dotActive]} />
        ))}
      </View>

      <View style={styles.footer}>
        <TouchableOpacity style={styles.cta} onPress={goNext} activeOpacity={0.9} accessibilityRole="button">
          <Text style={styles.ctaText}>{isLast ? 'Continue' : 'Next'}</Text>
        </TouchableOpacity>
        {!isLast && (
          <TouchableOpacity style={styles.skip} onPress={finish} accessibilityRole="button">
            <Text style={styles.skipText}>Skip</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}
