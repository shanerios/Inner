import { describe, expect, it, jest } from '@jest/globals';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

import { createPersonalizedLucidJourney } from '../factoryJourneys';
import {
  deletePersonalizedJourney,
  loadPersonalizedJourneys,
  savePersonalizedJourney,
} from '../personalizedJourneyStore';

function memoryStorage(initial: string | null = null) {
  let value = initial;
  return {
    getItem: async () => value,
    setItem: async (_key: string, next: string) => { value = next; },
  };
}

describe('personalized journey store', () => {
  it('preserves the complete generated journey under the user name', async () => {
    const storage = memoryStorage();
    const journey = createPersonalizedLucidJourney({
      intention: 'visualization', durationMinutes: 10, feel: 'immersive', familiarity: 'familiar',
    });
    const saved = await savePersonalizedJourney('  Night Door  ', journey, storage as any, () => 42);
    expect(saved).toHaveLength(1);
    expect(saved[0]).toEqual(expect.objectContaining({ title: 'Night Door', createdAt: 42, schemaVersion: 1 }));
    expect(saved[0].timeline.title).toBe('Night Door');
    expect(saved[0].timeline.guidance).toEqual(journey.timeline.guidance);
    expect(saved[0].timeline.stages).toEqual(journey.timeline.stages);
  });

  it('filters malformed storage and removes a saved journey', async () => {
    const storage = memoryStorage('{bad json');
    expect(await loadPersonalizedJourneys(storage as any)).toEqual([]);
    const journey = createPersonalizedLucidJourney({
      intention: 'calm', durationMinutes: 5, feel: 'grounded', familiarity: 'new',
    });
    const [saved] = await savePersonalizedJourney('Quiet Return', journey, storage as any, () => 7);
    expect(await deletePersonalizedJourney(saved.id, storage as any)).toEqual([]);
  });
});
