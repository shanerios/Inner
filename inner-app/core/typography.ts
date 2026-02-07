


// Typography system for Inner App
// Unified spec for typography tokens

export const Typography = {
  display: {
    fontFamily: 'CalSans-SemiBold',
    fontSize: 22,
    fontWeight: '600' as const,
    lineHeight: 30,
    letterSpacing: 0.2,
    opacity: 0.95,
  },
  title: {
    fontFamily: 'CalSans-SemiBold',
    fontSize: 18,
    fontWeight: '600' as const,
    lineHeight: 26,
    letterSpacing: 0.2,
    opacity: 1.0,
  },
  body: {
    fontFamily: 'CalSans-Regular',
    fontSize: 16,
    fontWeight: '400' as const,
    lineHeight: 24,
    letterSpacing: 0.2,
    opacity: 0.92,
  },
  subtle: {
    fontFamily: 'CalSans-Regular',
    fontSize: 14,
    fontWeight: '400' as const,
    lineHeight: 21,
    letterSpacing: 0.2,
    opacity: 0.85,
  },
  caption: {
    fontFamily: 'CalSans-Regular',
    fontSize: 12,
    fontWeight: '400' as const,
    lineHeight: 18,
    letterSpacing: 0.3,
    opacity: 0.9,
  },
} as const;