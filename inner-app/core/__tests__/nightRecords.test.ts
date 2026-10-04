import { describe, expect, it, jest } from '@jest/globals';
import { loadNightRecords, NIGHT_RECORDS_KEY, saveNightRecord } from '../nightRecords';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    getItem: jest.fn(async (key: string) => values.get(key) ?? null),
    setItem: jest.fn(async (key: string, value: string) => { values.set(key, value); }),
    values,
  };
}

describe('night records', () => {
  it('preserves a no-recall outcome without requiring a journal entry', async () => {
    const storage = memoryStorage();
    await saveNightRecord({
      id: 'overnight:night-1',
      source: 'overnight_journey',
      sourceSessionId: 'night-1',
      scheduledAt: 1,
      sleepOnsetAt: 2,
      reviewAt: 3,
      reflectedAt: 4,
      outcome: { recall: 'none', signalNotice: 'no', sleepImpact: 'none' },
    }, storage);

    const saved = (await loadNightRecords(storage))[0];
    expect(saved).not.toHaveProperty('journalEntryId');
    expect(saved.outcome).toEqual(expect.objectContaining({ recall: 'none' }));
    expect(JSON.parse(storage.values.get(NIGHT_RECORDS_KEY)!)).toEqual(expect.objectContaining({ schemaVersion: 1 }));
  });

  it('upserts a source outcome instead of double-counting a retry', async () => {
    const storage = memoryStorage();
    const base = {
      id: 'signal:signal-1',
      source: 'scheduled_signal' as const,
      sourceSessionId: 'signal-1',
      scheduledAt: 1,
      sleepOnsetAt: 2,
      reviewAt: 3,
      reflectedAt: 4,
    };
    await saveNightRecord({ ...base, outcome: { recall: 'none' } }, storage);
    await saveNightRecord({ ...base, reflectedAt: 5, journalEntryId: 'dream-1', outcome: { recall: 'dream' } }, storage);
    const records = await loadNightRecords(storage);
    expect(records).toHaveLength(1);
    expect(records[0].outcome.recall).toBe('dream');
  });

  it('recognizes older Morning Return QA records as test evidence', async () => {
    const storage = memoryStorage();
    storage.values.set(NIGHT_RECORDS_KEY, JSON.stringify({
      schemaVersion: 1,
      records: [{
        schemaVersion: 1,
        id: 'overnight:journey-qa-100-test',
        source: 'overnight_journey',
        sourceSessionId: 'journey-qa-100-test',
        scheduledAt: 1,
        sleepOnsetAt: 2,
        reviewAt: 3,
        reflectedAt: 4,
        outcome: { recall: 'dream' },
      }],
    }));
    await expect(loadNightRecords(storage)).resolves.toEqual([
      expect.objectContaining({ testSession: true }),
    ]);
  });
});
