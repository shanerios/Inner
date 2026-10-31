import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Where a person is with The Induction, kept on the device. It holds a status and how it was first offered, never
 * anything they said or heard.
 */
export const INDUCTION_STATE_KEY = 'inner.induction.v1';

/** Ordered by how far along: a later status is never replaced by an earlier one. */
export type InductionStatus = 'none' | 'started' | 'dismissed' | 'completed';
export type InductionEntry = 'new' | 'returning';

export type InductionState = {
  status: InductionStatus;
  /** How it was first offered: to someone new to the app (it leads the first visit to Home) or to someone returning. */
  entry: InductionEntry | null;
};

const RANK: Record<InductionStatus, number> = { none: 0, started: 1, dismissed: 2, completed: 3 };

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

export type InductionOffer = 'prominent' | 'quiet' | 'none';

/**
 * What Home shows:
 * - someone new, who has not yet had the tour, is offered it prominently, and the tour waits for their answer;
 * - someone who has been using Inner is offered a quiet card, once, and the tour is never involved;
 * - after they begin and leave early, the quiet card stays until they finish it or let it go;
 * - once finished or let go, nothing.
 */
export function inductionOffer(state: InductionState, tourUnseen: boolean): InductionOffer {
  if (state.status === 'completed' || state.status === 'dismissed') return 'none';
  if (state.status === 'none' && tourUnseen) return 'prominent';
  return 'quiet';
}

/** The spotlight tour only starts once the Induction has been answered. */
export function inductionHoldsTour(state: InductionState, tourUnseen: boolean): boolean {
  return inductionOffer(state, tourUnseen) === 'prominent';
}
