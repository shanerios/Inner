import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { BASELINE_MIGRATION_KEY, migrateJournalBaselines } from '../journalMigration';
import { getEntry, listEntries } from '../journalRepo';
import { secureGetItem, secureSetItem } from '../secureStorage';

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

async function addToIndex(id: string) {
  const ids = JSON.parse((await AsyncStorage.getItem('journal:index')) ?? '[]');
  await AsyncStorage.setItem('journal:index', JSON.stringify([...ids, id]));
}

async function seed(id: string, fields: Record<string, unknown>) {
  await secureSetItem(`journal:${id}`, JSON.stringify({ id, schemaVersion: 2, ...fields }));
  await addToIndex(id);
}

async function seedRaw(id: string, rawValue: string) {
  await AsyncStorage.setItem(`journal:${id}`, rawValue);
  await addToIndex(id);
}

const raw = (id: string) => AsyncStorage.getItem(`journal:${id}`);

async function snapshot(ids: string[]) {
  const out: Record<string, string | null> = {};
  for (const id of ids) out[id] = await raw(id);
  return out;
}

describe('migrateJournalBaselines', () => {
  beforeEach(async () => {
    secureKey = null;
    jest.clearAllMocks();
    await AsyncStorage.clear();
    (SecureStore.getItemAsync as any).mockImplementation(async () => secureKey);
    (SecureStore.setItemAsync as any).mockImplementation(async (_n: string, value: string) => {
      secureKey = value;
    });
  });

  async function seedMixedJournal() {
    await seed('normal', {
      createdAt: 1_000, updatedAt: 5_000, body: 'A stone corridor.', title: 'Corridor', kind: 'dream',
      dreamDetails: { awareness: 'yes' },
      practiceContext: { note: 'observed' },
      futureField: { keep: 'me' },
    });
    await seed('no-updated-at', { createdAt: 2_000, body: 'Only a createdAt.', kind: 'note' });
    await seed('empty', { createdAt: 3_000, updatedAt: 3_000, body: '   ', kind: 'dream' });
    await seed('drafting', {
      createdAt: 4_000, updatedAt: 4_100, body: 'Still being written', baselinePending: true, kind: 'dream',
    });
    await seed('already', {
      createdAt: 5_000, updatedAt: 5_000, body: 'Edited later.', kind: 'dream',
      baseline: { text: 'Original.', capturedAt: 5_000, source: 'original', preservedAt: 5_001 },
    });
    await seedRaw('bad-cipher', 'enc:v1:00:00');
    await seedRaw('bad-json', 'this is not json');
    await seed('no-created-at', { updatedAt: 9, body: 'cannot be listed' });
    await addToIndex('orphan'); // indexed, but no record
  }

  it('preserves legacy entries as snapshots and leaves everything else alone', async () => {
    await seedMixedJournal();
    const result = await migrateJournalBaselines({ yieldFn: noYield });

    expect(result).toMatchObject({
      skipped: false, total: 9, sealed: 2, alreadyPreserved: 1, stillDrafting: 1,
      empty: 1, missing: 1, failed: 3, complete: false,
    });

    const normal = (await getEntry('normal'))!;
    expect(normal.baseline).toMatchObject({
      text: 'A stone corridor.', title: 'Corridor', source: 'legacy_snapshot', capturedAt: 1_000,
    });
    expect(normal.createdAt).toBe(1_000);
    expect(normal.updatedAt).toBe(5_000);
    expect(normal.dreamDetails).toEqual({ awareness: 'yes' });
    expect((normal as any).practiceContext).toEqual({ note: 'observed' });
    expect((normal as any).futureField).toEqual({ keep: 'me' });
    expect(normal.body).toBe('A stone corridor.');

    const noUpdated = (await getEntry('no-updated-at'))!;
    expect(noUpdated.baseline?.text).toBe('Only a createdAt.');
    expect(noUpdated.updatedAt).toBe(2_000);

    expect((await getEntry('empty'))?.baseline).toBeUndefined();
    const drafting = (await getEntry('drafting'))!;
    expect(drafting.baseline).toBeUndefined();
    expect(drafting.baselinePending).toBe(true);
    expect((await getEntry('already'))?.baseline?.text).toBe('Original.');
    expect((await getEntry('already'))?.body).toBe('Edited later.');
  });

  it('leaves malformed records byte-for-byte untouched and does not count them as migrated', async () => {
    await seedMixedJournal();
    const encrypted = ['bad-cipher', 'no-created-at'];
    const before = await snapshot(encrypted);
    const result = await migrateJournalBaselines({ yieldFn: noYield });
    expect(await snapshot(encrypted)).toEqual(before);
    // Existing behavior: any read re-encrypts a plaintext value. Its content is unchanged.
    expect(await secureGetItem('journal:bad-json')).toBe('this is not json');
    expect(result.failed).toBe(3);
    expect(result.complete).toBe(false);
    expect(JSON.parse((await AsyncStorage.getItem(BASELINE_MIGRATION_KEY))!)).toMatchObject({
      status: 'partial', failed: 3,
    });
    // The readable entries are still all available.
    expect((await listEntries()).map(entry => entry.id).sort()).toEqual(
      ['already', 'drafting', 'empty', 'no-updated-at', 'normal'],
    );
  });

  it('is idempotent: a second run rewrites nothing', async () => {
    await seedMixedJournal();
    const ids = ['normal', 'no-updated-at', 'empty', 'drafting', 'already', 'bad-cipher', 'no-created-at'];
    await migrateJournalBaselines({ yieldFn: noYield });
    const afterFirst = await snapshot(ids);
    const second = await migrateJournalBaselines({ yieldFn: noYield });
    expect(await snapshot(ids)).toEqual(afterFirst);
    expect(second.sealed).toBe(0);
    expect(second.alreadyPreserved).toBe(3);
    const normal = (await getEntry('normal'))!;
    expect(normal.baseline?.source).toBe('legacy_snapshot');
  });

  it('marks complete only when nothing failed, then skips scanning', async () => {
    await seed('a', { createdAt: 1, body: 'one' });
    await seed('b', { createdAt: 2, body: 'two' });
    const first = await migrateJournalBaselines({ yieldFn: noYield });
    expect(first).toMatchObject({ sealed: 2, failed: 0, complete: true });
    const second = await migrateJournalBaselines({ yieldFn: noYield });
    expect(second).toMatchObject({ skipped: true, complete: true, total: 0 });
  });

  it('resumes after an interruption without duplicating work', async () => {
    for (let i = 0; i < 6; i += 1) await seed(`e${i}`, { createdAt: 100 + i, body: `legacy ${i}` });
    let yields = 0;
    const crashAfterTwo = async () => {
      yields += 1;
      if (yields === 2) throw new Error('app killed');
    };
    await expect(migrateJournalBaselines({ batchSize: 1, yieldFn: crashAfterTwo })).rejects.toThrow('app killed');
    expect(await AsyncStorage.getItem(BASELINE_MIGRATION_KEY)).toBeNull();

    const sealedBefore = (await listEntries()).filter(entry => entry.baseline).length;
    expect(sealedBefore).toBe(2);
    const afterCrash = await snapshot(['e0', 'e1']);

    const resumed = await migrateJournalBaselines({ batchSize: 1, yieldFn: noYield });
    expect(resumed).toMatchObject({ alreadyPreserved: 2, sealed: 4, failed: 0, complete: true });
    expect(await snapshot(['e0', 'e1'])).toEqual(afterCrash);
    expect((await listEntries()).every(entry => entry.baseline?.source === 'legacy_snapshot')).toBe(true);
  });

  it('migrates legacy plaintext records that predate encrypted storage', async () => {
    await seedRaw('plain', JSON.stringify({ id: 'plain', schemaVersion: 2, createdAt: 7, body: 'Plain.' }));
    const result = await migrateJournalBaselines({ yieldFn: noYield });
    expect(result.sealed).toBe(1);
    expect(await raw('plain')).toMatch(/^enc:v1:/);
    expect((await getEntry('plain'))?.baseline?.text).toBe('Plain.');
  });

  it('works through a large journal in small batches, yielding between them', async () => {
    const total = 120;
    for (let i = 0; i < total; i += 1) await seed(`big${i}`, { createdAt: 1_000 + i, body: `dream ${i}` });
    const yieldFn = jest.fn(async () => {});
    const result = await migrateJournalBaselines({ batchSize: 10, yieldFn });
    expect(result).toMatchObject({ total, sealed: total, failed: 0, complete: true });
    expect(yieldFn).toHaveBeenCalledTimes(total / 10);
  });
});
