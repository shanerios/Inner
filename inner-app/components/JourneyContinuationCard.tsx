import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

type Props = {
  remainingLabel: string;
  onContinue: () => void;
  onEnd: () => void;
};

export default function JourneyContinuationCard({ remainingLabel, onContinue, onEnd }: Props) {
  return (
    <View style={styles.card}>
      <Pressable
        onPress={onContinue}
        accessibilityRole="button"
        accessibilityLabel={`Continue your paused Overnight Journey. ${remainingLabel}`}
        style={({ pressed }) => [styles.openArea, pressed && styles.pressed]}
      >
        <View style={styles.signal} />
        <View style={styles.copy}>
          <Text style={styles.eyebrow}>YOUR NIGHT IS PAUSED</Text>
          <Text style={styles.title}>Continue your journey</Text>
          <Text style={styles.body}>{remainingLabel}</Text>
        </View>
        <Text style={styles.action}>Continue</Text>
      </Pressable>
      <Pressable
        onPress={onEnd}
        accessibilityRole="button"
        accessibilityLabel="End the paused Overnight Journey"
        hitSlop={10}
        style={styles.end}
      >
        <Text style={styles.endText}>End</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    width: '100%',
    overflow: 'hidden',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    backgroundColor: 'rgba(207,195,224,0.16)',
  },
  openArea: {
    minHeight: 82,
    paddingLeft: 18,
    paddingRight: 72,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
  },
  pressed: { opacity: 0.72 },
  signal: {
    width: 9,
    height: 9,
    borderRadius: 5,
    marginRight: 13,
    backgroundColor: 'rgba(220,185,100,0.96)',
    shadowColor: '#DCB964',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.9,
    shadowRadius: 8,
  },
  copy: { flex: 1 },
  eyebrow: { color: 'rgba(226,204,151,0.78)', fontFamily: 'Inter-Medium', fontSize: 8, letterSpacing: 1.5, marginBottom: 3 },
  title: { color: 'rgba(250,247,255,0.96)', fontFamily: 'CalSans-SemiBold', fontSize: 14 },
  body: { color: 'rgba(224,217,235,0.78)', fontFamily: 'Inter-ExtraLight', fontSize: 10, marginTop: 3 },
  action: { color: '#E5DDF5', fontFamily: 'Inter-Medium', fontSize: 9, letterSpacing: 0.8, marginLeft: 10 },
  end: { position: 'absolute', right: 12, bottom: 5, paddingHorizontal: 8, paddingVertical: 7 },
  endText: { color: 'rgba(215,207,228,0.62)', fontFamily: 'Inter-ExtraLight', fontSize: 10 },
});
