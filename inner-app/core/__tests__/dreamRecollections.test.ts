import { describe, expect, it } from '@jest/globals';
import {
  additionHeading,
  baselineHeading,
  bodyDiffersFromBaseline,
  buildDreamTimeline,
  normalizeAdditions,
  normalizeBaseline,
  type DreamBaseline,
} from '../dreamRecollections';

const baseline: DreamBaseline = {
  text: 'A stone corridor toward a blue light.',
  capturedAt: 1_000,
  source: 'original',
  preservedAt: 2_000,
};

describe('dream recollections', () => {
  it('accepts a valid baseline and rejects malformed ones', () => {
    expect(normalizeBaseline(baseline)).toEqual(baseline);
    expect(normalizeBaseline({ ...baseline, title: 'Corridor' })?.title).toBe('Corridor');
    expect(normalizeBaseline(null)).toBeUndefined();
    expect(normalizeBaseline([])).toBeUndefined();
    expect(normalizeBaseline({ ...baseline, text: 7 })).toBeUndefined();
    expect(normalizeBaseline({ ...baseline, source: 'guess' })).toBeUndefined();
    expect(normalizeBaseline({ ...baseline, capturedAt: 'yesterday' })).toBeUndefined();
    expect(normalizeBaseline({ ...baseline, preservedAt: NaN })).toBeUndefined();
  });

  it('keeps only well-formed, unique additions', () => {
    const result = normalizeAdditions([
      { id: 'a', kind: 'recollection', text: 'A staircase.', createdAt: 5 },
      { id: 'a', kind: 'reflection', text: 'duplicate id', createdAt: 6 },
      { id: 'b', kind: 'reflection', text: 'Reminds me of another dream.', createdAt: 9, editedAt: 12 },
      { id: 'c', kind: 'opinion', text: 'wrong kind', createdAt: 1 },
      { id: 'd', kind: 'reflection', text: '   ', createdAt: 1 },
      { id: 'e', kind: 'reflection', text: 'no time' },
      null,
      'text',
    ]);
    expect(result?.map(item => item.id)).toEqual(['a', 'b']);
    expect(result?.[1].editedAt).toBe(12);
    expect(normalizeAdditions('nope')).toBeUndefined();
    expect(normalizeAdditions([])).toBeUndefined();
  });

  it('tells when the current account differs from the baseline', () => {
    expect(bodyDiffersFromBaseline(undefined, 'anything')).toBe(false);
    expect(bodyDiffersFromBaseline(baseline, baseline.text)).toBe(false);
    expect(bodyDiffersFromBaseline(baseline, `  ${baseline.text}\n`)).toBe(false);
    expect(bodyDiffersFromBaseline(baseline, baseline.text.replace(/\n/g, '\r\n'))).toBe(false);
    expect(bodyDiffersFromBaseline(baseline, `${baseline.text} And a staircase.`)).toBe(true);
  });

  it('never calls a legacy snapshot the original', () => {
    expect(baselineHeading(baseline)).toBe('Original recollection');
    expect(baselineHeading({ ...baseline, source: 'legacy_snapshot' })).toBe('First saved version');
    expect(additionHeading('recollection')).toBe('Additional recollection');
    expect(additionHeading('reflection')).toBe('Reflection');
  });

  it('orders the timeline with the baseline first, then additions by time', () => {
    const timeline = buildDreamTimeline(baseline, [
      { id: 'z', kind: 'reflection', text: 'later', createdAt: 30 },
      { id: 'b', kind: 'recollection', text: 'same time, b', createdAt: 20 },
      { id: 'a', kind: 'recollection', text: 'same time, a', createdAt: 20, editedAt: 25 },
    ]);
    expect(timeline.map(item => item.id)).toEqual(['baseline', 'a', 'b', 'z']);
    expect(timeline[0]).toMatchObject({ kind: 'baseline', timestamp: 1_000, edited: false });
    expect(timeline[1].edited).toBe(true);
    expect(buildDreamTimeline(undefined, undefined)).toEqual([]);
  });
});
