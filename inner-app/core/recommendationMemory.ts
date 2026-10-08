import AsyncStorage from '@react-native-async-storage/async-storage';
import type { TonightRecommendation } from './tonightRecommendation';

export const SELECTED_RECOMMENDATION_KEY = 'inner.selectedRecommendation.v1';
export const RECOMMENDATION_LINK_WINDOW_MS = 24 * 60 * 60_000;

type Storage = Pick<typeof AsyncStorage, 'getItem' | 'setItem' | 'removeItem'>;

export type SelectedRecommendation = Pick<
  TonightRecommendation,
  'id' | 'kind' | 'title' | 'reason'
> & {
  selectedAt: number;
};

function validSelection(value: unknown): value is SelectedRecommendation {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const selection = value as Partial<SelectedRecommendation>;
  return typeof selection.id === 'string'
    && ['gentler_signal', 'clearer_signal', 'recurring_signal', 'repeat_environment', 'recognition_refresh', 'repeat_recipe'].includes(selection.kind ?? '')
    && typeof selection.title === 'string'
    && typeof selection.reason === 'string'
    && typeof selection.selectedAt === 'number';
}

export async function saveSelectedRecommendation(
  recommendation: TonightRecommendation,
  storage: Storage = AsyncStorage,
  now: () => number = Date.now,
): Promise<SelectedRecommendation> {
  const selection: SelectedRecommendation = {
    id: recommendation.id,
    kind: recommendation.kind,
    title: recommendation.title,
    reason: recommendation.reason,
    selectedAt: now(),
  };
  await storage.setItem(SELECTED_RECOMMENDATION_KEY, JSON.stringify(selection));
  return selection;
}

export async function loadSelectedRecommendation(
  storage: Storage = AsyncStorage,
): Promise<SelectedRecommendation | null> {
  try {
    const raw = await storage.getItem(SELECTED_RECOMMENDATION_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    return validSelection(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export async function clearSelectedRecommendation(
  storage: Storage = AsyncStorage,
): Promise<void> {
  await storage.removeItem(SELECTED_RECOMMENDATION_KEY);
}

export function recommendationForPracticeContext(
  selection: SelectedRecommendation | null,
  practiceStartedAt: number,
): SelectedRecommendation | undefined {
  if (!selection || selection.selectedAt > practiceStartedAt) return undefined;
  if (practiceStartedAt - selection.selectedAt > RECOMMENDATION_LINK_WINDOW_MS) return undefined;
  return selection;
}
