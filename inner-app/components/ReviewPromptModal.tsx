// components/ReviewPromptModal.tsx
import React from 'react';
import { Modal, View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import * as Haptics from 'expo-haptics';
import * as StoreReview from 'expo-store-review';

type Props = {
  visible: boolean;
  onDismiss: () => void;
};

export default function ReviewPromptModal({ visible, onDismiss }: Props) {
  const handleReview = async () => {
    try { await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch {}
    try { await StoreReview.requestReview(); } catch {}
    onDismiss();
  };

  const handleDismiss = async () => {
    try { await Haptics.selectionAsync(); } catch {}
    onDismiss();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={handleDismiss}
    >
      <TouchableOpacity
        activeOpacity={1}
        style={styles.backdrop}
        onPress={handleDismiss}
        accessibilityRole="button"
        accessibilityLabel="Dismiss review prompt"
        accessibilityHint="Closes the review prompt without leaving a review"
      >
        <TouchableOpacity activeOpacity={1} onPress={() => {}} style={styles.card}>
          <LinearGradient
            colors={['rgba(207,195,224,0.14)', 'rgba(31,35,58,0.0)']}
            start={{ x: 0.5, y: 0 }}
            end={{ x: 0.5, y: 1 }}
            style={StyleSheet.absoluteFill}
            pointerEvents="none"
          />

          <Text style={styles.heading}>Has this resonated?</Text>

          <View style={{ height: 10 }} />

          <Text style={styles.body}>
            If Inner has meant something to you, a review helps others find their way here.
          </Text>

          <View style={{ height: 20 }} />

          <TouchableOpacity
            style={styles.ctaBtn}
            onPress={handleReview}
            accessibilityRole="button"
            accessibilityLabel="Leave a review"
            activeOpacity={0.85}
          >
            <BlurView intensity={32} tint="dark" style={StyleSheet.absoluteFill} />

            <LinearGradient
              colors={['rgba(255,255,255,0.10)', 'rgba(255,255,255,0.02)']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={StyleSheet.absoluteFill}
              pointerEvents="none"
            />

            <Text style={styles.ctaText}>Leave a Reflection</Text>
          </TouchableOpacity>

          <View style={{ height: 10 }} />

          <TouchableOpacity
            onPress={handleDismiss}
            style={styles.dismissWrap}
            accessibilityRole="button"
            accessibilityLabel="Not now"
          >
            <Text style={styles.dismissText}>Not Now</Text>
          </TouchableOpacity>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.50)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  card: {
    width: '86%',
    backgroundColor: 'rgba(18,18,32,0.70)',
    borderRadius: 16,
    padding: 18,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    overflow: 'hidden',
    shadowColor: '#8E88D8',
    shadowOpacity: 0.12,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
  },
  heading: {
    color: '#F0EEF8',
    fontSize: 16,
    fontFamily: 'CalSans-SemiBold',
    textAlign: 'center',
  },
  body: {
    color: 'rgba(237,234,246,0.86)',
    fontSize: 14,
    fontFamily: 'Inter-ExtraLight',
    textAlign: 'center',
    lineHeight: 21,
  },
  ctaBtn: {
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(207,195,224,0.35)',
    borderTopColor: 'rgba(207,195,224,0.7)',
    alignSelf: 'center',
    overflow: 'hidden',
  },
  ctaText: {
    fontFamily: 'CalSans-SemiBold',
    fontSize: 16,
    color: '#F0EEF8',
  },
  dismissWrap: {
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  dismissText: {
    fontFamily: 'Inter-ExtraLight',
    fontSize: 13,
    color: 'rgba(237,234,246,0.6)',
  },
});
