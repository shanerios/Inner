import { describe, expect, it } from '@jest/globals';
import type { JournalEntry } from '../journalRepo';
import type { JourneyMemorySession } from '../journeyMemory';
import { derivePracticeMemoryInsights } from '../practiceMemory';
import type { NightRecord } from '../nightRecords';

function session(id: string, environment: string, recall: 'none' | 'fragment' | 'dream'): JourneyMemorySession {
  return {
    schemaVersion: 2,
    id,
    journeyId: `overnight-${environment}`,
    title: `${environment} night`,
    startedAt: Number(id.replace(/\D/g, '')) || 1,
    plannedDurationMs: 1,
    endPolicy: 'protocolControlled',
    protocolVersion: 1,
    seed: 1,
    initialConfig: {} as any,
    stages: [{ id: 'sleep', durationMs: 1, config: { environment, environmentGain: 1 } as any }],
    events: [],
    morningReflection: { answers: { recall }, savedAt: 2 },
  };
}

function entry(id: string, title: string, awareness?: 'no' | 'maybe' | 'yes'): JournalEntry {
  return {
    schemaVersion: 2,
    id,
    createdAt: 1,
    updatedAt: 1,
    kind: 'dream',
    body: 'A remembered dream',
    dreamDetails: awareness ? { awareness } : undefined,
    practiceContext: {
      linkedAt: 1,
      links: [{ sessionId: `practice-${id}`, type: 'soundscape', contentTitle: title, startedAt: 1, linkReason: 'recent_practice' }],
    },
  };
}

describe('practice memory insights', () => {
  it('uses possible-pattern language only with a comparison group and a meaningful difference', () => {
    const sessions = [
      ...['1', '2', '3', '4'].map(id => session(id, 'ocean', 'dream')),
      session('5', 'ocean', 'none'),
      session('6', 'forest', 'dream'),
      session('7', 'forest', 'none'),
      session('8', 'forest', 'none'),
      session('9', 'forest', 'none'),
    ];
    expect(derivePracticeMemoryInsights([], sessions)[0]).toEqual(expect.objectContaining({
      label: 'POSSIBLE PATTERN',
      text: 'Ocean may be associated with stronger dream recall for you.',
    }));
  });

  it('reports multidimensional outcomes as observations rather than causes', () => {
    const entries = [entry('1', 'Ocean Stillness', 'yes'), entry('2', 'Ocean Stillness', 'no'), entry('3', 'Ocean Stillness', 'yes')];
    expect(derivePracticeMemoryInsights(entries, [])[0]).toEqual({
      confidence: 'observed',
      label: 'OBSERVED',
      text: 'Lucid awareness was reported in 2 of 3 dreams linked to Ocean Stillness.',
      evidence: 'This records an association in your reports; it does not establish cause.',
    });
  });

  it('does not invent a pattern from one linked dream', () => {
    expect(derivePracticeMemoryInsights([entry('1', 'Outer Sanctum')], [])[0].label).toBe('EARLY OBSERVATION');
  });

  it('includes no-recall Night Records in a linked practice denominator', () => {
    const records: NightRecord[] = ['dream', 'none', 'fragment'].map((recall, index) => ({
      schemaVersion: 1,
      id: `night-${index}`,
      source: 'scheduled_signal',
      sourceSessionId: `signal-${index}`,
      scheduledAt: index,
      sleepOnsetAt: index,
      reviewAt: index,
      reflectedAt: index,
      outcome: { recall: recall as 'dream' | 'none' | 'fragment' },
      practiceContext: {
        linkedAt: index,
        links: [{ sessionId: 'ocean', type: 'soundscape', contentTitle: 'Ocean Stillness', startedAt: index, linkReason: 'recent_practice' }],
      },
    }));
    expect(derivePracticeMemoryInsights([], [], records)[0]).toEqual(expect.objectContaining({
      text: 'Dream recall was reported after 2 of 3 nights linked to Ocean Stillness.',
    }));
  });
});
