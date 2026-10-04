import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { PracticeExperimentView } from '../core/practiceExperiments';

type Props = {
  view: PracticeExperimentView | null;
  onStart: () => void;
  onContinue: () => void;
  onStop: () => void;
};

export default function PracticeExperimentCard({ view, onStart, onContinue, onStop }: Props) {
  if (!view) {
    return (
      <View style={styles.card}>
        <Text style={styles.eyebrow}>PERSONAL EXPERIMENT</Text>
        <Text style={styles.title}>Compare Ocean and Temple</Text>
        <Text style={styles.copy}>Try five guided nights. Inner will compare your own recall reports without treating association as cause.</Text>
        <Pressable accessibilityRole="button" accessibilityLabel="Begin the five-night Ocean and Temple experiment" onPress={onStart} style={styles.button}>
          <Text style={styles.buttonText}>BEGIN FIVE-NIGHT EXPERIMENT</Text>
        </Pressable>
      </View>
    );
  }

  const { experiment, completedNights, targetNights, nextCondition, observation, evidence } = view;
  const complete = experiment.status === 'completed';
  return (
    <View style={styles.card}>
      <Text style={styles.eyebrow}>PERSONAL EXPERIMENT · {completedNights}/{targetNights}</Text>
      <Text style={styles.title}>{experiment.title}</Text>
      <Text style={styles.copy}>{experiment.question}</Text>
      <View style={styles.progress} accessibilityLabel={`${completedNights} of ${targetNights} experiment nights complete`}>
        {Array.from({ length: targetNights }, (_, index) => (
          <View key={index} style={[styles.progressDot, index < completedNights && styles.progressDotComplete]} />
        ))}
      </View>
      {!!evidence && <Text style={styles.evidence}>{evidence}</Text>}
      {complete ? (
        <>
          <Text style={styles.observationLabel}>OBSERVED</Text>
          <Text style={styles.observation}>{observation}</Text>
          <Pressable accessibilityRole="button" accessibilityLabel="Start a new Ocean and Temple experiment" onPress={onStart} style={styles.button}>
            <Text style={styles.buttonText}>TRY ANOTHER FIVE NIGHTS</Text>
          </Pressable>
        </>
      ) : nextCondition ? (
        <>
          <Text style={styles.next}>Night {nextCondition.nightNumber} · {nextCondition.label}</Text>
          <Pressable accessibilityRole="button" accessibilityLabel={`Shape experiment night ${nextCondition.nightNumber} in ${nextCondition.label}`} onPress={onContinue} style={styles.button}>
            <Text style={styles.buttonText}>SHAPE {nextCondition.label.toLocaleUpperCase()} NIGHT</Text>
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel="End this personal experiment" onPress={onStop} hitSlop={10} style={styles.stop}>
            <Text style={styles.stopText}>End experiment</Text>
          </Pressable>
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginTop: 18,
    paddingTop: 16,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255,255,255,0.11)',
  },
  eyebrow: { color: '#A99BC8', fontFamily: 'Inter-Medium', fontSize: 8, letterSpacing: 1.35 },
  title: { color: '#EEEAF6', fontFamily: 'CalSans-SemiBold', fontSize: 16, marginTop: 5 },
  copy: { color: '#BDB5C9', fontFamily: 'Inter-Light', fontSize: 11, lineHeight: 17, marginTop: 5 },
  progress: { flexDirection: 'row', gap: 7, marginTop: 12 },
  progressDot: { width: 22, height: 3, borderRadius: 2, backgroundColor: 'rgba(207,195,224,0.16)' },
  progressDotComplete: { backgroundColor: '#A99BC8' },
  evidence: { color: '#C8C0D5', fontFamily: 'Inter-Light', fontSize: 10, lineHeight: 15, marginTop: 10 },
  observationLabel: { color: '#A99BC8', fontFamily: 'Inter-Medium', fontSize: 8, letterSpacing: 1.2, marginTop: 12 },
  observation: { color: '#DAD4E4', fontFamily: 'Inter-Light', fontSize: 11, lineHeight: 17, marginTop: 4 },
  next: { color: '#DAD4E4', fontFamily: 'Inter-Medium', fontSize: 11, marginTop: 12 },
  button: {
    alignSelf: 'flex-start',
    marginTop: 12,
    borderWidth: 1,
    borderColor: 'rgba(185,169,220,0.42)',
    borderRadius: 14,
    paddingHorizontal: 13,
    paddingVertical: 9,
    backgroundColor: 'rgba(142,136,216,0.10)',
  },
  buttonText: { color: '#D8CFF0', fontFamily: 'Inter-Medium', fontSize: 8, letterSpacing: 1.05 },
  stop: { alignSelf: 'flex-start', paddingVertical: 8, paddingRight: 12, marginTop: 2 },
  stopText: { color: 'rgba(207,195,224,0.68)', fontFamily: 'Inter-Light', fontSize: 11 },
});
