// core/onboardingPrefs.ts
import AsyncStorage from '@react-native-async-storage/async-storage';

const PRIMARY_GOAL_KEY = 'inner.onboarding.primaryGoal.v1';
const DREAM_RECALL_KEY = 'inner.onboarding.dreamRecall.v1';
const VALUE_CAPTURE_COMPLETE_KEY = 'inner.onboarding.valueCaptureComplete.v1';
const VALUE_HOOK_SEEN_KEY = 'inner.onboarding.valueHookSeen.v1';
const ACCOUNT_PROMPT_SEEN_KEY = 'inner.onboarding.accountPromptSeen.v1';

export type PrimaryGoal = 'lucid_dreaming' | 'obe' | 'deep_focus';
export type DreamRecallFrequency = 'rarely' | 'sometimes' | 'often' | 'every_night';

export async function setPrimaryGoal(goal: PrimaryGoal) {
  try { await AsyncStorage.setItem(PRIMARY_GOAL_KEY, goal); } catch {}
}

export async function getPrimaryGoal(): Promise<PrimaryGoal | null> {
  try { return (await AsyncStorage.getItem(PRIMARY_GOAL_KEY)) as PrimaryGoal | null; } catch { return null; }
}

export async function setDreamRecallFrequency(freq: DreamRecallFrequency) {
  try { await AsyncStorage.setItem(DREAM_RECALL_KEY, freq); } catch {}
}

export async function getDreamRecallFrequency(): Promise<DreamRecallFrequency | null> {
  try { return (await AsyncStorage.getItem(DREAM_RECALL_KEY)) as DreamRecallFrequency | null; } catch { return null; }
}

/** Set once both questionnaire answers are captured — gates the survey to first use only. */
export async function markValueCaptureComplete() {
  try { await AsyncStorage.setItem(VALUE_CAPTURE_COMPLETE_KEY, 'true'); } catch {}
}

export async function hasCompletedValueCapture(): Promise<boolean> {
  try { return (await AsyncStorage.getItem(VALUE_CAPTURE_COMPLETE_KEY)) === 'true'; } catch { return false; }
}

export async function markValueHookSeen() {
  try { await AsyncStorage.setItem(VALUE_HOOK_SEEN_KEY, 'true'); } catch {}
}

export async function hasSeenValueHook(): Promise<boolean> {
  try { return (await AsyncStorage.getItem(VALUE_HOOK_SEEN_KEY)) === 'true'; } catch { return false; }
}

export async function hasSeenAccountPrompt(): Promise<boolean> {
  try { return (await AsyncStorage.getItem(ACCOUNT_PROMPT_SEEN_KEY)) === 'true'; } catch { return false; }
}

export async function markAccountPromptSeen() {
  try { await AsyncStorage.setItem(ACCOUNT_PROMPT_SEEN_KEY, 'true'); } catch {}
}
