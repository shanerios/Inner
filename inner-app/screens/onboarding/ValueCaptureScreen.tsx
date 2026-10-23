// screens/onboarding/ValueCaptureScreen.tsx
import React, { useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation } from '@react-navigation/native';
import * as Haptics from 'expo-haptics';
import { usePostHog } from 'posthog-react-native';
import { Typography } from '../../core/typography';
import { useScale } from '../../utils/scale';
import {
  setPrimaryGoal,
  markValueCaptureComplete,
  PrimaryGoal,
} from '../../core/onboardingPrefs';

const GOALS: { id: PrimaryGoal; title: string; description: string }[] = [
  { id: 'lucid_dreaming', title: 'Lucid Dreaming', description: 'Become aware inside the dream' },
  { id: 'obe', title: 'Out-of-Body', description: 'Explore beyond the physical' },
  { id: 'deep_focus', title: 'Deep Focus', description: 'Sharpen the waking mind' },
];

export default function ValueCaptureScreen() {
  const navigation = useNavigation();
  const { scale, verticalScale } = useScale();
  const posthog = usePostHog();

  const [goal, setGoal] = useState<PrimaryGoal | null>(null);
  const submittedRef = useRef(false);

  const styles = useMemo(
    () =>
      StyleSheet.create({
        container: { flex: 1, backgroundColor: '#0d0d1a' },
        content: {
          flex: 1,
          paddingHorizontal: scale(24),
          justifyContent: 'center',
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
      }),
    [scale, verticalScale],
  );

  // One question: the answer and the completion flag are persisted together,
  // so an interrupted session never replays a half-finished survey.
  const selectGoal = async (id: PrimaryGoal) => {
    if (submittedRef.current) return;
    submittedRef.current = true;
    try { await Haptics.selectionAsync(); } catch {}
    setGoal(id);
    await setPrimaryGoal(id);
    await markValueCaptureComplete();
    // Funnel step only — the specific goal selection is a user intention and
    // is not sent to analytics (see CLAUDE.md).
    posthog.capture('onboarding_value_capture_completed');
    (navigation as any).navigate('Intention');
  };

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={['rgba(20,16,36,1)', 'rgba(10,9,18,1)']}
        style={StyleSheet.absoluteFill}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
      />

      <View style={styles.content}>
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
      </View>
    </View>
  );
}
