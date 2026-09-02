import AsyncStorage from '@react-native-async-storage/async-storage';
import Purchases from 'react-native-purchases';

// Free users get FREE_AERIS_DAYS distinct calendar days of Aeris conversation
// before being asked to subscribe. A "day" (not a message count) matches how
// Aeris already resets its own chat history daily — see AerisScreen.tsx.
export const FREE_AERIS_DAYS = 3;

const USAGE_DATES_KEY = 'aerisUsageDates';

function todayKey(): string {
  return new Date().toISOString().split('T')[0];
}

async function getUsageDates(): Promise<string[]> {
  try {
    const raw = await AsyncStorage.getItem(USAGE_DATES_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/** Distinct calendar days the user has chatted with Aeris (client-tracked, resettable on reinstall). */
export async function getAerisDaysUsed(): Promise<number> {
  return (await getUsageDates()).length;
}

/**
 * True when the user should be paywalled before starting/continuing Aeris.
 * A day already in progress is never gated mid-way — only a *new* day beyond
 * the free allowance is blocked, so nobody gets cut off mid-conversation.
 */
export async function isAerisLimitReached(): Promise<boolean> {
  const dates = await getUsageDates();
  if (dates.includes(todayKey())) return false;
  return dates.length >= FREE_AERIS_DAYS;
}

/** Marks today as a used day, if it isn't already recorded. Idempotent. */
export async function recordAerisUsageToday(): Promise<void> {
  const dates = await getUsageDates();
  const today = todayKey();
  if (dates.includes(today)) return;
  try {
    await AsyncStorage.setItem(USAGE_DATES_KEY, JSON.stringify([...dates, today]));
  } catch {}
}

/**
 * RevenueCat's anonymous app user id — stable across app restarts on this
 * device/install. Forwarded to the Aeris backend so a future server-side
 * gate can key off the same identifier the client already uses.
 */
export async function getAerisUserId(): Promise<string | null> {
  try {
    return await Purchases.getAppUserID();
  } catch {
    return null;
  }
}
