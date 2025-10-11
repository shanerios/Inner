import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, Animated, Easing, Image } from 'react-native';
import LottieView from 'lottie-react-native';
import { LinearGradient } from 'expo-linear-gradient';

export type OrbPortalProps = {
  size?: number;
  source?: any;     // Lottie JSON (defaults to embedded orb glow)
  imageSource?: any;        // Static orb PNG (when using image + overlay variant)
  speed?: number;   // Lottie playback speed for breathing (default 0.8)
  // Enhancement overlay (adds visible internal purple⇄ember wash on top of Lottie)
  enhance?: boolean;        // default false
  pulseDuration?: number;   // ms for overlay breath (default 9000)
  pulseStrength?: number;   // 0..1 overlay strength baseline (default 0.22)
  overlayScale?: number;    // scales only the breathing overlay (not the PNG/Lottie)
  overlayOffsetX?: number;  // px, nudge overlay horizontally (negative = left)
  overlayOffsetY?: number;  // px, nudge overlay vertically (negative = up)
  breathMin?: number;       // 0..1: minimum overlay opacity at exhale (default 0.18)
  breathMax?: number;       // 0..1: maximum overlay opacity at inhale (default 0.60)
  breathScale?: number;     // 0.002..0.03: amplitude of size breathing (default 0.01)
};

export default function OrbPortal({
  size = 280,
  source,
  imageSource,
  speed = 0.8,
  enhance = false,
  pulseDuration = 9000,
  pulseStrength = 0.22,
  overlayScale = 1.0,
  overlayOffsetX = 0,
  overlayOffsetY = 0,
  breathMin = 0.18,
  breathMax = 0.60,
  breathScale = 0.01,
}: OrbPortalProps) {
  const lottieRef = useRef<LottieView>(null);

  useEffect(() => {
    const t = setTimeout(() => {
      lottieRef.current?.play?.();
    }, 0);
    return () => clearTimeout(t);
  }, []);

  // Internal overlay driver (only used if enhance=true)
  const breath = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!enhance) return;
    const d = Math.max(3000, pulseDuration);
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(breath, { toValue: 1, duration: d / 2, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(breath, { toValue: 0, duration: d / 2, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [enhance, pulseDuration, breath]);

  const scale = breath.interpolate({
    inputRange: [0, 1],
    outputRange: [1 - breathScale, 1 + breathScale],
  });
  const emberOpacity = breath.interpolate({ inputRange: [0, 1], outputRange: [breathMin, breathMax] });
  const purpleOpacity = breath.interpolate({ inputRange: [0, 1], outputRange: [breathMax, breathMin] });

  return (
    <View style={[styles.container, { width: size, height: size }]}>
      {/* Base layer: prefer static orb image if provided; otherwise use Lottie JSON */}
      {imageSource ? (
        <Image
          source={imageSource}
          resizeMode="contain"
          style={{ width: size, height: size }}
        />
      ) : (
        <LottieView
          ref={lottieRef}
          source={source || require('../assets/animations/orb_glow_embedded.json')}
          autoPlay
          loop
          speed={speed}
          style={{ width: size, height: size }}
        />
      )}

      {/* Optional internal breathing color overlay to amplify visibility */}
      {enhance && (
        <>
          <Animated.View
            pointerEvents="none"
            style={{
              ...StyleSheet.absoluteFillObject,
              borderRadius: size / 2,
              transform: [
                { scale },
                { scale: overlayScale },
                { translateX: overlayOffsetX },
                { translateY: overlayOffsetY },
              ],
              opacity: purpleOpacity,
              overflow: 'hidden',
            }}
          >
            <LinearGradient
              colors={[
                'rgba(140,90,220,0.38)',
                'rgba(140,90,220,0.12)',
                'rgba(140,90,220,0.00)'
              ]}
              start={{ x: 0.5, y: 0.35 }}
              end={{ x: 0.5, y: 1.0 }}
              style={StyleSheet.absoluteFillObject}
            />
          </Animated.View>

          <Animated.View
            pointerEvents="none"
            style={{
              ...StyleSheet.absoluteFillObject,
              borderRadius: size / 2,
              transform: [
                { scale },
                { scale: overlayScale },
                { translateX: overlayOffsetX },
                { translateY: overlayOffsetY },
              ],
              opacity: emberOpacity,
              overflow: 'hidden',
            }}
          >
            <LinearGradient
              colors={[
                'rgba(255,140,80,0.35)',
                'rgba(255,140,80,0.10)',
                'rgba(255,140,80,0.00)'
              ]}
              start={{ x: 0.5, y: 0.65 }}
              end={{ x: 0.5, y: 0.0 }}
              style={StyleSheet.absoluteFillObject}
            />
          </Animated.View>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { justifyContent: 'center', alignItems: 'center', borderRadius: 9999, overflow: 'hidden' },
});