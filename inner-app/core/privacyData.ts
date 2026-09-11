import AsyncStorage from '@react-native-async-storage/async-storage';
import { secureRemoveItem } from './secureStorage';
import { LUCID_SIGNAL_LEARNING_KEY, LUCID_SIGNAL_PLAN_KEY } from './lucidSignalLearning';
import { DREAM_SEED_KEY } from './dreamIncubation';
import { RECOGNITION_SIGNAL_KEY } from './recognitionSignals';

const JOURNAL_INDEX_KEY = 'journal:index';
const JOURNAL_ENTRY_KEY = (id: string) => `journal:${id}`;

export async function clearPrivateUserData(): Promise<void> {
  const rawIndex = await AsyncStorage.getItem(JOURNAL_INDEX_KEY);
  let ids: string[] = [];
  try {
    const parsed = rawIndex ? JSON.parse(rawIndex) : [];
    if (Array.isArray(parsed)) ids = parsed.filter((id): id is string => typeof id === 'string');
  } catch {}

  await Promise.all(ids.map(id => secureRemoveItem(JOURNAL_ENTRY_KEY(id))));
  await Promise.all([
    AsyncStorage.removeItem(JOURNAL_INDEX_KEY),
    secureRemoveItem('aerisHistory'),
    AsyncStorage.removeItem('aerisHistoryDate'),
    AsyncStorage.removeItem('aerisJustClosed'),
    AsyncStorage.removeItem(LUCID_SIGNAL_LEARNING_KEY),
    AsyncStorage.removeItem(LUCID_SIGNAL_PLAN_KEY),
    AsyncStorage.removeItem(DREAM_SEED_KEY),
    AsyncStorage.removeItem(RECOGNITION_SIGNAL_KEY),
  ]);
}
