

import React, { createContext, useContext, useEffect, useRef } from 'react';
import { Animated, Easing } from 'react-native';

type BreathCtx = { breath: Animated.Value }; // 0 → exhale, 1 → inhale
const BreathContext = createContext<BreathCtx | null>(null);

export const BreathProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const breath = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // Seamless, symmetric loop matching the Home orb feel
    const easing = Easing.inOut(Easing.sin);
    const up = Animated.timing(breath, { toValue: 1, duration: 5000, easing, useNativeDriver: true });
    const down = Animated.timing(breath, { toValue: 0, duration: 5000, easing, useNativeDriver: true });
    const loop = Animated.loop(Animated.sequence([up, down]), { resetBeforeIteration: false });
    loop.start();
    return () => { try { loop.stop(); } catch {} };
  }, [breath]);

  return <BreathContext.Provider value={{ breath }}>{children}</BreathContext.Provider>;
};

export function useBreath(): Animated.Value {
  const ctx = useContext(BreathContext);
  if (!ctx) {
    throw new Error('useBreath must be used within <BreathProvider>');
  }
  return ctx.breath;
}