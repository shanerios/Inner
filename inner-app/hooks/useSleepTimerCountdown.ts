import { useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SLEEP_TIMER_END_KEY } from '../hooks/useSleepTimer';

function formatRemaining(ms: number) {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

export function useSleepTimerCountdown() {
  const [remainingMs, setRemainingMs] = useState<number | null>(null);

  useEffect(() => {
    let mounted = true;
    let interval: ReturnType<typeof setInterval> | null = null;

    const sync = async () => {
      const raw = await AsyncStorage.getItem(SLEEP_TIMER_END_KEY);
      if (!mounted) return;

      if (!raw) {
        setRemainingMs(null);
        return;
      }

      const endMs = Number(raw);
      if (!Number.isFinite(endMs) || endMs <= 0) {
        setRemainingMs(null);
        return;
      }

      const remaining = endMs - Date.now();
      setRemainingMs(remaining > 0 ? remaining : null);
    };

    void sync();

    interval = setInterval(() => {
      void sync();
    }, 1000);

    return () => {
      mounted = false;
      if (interval) clearInterval(interval);
    };
  }, []);

  return {
    remainingMs,
    countdownLabel: remainingMs != null ? formatRemaining(remainingMs) : null,
    isActive: remainingMs != null,
  };
}