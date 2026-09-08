import AsyncStorage from '@react-native-async-storage/async-storage';
import { normalizeProceduralAudioConfig } from './config';
import type { ProceduralAudioConfig } from './types';

const STORAGE_KEY = 'inner.audio.mixer-presets.v1';
const MAX_PRESETS = 12;

type Storage = Pick<typeof AsyncStorage, 'getItem' | 'setItem'>;

export type MixerPreset = {
  id: string;
  name: string;
  config: ProceduralAudioConfig;
  createdAt: number;
};

function parsePreset(value: unknown): MixerPreset | null {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as Partial<MixerPreset>;
  if (typeof candidate.id !== 'string' || typeof candidate.name !== 'string' || !candidate.config) return null;
  const name = candidate.name.trim().slice(0, 32);
  if (!name) return null;
  return {
    id: candidate.id,
    name,
    config: normalizeProceduralAudioConfig(candidate.config),
    createdAt: typeof candidate.createdAt === 'number' ? candidate.createdAt : 0,
  };
}

export async function loadMixerPresets(storage: Storage = AsyncStorage): Promise<MixerPreset[]> {
  try {
    const raw = await storage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map(parsePreset).filter((preset): preset is MixerPreset => preset !== null).slice(0, MAX_PRESETS);
  } catch {
    return [];
  }
}

export async function saveMixerPreset(
  name: string,
  config: ProceduralAudioConfig,
  storage: Storage = AsyncStorage,
  now: () => number = Date.now,
): Promise<MixerPreset[]> {
  const cleanName = name.trim().slice(0, 32);
  if (!cleanName) return loadMixerPresets(storage);
  const existing = await loadMixerPresets(storage);
  const timestamp = now();
  const preset: MixerPreset = {
    id: `mix-${timestamp}-${Math.random().toString(36).slice(2, 8)}`,
    name: cleanName,
    config: normalizeProceduralAudioConfig(config),
    createdAt: timestamp,
  };
  const next = [preset, ...existing].slice(0, MAX_PRESETS);
  await storage.setItem(STORAGE_KEY, JSON.stringify(next));
  return next;
}

export async function deleteMixerPreset(
  id: string,
  storage: Storage = AsyncStorage,
): Promise<MixerPreset[]> {
  const next = (await loadMixerPresets(storage)).filter(preset => preset.id !== id);
  await storage.setItem(STORAGE_KEY, JSON.stringify(next));
  return next;
}
