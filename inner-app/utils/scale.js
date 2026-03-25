import { useMemo } from 'react';
import { useWindowDimensions } from 'react-native';

/** Design reference: iPhone 15 Pro logical width (pt) */
export const BASE_WIDTH = 393;

/** Design reference: iPhone 15 Pro logical height (pt), portrait */
export const BASE_HEIGHT = 852;

/**
 * If the longer logical edge is below this (pt), treat as a short-phone layout (e.g. iPhone SE class).
 * Use {@link getLongestLogicalEdge} so portrait height drives the break — not min(w,h), which is usually width.
 */
export const COMPACT_LAYOUT_MAX_LONG_EDGE = 700;

/** Larger of width/height (stable across orientation for “how tall is this window”). */
export function getLongestLogicalEdge(width, height) {
  return Math.max(width, height);
}

/** True when the window’s longest edge is under {@link COMPACT_LAYOUT_MAX_LONG_EDGE} (e.g. SE vs Pro Max). */
export function matchesCompactLayout(width, height) {
  return getLongestLogicalEdge(width, height) < COMPACT_LAYOUT_MAX_LONG_EDGE;
}

/**
 * Horizontal scale from design width.
 * @param {number} size - value from the 393pt-wide design
 * @param {number} [width=BASE_WIDTH] - pass `useWindowDimensions().width` for live layout
 */
export function scale(size, width = BASE_WIDTH) {
  return (width / BASE_WIDTH) * size;
}

/**
 * Vertical scale from design height.
 * @param {number} size - value from the design at BASE_HEIGHT
 * @param {number} [height=BASE_HEIGHT] - pass `useWindowDimensions().height` for live layout
 */
export function verticalScale(size, height = BASE_HEIGHT) {
  return (height / BASE_HEIGHT) * size;
}

/**
 * Between `size` and fully width-scaled: dampens horizontal scaling.
 * @param {number} size
 * @param {number} [factor=0.5] - 0 = no scale, 1 = same as scale()
 * @param {number} [width=BASE_WIDTH] - pass `useWindowDimensions().width` for live layout
 */
export function moderateScale(size, factor = 0.5, width = BASE_WIDTH) {
  const scaled = scale(size, width);
  return size + (scaled - size) * factor;
}

/**
 * Binds `scale`, `verticalScale`, and `moderateScale` to the current window from `useWindowDimensions`.
 * Use inside React components; for static snapshots use the plain functions with explicit width/height.
 */
export function useScale() {
  const { width, height } = useWindowDimensions();
  const longestEdge = getLongestLogicalEdge(width, height);
  const matchesCompact = matchesCompactLayout(width, height);

  return useMemo(
    () => ({
      scale: (s) => scale(s, width),
      verticalScale: (s) => verticalScale(s, height),
      moderateScale: (s, f = 0.5) => moderateScale(s, f, width),
      /** Current window width (pt) */
      width,
      /** Current window height (pt) */
      height,
      /** max(width, height) — use for short-phone breakpoints */
      longestEdge,
      /** True when longest edge is below COMPACT_LAYOUT_MAX_LONG_EDGE; combine with !isTablet on full-screen layouts */
      matchesCompactLayout: matchesCompact,
    }),
    [width, height, longestEdge, matchesCompact],
  );
}
