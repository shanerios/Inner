// components/HomeHelperModal.tsx
import React from 'react';
import { Modal, View, Text, TouchableOpacity, Pressable, StyleSheet } from 'react-native';
import * as Haptics from 'expo-haptics';
import { Typography } from '../core/typography';
import { Typography as _Typography, Body as _Body } from '../core/typography';
const Body = _Body ?? ({ regular: { ..._Typography.body }, subtle: { ..._Typography.caption } } as const);

type Props = {
  visible: boolean;
  onClose: () => void;
  onDismissForever: () => void;
};

export default function HomeHelperModal({ visible, onClose, onDismissForever }: Props) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.modalBackdrop} onPress={onClose}>
        <Pressable onPress={() => { /* capture taps inside */ }}>
          <View style={styles.modalCard}>
            <Text style={[Typography.title, { color: '#F0EEF8', textAlign: 'center', marginBottom: 8 }]}>
              Welcome to Inner
            </Text>
            <Text style={[Body.subtle, { fontFamily: 'Inter-ExtraLight', color: '#DCD5F0', fontSize: 14, textAlign: 'center' }]}>
              A quick tour of your Home.
            </Text>

            <View style={{ height: 10 }} />
            <View style={{ gap: 8 }}>
              <Text style={[Body.subtle, { fontFamily: 'Inter-ExtraLight', color: '#EDEAF6', fontSize: 13 }]}>• Tap the orb to resume or start your journey.</Text>
              <Text style={[Body.subtle, { fontFamily: 'Inter-ExtraLight', color: '#EDEAF6', fontSize: 13 }]}>• Swipe left for Chambers · right for Soundscapes.</Text>
              <Text style={[Body.subtle, { fontFamily: 'Inter-ExtraLight', color: '#EDEAF6', fontSize: 13 }]}>• Tap the ⌄ at the bottom for the Learning Hub.</Text>
              <Text style={[Body.subtle, { fontFamily: 'Inter-ExtraLight', color: '#EDEAF6', fontSize: 13 }]}>• Long-press the orb to reveal the Lunar Whisper.</Text>
              <Text style={[Body.subtle, { fontFamily: 'Inter-ExtraLight', color: '#EDEAF6', fontSize: 13 }]}>• Use ⚙︎ to set your name, intentions, and audio quality.</Text>
            </View>

            <View style={{ height: 14 }} />
            <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 16, marginTop: 6 }}>
              <TouchableOpacity
                onPress={async () => { try { await Haptics.selectionAsync(); } catch {} onClose(); }}
                accessibilityRole="button"
                accessibilityLabel="Got it"
                style={{ backgroundColor: '#CFC3E0', paddingVertical: 8, paddingHorizontal: 20, borderRadius: 14, borderWidth: 1, borderColor: 'rgba(255,255,255,0.20)' }}
              >
                <Text style={[Typography.subtle, { color: '#1F233A' }]}>Got it</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={async () => { try { await Haptics.selectionAsync(); } catch {} onDismissForever(); }}
                accessibilityRole="button"
                accessibilityLabel="Don't show again"
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Text style={{ color: '#F0EEF8', fontSize: 14, opacity: 0.9 }}>Don’t show again</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(8,8,16,0.65)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  modalCard: {
    width: Math.min(420, 0.9 * (typeof window !== 'undefined' ? window.innerWidth || 420 : 420)),
    maxWidth: '92%',
    backgroundColor: 'rgba(14,14,28,0.88)',
    borderRadius: 16,
    paddingVertical: 16,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
});