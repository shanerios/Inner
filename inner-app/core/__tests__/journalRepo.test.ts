import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import {
  JournalRecordUnreadableError,
  addAddition,
  createEntry,
  deleteAddition,
  deleteEntry,
  editAddition,
  getEntry,
  listEntries,
  preserveBaseline,
  saveEntry,
} from '../journalRepo';
import { secureSetItem } from '../secureStorage';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

jest.mock('expo-secure-store', () => ({
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'whenUnlockedThisDeviceOnly',
  getItemAsync: require('jest-mock').fn(),
  setItemAsync: require('jest-mock').fn(),
}));

let secureKey: string | null;

async function seedRecord(id: string, fields: Record<string, unknown>, index = true) {
  await secureSetItem(`journal:${id}`, JSON.stringify({ id, schemaVersion: 2, ...fields }));
  if (index) {
    const ids = JSON.parse((await AsyncStorage.getItem('journal:index')) ?? '[]');
    await AsyncStorage.setItem('journal:index', JSON.stringify([id, ...ids]));
  }
}

const raw = (id: string) => AsyncStorage.getItem(`journal:${id}`);

describe('journalRepo', () => {
  beforeEach(async () => {
    secureKey = null;
    jest.clearAllMocks();
    await AsyncStorage.clear();
    (SecureStore.getItemAsync as any).mockImplementation(async () => secureKey);
    (SecureStore.setItemAsync as any).mockImplementation(async (_n: string, value: string) => {
      secureKey = value;
    });
  });

  describe('creating entries', () => {
    it('preserves a finished body as the original immediately', async () => {
      const entry = await createEntry({ kind: 'dream', body: 'A stone corridor.', title: 'Corridor' });
      expect(entry.baseline).toMatchObject({
        text: 'A stone corridor.',
        title: 'Corridor',
        source: 'original',
        capturedAt: entry.createdAt,
      });
      expect(entry.baselinePending).toBeUndefined();
      expect((await getEntry(entry.id))?.baseline?.text).toBe('A stone corridor.');
    });

    it('leaves a blank entry pending until the capture is complete', async () => {
      const entry = await createEntry({ kind: 'dream' });
      expect(entry.baseline).toBeUndefined();
      expect(entry.baselinePending).toBe(true);
      expect((await getEntry(entry.id))?.baselinePending).toBe(true);
    });

    it('keeps existing metadata on a morning-return entry', async () => {
      const entry = await createEntry({
        kind: 'dream',
        body: 'Water.',
        captureSource: 'morning_return',
        journeySessionId: 'journey-1',
        captureInput: { method: 'morning_quick_capture', completedAt: 5 },
      });
      const stored = await getEntry(entry.id);
      expect(stored).toMatchObject({
        captureSource: 'morning_return',
        journeySessionId: 'journey-1',
        captureInput: { method: 'morning_quick_capture', completedAt: 5 },
      });
    });
  });

  describe('autosave and the capture boundary', () => {
    it('does not treat autosaved drafts as the original', async () => {
      const entry = await createEntry({ kind: 'dream' });
      for (const body of ['A', 'A stone', 'A stone corridor']) {
        await saveEntry({ ...(await getEntry(entry.id))!, body });
      }
      const stored = (await getEntry(entry.id))!;
      expect(stored.body).toBe('A stone corridor');
      expect(stored.baseline).toBeUndefined();
      expect(stored.baselinePending).toBe(true);
      expect(await preserveBaseline(entry.id, 'legacy_only')).toBe('still_drafting');
      expect((await getEntry(entry.id))?.baseline).toBeUndefined();
    });

    it('preserves the finished account once, when capture completes', async () => {
      const entry = await createEntry({ kind: 'dream' });
      await saveEntry({ ...(await getEntry(entry.id))!, body: 'First words' });
      const firstContentAt = (await getEntry(entry.id))!.contentStartedAt;
      expect(typeof firstContentAt).toBe('number');
      await saveEntry({ ...(await getEntry(entry.id))!, body: 'First words, then the rest.' });
      expect((await getEntry(entry.id))!.contentStartedAt).toBe(firstContentAt);

      const before = (await getEntry(entry.id))!;
      expect(await preserveBaseline(entry.id, 'capture_complete')).toBe('sealed');
      const sealed = (await getEntry(entry.id))!;
      expect(sealed.baseline).toMatchObject({
        text: 'First words, then the rest.',
        source: 'original',
        capturedAt: firstContentAt,
      });
      expect(sealed.baselinePending).toBeUndefined();
      expect(sealed.updatedAt).toBe(before.updatedAt);
      expect(await preserveBaseline(entry.id, 'capture_complete')).toBe('already_preserved');
    });

    it('does not preserve an empty capture', async () => {
      const entry = await createEntry({ kind: 'dream' });
      expect(await preserveBaseline(entry.id, 'capture_complete')).toBe('empty');
      expect((await getEntry(entry.id))?.baseline).toBeUndefined();
    });

    it('keeps the baseline fixed after later edits to the body', async () => {
      const entry = await createEntry({ kind: 'dream', body: 'Original words.' });
      await saveEntry({ ...(await getEntry(entry.id))!, body: 'Revised words.' });
      const stored = (await getEntry(entry.id))!;
      expect(stored.body).toBe('Revised words.');
      expect(stored.baseline?.text).toBe('Original words.');
    });

    it('preserves a legacy entry as a snapshot, never as the original', async () => {
      await seedRecord('legacy', { createdAt: 100, updatedAt: 300, body: 'Old text.', kind: 'dream' });
      expect(await preserveBaseline('legacy', 'legacy_only')).toBe('sealed');
      const stored = (await getEntry('legacy'))!;
      expect(stored.baseline).toMatchObject({ text: 'Old text.', source: 'legacy_snapshot', capturedAt: 100 });
      expect(stored.updatedAt).toBe(300);
    });
  });

  describe('data safety', () => {
    it('ignores baseline and additions supplied by a stale editor copy', async () => {
      const entry = await createEntry({ kind: 'dream', body: 'Original words.' });
      const stale = (await getEntry(entry.id))!; // loaded before the addition
      await addAddition(entry.id, { kind: 'recollection', text: 'A staircase.' });

      await saveEntry({
        ...stale,
        body: 'Edited in a stale editor.',
        baseline: { text: 'forged', capturedAt: 1, source: 'original', preservedAt: 1 },
        additions: [],
      });

      const stored = (await getEntry(entry.id))!;
      expect(stored.body).toBe('Edited in a stale editor.');
      expect(stored.baseline?.text).toBe('Original words.');
      expect(stored.additions?.map(item => item.text)).toEqual(['A staircase.']);
    });

    it('serializes concurrent saves and additions without losing any', async () => {
      const entry = await createEntry({ kind: 'dream', body: 'Original words.' });
      const copy = (await getEntry(entry.id))!;
      const jobs: Promise<unknown>[] = [];
      for (let i = 0; i < 12; i += 1) jobs.push(saveEntry({ ...copy, body: `draft ${i}` }));
      for (let i = 0; i < 6; i += 1) jobs.push(addAddition(entry.id, { kind: 'reflection', text: `reflection ${i}` }));
      for (let i = 12; i < 24; i += 1) jobs.push(saveEntry({ ...copy, body: `draft ${i}` }));
      await Promise.all(jobs);

      const stored = (await getEntry(entry.id))!;
      expect(stored.baseline?.text).toBe('Original words.');
      expect(stored.additions).toHaveLength(6);
      expect(new Set(stored.additions!.map(item => item.id)).size).toBe(6);
      expect(stored.body).toBe('draft 23');
    });

    it('never overwrites a record it cannot read, and still lists the rest', async () => {
      const good = await createEntry({ kind: 'dream', body: 'Readable.' });
      await AsyncStorage.setItem('journal:broken', 'enc:v1:00:00');
      await AsyncStorage.setItem('journal:index', JSON.stringify([good.id, 'broken']));
      const before = await raw('broken');

      await expect(saveEntry({
        schemaVersion: 2, id: 'broken', createdAt: 1, updatedAt: 1, body: 'blind write',
      })).rejects.toBeInstanceOf(JournalRecordUnreadableError);
      expect(await preserveBaseline('broken', 'legacy_only')).toBe('unreadable');
      await expect(addAddition('broken', { kind: 'reflection', text: 'x' })).rejects.toBeInstanceOf(JournalRecordUnreadableError);

      expect(await raw('broken')).toBe(before);
      expect((await listEntries()).map(entry => entry.id)).toEqual([good.id]);
    });

    it('restores the record when the baseline write fails', async () => {
      await seedRecord('legacy', { createdAt: 100, body: 'Old text.', mystery: { keep: true } });
      const before = (await getEntry('legacy'))!;
      // The first write (the baseline) fails; the restore write goes through.
      (AsyncStorage.setItem as any).mockImplementationOnce(async () => { throw new Error('disk full'); });

      expect(await preserveBaseline('legacy', 'legacy_only')).toBe('verify_failed');
      const after = (await getEntry('legacy'))!;
      expect(after.body).toBe(before.body);
      expect(after.baseline).toBeUndefined();
      expect((after as any).mystery).toEqual({ keep: true });
    });

    it('keeps fields this version does not know about', async () => {
      await seedRecord('future', { createdAt: 100, body: 'Text.', links: [{ target: 'x' }] });
      await preserveBaseline('future', 'legacy_only');
      await saveEntry({ ...(await getEntry('future'))!, title: 'Named' });
      expect(((await getEntry('future')) as any).links).toEqual([{ target: 'x' }]);
    });

    it('backs up an unparsable index instead of silently discarding it', async () => {
      await AsyncStorage.setItem('journal:index', '{not json');
      const entry = await createEntry({ kind: 'dream', body: 'New.' });
      expect(await AsyncStorage.getItem('journal:index:backup')).toBe('{not json');
      expect((await listEntries()).map(item => item.id)).toEqual([entry.id]);
    });

    it('removes a deleted entry from storage and the index', async () => {
      const entry = await createEntry({ kind: 'dream', body: 'Gone.' });
      await deleteEntry(entry.id);
      expect(await getEntry(entry.id)).toBeNull();
      expect(await listEntries()).toEqual([]);
    });
  });

  describe('additions', () => {
    it('adds timestamped recollections and reflections without touching the baseline', async () => {
      const entry = await createEntry({ kind: 'dream', body: 'A corridor.' });
      const { addition: detail } = await addAddition(entry.id, { kind: 'recollection', text: '  A staircase to the left.  ' });
      const { addition: reflection, entry: updated } = await addAddition(entry.id, { kind: 'reflection', text: 'Like an older dream.' });

      expect(detail).toMatchObject({ kind: 'recollection', text: 'A staircase to the left.' });
      expect(detail.id).not.toBe(reflection.id);
      expect(updated.baseline?.text).toBe('A corridor.');
      expect(updated.body).toBe('A corridor.');
      expect((await getEntry(entry.id))!.additions).toHaveLength(2);
    });

    it('edits an addition in place and records when', async () => {
      const entry = await createEntry({ kind: 'dream', body: 'A corridor.' });
      const { addition } = await addAddition(entry.id, { kind: 'reflection', text: 'First thought.' });
      const edited = await editAddition(entry.id, addition.id, 'Second thought.');
      const stored = edited.additions![0];
      expect(stored).toMatchObject({ id: addition.id, text: 'Second thought.', createdAt: addition.createdAt });
      expect(typeof stored.editedAt).toBe('number');
    });

    it('deletes only the chosen addition', async () => {
      const entry = await createEntry({ kind: 'dream', body: 'A corridor.' });
      const a = await addAddition(entry.id, { kind: 'reflection', text: 'one' });
      const b = await addAddition(entry.id, { kind: 'recollection', text: 'two' });
      const after = await deleteAddition(entry.id, a.addition.id);
      expect(after.additions?.map(item => item.id)).toEqual([b.addition.id]);
      const empty = await deleteAddition(entry.id, b.addition.id);
      expect(empty.additions).toBeUndefined();
      expect(empty.baseline?.text).toBe('A corridor.');
    });

    it('rejects empty or oversized text, unknown ids, and entries without a baseline', async () => {
      const entry = await createEntry({ kind: 'dream', body: 'A corridor.' });
      await expect(addAddition(entry.id, { kind: 'reflection', text: '   ' })).rejects.toThrow();
      await expect(addAddition(entry.id, { kind: 'reflection', text: 'x'.repeat(12_001) })).rejects.toThrow();
      await expect(editAddition(entry.id, 'nope', 'text')).rejects.toThrow();
      await expect(deleteAddition(entry.id, 'nope')).rejects.toThrow();
      const draft = await createEntry({ kind: 'dream' });
      await expect(addAddition(draft.id, { kind: 'reflection', text: 'too early' })).rejects.toThrow();
    });

    it('persists encrypted and reads back from storage alone', async () => {
      // The repository keeps no in-memory copy of entries, so a restart is just a
      // fresh read of what is stored.
      const entry = await createEntry({ kind: 'dream', body: 'A corridor.' });
      await addAddition(entry.id, { kind: 'reflection', text: 'Remembered later.' });
      const stored = await raw(entry.id);
      expect(stored).toMatch(/^enc:v1:/);
      expect(stored).not.toContain('Remembered later');
      const [reloaded] = await listEntries();
      expect(reloaded.baseline?.text).toBe('A corridor.');
      expect(reloaded.additions?.[0].text).toBe('Remembered later.');
    });
  });
});
