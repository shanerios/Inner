import AsyncStorage from '@react-native-async-storage/async-storage';

export type EmberState = {
  // Total embers earned across all time (used for unlocks / milestones)
  totalEmbers: number;
  // Embers earned in the current rolling week (resets every week)
  weeklyEmbers: number;
  // ISO timestamp of the last time the weeklyEmbers bucket was normalized/reset
  lastWeeklyResetAt?: string;
  // Whether Inner Pulse has been unlocked by cumulative Embers
  innerPulseUnlocked: boolean;
};

const ONE_WEEK_MS = 7 * 24 * 60 * 60 * 1000;

const EMBERS_TOTAL_KEY = 'embers:total_v1';
const EMBERS_INNER_PULSE_KEY = 'embers:innerPulseUnlocked_v1';

const EMBERS_STATE_KEY = 'embers:state_v2';

// How many embers before Inner Pulse unlocks
const INNER_PULSE_THRESHOLD = 7;

function normalizeWeeklyState(raw: EmberState | null): EmberState {
  if (!raw) {
    return {
      totalEmbers: 0,
      weeklyEmbers: 0,
      lastWeeklyResetAt: new Date().toISOString(),
      innerPulseUnlocked: false,
    };
  }

  const now = Date.now();
  const last = raw.lastWeeklyResetAt ? Date.parse(raw.lastWeeklyResetAt) : 0;

  // Reset weekly if older than 7 days or never set
  if (!last || now - last > ONE_WEEK_MS) {
    return {
      ...raw,
      weeklyEmbers: 0,
      lastWeeklyResetAt: new Date().toISOString(),
    };
  }

  return raw;
}

export async function getEmberState(): Promise<EmberState> {
  try {
    // Prefer the unified state key if it exists
    const stateStr = await AsyncStorage.getItem(EMBERS_STATE_KEY);
    if (stateStr) {
      const parsed = JSON.parse(stateStr) as EmberState | null;
      const normalized = normalizeWeeklyState(parsed);

      return {
        totalEmbers: normalized.totalEmbers ?? 0,
        weeklyEmbers: normalized.weeklyEmbers ?? 0,
        lastWeeklyResetAt:
          normalized.lastWeeklyResetAt ?? new Date().toISOString(),
        innerPulseUnlocked: !!normalized.innerPulseUnlocked,
      };
    }

    // Fallback for older installs: read from legacy keys and migrate
    const [totalStr, unlockedStr] = await AsyncStorage.multiGet([
      EMBERS_TOTAL_KEY,
      EMBERS_INNER_PULSE_KEY,
    ]);

    const legacyTotal = parseInt(totalStr?.[1] ?? '0', 10) || 0;
    const legacyUnlocked =
      unlockedStr?.[1] === '1' || legacyTotal >= INNER_PULSE_THRESHOLD;

    const migrated: EmberState = normalizeWeeklyState({
      totalEmbers: legacyTotal,
      weeklyEmbers: 0,
      lastWeeklyResetAt: new Date().toISOString(),
      innerPulseUnlocked: legacyUnlocked,
    });

    // Persist the migrated state under the new key so we don't keep reading legacy keys
    await AsyncStorage.setItem(EMBERS_STATE_KEY, JSON.stringify(migrated));

    return migrated;
  } catch (e) {
    console.log('[Ember] getEmberState error', e);
    return {
      totalEmbers: 0,
      weeklyEmbers: 0,
      lastWeeklyResetAt: new Date().toISOString(),
      innerPulseUnlocked: false,
    };
  }
}

export async function awardEmber(source?: string): Promise<EmberState> {
  try {
    // Start from the current normalized state (this will also reset weekly if needed)
    const current = await getEmberState();
    const normalized = normalizeWeeklyState(current);

    const nextTotal = (normalized.totalEmbers ?? 0) + 1;
    const nextWeekly = (normalized.weeklyEmbers ?? 0) + 1;

    const innerPulseUnlocked =
      normalized.innerPulseUnlocked || nextTotal >= INNER_PULSE_THRESHOLD;

    const updated: EmberState = {
      totalEmbers: nextTotal,
      weeklyEmbers: nextWeekly,
      lastWeeklyResetAt:
        normalized.lastWeeklyResetAt ?? new Date().toISOString(),
      innerPulseUnlocked,
    };

    // Persist unified state
    await AsyncStorage.setItem(EMBERS_STATE_KEY, JSON.stringify(updated));

    // Mirror to legacy keys for backward compatibility (safe to keep for now)
    await AsyncStorage.multiSet([
      [EMBERS_TOTAL_KEY, String(nextTotal)],
      [EMBERS_INNER_PULSE_KEY, innerPulseUnlocked ? '1' : '0'],
    ]);

    // Later we can use `source` to track what caused the ember.
    console.log(
      '[Ember] +1 ember from',
      source,
      '→ totalEmbers =',
      nextTotal,
      ', weeklyEmbers =',
      nextWeekly
    );

    return updated;
  } catch (e) {
    console.log('[Ember] awardEmber error', e);
    return {
      totalEmbers: 0,
      weeklyEmbers: 0,
      lastWeeklyResetAt: new Date().toISOString(),
      innerPulseUnlocked: false,
    };
  }
}