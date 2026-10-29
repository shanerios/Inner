


import { Platform } from 'react-native';

// Typography system for Inner App
// Unified spec for typography tokens

/**
 * Small letter-spacing makes Android size shrink-to-fit text a pixel or two narrower
 * than it is laid out, so the last letter or word wraps out of view (e.g. a chip
 * reading "Wate"). Android therefore gets no tracking; other platforms are unchanged.
 */
export const tracking = (value: number): number => (Platform.OS === 'android' ? 0 : value);

export const Typography = {
  display: {
    fontFamily: 'CalSans-SemiBold',
    fontSize: 22,
    fontWeight: '600' as const,
    lineHeight: 30,
    letterSpacing: tracking(0.2),
    opacity: 0.95,
  },
  title: {
    fontFamily: 'CalSans-SemiBold',
    fontSize: 18,
    fontWeight: '600' as const,
    lineHeight: 26,
    letterSpacing: tracking(0.2),
    opacity: 1.0,
  },
  body: {
    fontFamily: 'CalSans-Regular',
    fontSize: 16,
    fontWeight: '400' as const,
    lineHeight: 24,
    letterSpacing: tracking(0.2),
    opacity: 0.92,
  },
  subtle: {
    fontFamily: 'CalSans-Regular',
    fontSize: 14,
    fontWeight: '400' as const,
    lineHeight: 21,
    letterSpacing: tracking(0.2),
    opacity: 0.85,
  },
  caption: {
    fontFamily: 'CalSans-Regular',
    fontSize: 12,
    fontWeight: '400' as const,
    lineHeight: 18,
    letterSpacing: tracking(0.3),
    opacity: 0.9,
  },
} as const;

// Backward-compatible semantic aliases used throughout the existing screens.
export const Body = {
  regular: Typography.body,
  subtle: Typography.subtle,
} as const;

export const _Body = Body;
