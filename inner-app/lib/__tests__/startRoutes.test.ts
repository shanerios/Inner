import { describe, expect, it, jest } from '@jest/globals';
import { startFromSuggestion } from '../startRoutes';

jest.mock('../../data/learn', () => ({
  LEARN_TRACKS: {
    lucid: { lessons: [{ id: 'known-lesson' }] },
    obe: { lessons: [] },
  },
}));

const navigation = () => ({ navigate: jest.fn() } as any);

describe('startFromSuggestion', () => {
  it('routes media suggestions to JourneyPlayer', () => {
    const nav = navigation();
    startFromSuggestion({ id: 'rain', kind: 'soundscape' }, nav);
    expect(nav.navigate).toHaveBeenCalledWith('JourneyPlayer', { trackId: 'rain' });
  });

  it('routes known lessons with the required reader params', () => {
    const nav = navigation();
    startFromSuggestion({ id: 'known-lesson', kind: 'lesson' }, nav);
    expect(nav.navigate).toHaveBeenCalledWith('LessonReader', {
      trackId: 'lucid',
      lessonId: 'known-lesson',
    });
  });

  it('sends unknown lesson suggestions to the hub', () => {
    const nav = navigation();
    startFromSuggestion({ id: 'missing', kind: 'lesson' }, nav);
    expect(nav.navigate).toHaveBeenCalledWith('LearnHub');
  });
});
