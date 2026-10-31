import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

type Props = {
  /** Prominent leads a first visit to Home; quiet is for someone who has been using Inner. */
  variant: 'prominent' | 'quiet';
  onBegin: () => void;
  onDismiss: () => void;
};

/** The offer of The Induction. It never starts anything itself: audio begins only when the person chooses to. */
export default function InductionCard({ variant, onBegin, onDismiss }: Props) {
  const prominent = variant === 'prominent';
  return (
    <View style={styles.wrap}>
      <Pressable
        onPress={onBegin}
        accessibilityRole="button"
        accessibilityLabel={`The Induction. ${prominent ? 'Your first experience of Inner' : 'A short experience of Inner'}. Six minutes. Best with headphones. Begin`}
        style={({ pressed }) => [styles.card, prominent && styles.cardProminent, pressed && styles.cardPressed]}
      >
        <Text style={styles.eyebrow}>{prominent ? 'YOUR FIRST EXPERIENCE' : 'START HERE'}</Text>
        <Text style={[styles.title, prominent && styles.titleProminent]}>The Induction</Text>
        <Text style={[styles.reason, prominent && styles.reasonProminent]}>
          {prominent
            ? 'Six minutes of sound, to show you what Inner is about. Best with headphones.'
            : 'Six minutes of sound that shows what Inner is about. Best with headphones.'}
        </Text>
        <Text style={styles.action}>BEGIN · 6 MIN</Text>
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
  cardProminent: {
    paddingVertical: 18,
    borderColor: 'rgba(205,194,255,0.34)',
    backgroundColor: 'rgba(14,11,30,0.62)',
  },
  cardPressed: { backgroundColor: 'rgba(30,25,52,0.58)', borderColor: 'rgba(205,194,255,0.30)' },
  eyebrow: { color: '#AFA5C8', fontFamily: 'Inter-Medium', fontSize: 8, letterSpacing: 1.45 },
  title: { color: '#F2EDF9', fontFamily: 'CalSans-SemiBold', fontSize: 14, marginTop: 4, textAlign: 'center' },
  titleProminent: { fontSize: 20, marginTop: 6 },
  reason: { color: '#C8C0D5', fontFamily: 'Inter-ExtraLight', fontSize: 10, lineHeight: 14, marginTop: 4, textAlign: 'center' },
  reasonProminent: { fontSize: 12, lineHeight: 17, marginTop: 6 },
  action: { color: '#D8CFF0', fontFamily: 'Inter-Medium', fontSize: 8, letterSpacing: 1.15, marginTop: 10 },
  later: { paddingHorizontal: 10, paddingVertical: 6, marginTop: 2 },
  laterText: { color: 'rgba(207,195,224,0.78)', fontFamily: 'Inter-ExtraLight', fontSize: 12 },
});
