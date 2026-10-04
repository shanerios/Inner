import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

type Props = {
  visible: boolean;
  onOpen: () => void;
  onDismiss: () => void;
};

export default function MorningReturnCard({ visible, onOpen, onDismiss }: Props) {
  if (!visible) return null;

  return (
    <View pointerEvents="box-none" style={styles.positioner}>
      <View style={styles.card}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Continue your Morning Return"
          accessibilityHint="Opens the reflection for your recent night"
          onPress={onOpen}
          style={({ pressed }) => [styles.openArea, pressed && styles.pressed]}
        >
          <View style={styles.signal} />
          <View style={styles.copy}>
            <Text style={styles.eyebrow}>MORNING RETURN</Text>
            <Text style={styles.title}>What stayed with you?</Text>
            <Text style={styles.body}>Capture the dream before it fades.</Text>
          </View>
          <Text style={styles.openLabel}>Reflect</Text>
        </Pressable>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Hide Morning Return until next time"
          onPress={onDismiss}
          hitSlop={12}
          style={({ pressed }) => [styles.dismiss, pressed && styles.pressed]}
        >
          <Text style={styles.dismissText}>×</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  positioner: {
    width: '100%',
    alignItems: 'center',
  },
  card: {
    width: '100%',
    maxWidth: 430,
    overflow: 'hidden',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    backgroundColor: 'rgba(207,195,224,0.16)',
  },
  openArea: {
    minHeight: 82,
    paddingLeft: 18,
    paddingRight: 64,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
  },
  signal: {
    width: 9,
    height: 9,
    borderRadius: 5,
    marginRight: 13,
    backgroundColor: 'rgba(208,187,255,0.92)',
    shadowColor: '#CDB6FF',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.9,
    shadowRadius: 8,
  },
  copy: {
    flex: 1,
  },
  eyebrow: {
    color: 'rgba(210,194,244,0.72)',
    fontFamily: 'Inter-ExtraLight',
    fontSize: 9,
    letterSpacing: 1.7,
    marginBottom: 3,
  },
  title: {
    color: 'rgba(250,247,255,0.96)',
    fontFamily: 'CalSans-SemiBold',
    fontSize: 15,
    marginBottom: 2,
  },
  body: {
    color: 'rgba(228,222,240,0.66)',
    fontFamily: 'Inter-ExtraLight',
    fontSize: 12,
  },
  openLabel: {
    color: 'rgba(221,206,255,0.92)',
    fontFamily: 'Inter-Regular',
    fontSize: 12,
    marginLeft: 12,
  },
  dismiss: {
    position: 'absolute',
    right: 8,
    top: 8,
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dismissText: {
    color: 'rgba(238,232,248,0.58)',
    fontFamily: 'Inter-ExtraLight',
    fontSize: 24,
    lineHeight: 26,
  },
  pressed: {
    opacity: 0.72,
  },
});
