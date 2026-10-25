import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { migrateJournalBaselines } from '../journalMigration';
import { addAddition, createEntry, getEntry, preserveBaseline, saveEntry } from '../journalRepo';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

jest.mock('expo-secure-store', () => ({
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'whenUnlockedThisDeviceOnly',
  getItemAsync: require('jest-mock').fn(),
  setItemAsync: require('jest-mock').fn(),
}));

let secureKey: string | null;
const noYield = async () => {};

/** What the editor does: load, autosave drafts, then preserve on leaving. */
async function typeIn(id: string, drafts: string[]) {
  for (const body of drafts) {
    await saveEntry({ ...(await getEntry(id))!, body });
  }
}

describe('every way an entry is created', () => {
  beforeEach(async () => {
    secureKey = null;
    jest.clearAllMocks();
    await AsyncStorage.clear();
    (SecureStore.getItemAsync as any).mockImplementation(async () => secureKey);
    (SecureStore.setItemAsync as any).mockImplementation(async (_n: string, value: string) => {
      secureKey = value;
    });
  });

  it('morning return: finished text is preserved at once and survives the follow-up reflection save', async () => {
    const created = await createEntry({
      kind: 'dream',
      body: 'I was walking toward a blue light.',
      captureSource: 'morning_return',
      journeySessionId: 'night-1',
    });
    // The reflection step later writes Dream Details onto the same entry.
    const linked = (await getEntry(created.id))!;
    await saveEntry({ ...linked, dreamDetails: { awareness: 'yes' }, dreamSigns: ['water'] });

    const stored = (await getEntry(created.id))!;
    expect(stored.baseline).toMatchObject({ text: 'I was walking toward a blue light.', source: 'original' });
    expect(stored.dreamDetails).toEqual({ awareness: 'yes' });
    expect(stored.journeySessionId).toBe('night-1');
  });

  it('new-dream button and wake notification: drafts are not sealed; leaving the editor seals', async () => {
    for (const captureInput of [undefined, { method: 'morning_quick_capture' as const }]) {
      const entry = await createEntry({ kind: 'dream', captureInput });
      await typeIn(entry.id, ['A', 'A door', 'A door in the water']);
      let stored = (await getEntry(entry.id))!;
      expect(stored.baseline).toBeUndefined();
      expect(stored.baselinePending).toBe(true);

      // Opening it again mid-capture must not seal it either.
      expect(await preserveBaseline(entry.id, 'legacy_only')).toBe('still_drafting');

      expect(await preserveBaseline(entry.id, 'capture_complete')).toBe('sealed');
      stored = (await getEntry(entry.id))!;
      expect(stored.baseline).toMatchObject({ text: 'A door in the water', source: 'original' });
    }
  });

  it('an unexpected termination mid-capture leaves the draft unsealed and recoverable', async () => {
    const entry = await createEntry({ kind: 'dream' });
    await typeIn(entry.id, ['Half a dream, then the app is killed']);
    // No unmount, so no preserveBaseline(..., 'capture_complete'). Next launch:
    const result = await migrateJournalBaselines({ yieldFn: noYield });
    expect(result).toMatchObject({ stillDrafting: 1, sealed: 0, complete: true });
    const stored = (await getEntry(entry.id))!;
    expect(stored.body).toBe('Half a dream, then the app is killed');
    expect(stored.baseline).toBeUndefined();

    // The user returns, finishes, and leaves: now it is preserved as written.
    await typeIn(entry.id, ['Half a dream, then the app is killed. And I finished it.']);
    expect(await preserveBaseline(entry.id, 'capture_complete')).toBe('sealed');
    expect((await getEntry(entry.id))?.baseline?.text).toBe('Half a dream, then the app is killed. And I finished it.');
  });

  it('chamber log: an unedited prefill is never preserved, but later text is', async () => {
    const entry = await createEntry({ kind: 'chamber', chamberId: 'c1', chamberTitle: 'Chamber I' });
    // The editor shows "What remained?" as a placeholder only; nothing is saved.
    expect(await preserveBaseline(entry.id, 'capture_complete')).toBe('empty');
    expect((await getEntry(entry.id))?.baseline).toBeUndefined();

    await typeIn(entry.id, ['A low hum, then stillness.']);
    expect(await preserveBaseline(entry.id, 'capture_complete')).toBe('sealed');
    const stored = (await getEntry(entry.id))!;
    expect(stored).toMatchObject({ kind: 'chamber', chamberId: 'c1', chamberTitle: 'Chamber I' });
    expect(stored.baseline?.text).toBe('A low hum, then stillness.');
  });

  it('dictation: transcript segments autosave like typing and are preserved only on leaving', async () => {
    const entry = await createEntry({ kind: 'dream' });
    const withVoice = async (body: string) => saveEntry({
      ...(await getEntry(entry.id))!,
      body,
      captureInput: { method: 'voice_transcription', completedAt: Date.now(), recognitionMode: 'on_device' },
    });
    await withVoice('A long corridor');
    await withVoice('A long corridor with a blue light');
    expect((await getEntry(entry.id))?.baseline).toBeUndefined();
    await preserveBaseline(entry.id, 'capture_complete');
    const stored = (await getEntry(entry.id))!;
    expect(stored.baseline?.text).toBe('A long corridor with a blue light');
    expect(stored.captureInput).toMatchObject({ method: 'voice_transcription', recognitionMode: 'on_device' });
  });

  it('after capture, later details and edits stay separate from the original', async () => {
    const entry = await createEntry({ kind: 'dream', body: 'A stone corridor toward a blue light.' });
    await addAddition(entry.id, { kind: 'recollection', text: 'There was also a staircase to the left.' });
    await saveEntry({ ...(await getEntry(entry.id))!, body: 'A stone corridor toward a blue light, and stairs.' });
    await addAddition(entry.id, { kind: 'reflection', text: 'It reminds me of an older dream.' });

    const stored = (await getEntry(entry.id))!;
    expect(stored.baseline?.text).toBe('A stone corridor toward a blue light.');
    expect(stored.body).toBe('A stone corridor toward a blue light, and stairs.');
    expect(stored.additions?.map(item => item.kind)).toEqual(['recollection', 'reflection']);
  });
});
