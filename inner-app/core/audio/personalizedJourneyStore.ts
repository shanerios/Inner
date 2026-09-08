import AsyncStorage from '@react-native-async-storage/async-storage';
import { DEFAULT_PROCEDURAL_AUDIO_CONFIG } from './config';
import type { FactoryAudioJourney } from './factoryJourneys';
import { compileAudioJourneyTimeline } from './timeline';

const STORAGE_KEY = 'inner.audio.personalized-lucid-journeys.v1';
const MAX_SAVED_JOURNEYS = 12;

type Storage = Pick<typeof AsyncStorage, 'getItem' | 'setItem'>;

export type SavedPersonalizedJourney = FactoryAudioJourney & {
  schemaVersion: 1;
  createdAt: number;
};

function parseSavedJourney(value: unknown): SavedPersonalizedJourney | null {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as Partial<SavedPersonalizedJourney>;
  if (candidate.schemaVersion !== 1 || typeof candidate.id !== 'string'
    || typeof candidate.title !== 'string' || typeof candidate.durationLabel !== 'string'
    || typeof candidate.summary !== 'string' || !candidate.timeline) return null;
  const title = candidate.title.trim().slice(0, 40);
  if (!title) return null;
  const saved: SavedPersonalizedJourney = {
    schemaVersion: 1,
    id: candidate.id.trim(),
    title,
    durationLabel: candidate.durationLabel.trim().slice(0, 32),
    summary: candidate.summary.trim().slice(0, 180),
    timeline: { ...candidate.timeline, title },
    createdAt: typeof candidate.createdAt === 'number' ? candidate.createdAt : 0,
  };
  try {
    compileAudioJourneyTimeline(saved.timeline, DEFAULT_PROCEDURAL_AUDIO_CONFIG);
    return saved;
  } catch {
    return null;
  }
}

export async function loadPersonalizedJourneys(
  storage: Storage = AsyncStorage,
): Promise<SavedPersonalizedJourney[]> {
  try {
    const raw = await storage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map(parseSavedJourney)
      .filter((journey): journey is SavedPersonalizedJourney => journey !== null)
      .slice(0, MAX_SAVED_JOURNEYS);
  } catch {
    return [];
  }
}

export async function savePersonalizedJourney(
  name: string,
  journey: FactoryAudioJourney,
  storage: Storage = AsyncStorage,
  now: () => number = Date.now,
): Promise<SavedPersonalizedJourney[]> {
  const title = name.trim().slice(0, 40);
  if (!title) return loadPersonalizedJourneys(storage);
  const timestamp = now();
  const id = `personal-lucid-saved-${timestamp}-${Math.random().toString(36).slice(2, 8)}`;
  const saved: SavedPersonalizedJourney = {
    ...journey,
    schemaVersion: 1,
    id,
    title,
    timeline: { ...journey.timeline, id, title },
    createdAt: timestamp,
  };
  compileAudioJourneyTimeline(saved.timeline, DEFAULT_PROCEDURAL_AUDIO_CONFIG);
  const existing = await loadPersonalizedJourneys(storage);
  const next = [saved, ...existing].slice(0, MAX_SAVED_JOURNEYS);
  await storage.setItem(STORAGE_KEY, JSON.stringify(next));
  return next;
}

export async function deletePersonalizedJourney(
  id: string,
  storage: Storage = AsyncStorage,
): Promise<SavedPersonalizedJourney[]> {
  const next = (await loadPersonalizedJourneys(storage)).filter(journey => journey.id !== id);
  await storage.setItem(STORAGE_KEY, JSON.stringify(next));
  return next;
}
