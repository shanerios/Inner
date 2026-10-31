import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Where a person is with The Induction, kept on the device. It holds a status and how it was first offered, never
 * anything they said or heard.
 */
export const INDUCTION_STATE_KEY = 'inner.induction.v1';

/**
 * Ordered by how far along: a later status is never replaced by an earlier one.
 * - skipped: they saw the welcome and chose to skip it; it waits for them as a card on Home;
 * - started: audio began;
 * - dismissed: they let the card go;
 * - completed: they heard it to the end.
 */
export type InductionStatus = 'none' | 'skipped' | 'started' | 'dismissed' | 'completed';
export type InductionEntry = 'new' | 'returning';

export type InductionState = {
  status: InductionStatus;
  /** How it was first offered: to someone new to the app (a welcome over their first Home) or to someone returning (a card). */
  entry: InductionEntry | null;
};

const RANK: Record<InductionStatus, number> = { none: 0, skipped: 1, started: 2, dismissed: 3, completed: 4 };

export const EMPTY_INDUCTION_STATE: InductionState = { status: 'none', entry: null };

function parse(raw: string | null): InductionState {
  if (!raw) return EMPTY_INDUCTION_STATE;
  try {
    const value = JSON.parse(raw);
    const status: InductionStatus = value?.status in RANK ? value.status : 'none';
    const entry: InductionEntry | null = value?.entry === 'new' || value?.entry === 'returning' ? value.entry : null;
    return { status, entry };
  } catch {
    return EMPTY_INDUCTION_STATE;
  }
}

export async function getInductionState(): Promise<InductionState> {
  try {
    return parse(await AsyncStorage.getItem(INDUCTION_STATE_KEY));
  } catch {
    return EMPTY_INDUCTION_STATE;
  }
}

async function save(state: InductionState): Promise<InductionState> {
  try {
    await AsyncStorage.setItem(INDUCTION_STATE_KEY, JSON.stringify(state));
  } catch {
    // Non-fatal: the card simply appears again next time.
  }
  return state;
}

/** Moves the status forward. Returns the state as stored; an earlier status than the current one changes nothing. */
export async function advanceInductionStatus(next: InductionStatus): Promise<InductionState> {
  const current = await getInductionState();
  if (RANK[next] <= RANK[current.status]) return current;
  return save({ ...current, status: next });
}

/** Records how the Induction was first offered. Only the first call counts. */
export async function recordInductionEntry(entry: InductionEntry): Promise<InductionState> {
  const current = await getInductionState();
  if (current.entry) return current;
  return save({ ...current, entry });
}

export type InductionOffer = 'welcome' | 'quiet' | 'none';

/**
 * What Home shows:
 * - someone new, who has not yet had the tour and has not answered, gets the welcome over Home, and the tour waits;
 * - someone who has been using Inner, or who skipped the welcome, or who began and left early, gets a quiet card
 *   at the top of Home until they finish it or let it go;
 * - once finished or let go, nothing.
 */
export function inductionOffer(state: InductionState, tourUnseen: boolean): InductionOffer {
  if (state.status === 'completed' || state.status === 'dismissed') return 'none';
  if (state.status === 'none' && tourUnseen) return 'welcome';
  return 'quiet';
}

/** The spotlight tour only starts once the welcome has been answered. */
export function inductionHoldsTour(state: InductionState, tourUnseen: boolean): boolean {
  return inductionOffer(state, tourUnseen) === 'welcome';
}
