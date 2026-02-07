import { useEffect } from 'react';
import TrackPlayer from 'react-native-track-player';

export function useSleepTimer(minutes: number | null) {
  useEffect(() => {
    if (!minutes) return;

    const fadeAndPause = async () => {
      const fadeDuration = 6000; // 6 seconds fade-out
      const steps = 12;
      const stepDelay = fadeDuration / steps;

      for (let i = 1; i <= steps; i++) {
        const v = 1 - i / steps;
        await TrackPlayer.setVolume(v);
        await new Promise(r => setTimeout(r, stepDelay));
      }

      await TrackPlayer.pause();
      await TrackPlayer.setVolume(1); // restore for next play
    };

    const timeout = setTimeout(fadeAndPause, minutes * 60 * 1000);

    return () => clearTimeout(timeout);
  }, [minutes]);
}