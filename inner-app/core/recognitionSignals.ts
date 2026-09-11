import AsyncStorage from '@react-native-async-storage/async-storage';
import type { AVPlaybackSource } from 'expo-av';

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
