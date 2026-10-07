import { describe, expect, it } from '@jest/globals';
import { suggestDreamSigns } from '../dreamSigns';

describe('dream sign suggestions', () => {
  it('finds multiple concrete signs in taxonomy order', () => {
    expect(suggestDreamSigns(
      'I was swimming in the ocean, then I flew away while someone chased me.',
    )).toEqual(['Flying', 'Water', 'Chased']);
  });

  it('recognizes common phrases used in spoken dream recall', () => {
    expect(suggestDreamSigns(
      "My sister and I were in an unfamiliar house. I couldn't find the door, and a dark figure appeared.",
    )).toEqual(['Lost', 'Familiar Person', 'Unknown Place', 'Shadow Presence']);
  });

  it('handles curly apostrophes from platform transcription', () => {
    expect(suggestDreamSigns("I couldn’t get back to the room.")).toEqual(['Lost']);
  });

  it('does not turn adjacent or figurative words into signs', () => {
    expect(suggestDreamSigns('I reflected on a waterfall painting beside my toothbrush.')).toEqual([]);
  });

  it('does not return the same sign more than once', () => {
    expect(suggestDreamSigns('There was water, an ocean, and then a river.')).toEqual(['Water']);
  });
});
