import { describe, expect, it, jest } from '@jest/globals';
import type { JournalEntry } from '../journalRepo';
import {
  activeRecurringSignalFocus,
  createRecurringSignalJourney,
  deriveRecurringDreamSignal,
  recurringSignalObservation,
  markRecurringSignalPracticeCompleted,
  saveRecurringSignalFocus,
} from '../recurringDreamSignals';

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

  it('keeps an accepted recognition focus available for the next three days', () => {
    const focus = { sign: 'Water', count: 4, rememberedDreams: 7, setAt: 1_000 };
    expect(activeRecurringSignalFocus(focus, 1_000 + 72 * 60 * 60 * 1000)).toEqual(focus);
    expect(activeRecurringSignalFocus(focus, 1_001 + 72 * 60 * 60 * 1000)).toBeNull();
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
    expect(journey.recognitionPractice).toEqual({
      type: 'recurring_dream_sign', sign: 'Water', protocolVersion: 1,
    });
  });

  it('attaches a completed recognition practice to the matching focus', async () => {
    let value: string | null = null;
    const storage = {
      getItem: async () => value,
      setItem: async (_key: string, next: string) => { value = next; },
      removeItem: async () => { value = null; },
    };
    await saveRecurringSignalFocus({ sign: 'Water', count: 4, rememberedDreams: 7 }, storage as any, () => 100);
    const completed = await markRecurringSignalPracticeCompleted('water', {
      sessionId: 'practice-1', completedAt: 200, signalId: 'guardian', presentationCount: 7, protocolVersion: 1,
    }, storage as any);
    expect(completed?.completedPractice).toEqual(expect.objectContaining({
      sessionId: 'practice-1', signalId: 'guardian', presentationCount: 7,
    }));
  });
});
