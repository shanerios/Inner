import { describe, expect, it, jest } from '@jest/globals';
import {
  armPracticeExperimentNight,
  experimentContextForPractice,
  loadCurrentPracticeExperiment,
  practiceExperimentView,
  recordPracticeExperimentOutcome,
  startEnvironmentComparisonExperiment,
} from '../practiceExperiments';
import type { NightRecord } from '../nightRecords';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    getItem: jest.fn(async (key: string) => values.get(key) ?? null),
    setItem: jest.fn(async (key: string, value: string) => { values.set(key, value); }),
  };
}

function record(
  id: string,
  snapshot: NonNullable<NightRecord['practiceContext']>['experiment'],
  recall: 'none' | 'dream' = 'dream',
): NightRecord {
  return {
    schemaVersion: 1,
    id,
    source: 'overnight_journey',
    sourceSessionId: `session-${id}`,
    scheduledAt: 1,
    sleepOnsetAt: 2,
    reviewAt: 3,
    reflectedAt: Number(id.replace(/\D/g, '')) || 4,
    practiceContext: { linkedAt: 4, links: [], experiment: snapshot },
    outcome: { recall },
  };
}

describe('personal practice experiments', () => {
  it('arms only the next prescribed condition for one day', async () => {
    const storage = memoryStorage();
    const experiment = await startEnvironmentComparisonExperiment(storage as any, () => 0);
    expect(experiment.sequence).toEqual(['ocean', 'temple', 'ocean', 'temple', 'ocean']);
    await armPracticeExperimentNight(experiment.id, storage as any, () => 100);
    await expect(experimentContextForPractice('temple', 200, storage as any)).resolves.toBeUndefined();
    await expect(experimentContextForPractice('ocean', 200, storage as any)).resolves.toEqual(expect.objectContaining({
      experimentId: experiment.id,
      conditionId: 'ocean',
      nightNumber: 1,
    }));
    await expect(experimentContextForPractice('ocean', 100 + 24 * 60 * 60_000 + 1, storage as any)).resolves.toBeUndefined();
  });

  it('advances once per reflected night and completes after five outcomes', async () => {
    const storage = memoryStorage();
    const experiment = await startEnvironmentComparisonExperiment(storage as any, () => 0);
    for (let index = 0; index < 5; index += 1) {
      await armPracticeExperimentNight(experiment.id, storage as any, () => index * 1_000 + 100);
      const current = await loadCurrentPracticeExperiment(storage as any);
      const expected = current!.sequence[current!.outcomes.length];
      const snapshot = await experimentContextForPractice(expected, index * 1_000 + 200, storage as any);
      await recordPracticeExperimentOutcome(record(`night-${index + 1}`, snapshot, index === 1 ? 'none' : 'dream'), storage as any);
      await recordPracticeExperimentOutcome(record(`night-${index + 1}`, snapshot), storage as any);
    }
    const completed = await loadCurrentPracticeExperiment(storage as any);
    expect(completed?.status).toBe('completed');
    expect(completed?.outcomes).toHaveLength(5);
    expect(practiceExperimentView(completed!).evidence).toContain('Ocean: 3 of 3 nights included recall.');
    expect(practiceExperimentView(completed!).evidence).toContain('Temple: 1 of 2 nights included recall.');
  });

  it('never counts development QA outcomes', async () => {
    const storage = memoryStorage();
    const experiment = await startEnvironmentComparisonExperiment(storage as any, () => 0);
    await armPracticeExperimentNight(experiment.id, storage as any, () => 100);
    const snapshot = await experimentContextForPractice('ocean', 200, storage as any);
    await recordPracticeExperimentOutcome({ ...record('qa-1', snapshot), testSession: true }, storage as any);
    expect((await loadCurrentPracticeExperiment(storage as any))?.outcomes).toHaveLength(0);
  });
});
