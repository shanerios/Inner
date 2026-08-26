// screens/AccountCreateScreen.tsx
//
// Placeholder destination for the soft account-creation prompt. No auth or
// cloud-sync backend exists yet — this screen intentionally does not collect
// credentials. Wire a real provider (and replace this screen) before shipping
// an actual sign-up flow.
import React, { useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useScale } from '../utils/scale';

export default function AccountCreateScreen() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const { scale, verticalScale } = useScale();

  const styles = useMemo(
    () =>
      StyleSheet.create({
        container: { flex: 1, backgroundColor: '#0d0d1a', justifyContent: 'center', alignItems: 'center', paddingHorizontal: scale(28) },
        title: {
          fontFamily: 'CalSans-SemiBold',
          fontSize: scale(22),
          color: '#F0EEF8',
          textAlign: 'center',
          marginBottom: verticalScale(12),
        },
        body: {
          fontFamily: 'Inter-ExtraLight',
          fontSize: scale(14),
          color: 'rgba(240,238,248,0.65)',
          textAlign: 'center',
          lineHeight: verticalScale(21),
          marginBottom: verticalScale(28),
        },
        cta: {
          paddingVertical: verticalScale(12),
          paddingHorizontal: scale(28),
          borderRadius: 12,
          borderWidth: 1,
          borderColor: 'rgba(255,255,255,0.15)',
          backgroundColor: 'rgba(255,255,255,0.06)',
        },
        ctaText: { fontFamily: 'CalSans-SemiBold', color: '#F3EDE7', fontSize: scale(15) },
      }),
    [scale, verticalScale],
  );

  return (
    <View style={styles.container}>
      <LinearGradient colors={['rgba(20,16,36,1)', 'rgba(10,9,18,1)']} style={StyleSheet.absoluteFill} />
      <Text style={styles.title}>Account backup is coming soon.</Text>
      <Text style={styles.body}>
        Your dream journal stays private and on this device for now. We're building secure backup so it
        travels with you. We'll let you know the moment it's ready.
      </Text>
      <TouchableOpacity style={styles.cta} onPress={() => navigation.goBack()} accessibilityRole="button">
        <Text style={styles.ctaText}>Back to Journal</Text>
      </TouchableOpacity>
    </View>
  );
}
