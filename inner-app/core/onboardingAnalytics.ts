import AsyncStorage from '@react-native-async-storage/async-storage';
import { track } from './analytics';

const STARTED_KEY = 'inner.analytics.onboardingStartedAt';
const DONE_KEY = 'inner.analytics.onboardingCompleted';

/**
 * Onboarding funnel markers. `started` is recorded the first time the Intro screen shows on this
 * install; `completed` only fires for an install that recorded a start, so people who onboarded
 * before this existed are never reported as new completions.
 */
export async function trackOnboardingStarted(): Promise<void> {
  try {
    if (await AsyncStorage.getItem(STARTED_KEY)) return;
    await AsyncStorage.setItem(STARTED_KEY, String(Date.now()));
    track('onboarding_started');
  } catch {}
}

export async function trackOnboardingCompletedIfStarted(): Promise<void> {
  try {
    const [startedRaw, done] = await Promise.all([
      AsyncStorage.getItem(STARTED_KEY),
      AsyncStorage.getItem(DONE_KEY),
    ]);
    if (!startedRaw || done) return;
    await AsyncStorage.setItem(DONE_KEY, '1');
    const startedAt = parseInt(startedRaw, 10);
    track('onboarding_completed', {
      duration_s: Number.isFinite(startedAt) ? Math.max(0, Math.round((Date.now() - startedAt) / 1000)) : undefined,
    });
  } catch {}
}
