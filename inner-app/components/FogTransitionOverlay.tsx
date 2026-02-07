// components/FogTransitionOverlay.tsx
import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Image, Easing, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type Props = {
  visible: boolean;
  onHidden?: () => void;
  tint?: string;
  skipFadeIn?: boolean;
  startOpacity?: number;
  sealBoost?: number;
};

export default function FogTransitionOverlay({ visible, onHidden, tint, skipFadeIn, startOpacity }: Props) {
  const insets = useSafeAreaInsets();
  const { height, width } = useWindowDimensions();
  const isLargeScreen = Math.max(width, height) >= 900; // rough iPad / tablet threshold
  const initialOpacity = (visible && skipFadeIn) ? (startOpacity ?? 1) : 0;
  const opacity = useRef(new Animated.Value(initialOpacity)).current;
  const sealOpacity = opacity.interpolate({
    inputRange: [0, 0.8, 1],
    outputRange: [0, 0.08, 0.12],
    extrapolate: 'clamp',
  });

  useEffect(() => {
    if (visible) {
      if (skipFadeIn) {
        opacity.setValue(startOpacity ?? 0.9);
      } else {
        Animated.sequence([
          Animated.timing(opacity, {
            toValue: 1,
            duration: 1800,
            easing: Easing.inOut(Easing.cubic),
            useNativeDriver: true,
          }),
          Animated.delay(600), // hold fog fully visible
          Animated.timing(opacity, {
            toValue: 0,
            duration: 1800,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
          }),
        ]).start(({ finished }) => finished && onHidden?.());
      }
    } else {
      Animated.timing(opacity, {
        toValue: 0,
        duration: 1800,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start(({ finished }) => finished && onHidden?.());
    }
  }, [visible, skipFadeIn, startOpacity]);

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        isLargeScreen
          ? { position: 'absolute', top: 0, left: 0, width, height }
          : StyleSheet.absoluteFillObject,
        styles.overlay,
        { opacity },
      ]}
    >
      {/* optional brand tint to unify with palette */}
      {!!tint && <Animated.View style={[StyleSheet.absoluteFillObject, { backgroundColor: tint, opacity: 0.12 }]} />}
      <Animated.View
        pointerEvents="none"
        style={[StyleSheet.absoluteFillObject, { backgroundColor: '#000', opacity: sealOpacity }]}
      />
      <Animated.Image
        source={require('../assets/fx/fog.webp')}
        resizeMode="cover"
        style={[
          isLargeScreen
            ? { position: 'absolute', top: 0, left: 0, width, height }
            : StyleSheet.absoluteFillObject,
        ]}
        fadeDuration={0}
      />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    zIndex: 9999,
    elevation: 9999,
  },
});