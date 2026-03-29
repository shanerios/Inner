import { useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const DEBUG_SLEEP_TIMER = false;

export const SLEEP_TIMER_END_KEY = 'inner_sleep_timer_end_ms';

export function useSleepTimer(minutes: number | null) {
  useEffect(() => {
    if (!minutes) {
      if (DEBUG_SLEEP_TIMER) {
        console.log('[SleepTimerHook] clearing timer because minutes =', minutes);
      }
      void AsyncStorage.removeItem(SLEEP_TIMER_END_KEY);
      return;
    }

    const endTime = Date.now() + minutes * 60 * 1000;
    if (DEBUG_SLEEP_TIMER) {
      console.log('[SleepTimerHook] setting timer minutes =', minutes, 'endTime =', endTime);
    }

    void (async () => {
      await AsyncStorage.setItem(SLEEP_TIMER_END_KEY, String(endTime));
      if (DEBUG_SLEEP_TIMER) {
        const verify = await AsyncStorage.getItem(SLEEP_TIMER_END_KEY);
        console.log('[SleepTimerHook] persisted key =', SLEEP_TIMER_END_KEY, 'verify =', verify);
      }
    })();
  }, [minutes]);
}
