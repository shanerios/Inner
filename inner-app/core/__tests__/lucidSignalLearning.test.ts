import { describe, expect, it, jest } from '@jest/globals';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

import {
  getPendingLucidSignalReflection,
  lucidSignalInsight,
  lucidSignalLearningSummary,
  lucidSignalRecommendation,
  loadLucidSignalLearning,
  recordLucidSignalNight,
  saveLucidSignalReflection,
  saveLucidSignalMorningCapture,
} from '../lucidSignalLearning';

function memoryStorage() {
  let value: string | null = null;
  return {
    getItem: async () => value,
    setItem: async (_key: string, next: string) => { value = next; },
  };
}

describe('Lucid Signal learning', () => {
  it('waits until morning before offering a reflection', async () => {
    const storage = memoryStorage();
    const hour = 60 * 60 * 1000;
    const night = await recordLucidSignalNight(1_000, [1_000 + 4.5 * hour, 1_000 + 6 * hour], storage as any, () => 500);
    await expect(getPendingLucidSignalReflection(storage as any, () => night.reviewAt - 1)).resolves.toBeNull();
    await expect(getPendingLucidSignalReflection(storage as any, () => night.reviewAt)).resolves.toEqual(night);
  });

  it('stores a private response and stops asking about that night', async () => {
    const storage = memoryStorage();
    const night = await recordLucidSignalNight(1_000, [2_000], storage as any, () => 500);
    await saveLucidSignalReflection(night.id, { noticed: 'yes', lucid: true, sleepImpact: 'none' }, storage as any, () => 9_000);
    await expect(getPendingLucidSignalReflection(storage as any, () => night.reviewAt + 1)).resolves.toBeNull();
    expect((await loadLucidSignalLearning(storage as any)).nights[0].reflection?.lucid).toBe(true);
  });

  it('keeps a morning capture linked while the structured reflection remains pending', async () => {
    const storage = memoryStorage();
    const night = await recordLucidSignalNight(1_000, [2_000], storage as any, () => 500);
    await saveLucidSignalMorningCapture(night.id, 'journal-1', storage as any);
    const pending = await getPendingLucidSignalReflection(storage as any, () => night.reviewAt + 1);
    expect(pending?.morningCaptureEntryId).toBe('journal-1');
  });

  it('waits for three nights before describing a pattern', () => {
    const reflected = (noticed: 'yes' | 'no', lucid: boolean, sleepImpact: 'none' | 'woke') => ({
      id: Math.random().toString(), scheduledAt: 1, sleepOnsetAt: 2, cueTimes: [3], reviewAt: 4,
      reflection: { noticed, lucid, sleepImpact },
    });
    expect(lucidSignalInsight([reflected('yes', true, 'none'), reflected('yes', false, 'none')])).toBeNull();
    expect(lucidSignalInsight([reflected('yes', true, 'none'), reflected('yes', false, 'none'), reflected('no', false, 'none')]))
      .toContain('carried into lucidity');
  });

  it('acknowledges early reflections without calling them a pattern', () => {
    const night = {
      id: 'one', scheduledAt: 1, sleepOnsetAt: 2, cueTimes: [3], reviewAt: 4,
      reflection: { noticed: 'yes' as const, lucid: false, sleepImpact: 'none' as const },
    };
    expect(lucidSignalLearningSummary([night])).toEqual(expect.objectContaining({
      label: '1 DAY OBSERVED', nightsObserved: 1,
    }));
    expect(lucidSignalLearningSummary([night, { ...night, id: 'two' }])?.text).toContain('One more night');
    expect(lucidSignalLearningSummary([night, { ...night, id: 'two' }, { ...night, id: 'three' }])?.label)
      .toBe('3 DAYS OBSERVED');
  });

  it('recommends fewer later cues when the signal repeatedly wakes the user', () => {
    const night = (id: string, sleepImpact: 'none' | 'woke') => ({
      id, scheduledAt: 1, sleepOnsetAt: 2, cueTimes: [3], reviewAt: 4,
      reflection: { noticed: 'yes' as const, lucid: false, sleepImpact },
    });
    expect(lucidSignalRecommendation([
      night('one', 'woke'), night('two', 'woke'), night('three', 'none'),
    ])).toEqual(expect.objectContaining({ plan: 'gentle', title: 'A gentler signal night' }));
  });

  it('preserves the current plan after the signal has carried into lucidity', () => {
    const nights = ['one', 'two', 'three'].map((id, index) => ({
      id, scheduledAt: 1, sleepOnsetAt: 2, cueTimes: [3], reviewAt: 4,
      reflection: { noticed: 'yes' as const, lucid: index === 0, sleepImpact: 'none' as const },
    }));
    expect(lucidSignalRecommendation(nights, 'gentle')).toEqual(expect.objectContaining({
      plan: 'gentle', title: 'Keep what is working',
    }));
  });
});
