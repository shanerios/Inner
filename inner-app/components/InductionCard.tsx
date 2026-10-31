import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

type Props = {
  onBegin: () => void;
  onDismiss: () => void;
};

/**
 * The Induction, kept at the top of Home for someone who has not yet heard it. It never starts anything itself:
 * audio begins only when the person chooses to.
 */
export default function InductionCard({ onBegin, onDismiss }: Props) {
  return (
    <View style={styles.wrap}>
      <Pressable
        onPress={onBegin}
        accessibilityRole="button"
        accessibilityLabel="The Induction. A short experience of what Inner is about. Six minutes. Best with headphones. Listen"
        style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
      >
        <Text style={styles.eyebrow}>START HERE</Text>
        <Text style={styles.title}>The Induction</Text>
        <Text style={styles.reason}>Six minutes of sound that shows what Inner is about. Best with headphones.</Text>
        <Text style={styles.action}>LISTEN · 6 MIN</Text>
      </Pressable>
      <Pressable
        onPress={onDismiss}
        accessibilityRole="button"
        accessibilityLabel="Not now"
        hitSlop={10}
        style={styles.later}
      >
        <Text style={styles.laterText}>Not now</Text>
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
