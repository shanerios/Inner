import AsyncStorage from '@react-native-async-storage/async-storage';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

import { buildPracticeContext } from '../practiceLinking';
import { finishPracticeActivity, listPracticeActivity, recordPracticeActivity } from '../practiceHistory';
import { saveRecurringSignalFocus } from '../recurringDreamSignals';
import { saveSelectedRecommendation } from '../recommendationMemory';

describe('practice history', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
  });

  it('records and finishes local practice evidence', async () => {
    await recordPracticeActivity({ id: 'guardian-1', type: 'guardian', contentTitle: 'Recognition', startedAt: 1_000 });
    await finishPracticeActivity('guardian-1', 61_000);
    expect(await listPracticeActivity()).toEqual([
      expect.objectContaining({ id: 'guardian-1', endedAt: 61_000 }),
    ]);
  });

  it('links the latest practice of each type within the preceding 72 hours', async () => {
    const capturedAt = 80 * 60 * 60 * 1_000;
    await recordPracticeActivity({ id: 'old', type: 'chamber', contentTitle: 'Too old', startedAt: capturedAt - 73 * 60 * 60 * 1_000 });
    await recordPracticeActivity({ id: 'chamber-1', type: 'chamber', contentTitle: 'Outer Sanctum', startedAt: capturedAt - 60_000 });
    await recordPracticeActivity({ id: 'soundscape-1', type: 'soundscape', contentTitle: 'Ocean', startedAt: capturedAt - 120_000 });

    const context = await buildPracticeContext(undefined, capturedAt);
    expect(context?.links.map(link => link.sessionId)).toEqual(['chamber-1', 'soundscape-1']);
  });

  it('carries a selected recurring dream sign into the next night context', async () => {
    await saveRecurringSignalFocus({ sign: 'Water', count: 4, rememberedDreams: 7 }, undefined, () => 1_000);
    const context = await buildPracticeContext(undefined, 61_000);
    expect(context?.links[0]).toEqual(expect.objectContaining({
      type: 'recognition_signal',
      contentTitle: 'Recognition focus · Water',
    }));
  });

  it('freezes the recommendation opened before the practice into its outcome context', async () => {
    await saveSelectedRecommendation({
      id: 'environment:ocean',
      kind: 'repeat_environment',
      title: 'Return to Ocean',
      reason: 'You recalled dreams after 4 of 5 Ocean nights.',
      actionLabel: 'SHAPE ANOTHER OCEAN NIGHT',
      environment: 'ocean',
    }, undefined, () => 1_000);

    const context = await buildPracticeContext(undefined, 2_000);
    expect(context?.links).toEqual([]);
    expect(context?.recommendation).toEqual(expect.objectContaining({
      id: 'environment:ocean',
      selectedAt: 1_000,
    }));
  });

  it('does not link a recommendation selected more than a day before practice', async () => {
    await saveSelectedRecommendation({
      id: 'recognition:refresh',
      kind: 'recognition_refresh',
      title: 'Refresh recognition',
      reason: 'Recognition practice has not appeared recently.',
      actionLabel: 'OPEN LUCID SIGNAL',
    }, undefined, () => 1_000);

    expect(await buildPracticeContext(undefined, 1_000 + 24 * 60 * 60_000 + 1)).toBeUndefined();
  });
});
