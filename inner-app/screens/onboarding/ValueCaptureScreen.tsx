// screens/onboarding/ValueCaptureScreen.tsx
import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Animated, Easing, useWindowDimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { usePostHog } from 'posthog-react-native';
import { Typography } from '../../core/typography';
import { useScale } from '../../utils/scale';
import {
  setPrimaryGoal,
  setDreamRecallFrequency,
  markValueCaptureComplete,
  PrimaryGoal,
  DreamRecallFrequency,
} from '../../core/onboardingPrefs';

const GOALS: { id: PrimaryGoal; title: string; description: string }[] = [
  { id: 'lucid_dreaming', title: 'Lucid Dreaming', description: 'Become aware inside the dream' },
  { id: 'obe', title: 'Out-of-Body', description: 'Explore beyond the physical' },
  { id: 'deep_focus', title: 'Deep Focus', description: 'Sharpen the waking mind' },
];

const FREQUENCIES: { id: DreamRecallFrequency; title: string }[] = [
  { id: 'rarely', title: 'Rarely' },
  { id: 'sometimes', title: 'Sometimes' },
  { id: 'often', title: 'Often' },
  { id: 'every_night', title: 'Nearly every night' },
];

const STEP_COUNT = 3;

export default function ValueCaptureScreen() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const { scale, verticalScale } = useScale();
  const { width } = useWindowDimensions();
  const posthog = usePostHog();

  const [step, setStep] = useState(0);
  const [goal, setGoal] = useState<PrimaryGoal | null>(null);
  const [frequency, setFrequency] = useState<DreamRecallFrequency | null>(null);
  const fade = React.useRef(new Animated.Value(1)).current;

  const styles = useMemo(
    () =>
      StyleSheet.create({
        container: { flex: 1, backgroundColor: '#0d0d1a' },
        content: {
          flex: 1,
          paddingHorizontal: scale(24),
          justifyContent: 'center',
        },
        progressRow: {
          position: 'absolute',
          left: scale(24),
          right: scale(24),
          flexDirection: 'row',
          gap: 6,
        },
        progressDot: {
          flex: 1,
          height: 3,
          borderRadius: 2,
          backgroundColor: 'rgba(255,255,255,0.14)',
        },
        progressDotActive: {
          backgroundColor: '#CFC3E0',
        },
        title: {
          ...Typography.title,
          fontFamily: 'CalSans-SemiBold',
          fontSize: scale(24),
          color: '#F0EEF8',
          textAlign: 'center',
          marginBottom: verticalScale(8),
        },
        subtitle: {
          fontFamily: 'Inter-ExtraLight',
          fontSize: scale(13),
          color: 'rgba(240,238,248,0.65)',
          textAlign: 'center',
          marginBottom: verticalScale(32),
        },
        optionCard: {
          paddingVertical: verticalScale(16),
          paddingHorizontal: scale(18),
          borderRadius: 14,
          borderWidth: 1,
          borderColor: 'rgba(255,255,255,0.12)',
          backgroundColor: 'rgba(255,255,255,0.04)',
          marginBottom: verticalScale(12),
        },
        optionCardSelected: {
          borderColor: 'rgba(207,195,224,0.8)',
          backgroundColor: 'rgba(207,195,224,0.12)',
        },
        optionTitle: {
          fontFamily: 'CalSans-SemiBold',
          fontSize: scale(16),
          color: '#F0EEF8',
        },
        optionDescription: {
          fontFamily: 'Inter-ExtraLight',
          fontSize: scale(12),
          color: 'rgba(240,238,248,0.55)',
          marginTop: 2,
        },
        summaryWrap: { alignItems: 'center' },
        summaryLine: {
          fontFamily: 'Inter-ExtraLight',
          fontSize: scale(14),
          color: 'rgba(240,238,248,0.75)',
          textAlign: 'center',
          lineHeight: verticalScale(22),
          marginBottom: verticalScale(28),
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
        ctaDisabled: { opacity: 0.3 },
        ctaText: {
          fontFamily: 'CalSans-SemiBold',
          color: '#F3EDE7',
          fontSize: scale(16),
          letterSpacing: 0.2,
        },
      }),
    [scale, verticalScale, insets.bottom],
  );

  const advance = (next: number) => {
    Animated.sequence([
      Animated.timing(fade, { toValue: 0, duration: 160, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
    ]).start(() => {
      setStep(next);
      Animated.timing(fade, { toValue: 1, duration: 220, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
    });
  };

  const selectGoal = async (id: PrimaryGoal) => {
    try { await Haptics.selectionAsync(); } catch {}
    setGoal(id);
    await setPrimaryGoal(id);
    advance(1);
  };

  const selectFrequency = async (id: DreamRecallFrequency) => {
    try { await Haptics.selectionAsync(); } catch {}
    setFrequency(id);
    await setDreamRecallFrequency(id);
    advance(2);
  };

  const finish = async () => {
    try { await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch {}
    await markValueCaptureComplete();
    // Funnel step only — the specific goal/frequency selections are treated as
    // user intentions and are not sent to analytics (see CLAUDE.md).
    posthog.capture('onboarding_value_capture_completed');
    (navigation as any).navigate('ValueHook');
  };

  const goalTitle = GOALS.find(g => g.id === goal)?.title ?? '';

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={['rgba(20,16,36,1)', 'rgba(10,9,18,1)']}
        style={StyleSheet.absoluteFill}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
      />

      <View style={[styles.progressRow, { top: insets.top + verticalScale(16) }]}>
        {Array.from({ length: STEP_COUNT }).map((_, i) => (
          <View key={i} style={[styles.progressDot, i <= step && styles.progressDotActive]} />
        ))}
      </View>

      <Animated.View style={[styles.content, { opacity: fade }]}>
        {step === 0 && (
          <View accessible accessibilityLabel="Primary goal selection">
            <Text style={styles.title}>What brings you to Inner?</Text>
            <Text style={styles.subtitle}>Choose the path that calls to you most.</Text>
            {GOALS.map(g => (
              <TouchableOpacity
                key={g.id}
                style={[styles.optionCard, goal === g.id && styles.optionCardSelected]}
                onPress={() => selectGoal(g.id)}
                activeOpacity={0.85}
                accessibilityRole="button"
                accessibilityLabel={g.title}
              >
                <Text style={styles.optionTitle}>{g.title}</Text>
                <Text style={styles.optionDescription}>{g.description}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {step === 1 && (
          <View accessible accessibilityLabel="Dream recall frequency selection">
            <Text style={styles.title}>How often do you{'\n'}recall your dreams?</Text>
            <Text style={styles.subtitle}>This shapes how we guide your journal and prompts.</Text>
            {FREQUENCIES.map(f => (
              <TouchableOpacity
                key={f.id}
                style={[styles.optionCard, frequency === f.id && styles.optionCardSelected]}
                onPress={() => selectFrequency(f.id)}
                activeOpacity={0.85}
                accessibilityRole="button"
                accessibilityLabel={f.title}
              >
                <Text style={styles.optionTitle}>{f.title}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {step === 2 && (
          <View style={styles.summaryWrap} accessible accessibilityLabel="Personalization summary">
            <Text style={styles.title}>Your path is taking shape.</Text>
            <Text style={styles.summaryLine}>
              {goalTitle ? `We're tuning Inner around ${goalTitle.toLowerCase()}` : "We're tuning Inner around your path"}
              {'\n'}— starting with how Inner listens for the moments you're most likely to remember.
            </Text>
          </View>
        )}
      </Animated.View>

      {step === 2 && (
        <View style={styles.footer}>
          <TouchableOpacity style={styles.cta} onPress={finish} activeOpacity={0.9} accessibilityRole="button">
            <Text style={styles.ctaText}>Continue</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}
