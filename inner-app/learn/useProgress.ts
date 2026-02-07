// learn/useProgress.ts
import { useEffect, useState } from 'react';
import { getProgressMap, subscribe, type ProgressMap } from './progress';

/**
 * React hook that exposes the current lesson ProgressMap
 * and keeps it in sync with storage updates.
 */
export function useLessonProgressMap(): ProgressMap {
  const [map, setMap] = useState<ProgressMap>(() => getProgressMap());

  useEffect(() => {
    // subscribe will immediately call with a snapshot
    const unsubscribe = subscribe((snap) => {
      setMap(snap);
    });

    return unsubscribe;
  }, []);

  return map;
}