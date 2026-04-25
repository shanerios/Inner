// hooks/useReviewScore.ts
import { useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const REVIEW_SCORE_KEY = 'review_score';
const REVIEW_PROMPT_DATE_KEY = 'last_review_prompt_date';
const REVIEW_PROMPT_COUNT_KEY = 'review_prompt_count';

const SCORE_THRESHOLD = 6;
const MAX_PROMPTS = 3;
const COOLDOWN_DAYS = 7;

// Standalone — safe to call from any component or effect
export async function addReviewScore(points: number): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(REVIEW_SCORE_KEY);
    const current = parseInt(raw ?? '0', 10) || 0;
    await AsyncStorage.setItem(REVIEW_SCORE_KEY, String(current + points));
  } catch {
    // non-fatal
  }
}

export function useReviewScore() {
  // Evaluates all gate conditions. Returns true and records the show if eligible.
  const checkAndPrompt = useCallback(async (): Promise<boolean> => {
    try {
      const countRaw = await AsyncStorage.getItem(REVIEW_PROMPT_COUNT_KEY);
      const count = parseInt(countRaw ?? '0', 10) || 0;
      if (count >= MAX_PROMPTS) return false;

      const lastDateRaw = await AsyncStorage.getItem(REVIEW_PROMPT_DATE_KEY);
      if (lastDateRaw) {
        const lastDate = parseInt(lastDateRaw, 10) || 0;
        const daysSince = (Date.now() - lastDate) / (1000 * 60 * 60 * 24);
        if (daysSince < COOLDOWN_DAYS) return false;
      }

      const scoreRaw = await AsyncStorage.getItem(REVIEW_SCORE_KEY);
      const score = parseInt(scoreRaw ?? '0', 10) || 0;
      if (score < SCORE_THRESHOLD) return false;

      // Record show: store date, bump count, reset score
      await AsyncStorage.multiSet([
        [REVIEW_PROMPT_DATE_KEY, String(Date.now())],
        [REVIEW_PROMPT_COUNT_KEY, String(count + 1)],
        [REVIEW_SCORE_KEY, '0'],
      ]);

      return true;
    } catch {
      return false;
    }
  }, []);

  return { checkAndPrompt };
}
