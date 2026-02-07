import { useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { Asset } from 'expo-asset';
import { moonPhaseFor } from '../utils/lunar';
import { orbMoonImages } from '../src/ui/orbMoonImages';

type Options = {
  minIntervalMs?: number; // min idle time between whispers
  maxIntervalMs?: number; // max idle time between whispers
  showDurationMs?: number; // how long the moon stays visible
  enabled?: boolean;
  defaultSrc: any; // require('…/orb-default.webp')
};

export function useLunarWhisper({
  minIntervalMs = 30_000,
  maxIntervalMs = 90_000,
  showDurationMs = 2_000,
  enabled = true,
  defaultSrc,
}: Options) {
  const phase = useMemo(() => moonPhaseFor(new Date()), []);
  const moonSrc = orbMoonImages[phase];

  // preload both sprites to avoid first-frame pop
  useEffect(() => {
    try {
      const a1 = Asset.fromModule(defaultSrc);
      const a2 = Asset.fromModule(moonSrc as any);
      if (!a1.downloaded) a1.downloadAsync();
      if (!a2.downloaded) a2.downloadAsync();
    } catch {}
  }, [defaultSrc, moonSrc]);

  const [showMoon, setShowMoon] = useState(false);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const aliveRef = useRef(true);

  // pause whispering when app backgrounded
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => {
      if (s !== 'active') {
        setShowMoon(false);
        if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
      } else {
        startLoop();
      }
    });
    return () => { try { sub.remove(); } catch {} };
  }, []);

  function startLoop() {
    if (!enabled) return;
    if (!aliveRef.current) return;
    if (timerRef.current) return;
    const wait = () => minIntervalMs + Math.floor(Math.random() * (maxIntervalMs - minIntervalMs));
    const tick = () => {
      timerRef.current = setTimeout(() => {
        if (!aliveRef.current) return;
        setShowMoon(true);
        setTimeout(() => {
          setShowMoon(false);
          timerRef.current = null;
          if (aliveRef.current) tick(); // schedule next
        }, showDurationMs);
      }, wait());
    };
    tick();
  }

  useEffect(() => {
    aliveRef.current = true;
    if (enabled) startLoop();
    return () => {
      aliveRef.current = false;
      if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
    };
  }, [enabled]);

  const currentSrc = showMoon ? moonSrc : defaultSrc;
  return { currentSrc, phase, showMoon };
}