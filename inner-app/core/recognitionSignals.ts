import AsyncStorage from '@react-native-async-storage/async-storage';
import type { AVPlaybackSource } from 'expo-av';
import { Asset } from 'expo-asset';

export const RECOGNITION_SIGNAL_KEY = 'inner.recognition-signal.v1';

export type RecognitionSignalId = 'ascending' | 'bell' | 'chimes' | 'droplets';

export type RecognitionSignal = {
  id: RecognitionSignalId;
  name: string;
  description: string;
  notificationSound: string;
  durationMs: number;
};

export const RECOGNITION_SIGNALS: RecognitionSignal[] = [
  { id: 'ascending', name: 'Ascending Tone', description: 'Clear · neutral', notificationSound: 'lucidity_cue.wav', durationMs: 7_760 },
  { id: 'bell', name: 'Bell', description: 'Warm · distinct', notificationSound: 'signal_bell.wav', durationMs: 4_741 },
  { id: 'chimes', name: 'Chimes', description: 'Light · crystalline', notificationSound: 'signal_chimes.wav', durationMs: 6_727 },
  { id: 'droplets', name: 'Droplets', description: 'Organic · fluid', notificationSound: 'signal_droplets.wav', durationMs: 4_759 },
];

const SIGNAL_ASSETS: Record<RecognitionSignalId, AVPlaybackSource> = {
  ascending: require('../assets/sounds/lucidity_cue.wav'),
  bell: require('../assets/sounds/signal_bell.wav'),
  chimes: require('../assets/sounds/signal_chimes.wav'),
  droplets: require('../assets/sounds/signal_droplets.wav'),
};

type Storage = Pick<typeof AsyncStorage, 'getItem' | 'setItem'>;

/**
 * Level trim applied where each signal enters the native mix, in dB.
 *
 * The signals were never level-matched: as they reach the mix (before master
 * gain, K-weighted) the built-in Ascending Tone sat about 14 dB above Bell and
 * about 20 dB above Chimes. In a quiet overnight bed that made Ascending read
 * as an alarm. Bell is the reference; trims pull every signal to within ~3 dB
 * of it while keeping their character. Tune a signal here, never in native
 * code, so Android and iOS cannot drift apart.
 *
 * Levels measured by rendering each signal through the real Kotlin engine
 * (dB LU, before trim): ascending -4.9, bell -18.4, chimes -25.2, droplets
 * -24.0. core/audio/__tests__/recognitionSignalLevels.test.ts re-measures the
 * WAV signals from the shipped assets and fails if a trim stops matching them.
 */
export const RECOGNITION_SIGNAL_TRIM_DB: Record<RecognitionSignalId, number> = {
  ascending: -13.5,
  bell: 0,
  chimes: 4,
  droplets: 3,
};

/** Linear gain the native engine applies to a signal. */
export function recognitionSignalGain(id: RecognitionSignalId): number {
  return 10 ** (RECOGNITION_SIGNAL_TRIM_DB[id] / 20);
}

export function recognitionSignalById(id: RecognitionSignalId): RecognitionSignal {
  return RECOGNITION_SIGNALS.find(signal => signal.id === id) ?? RECOGNITION_SIGNALS[0];
}

export async function getRecognitionSignalId(storage: Storage = AsyncStorage): Promise<RecognitionSignalId> {
  try {
    const value = await storage.getItem(RECOGNITION_SIGNAL_KEY);
    return RECOGNITION_SIGNALS.some(signal => signal.id === value) ? value as RecognitionSignalId : 'ascending';
  } catch {
    return 'ascending';
  }
}

export async function setRecognitionSignalId(id: RecognitionSignalId, storage: Storage = AsyncStorage): Promise<void> {
  await storage.setItem(RECOGNITION_SIGNAL_KEY, recognitionSignalById(id).id);
}

export async function createRecognitionSignalSound(id: RecognitionSignalId): Promise<import('expo-av').Audio.Sound> {
  const { Audio } = await import('expo-av');
  const { sound } = await Audio.Sound.createAsync(SIGNAL_ASSETS[id], { shouldPlay: false, volume: 0.8 });
  return sound;
}

export async function getRecognitionSignalAssetUri(id: RecognitionSignalId): Promise<string | null> {
  if (id === 'ascending') return null;
  const asset = Asset.fromModule(SIGNAL_ASSETS[id] as number);
  await asset.downloadAsync();
  return asset.localUri ?? asset.uri ?? null;
}

/** Everything the native engine needs to play a signal at its intended level. */
export async function recognitionSignalPlayback(id: RecognitionSignalId): Promise<{
  signalId: RecognitionSignalId;
  uri: string | null;
  gain: number;
}> {
  return { signalId: id, uri: await getRecognitionSignalAssetUri(id), gain: recognitionSignalGain(id) };
}
