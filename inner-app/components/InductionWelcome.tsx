import React, { useEffect, useRef } from 'react';
import { Animated, Easing, Image, ImageSourcePropType, Pressable, StyleSheet, Text, View } from 'react-native';

type Props = {
  /** Home's own orb, drawn again over the dark so it stands in the same place it does underneath. */
  orbSource: ImageSourcePropType;
  orbLeft: number;
  orbTop: number;
  orbSize: number;
  topInset: number;
  bottomInset: number;
  onListen: () => void;
  onSkip: () => void;
};

/**
 * The first welcome: a dark veil over Home, the orb in its place, and an offer of The Induction. It never starts
 * audio itself; Listen is a choice, and Skip leaves the Induction waiting as a card on Home.
 */
export default function InductionWelcome({ orbSource, orbLeft, orbTop, orbSize, topInset, bottomInset, onListen, onSkip }: Props) {
  const fade = useRef(new Animated.Value(0)).current;
  const breathe = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(fade, { toValue: 1, duration: 900, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(breathe, { toValue: 1, duration: 4200, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(breathe, { toValue: 0, duration: 4200, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [fade, breathe]);

  const orbScale = breathe.interpolate({ inputRange: [0, 1], outputRange: [0.97, 1.03] });

  return (
    <Animated.View style={[styles.veil, { opacity: fade }]} accessibilityViewIsModal>
      <View style={[styles.copy, { paddingTop: topInset + 36 }]}>
        <Text style={styles.title} accessibilityRole="header">Welcome to Inner</Text>
        <Text style={styles.body}>
          If you're unsure where to begin, a good starting point is The Induction: six minutes that show what Inner is about.
        </Text>
        <Text style={styles.hint}>Headphones are suggested for the best experience, but they're optional.</Text>
      </View>

      <Animated.Image
        source={orbSource}
        resizeMode="contain"
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={{
          position: 'absolute',
          left: orbLeft,
          top: orbTop,
          width: orbSize,
          height: orbSize,
          transform: [{ scale: orbScale }],
        }}
      />

      <View style={[styles.actions, { paddingBottom: bottomInset + 40 }]}>
        <Pressable
          onPress={onListen}
          accessibilityRole="button"
          accessibilityLabel="Listen to The Induction"
          style={({ pressed }) => [styles.listen, pressed && styles.listenPressed]}
        >
          <Text style={styles.listenText}>Listen</Text>
        </Pressable>
        <Pressable
          onPress={onSkip}
          accessibilityRole="button"
          accessibilityLabel="Skip for now"
          hitSlop={12}
          style={styles.skip}
        >
          <Text style={styles.skipText}>Skip</Text>
        </Pressable>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  veil: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.82)',
    zIndex: 400,
    elevation: 400,
    justifyContent: 'space-between',
  },
  copy: { paddingHorizontal: 32, alignItems: 'center' },
  title: { color: '#F2EDF9', fontFamily: 'CalSans-SemiBold', fontSize: 26, textAlign: 'center' },
  body: { color: '#DCD5F0', fontFamily: 'Inter-ExtraLight', fontSize: 15, lineHeight: 23, textAlign: 'center', marginTop: 14 },
  hint: { color: 'rgba(207,195,224,0.72)', fontFamily: 'Inter-ExtraLight', fontSize: 12, lineHeight: 18, textAlign: 'center', marginTop: 12 },
  actions: { alignItems: 'center' },
  listen: {
    minWidth: 180,
    paddingVertical: 14,
    paddingHorizontal: 36,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(205,194,255,0.45)',
    backgroundColor: 'rgba(205,194,255,0.14)',
    alignItems: 'center',
  },
  listenPressed: { backgroundColor: 'rgba(205,194,255,0.26)' },
  listenText: { color: '#F2EDF9', fontFamily: 'Inter-Medium', fontSize: 14, letterSpacing: 1.6 },
  skip: { paddingVertical: 14, paddingHorizontal: 24, marginTop: 6 },
  skipText: { color: 'rgba(207,195,224,0.78)', fontFamily: 'Inter-ExtraLight', fontSize: 14 },
});
