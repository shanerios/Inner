// utils/notifications.ts
import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';

const WAKE_NOTIFICATION_ID_KEY = 'wakeNotificationId';

// ── Permission ────────────────────────────────────────────────────────────────

/**
 * Requests push notification permission.
 * Returns true if granted, skips the prompt if already granted.
 */
export async function requestNotificationPermission(): Promise<boolean> {
  try {
    const { status: existing } = await Notifications.getPermissionsAsync();
    if (existing === 'granted') return true;
    const { status } = await Notifications.requestPermissionsAsync();
    return status === 'granted';
  } catch {
    return false;
  }
}

// ── Time parsing ──────────────────────────────────────────────────────────────

/**
 * Parses a wake time string into { hour, minute } (24-hour).
 * Accepts: "7am", "8am", "6:30am", "10:45pm", "12pm", "12am", etc.
 * Returns null if the string cannot be parsed.
 */
function parseWakeTime(timeStr: string): { hour: number; minute: number } | null {
  const clean = timeStr.trim().toLowerCase().replace(/\s+/g, '');
  const match = clean.match(/^(\d{1,2})(?::(\d{2}))?(am|pm)$/);
  if (!match) return null;

  let hour = parseInt(match[1], 10);
  const minute = match[2] ? parseInt(match[2], 10) : 0;
  const meridiem = match[3];

  if (hour < 1 || hour > 12 || minute < 0 || minute > 59) return null;

  if (meridiem === 'am') {
    if (hour === 12) hour = 0; // 12am = midnight
  } else {
    if (hour !== 12) hour += 12; // 1pm–11pm → 13–23; 12pm stays 12
  }

  return { hour, minute };
}

// ── Scheduling ────────────────────────────────────────────────────────────────

/**
 * Cancels any existing wake notification, then schedules a new daily one.
 * wakeTime: time string as stored in AsyncStorage (e.g. "7am", "6:30am").
 * Returns true on success, false if the time string couldn't be parsed.
 */
export async function scheduleDailyWakeNotification(wakeTime: string): Promise<boolean> {
  try {
    const parsed = parseWakeTime(wakeTime);
    if (!parsed) return false;

    await cancelWakeNotification();

    const id = await Notifications.scheduleNotificationAsync({
      content: {
        title: 'Something from the night remains.',
        body: 'Record it before it fades.',
        sound: true,
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DAILY,
        hour: parsed.hour,
        minute: parsed.minute,
      },
    });

    await AsyncStorage.setItem(WAKE_NOTIFICATION_ID_KEY, id);
    return true;
  } catch {
    return false;
  }
}

// ── Cancellation ──────────────────────────────────────────────────────────────

/**
 * Cancels the scheduled wake notification and clears its stored ID.
 */
export async function cancelWakeNotification(): Promise<void> {
  try {
    const id = await AsyncStorage.getItem(WAKE_NOTIFICATION_ID_KEY);
    if (id) {
      await Notifications.cancelScheduledNotificationAsync(id);
      await AsyncStorage.removeItem(WAKE_NOTIFICATION_ID_KEY);
    }
  } catch {}
}
