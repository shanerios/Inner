// src/lunar/LunarWhisperModal.tsx
import React from 'react';
import { Modal, View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import type { MoonPhase } from '../../utils/lunar';
import { lunarMeanings } from './lunarMeanings';
import { lunarLore } from './lunarLore';

type Props = {
  visible: boolean;
  phase: MoonPhase;
  onClose: () => void;
  onReflect?: () => void; // optional: jump to Journal
};

export default function LunarWhisperModal({ visible, phase, onClose, onReflect }: Props) {
  const data = lunarMeanings[phase];
  const lore = lunarLore[phase];

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <TouchableOpacity
        activeOpacity={1}
        style={styles.backdrop}
        onPress={onClose}
        accessibilityRole="button"
        accessibilityLabel="Close lunar phase details"
        accessibilityHint="Dismisses the lunar guidance overlay"
      >
        <TouchableOpacity activeOpacity={1} onPress={() => {}} style={styles.card}>
          <LinearGradient
            colors={['rgba(207,195,224,0.20)', 'rgba(31,35,58,0.0)']}
            start={{ x: 0.5, y: 0 }}
            end={{ x: 0.5, y: 1 }}
            style={StyleSheet.absoluteFill}
            pointerEvents="none"
          />
          <Text style={[styles.heading]}>{phase.replace('-', ' ')} • {data.title}</Text>
          <Text style={styles.summary}>{data.summary}</Text>

          <View style={{ height: 10 }} />

          <Text style={styles.label}>Ritual</Text>
          <Text style={styles.body}>{data.ritualTip}</Text>

          <View style={{ height: 10 }} />

          <Text style={styles.label}>Affirmation</Text>
          <Text style={styles.body} accessibilityRole="text">“{data.affirmation}”</Text>

          {lore && (
            <>
              <View style={{ height: 10 }} />
              <Text style={styles.label}>Lore</Text>
              <Text style={styles.lore}>{lore}</Text>
            </>
          )}

          <View style={{ height: 16 }} />

          <View style={styles.row}>
            <TouchableOpacity
              onPress={async () => { try { await Haptics.selectionAsync(); } catch {} onClose(); }}
              accessibilityRole="button"
              accessibilityLabel="Close lunar guidance"
              style={[styles.btn, { backgroundColor: 'rgba(255,255,255,0.06)' }]}
            >
              <Text style={[styles.btnText, { color: '#EDEAF6' }]}>Close</Text>
            </TouchableOpacity>

            {onReflect && (
              <TouchableOpacity
                onPress={async () => { try { await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch {} onReflect(); }}
                accessibilityRole="button"
                accessibilityLabel="Open Journal to reflect"
                style={[styles.btn, { backgroundColor: '#CFC3E0', borderWidth: 1, borderColor: 'rgba(255,255,255,0.20)' }]}
              >
                <Text style={[styles.btnText, { color: '#1F233A' }]}>Reflect</Text>
              </TouchableOpacity>
            )}
          </View>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  card: {
    width: '86%',
    backgroundColor: 'rgba(18,18,32,0.96)',
    borderRadius: 16,
    padding: 18,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  heading: {
    color: '#F0EEF8',
    fontSize: 16,
    fontFamily: 'CalSans',
    textTransform: 'capitalize',
    textAlign: 'center',
    marginBottom: 8,
  },
  summary: {
    color: '#EDEAF6',
    fontSize: 14,
    fontFamily: 'Inter-ExtraLight',
    textAlign: 'center',
  },
  label: {
    color: '#CFC3E0',
    fontSize: 12,
    fontFamily: 'CalSans',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 4,
  },
  body: {
    color: '#EDEAF6',
    fontSize: 14,
    fontFamily: 'Inter-ExtraLight',
  },
  lore: {
    color: '#EDEAF6',
    fontSize: 13,
    fontFamily: 'Inter-ExtraLight',
    fontStyle: 'italic',
    textAlign: 'center',
    textShadowColor: 'rgba(207,195,224,0.35)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 6,
    marginTop: 4,
  },
  row: {
    marginTop: 6,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 14,
  },
  btn: {
    paddingVertical: 8,
    paddingHorizontal: 18,
    borderRadius: 14,
  },
  btnText: {
    fontFamily: 'Inter-ExtraLight',
    fontSize: 14,
  },
});