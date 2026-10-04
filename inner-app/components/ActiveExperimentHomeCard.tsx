import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { PracticeExperimentView } from '../core/practiceExperiments';

type Props = {
  view: PracticeExperimentView;
  onOpen: () => void;
  onDismiss: () => void;
};

export default function ActiveExperimentHomeCard({ view, onOpen, onDismiss }: Props) {
  const next = view.nextCondition;
  if (!next) return null;

  return (
    <View style={styles.wrap}>
      <Pressable
        onPress={onOpen}
        accessibilityRole="button"
        accessibilityLabel={`Personal experiment, night ${next.nightNumber} of ${view.targetNights}. Shape ${next.label} night.`}
        style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
      >
        <Text style={styles.eyebrow}>PERSONAL EXPERIMENT · {view.completedNights}/{view.targetNights}</Text>
        <Text style={styles.title}>Night {next.nightNumber} · {next.label}</Text>
        <Text style={styles.reason}>{view.experiment.question}</Text>
        <Text style={styles.action}>SHAPE {next.label.toLocaleUpperCase()} NIGHT</Text>
      </Pressable>
      <Pressable
        onPress={onDismiss}
        accessibilityRole="button"
        accessibilityLabel="Hide this experiment until tomorrow"
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
  eyebrow: { color: '#AFA5C8', fontFamily: 'Inter-Medium', fontSize: 8, letterSpacing: 1.35 },
  title: { color: '#F2EDF9', fontFamily: 'CalSans-SemiBold', fontSize: 14, marginTop: 4, textAlign: 'center' },
  reason: { color: '#C8C0D5', fontFamily: 'Inter-ExtraLight', fontSize: 10, lineHeight: 14, marginTop: 4, textAlign: 'center' },
  action: { color: '#D8CFF0', fontFamily: 'Inter-Medium', fontSize: 8, letterSpacing: 1.15, marginTop: 8 },
  later: { paddingHorizontal: 10, paddingVertical: 6, marginTop: 2 },
  laterText: { color: 'rgba(207,195,224,0.78)', fontFamily: 'Inter-ExtraLight', fontSize: 12 },
});
