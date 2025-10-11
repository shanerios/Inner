// components/SoundscapeCard.tsx
import React from 'react';
import { Pressable, StyleSheet, Text, ViewStyle, Image, ImageSourcePropType } from 'react-native';
import { Animated, Easing } from 'react-native';
const AnimatedPressable = Animated.createAnimatedComponent(Pressable);
import { LinearGradient } from 'expo-linear-gradient';

type Props = {
  label: string;
  colors: string[];               // gradient colors
  onPress?: () => void;
  style?: ViewStyle;
  subtitle?: string;              // optional small descriptor
  sigil?: ImageSourcePropType | React.ReactNode | string; // image, node, or glyph string
};

export default function SoundscapeCard({
  label,
  colors,
  onPress,
  style,
  subtitle,
  sigil,
}: Props) {
  const press = React.useRef(new Animated.Value(0)).current;
  const animatedStyle = {
    transform: [
      {
        scale: press.interpolate({ inputRange: [0, 1], outputRange: [1, 0.98] }),
      },
    ],
  } as const;
  const overlayOpacity = press.interpolate({ inputRange: [0, 1], outputRange: [0, 0.12] });
  return (
    <AnimatedPressable
      onPress={onPress}
      onPressIn={() => {
        Animated.timing(press, { toValue: 1, duration: 120, easing: Easing.out(Easing.quad), useNativeDriver: true }).start();
      }}
      onPressOut={() => {
        Animated.timing(press, { toValue: 0, duration: 180, easing: Easing.out(Easing.quad), useNativeDriver: true }).start();
      }}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      style={[styles.card, style, animatedStyle]}
    >
      <LinearGradient
        colors={[colors[0], colors[1], 'transparent']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={styles.fill}
      />
      <LinearGradient
        colors={['rgba(255,255,255,0.08)', 'rgba(255,255,255,0.0)']}
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
            return imgSource ? (
              <Image source={imgSource} style={styles.sigilImage} resizeMode="contain" />
            ) : null;
          })()}
        </Animated.View>
      ) : null}
      <Text style={styles.label}>{label}</Text>
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
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
    opacity: 0.96,
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
  label: {
    color: '#F5F2FB',
    fontWeight: '700',
    fontSize: 18,
    letterSpacing: 0.4,
  },
  subtitle: {
    color: '#E4DFEF',
    opacity: 0.8,
    marginTop: 2,
    fontSize: 12,
  },
  sigil: {
    position: 'absolute',
    top: '50%',
    right: 20,
    opacity: 0.8,
    transform: [{ translateY: -6 }], // half of 36px height to truly center
    zIndex: 2,
  },
  sigilGlyph: {
    color: '#EDE8FA',
    fontSize: 28,
    opacity: 0.9,
  },
  sigilImage: {
    width: 30,
    height: 30,
    opacity: 0.9,
  },
});