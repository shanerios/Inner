import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { TonightRecommendation } from '../core/tonightRecommendation';

type Props = {
  recommendation: TonightRecommendation;
  onOpen: () => void;
  onDismiss: () => void;
};

export default function TonightRecommendationCard({ recommendation, onOpen, onDismiss }: Props) {
  return (
    <View style={styles.wrap}>
      <Pressable
        onPress={onOpen}
        accessibilityRole="button"
        accessibilityLabel={`${recommendation.title}. ${recommendation.reason}. ${recommendation.actionLabel}`}
        style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
      >
        <Text style={styles.eyebrow}>INNER REMEMBERS</Text>
        <Text style={styles.title}>{recommendation.title}</Text>
        <Text style={styles.reason}>{recommendation.reason}</Text>
        <Text style={styles.action}>{recommendation.actionLabel}</Text>
      </Pressable>
      <Pressable
        onPress={onDismiss}
        accessibilityRole="button"
        accessibilityLabel="Dismiss tonight's recommendation"
        hitSlop={10}
        style={styles.later}
      >
        <Text style={styles.laterText}>Later</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { width: '100%', alignItems: 'center' },
  card: {
    width: '100%',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(205,194,255,0.18)',
    backgroundColor: 'rgba(12,10,24,0.42)',
    alignItems: 'center',
  },
  cardPressed: { backgroundColor: 'rgba(30,25,52,0.58)', borderColor: 'rgba(205,194,255,0.30)' },
  eyebrow: { color: '#AFA5C8', fontFamily: 'Inter-Medium', fontSize: 8, letterSpacing: 1.45 },
  title: { color: '#F2EDF9', fontFamily: 'CalSans-SemiBold', fontSize: 14, marginTop: 4, textAlign: 'center' },
  reason: { color: '#C8C0D5', fontFamily: 'Inter-ExtraLight', fontSize: 10, lineHeight: 14, marginTop: 4, textAlign: 'center' },
  action: { color: '#D8CFF0', fontFamily: 'Inter-Medium', fontSize: 8, letterSpacing: 1.15, marginTop: 8 },
  later: { paddingHorizontal: 10, paddingVertical: 6, marginTop: 2 },
  laterText: { color: 'rgba(207,195,224,0.78)', fontFamily: 'Inter-ExtraLight', fontSize: 12 },
});

