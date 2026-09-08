import AsyncStorage from '@react-native-async-storage/async-storage';
import { DEFAULT_PROCEDURAL_AUDIO_CONFIG } from './config';
import { compileAudioJourneyTimeline } from './timeline';
import type { AudioJourneyTimeline } from './types';

const STORAGE_KEY = 'inner.audio.journeys.v1';
const MAX_JOURNEYS = 24;

type Storage = Pick<typeof AsyncStorage, 'getItem' | 'setItem'>;

export type SavedAudioJourney = AudioJourneyTimeline & {
  schemaVersion: 1;
  createdAt: number;
  updatedAt: number;
};

function parseJourney(value: unknown): SavedAudioJourney | null {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as Partial<SavedAudioJourney>;
  if (candidate.schemaVersion !== 1 || typeof candidate.id !== 'string'
    || typeof candidate.title !== 'string' || !Array.isArray(candidate.stages)) return null;
  const journey: SavedAudioJourney = {
    schemaVersion: 1,
    id: candidate.id.trim(),
    title: candidate.title.trim().slice(0, 48),
    loop: candidate.loop === true,
    stages: candidate.stages,
    createdAt: typeof candidate.createdAt === 'number' ? candidate.createdAt : 0,
    updatedAt: typeof candidate.updatedAt === 'number' ? candidate.updatedAt : 0,
  };
  try {
    compileAudioJourneyTimeline(journey, DEFAULT_PROCEDURAL_AUDIO_CONFIG);
    return journey;
  } catch {
    return null;
  }
}

export async function loadAudioJourneys(storage: Storage = AsyncStorage): Promise<SavedAudioJourney[]> {
  try {
    const raw = await storage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map(parseJourney).filter((journey): journey is SavedAudioJourney => journey !== null).slice(0, MAX_JOURNEYS);
  } catch {
    return [];
  }
}

export async function saveAudioJourney(
  timeline: AudioJourneyTimeline,
  storage: Storage = AsyncStorage,
  now: () => number = Date.now,
): Promise<SavedAudioJourney[]> {
  compileAudioJourneyTimeline(timeline, DEFAULT_PROCEDURAL_AUDIO_CONFIG);
  const existing = await loadAudioJourneys(storage);
  const timestamp = now();
  const previous = existing.find(journey => journey.id === timeline.id);
  const saved: SavedAudioJourney = {
    ...timeline,
    id: timeline.id.trim(),
    title: timeline.title.trim().slice(0, 48),
    loop: timeline.loop === true,
    schemaVersion: 1,
    createdAt: previous?.createdAt ?? timestamp,
    updatedAt: timestamp,
  };
  const next = [saved, ...existing.filter(journey => journey.id !== saved.id)].slice(0, MAX_JOURNEYS);
  await storage.setItem(STORAGE_KEY, JSON.stringify(next));
  return next;
}

export async function deleteAudioJourney(id: string, storage: Storage = AsyncStorage): Promise<SavedAudioJourney[]> {
  const next = (await loadAudioJourneys(storage)).filter(journey => journey.id !== id);
  await storage.setItem(STORAGE_KEY, JSON.stringify(next));
  return next;
}
