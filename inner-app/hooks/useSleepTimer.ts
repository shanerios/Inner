import { useEffect, useRef } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import TrackPlayer from 'react-native-track-player';

const FADE_DURATION_MS = 6000;
const FADE_STEPS = 12;
/** Past target by this much → assume timers were throttled in background; stop without a long fade. */
const LATE_SKIP_FADE_MS = 1500;

export function useSleepTimer(minutes: number | null) {
  const endTimeRef = useRef<number | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const firedRef = useRef(false);

  useEffect(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }

    if (!minutes) {
      endTimeRef.current = null;
      firedRef.current = false;
      return;
    }

    firedRef.current = false;
    endTimeRef.current = Date.now() + minutes * 60 * 1000;

    const clearTimer = () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    };

    const fadeAndPause = async () => {
      const fadeDuration = FADE_DURATION_MS;
      const steps = FADE_STEPS;
      const stepDelay = fadeDuration / steps;

      for (let i = 1; i <= steps; i++) {
        const v = 1 - i / steps;
        await TrackPlayer.setVolume(v);
        await new Promise(r => setTimeout(r, stepDelay));
      }

      await TrackPlayer.pause();
      await TrackPlayer.setVolume(1);
    };

    const runEnd = async () => {
      if (firedRef.current) return;
      firedRef.current = true;

      const end = endTimeRef.current;
      endTimeRef.current = null;
      clearTimer();

      const lateMs = end != null ? Date.now() - end : 0;
      const skipFade = lateMs > LATE_SKIP_FADE_MS;

      try {
        if (skipFade) {
          await TrackPlayer.pause();
          await TrackPlayer.setVolume(1);
          return;
        }
        await fadeAndPause();
      } catch {
        // best-effort: still try to restore volume
        try {
          await TrackPlayer.setVolume(1);
        } catch {}
      }
    };

    const scheduleFromEndTime = () => {
      if (firedRef.current || !endTimeRef.current) return;
      const remaining = endTimeRef.current - Date.now();
      if (remaining <= 0) {
        void runEnd();
        return;
      }
      clearTimer();
      timeoutRef.current = setTimeout(() => {
        timeoutRef.current = null;
        void runEnd();
      }, remaining);
    };

    scheduleFromEndTime();

    const onAppState = (next: AppStateStatus) => {
      if (next !== 'active') return;
      if (firedRef.current || !endTimeRef.current) return;
      if (Date.now() >= endTimeRef.current) {
        void runEnd();
      } else {
        scheduleFromEndTime();
      }
    };

    const sub = AppState.addEventListener('change', onAppState);

    return () => {
      sub.remove();
      clearTimer();
    };
  }, [minutes]);
}
