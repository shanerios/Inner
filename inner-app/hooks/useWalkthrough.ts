// hooks/useWalkthrough.ts
import { useEffect, useState, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_PREFIX = 'inner_walkthrough_seen:';

export function useWalkthrough(key: string) {
  const storageKey = `${STORAGE_PREFIX}${key}`;

  const [loading, setLoading] = useState(true);
  const [seen, setSeen] = useState(false);

  useEffect(() => {
    let mounted = true;

    (async () => {
      try {
        const raw = await AsyncStorage.getItem(storageKey);
        if (!mounted) return;
        setSeen(raw === '1');
      } catch (e) {
        if (!mounted) return;
        setSeen(false);
      } finally {
        if (mounted) setLoading(false);
      }
    })();

    return () => {
      mounted = false;
    };
  }, [storageKey]);

  const markSeen = useCallback(async () => {
    try {
      await AsyncStorage.setItem(storageKey, '1');
    } catch (e) {
      // non-fatal
    }
    setSeen(true);
  }, [storageKey]);

  const reset = useCallback(async () => {
    try {
      await AsyncStorage.removeItem(storageKey);
    } catch (e) {
      // non-fatal
    }
    setSeen(false);
  }, [storageKey]);

  return {
    loading,
    seen,
    shouldShow: !loading && !seen,
    markSeen,
    reset,
  };
}