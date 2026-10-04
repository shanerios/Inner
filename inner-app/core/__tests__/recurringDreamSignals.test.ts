import { describe, expect, it, jest } from '@jest/globals';
import type { JournalEntry } from '../journalRepo';
import { createRecurringSignalJourney, deriveRecurringDreamSignal, recurringSignalObservation } from '../recurringDreamSignals';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

function dream(id: string, createdAt: number, signs: string[], body = 'Remembered'): JournalEntry {
  return { schemaVersion: 2, id, createdAt, updatedAt: createdAt, kind: 'dream', body, dreamSigns: signs };
}

describe('recurring dream signals', () => {
  it('requires the same sign in at least three recent remembered dreams', () => {
    const result = deriveRecurringDreamSignal([
      dream('1', 4, ['Water', 'Water']),
      dream('2', 3, ['water']),
      dream('3', 2, ['Water']),
      dream('4', 1, ['Flying']),
    ]);
    expect(result).toEqual({ sign: 'Water', count: 3, rememberedDreams: 4 });
    expect(recurringSignalObservation(result!)).toBe('Water has appeared in 3 of your last 4 remembered dreams.');
  });

  it('does not treat empty or no-recall entries as evidence', () => {
    const noRecall = { ...dream('1', 2, ['Water'], ''), dreamDetails: { recall: 'none' as const } };
    expect(deriveRecurringDreamSignal([noRecall, dream('2', 1, ['Water'])])).toBeNull();
  });

  it('adapts Lucid Signal guidance while preserving its scheduling identity', () => {
    const base = {
      id: 'lucid-signal',
      title: 'Lucid Signal',
      durationLabel: '7 min',
      summary: 'Base',
      timeline: {
        id: 'lucid-signal', title: 'Lucid Signal', stages: [],
        guidance: [{ id: 'signal-rehearse', atMs: 1, heading: 'Rehearse', prompt: 'Base prompt' }],
      },
    } as any;
    const journey = createRecurringSignalJourney(base, 'Water');
    expect(journey.id).toBe('lucid-signal');
    expect(journey.title).toBe('Lucid Signal — Water');
    expect(journey.timeline.guidance?.[0].prompt).toContain('could this be a dream?');
  });
});
