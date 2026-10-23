// core/onboardingPrefs.ts
import AsyncStorage from '@react-native-async-storage/async-storage';

const PRIMARY_GOAL_KEY = 'inner.onboarding.primaryGoal.v1';
const ACCOUNT_PROMPT_SEEN_KEY = 'inner.onboarding.accountPromptSeen.v1';

export type PrimaryGoal = 'lucid_dreaming' | 'obe' | 'deep_focus';

// Intention keys that map onto a paywall goal. 'reawakening' and 'clarity' are
// the stored keys behind the OBE and Focus options.
const GOAL_FROM_INTENTION: Record<string, PrimaryGoal> = {
  lucidity: 'lucid_dreaming',
  reawakening: 'obe',
  clarity: 'deep_focus',
};

/** Personalizes the paywall from the first intention that maps to a goal; clears it otherwise. */
export async function syncPrimaryGoalFromIntentions(intentions: string[]) {
  const goal = intentions.map(k => GOAL_FROM_INTENTION[k]).find(Boolean);
  try {
    if (goal) await AsyncStorage.setItem(PRIMARY_GOAL_KEY, goal);
    else await AsyncStorage.removeItem(PRIMARY_GOAL_KEY);
  } catch {}
}

export async function getPrimaryGoal(): Promise<PrimaryGoal | null> {
  try { return (await AsyncStorage.getItem(PRIMARY_GOAL_KEY)) as PrimaryGoal | null; } catch { return null; }
}

export async function hasSeenAccountPrompt(): Promise<boolean> {
  try { return (await AsyncStorage.getItem(ACCOUNT_PROMPT_SEEN_KEY)) === 'true'; } catch { return false; }
}

export async function markAccountPromptSeen() {
  try { await AsyncStorage.setItem(ACCOUNT_PROMPT_SEEN_KEY, 'true'); } catch {}
}
