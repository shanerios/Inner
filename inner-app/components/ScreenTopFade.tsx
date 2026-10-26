import React from 'react';
import { Platform, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

/**
 * How far the fade reaches below the point where scrolling content starts, so
 * the first items are already part-faded when they meet the title block.
 */
export const TOP_FADE_OVERLAP = Platform.OS === 'android' ? 20 : 25;

/** Gap between the bottom of a title block and where its scrolling content starts. */
export const TITLE_CONTENT_GAP = 32;

/**
 * The dark fade that lets a scrolling list pass behind a fixed title block
 * without clashing with it. Overnight Journey's fade, with its two edges made
 * explicit: it is solid down to `solid` (the bottom of everything in the title
 * block, including any button) and has cleared by `end`. Place it after the
 * scrolling content and give the title block a higher zIndex than `zIndex`.
 */
export default function ScreenTopFade({ solid, end, zIndex = 2 }: { solid: number; end: number; zIndex?: number }) {
  const height = Math.max(end, solid + 8);
  return (
    <LinearGradient
      colors={['rgba(2,4,11,0.98)', 'rgba(2,4,11,0.9)', 'rgba(2,4,11,0)']}
      locations={[0, Math.min(0.95, solid / height), 1]}
      pointerEvents="none"
      style={[styles.fade, { height, zIndex }]}
    />
  );
}

const styles = StyleSheet.create({
  fade: { position: 'absolute', top: 0, left: 0, right: 0 },
});
