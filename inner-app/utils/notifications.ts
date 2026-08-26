// utils/notifications.ts
import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';

const WAKE_NOTIFICATION_IDS_KEY = 'wakeNotificationIds';
/** Legacy single-ID key from before rotating weekly copy — cancelled for migration only. */
const LEGACY_WAKE_NOTIFICATION_ID_KEY = 'wakeNotificationId';
export const WAKE_TIME_KEY = 'wakeTime';

const REENGAGEMENT_NOTIFICATION_ID_KEY = 'reengagementNotificationId';
const REENGAGEMENT_DAYS = 4;

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
export function parseWakeTime(timeStr: string): { hour: number; minute: number } | null {
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

// ── Wake time (single source of truth) ──────────────────────────────────────
//
// Every entry point that lets a user set/clear their wake time (onboarding's
// EssenceScreen prompt, SettingsModal) should go through setWakeTime() rather
// than writing AsyncStorage directly — that's what keeps the stored value and
// the OS-scheduled notification from drifting apart.

export async function getWakeTime(): Promise<string | null> {
  try { return await AsyncStorage.getItem(WAKE_TIME_KEY); } catch { return null; }
}

/**
 * Persists the wake time and syncs the scheduled notification to match:
 * a non-empty value requests permission and (re)schedules; an empty/null
 * value clears storage and cancels any pending notification.
 * Returns true on success (including a successful clear).
 */
export async function setWakeTime(wakeTime: string | null): Promise<boolean> {
  const trimmed = wakeTime?.trim();
  try {
    if (!trimmed) {
      await AsyncStorage.removeItem(WAKE_TIME_KEY);
      await cancelWakeNotification();
      return true;
    }
    await AsyncStorage.setItem(WAKE_TIME_KEY, trimmed);
    const granted = await requestNotificationPermission();
    if (!granted) return false;
    return await scheduleDailyWakeNotification(trimmed);
  } catch {
    return false;
  }
}

// ── Wake notification scheduling ────────────────────────────────────────────
//
// Rotating copy: a single DAILY trigger bakes in one fixed message forever,
// so instead we schedule 7 WEEKLY triggers (one per weekday) at the same
// hour/minute, each with different copy. All 7 IDs are tracked together so
// they can be cancelled/replaced as a set.

const WAKE_MESSAGES: Array<{ title: string; body: string }> = [
  { title: 'Something from the night remains.', body: 'Record it before it fades.' },
  { title: 'The dream is still close.', body: 'A few words now are enough to keep it.' },
  { title: "Before it's gone...", body: 'What did you see?' },
  { title: 'A quiet thread from sleep.', body: 'Follow it back into the journal.' },
  { title: 'Threshold moment.', body: "You're still close enough to remember." },
  { title: 'The night left something behind.', body: 'Catch it before the day takes over.' },
  { title: 'Still half in the dream?', body: "That's the best time to write it down." },
];

/**
 * Cancels any existing wake notifications, then schedules 7 weekly ones
 * (one per weekday, rotating copy) at the given time.
 * wakeTime: time string as stored in AsyncStorage (e.g. "7am", "6:30am").
 * Returns true on success, false if the time string couldn't be parsed.
 */
export async function scheduleDailyWakeNotification(wakeTime: string): Promise<boolean> {
  try {
    const parsed = parseWakeTime(wakeTime);
    if (!parsed) return false;

    await cancelWakeNotification();

    const ids = await Promise.all(
      WAKE_MESSAGES.map((msg, i) =>
        Notifications.scheduleNotificationAsync({
          content: { title: msg.title, body: msg.body, sound: true, data: { type: 'wake' } },
          trigger: {
            type: Notifications.SchedulableTriggerInputTypes.WEEKLY,
            weekday: i + 1, // 1 = Sunday .. 7 = Saturday
            hour: parsed.hour,
            minute: parsed.minute,
          },
        })
      )
    );

    await AsyncStorage.setItem(WAKE_NOTIFICATION_IDS_KEY, JSON.stringify(ids));
    return true;
  } catch {
    return false;
  }
}

/**
 * Cancels all scheduled wake notifications and clears their stored IDs.
 */
export async function hasWakeNotificationScheduled(): Promise<boolean> {
  try {
    const raw = await AsyncStorage.getItem(WAKE_NOTIFICATION_IDS_KEY);
    const ids: string[] = raw ? JSON.parse(raw) : [];
    return ids.length > 0;
  } catch {
    return false;
  }
}

export async function cancelWakeNotification(): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(WAKE_NOTIFICATION_IDS_KEY);
    const ids: string[] = raw ? JSON.parse(raw) : [];
    await Promise.all(ids.map(id => Notifications.cancelScheduledNotificationAsync(id).catch(() => {})));
    await AsyncStorage.removeItem(WAKE_NOTIFICATION_IDS_KEY);

    // Migration: cancel any notification scheduled under the old single-ID
    // scheme so upgrading users don't end up with an orphaned daily ping.
    const legacyId = await AsyncStorage.getItem(LEGACY_WAKE_NOTIFICATION_ID_KEY);
    if (legacyId) {
      await Notifications.cancelScheduledNotificationAsync(legacyId).catch(() => {});
      await AsyncStorage.removeItem(LEGACY_WAKE_NOTIFICATION_ID_KEY);
    }
  } catch {}
}

// ── Re-engagement (lapsed user) notification ────────────────────────────────
//
// No backend, so this is done client-side: every time the app is opened or
// foregrounded, push the "come back" notification REENGAGEMENT_DAYS into the
// future. An active user keeps deferring it forever; someone who goes quiet
// leaves the last-scheduled one to actually fire. Only touches notifications
// for users who've already granted permission elsewhere (wake time) — this
// doesn't prompt for permission on its own, to avoid asking before any value
// has been shown.
const REENGAGEMENT_MESSAGES: Array<{ title: string; body: string }> = [
  { title: 'The door is still open.', body: "It's been quiet in here without you." },
  { title: 'Still here.', body: 'Whenever you\'re ready to go inward again.' },
  { title: 'The orb remembers you.', body: 'Come back whenever it calls.' },
];

// Picked at random each time this reschedules — since it's a single one-off
// notification (not a repeating series like the wake reminder), rotation
// only matters across separate lapses, but costs nothing to add.
function pickReengagementMessage() {
  return REENGAGEMENT_MESSAGES[Math.floor(Math.random() * REENGAGEMENT_MESSAGES.length)];
}

export async function scheduleReengagementNotification(): Promise<void> {
  try {
    const { status } = await Notifications.getPermissionsAsync();
    if (status !== 'granted') return;

    await cancelReengagementNotification();

    const fireDate = new Date(Date.now() + REENGAGEMENT_DAYS * 24 * 60 * 60 * 1000);
    const msg = pickReengagementMessage();
    const id = await Notifications.scheduleNotificationAsync({
      content: { title: msg.title, body: msg.body, sound: true, data: { type: 'reengagement' } },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: fireDate },
    });
    await AsyncStorage.setItem(REENGAGEMENT_NOTIFICATION_ID_KEY, id);
  } catch {}
}

export async function cancelReengagementNotification(): Promise<void> {
  try {
    const id = await AsyncStorage.getItem(REENGAGEMENT_NOTIFICATION_ID_KEY);
    if (id) {
      await Notifications.cancelScheduledNotificationAsync(id);
      await AsyncStorage.removeItem(REENGAGEMENT_NOTIFICATION_ID_KEY);
    }
  } catch {}
}
