import React from 'react';
import { Platform, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

/**
 * How far the fade reaches below the point where scrolling content starts, so
 * the first items are already half-faded when they meet the title block.
 */
export const TOP_FADE_OVERLAP = Platform.OS === 'android' ? 20 : 25;

/**
 * The dark fade that lets a scrolling list pass behind a fixed title and
 * subtitle without clashing with them. It is the one Overnight Journey uses:
 * place it after the scrolling content, give the title a higher zIndex than
 * `zIndex`, and pass the height at which the content starts plus the overlap.
 */
export default function ScreenTopFade({ height, zIndex = 2 }: { height: number; zIndex?: number }) {
  return (
    <LinearGradient
      colors={['rgba(2,4,11,0.98)', 'rgba(2,4,11,0.9)', 'rgba(2,4,11,0)']}
      locations={[0, 0.72, 1]}
      pointerEvents="none"
      style={[styles.fade, { height, zIndex }]}
    />
  );
}

const styles = StyleSheet.create({
  fade: { position: 'absolute', top: 0, left: 0, right: 0 },
});
