// components/onboarding/SoftAccountPrompt.tsx
import React, { useMemo } from 'react';
import { Modal, View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useScale } from '../../utils/scale';

type Props = {
  visible: boolean;
  onCreateAccount: () => void;
  onDismiss: () => void;
};

export default function SoftAccountPrompt({ visible, onCreateAccount, onDismiss }: Props) {
  const { scale, verticalScale } = useScale();

  const styles = useMemo(
    () =>
      StyleSheet.create({
        overlay: {
          flex: 1,
          backgroundColor: 'rgba(6,6,15,0.7)',
          justifyContent: 'flex-end',
        },
        sheet: {
          borderTopLeftRadius: 20,
          borderTopRightRadius: 20,
          paddingHorizontal: scale(24),
          paddingTop: verticalScale(24),
          paddingBottom: verticalScale(32),
          borderTopWidth: 1,
          borderColor: 'rgba(255,255,255,0.1)',
          overflow: 'hidden',
        },
        title: {
          fontFamily: 'CalSans-SemiBold',
          fontSize: scale(18),
          color: '#F0EEF8',
          marginBottom: verticalScale(8),
        },
        body: {
          fontFamily: 'Inter-ExtraLight',
          fontSize: scale(13),
          color: 'rgba(240,238,248,0.65)',
          lineHeight: verticalScale(19),
          marginBottom: verticalScale(20),
        },
        primary: {
          backgroundColor: 'rgba(207,195,224,0.16)',
          paddingVertical: verticalScale(13),
          borderRadius: 12,
          borderWidth: 1,
          borderColor: 'rgba(255,255,255,0.12)',
          alignItems: 'center',
          marginBottom: verticalScale(10),
        },
        primaryText: { fontFamily: 'CalSans-SemiBold', color: '#F3EDE7', fontSize: scale(15) },
        secondary: { alignItems: 'center', paddingVertical: verticalScale(6) },
        secondaryText: { fontFamily: 'Inter-ExtraLight', color: 'rgba(240,238,248,0.45)', fontSize: scale(13) },
      }),
    [scale, verticalScale],
  );

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onDismiss}>
      <View style={styles.overlay}>
        <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={onDismiss} accessibilityLabel="Dismiss" />
        <View style={styles.sheet}>
          <LinearGradient colors={['rgba(26,20,46,1)', 'rgba(13,13,26,1)']} style={StyleSheet.absoluteFill} />
          <Text style={styles.title}>Keep this entry safe.</Text>
          <Text style={styles.body}>
            Your journal stays private on this device. Create an account to make sure this entry is never lost.
          </Text>
          <TouchableOpacity style={styles.primary} onPress={onCreateAccount} accessibilityRole="button">
            <Text style={styles.primaryText}>Create Account</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.secondary} onPress={onDismiss} accessibilityRole="button">
            <Text style={styles.secondaryText}>Not now</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}
