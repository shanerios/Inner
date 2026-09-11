import AsyncStorage from '@react-native-async-storage/async-storage';

export const DREAM_SEED_KEY = 'inner.dream-incubation.seed.v1';
const MAX_SEED_LENGTH = 120;

type Storage = Pick<typeof AsyncStorage, 'getItem' | 'setItem' | 'removeItem'>;

export type DreamSeed = {
  text: string;
  createdAt: number;
};

export async function loadDreamSeed(storage: Storage = AsyncStorage): Promise<DreamSeed | null> {
  try {
    const raw = await storage.getItem(DREAM_SEED_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    if (!parsed || typeof parsed.text !== 'string' || typeof parsed.createdAt !== 'number') return null;
    const text = parsed.text.trim().slice(0, MAX_SEED_LENGTH);
    return text ? { text, createdAt: parsed.createdAt } : null;
  } catch {
    return null;
  }
}

export async function saveDreamSeed(
  text: string,
  storage: Storage = AsyncStorage,
  now: () => number = Date.now,
): Promise<DreamSeed | null> {
  const normalized = text.trim().replace(/\s+/g, ' ').slice(0, MAX_SEED_LENGTH);
  if (!normalized) return null;
  const seed = { text: normalized, createdAt: now() };
  await storage.setItem(DREAM_SEED_KEY, JSON.stringify(seed));
  return seed;
}

export async function clearDreamSeed(storage: Storage = AsyncStorage): Promise<void> {
  await storage.removeItem(DREAM_SEED_KEY);
}
