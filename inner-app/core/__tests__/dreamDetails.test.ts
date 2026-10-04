import { describe, expect, it, jest } from '@jest/globals';

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {},
}));
jest.mock('../secureStorage', () => ({
  secureGetItem: jest.fn(),
  secureRemoveItem: jest.fn(),
  secureSetItem: jest.fn(),
}));

import { dreamDetailsSummary, normalizeDreamDetails } from '../dreamDetails';
import { normalizeJournalEntry } from '../journalRepo';

describe('Dream Details', () => {
  it('keeps the lucidity dimensions independent', () => {
    expect(normalizeDreamDetails({ awareness: 'yes', agency: 'no' })).toEqual({
      awareness: 'yes',
      agency: 'no',
      recall: undefined,
      sleepImpact: undefined,
    });
  });

  it('removes control answers when control was not attempted', () => {
    expect(normalizeDreamDetails({
      control: {
        attempted: 'no',
        domains: ['place'],
        result: 'worked',
        otherText: 'A hidden value',
      },
    })?.control).toEqual({ attempted: 'no' });
  });

  it('prevents negative cue status from coexisting with recognized cue types', () => {
    expect(normalizeDreamDetails({
      innerCue: { status: 'none', types: ['sound', 'feeling'] },
    })?.innerCue).toEqual({ status: 'none' });
  });

  it('filters unsupported values and duplicate selections', () => {
    expect(normalizeDreamDetails({
      awareness: 'absolutely',
      control: { attempted: 'yes', domains: ['place', 'place', 'invalid'] },
      innerCue: { status: 'recognized', types: ['sound', 'invalid'] },
    })).toEqual({
      recall: undefined,
      awareness: undefined,
      agency: undefined,
      sleepImpact: undefined,
      control: { attempted: 'yes', domains: ['place'], result: undefined },
      innerCue: { status: 'recognized', types: ['sound'] },
    });
  });

  it('formats a readable summary', () => {
    expect(dreamDetailsSummary({
      awareness: 'maybe',
      agency: 'a_little',
      control: { attempted: 'yes', domains: ['movement', 'physics'], result: 'worked' },
      innerCue: { status: 'unsure' },
    })).toEqual([
      'Lucid awareness: Maybe',
      'Agency: A little',
      'Control: Movement, Physics, worked',
      'Inner cue: Not sure',
    ]);
  });

  it('opens legacy journal entries with versioned, optional metadata', () => {
    const legacy = normalizeJournalEntry({
      id: 'legacy-dream',
      createdAt: 100,
      updatedAt: 120,
      body: 'A remembered room.',
      kind: 'note',
      futureField: 'preserved',
      dreamDetails: { awareness: 'unsupported' },
    });
    expect(legacy).toEqual(expect.objectContaining({
      schemaVersion: 2,
      id: 'legacy-dream',
      body: 'A remembered room.',
      kind: 'note',
      futureField: 'preserved',
      dreamDetails: undefined,
    }));
  });
});
