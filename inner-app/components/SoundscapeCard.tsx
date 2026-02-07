// components/SoundscapeCard.tsx
import React from 'react';
import { Pressable, StyleSheet, Text, ViewStyle, Image, ImageSourcePropType, View, Alert } from 'react-native';
import { Animated, Easing } from 'react-native';
const AnimatedPressable = Animated.createAnimatedComponent(Pressable);
import { LinearGradient } from 'expo-linear-gradient';
import { Typography } from '../core/typography';
import { Body as _Body } from '../core/typography';
const Body = _Body ?? ({
  regular: { fontFamily: 'Inter-ExtraLight', fontSize: 14 },
  subtle: { fontFamily: 'Inter-ExtraLight', fontSize: 12 },
} as const);

const LOCK_ICON = require('../assets/images/locked_gate.png');

type Props = {
  label: string;
  colors: string[];               // gradient colors
  onPress?: () => void;
  style?: ViewStyle;
  subtitle?: string;              // optional small descriptor
  sigil?: ImageSourcePropType | React.ReactNode | string; // image, node, or glyph string
  isLocked?: boolean;
  onLockedPress?: () => void;
};

export default function SoundscapeCard({
  label,
  colors,
  onPress,
  style,
  subtitle,
  sigil,
  isLocked,
  onLockedPress,
}: Props) {
  const press = React.useRef(new Animated.Value(0)).current;
  const pulse = React.useRef(new Animated.Value(0)).current;

  React.useEffect(() => {
    let loop: Animated.CompositeAnimation | null = null;

    if (isLocked) {
      loop = Animated.loop(
        Animated.sequence([
          Animated.timing(pulse, {
            toValue: 1,
            duration: 2800,
            easing: Easing.inOut(Easing.quad),
            useNativeDriver: true,
          }),
          Animated.timing(pulse, {
            toValue: 0,
            duration: 2800,
            easing: Easing.inOut(Easing.quad),
            useNativeDriver: true,
          }),
        ])
      );
      loop.start();
    } else {
      pulse.stopAnimation();
      pulse.setValue(0);
    }

    return () => {
      // Stop the loop cleanly on unmount / fast refresh
      try {
        loop?.stop();
      } catch {}
      pulse.stopAnimation();
    };
  }, [isLocked, pulse]);

  const animatedOpacity = press.interpolate({ inputRange: [0, 1], outputRange: [1, 0.93] });
  const combinedOpacity = isLocked ? Animated.multiply(animatedOpacity, 0.9) : animatedOpacity;
  const animatedStyle = {
    transform: [
      {
        scale: press.interpolate({ inputRange: [0, 1], outputRange: [1, 0.98] }),
      },
    ],
    opacity: combinedOpacity,
  } as const;
  const overlayOpacity = press.interpolate({ inputRange: [0, 1], outputRange: [0, 0.12] });

  const pulseScale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.06] });
  const pulseOpacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.85, 1] });

  const handleLockedPress =
    onLockedPress ??
    (() => {
      Alert.alert('Continuing with Inner', 'This soundscape is available with Continuing with Inner.');
    });

  return (
    <AnimatedPressable
      onPress={isLocked ? handleLockedPress : onPress}
      onPressIn={() => {
        if (!isLocked) {
          Animated.timing(press, { toValue: 1, duration: 120, easing: Easing.out(Easing.quad), useNativeDriver: true }).start();
        }
      }}
      onPressOut={() => {
        if (!isLocked) {
          Animated.timing(press, { toValue: 0, duration: 180, easing: Easing.out(Easing.quad), useNativeDriver: true }).start();
        }
      }}
      accessibilityRole="button"
      accessibilityLabel={isLocked ? `${label} (Locked)` : label}
      accessibilityHint={
        isLocked
          ? 'Requires Continuing with Inner. Double tap to learn how to unlock.'
          : undefined
      }
      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      style={[styles.card, style, animatedStyle]}
    >
      <LinearGradient
        colors={[colors[0], colors[1], 'transparent']}
        start={{ x: 0, y: 0.5 }}
        end={{ x: 1, y: 0.5 }}
        style={styles.fill}
      />
      {/* saturation veil (mutes loud gradients) */}
      <Animated.View pointerEvents="none" style={[styles.veil, { opacity: 0.28 }]} />

      {/* inner vignette (edges darker → center clearer) */}
      <LinearGradient
        pointerEvents="none"
        colors={['rgba(0,0,0,0.22)', 'rgba(0,0,0,0.00)', 'rgba(0,0,0,0.22)']}
        locations={[0, 0.5, 1]}
        start={{ x: 0, y: 0.5 }}
        end={{ x: 1, y: 0.5 }}
        style={StyleSheet.absoluteFill}
      />

      {/* bottom lift for text readability */}
      <LinearGradient
        pointerEvents="none"
        colors={['rgba(0,0,0,0.00)', 'rgba(0,0,0,0.22)']}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <LinearGradient
        colors={['rgba(255,255,255,0.05)', 'rgba(255,255,255,0.0)']}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
        style={styles.sheen}
      />
      <Animated.View pointerEvents="none" style={[styles.pressOverlay, { opacity: overlayOpacity }]} />
      {sigil ? (
        <Animated.View pointerEvents="none" style={styles.sigil}>
          {(() => {
            if (typeof sigil === 'string') {
              return <Text style={styles.sigilGlyph}>{sigil}</Text>;
            }
            if (React.isValidElement(sigil)) {
              return sigil;
            }
            // resolve possible { default: number } or direct numeric require
            let imgSource: ImageSourcePropType | null = null;
            if (typeof sigil === 'number') {
              imgSource = sigil as ImageSourcePropType;
            } else if (typeof sigil === 'object' && sigil) {
              const maybeDefault = (sigil as any).default;
              if (typeof maybeDefault === 'number' || (maybeDefault && typeof maybeDefault === 'object' && 'uri' in maybeDefault)) {
                imgSource = maybeDefault as ImageSourcePropType;
              } else if ('uri' in (sigil as any)) {
                imgSource = sigil as ImageSourcePropType;
              }
            }
            return imgSource ? <Image source={imgSource} style={styles.sigilImage} resizeMode="contain" /> : null;
          })()}
        </Animated.View>
      ) : null}
      <Text style={[Typography.title, { color: '#F5F2FB', letterSpacing: 0.4 }]}>{label}</Text>
      {subtitle ? (
        <Text
          style={[
            {
              fontFamily: 'Inter-ExtraLight',
              fontWeight: '200',
              color: '#E4DFEF',
              opacity: 0.85,
              marginTop: 2,
              lineHeight: 18,
            },
          ]}
        >
          {subtitle}
        </Text>
      ) : null}
      {isLocked ? (
        <View style={styles.lockContainer} pointerEvents="none">
          <Animated.Image
            source={LOCK_ICON}
            style={[
              styles.lockIcon,
              {
                transform: [{ scale: pulseScale }],
                opacity: pulseOpacity,
              },
            ]}
            resizeMode="contain"
          />
        </View>
      ) : null}
    </AnimatedPressable>
  );
}

const styles = StyleSheet.create({
  card: {
    height: 96,
    borderRadius: 18,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    justifyContent: 'flex-end',
    padding: 16,
  },
  fill: {
    ...StyleSheet.absoluteFillObject,
    // faint inner life (very subtle)
    opacity: 0.90,
  },
  veil: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,1)',
  },
  sheen: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 36,
    pointerEvents: 'none',
  },
  pressOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#FFFFFF',
  },
  sigil: {
    position: 'absolute',
    top: '50%',
    right: 20,
    opacity: 0.7,
    transform: [{ translateY: -6 }],
    zIndex: 2,
  },
  sigilGlyph: {
    color: '#EDE8FA',
    fontSize: 28,
    opacity: 0.85,
    textShadowColor: 'rgba(0,0,0,0.35)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  sigilImage: {
    width: 30,
    height: 30,
    opacity: 0.85,
  },
  lockContainer: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    width: 38,
    height: 38,
    marginLeft: -19,
    marginTop: -19,
    backgroundColor: 'rgba(0,0,0,0.22)',
    borderRadius: 19,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 3,
  },
  lockIcon: {
    width: 20,
    height: 20,
  },
});