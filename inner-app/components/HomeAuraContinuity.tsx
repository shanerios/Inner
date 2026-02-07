import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, AppState, View } from 'react-native';
// If your project uses Reanimated v3 API, swap the import to:
// import Animated, { Easing } from 'react-native-reanimated';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect } from '@react-navigation/native';
import { useIntention } from '../core/IntentionProvider';

/**
 * Aura color tokens mapped to the user's intentions.
 * Keep alphas low; this layer sits above the background and below UI.
 */
const INTENTION_AURA: Record<string, string> = {
  calm: 'rgba(123,209,200,0.08)',
  clarity: 'rgba(255,201,121,0.08)',
  reawakening: 'rgba(197,155,255,0.08)',
  grounding: 'rgba(167,139,109,0.06)',
  expansion: 'rgba(155,167,255,0.08)',
  healing: 'rgba(255,157,182,0.08)',
};

const NEUTRAL_AURA = 'rgba(185,176,235,0.06)';
const STORAGE_KEY = 'inner:lastAuraColors';

function mixColors(colors: string[]): string[] {
  if (!colors.length) return [NEUTRAL_AURA];
  if (colors.length === 1) return [colors[0]];
  // Limit to two layers for subtle depth
  return [colors[0], colors[1]];
}

export type HomeAuraContinuityProps = {
  inhaleMs?: number; // fade-in duration
  holdMs?: number;   // hold at peak
  exhaleMs?: number; // fade-out duration
  delayMs?: number;  // small delay after screen focus
  zIndex?: number;   // stacking below UI, above bg
};

export default function HomeAuraContinuity({
  inhaleMs = 1400,
  holdMs = 300,
  exhaleMs = 1400,
  delayMs = 180,
  zIndex = 9,
}: HomeAuraContinuityProps) {
  const { intentions } = useIntention(); // e.g., ['calm','clarity']
  const [loaded, setLoaded] = useState(false);
  const lastAuraRef = useRef<string[]>([]);

  // Resolve current aura layers from intentions
  const nextLayers = useMemo(() => {
    const mapped = (intentions ?? []).map((i) => INTENTION_AURA[i]).filter(Boolean);
    return mixColors(mapped);
  }, [intentions]);

  // Animated drivers for up to two layers (current run)
  const a1 = useRef(new Animated.Value(0)).current;
  const a2 = useRef(new Animated.Value(0)).current;

  // Previous-aura crossfade drivers
  const b1 = useRef(new Animated.Value(0)).current;
  const b2 = useRef(new Animated.Value(0)).current;

  // Load last aura colors (for potential future crossfade)
  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        if (raw) lastAuraRef.current = JSON.parse(raw);
      } catch {}
      setLoaded(true);
    })();
  }, []);

  // Persist the most recent aura after each run
  const persistAura = async (layers: string[]) => {
    try {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(layers));
    } catch {}
  };

  const getPrevLayers = (): string[] => {
    const raw = lastAuraRef.current;
    if (Array.isArray(raw) && raw.length) return raw.slice(0, 2);
    return [];
  };

  const crossfadeFromLast = (crossfadeMs = 900, stagger = 80) => {
    const prev = getPrevLayers();
    // reset
    b1.setValue(0);
    b2.setValue(0);

    if (!prev.length) return; // nothing to fade

    // start at 1, fade to 0 (previous aura dissolves)
    b1.setValue(1);
    Animated.timing(b1, { toValue: 0, duration: crossfadeMs, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();

    if (prev[1]) {
      b2.setValue(1);
      Animated.timing(b2, { toValue: 0, duration: crossfadeMs, easing: Easing.out(Easing.cubic), useNativeDriver: true, delay: stagger }).start();
    }
  };

  const playOneBreath = () => {
    // Reset opacities
    a1.setValue(0);
    a2.setValue(0);

    const easeIn = Easing.out(Easing.cubic);
    const easeOut = Easing.in(Easing.cubic);

    const seq: Animated.CompositeAnimation[] = [];

    // Layer 1
    seq.push(
      Animated.sequence([
        Animated.delay(delayMs),
        Animated.timing(a1, { toValue: 1, duration: inhaleMs, easing: easeIn, useNativeDriver: true }),
        Animated.delay(holdMs),
        Animated.timing(a1, { toValue: 0, duration: exhaleMs, easing: easeOut, useNativeDriver: true }),
      ])
    );

    // Layer 2 (if present), slightly stagger for depth
    if (nextLayers[1]) {
      seq.push(
        Animated.sequence([
          Animated.delay(delayMs + 120),
          Animated.timing(a2, { toValue: 0.8, duration: inhaleMs, easing: easeIn, useNativeDriver: true }),
          Animated.delay(holdMs),
          Animated.timing(a2, { toValue: 0, duration: exhaleMs, easing: easeOut, useNativeDriver: true }),
        ])
      );
    }

    Animated.parallel(seq).start(({ finished }) => {
      if (finished) persistAura(nextLayers);
    });
  };

  // Run on focus (entering Home) and when app returns to foreground
  useFocusEffect(
    React.useCallback(() => {
      if (!loaded) return;
      crossfadeFromLast();
      playOneBreath();
      return undefined;
    }, [loaded, nextLayers.join('|')])
  );

  useEffect(() => {
    if (!loaded) return;
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') {
        crossfadeFromLast();
        playOneBreath();
      }
    });
    return () => sub.remove();
  }, [loaded, nextLayers.join('|')]);

  if (!loaded) return null;

  return (
    <View
      pointerEvents="none"
      style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, zIndex }}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {/* Previous-aura crossfade (dissolve to reveal new state) */}
      {getPrevLayers()[0] ? (
        <Animated.View
          style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, backgroundColor: getPrevLayers()[0], opacity: b1 }}
        />
      ) : null}
      {getPrevLayers()[1] ? (
        <Animated.View
          style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, backgroundColor: getPrevLayers()[1], opacity: b2 }}
        />
      ) : null}

      {/* Current-aura pass (one breath fade-in/out) */}
      <Animated.View
        style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, backgroundColor: nextLayers[0], opacity: a1 }}
      />
      {nextLayers[1] ? (
        <Animated.View
          style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, backgroundColor: nextLayers[1], opacity: a2 }}
        />
      ) : null}
    </View>
  );
}