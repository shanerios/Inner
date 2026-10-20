jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'));

import AsyncStorage from '@react-native-async-storage/async-storage';
import { beforeEach, describe, expect, it } from '@jest/globals';
import { resetAnalyticsForTests, setAnalyticsClient } from '../analytics';
import { resetJournalAnalyticsForTests, trackEntryContent, trackEntryRevisited } from '../journalAnalytics';
import { trackGuardianEnded, trackGuardianStarted } from '../practiceAnalytics';
import { trackOnboardingCompletedIfStarted, trackOnboardingStarted } from '../onboardingAnalytics';

const captured: Array<[string, any]> = [];
const names = () => captured.map(([name]) => name);

beforeEach(async () => {
  captured.length = 0;
  resetAnalyticsForTests();
  resetJournalAnalyticsForTests();
  await AsyncStorage.clear();
  setAnalyticsClient({ capture: (event, props) => { captured.push([event, props]); } });
});

describe('dream entries', () => {
  it('ignores empty entries and reports an entry once, with no content or id', async () => {
    await trackEntryContent({ id: 'e1', body: '   ', kind: 'dream' });
    expect(names()).toEqual([]);
    await trackEntryContent({ id: 'e1', body: 'I was flying over the sea', kind: 'dream', captureInput: { method: 'typed' } });
    await trackEntryContent({ id: 'e1', body: 'I was flying over the sea and more', kind: 'dream' });
    expect(names()).toEqual(['dream_entry_created']);
    const serialized = JSON.stringify(captured);
    expect(serialized).not.toContain('flying');
    expect(serialized).not.toContain('e1');
  });

  it('does not double count across app restarts', async () => {
    await trackEntryContent({ id: 'e2', body: 'x', kind: 'dream' });
    resetJournalAnalyticsForTests();
    await trackEntryContent({ id: 'e2', body: 'xy', kind: 'dream' });
    expect(names()).toEqual(['dream_entry_created']);
  });

  it('treats a just-created entry as not revisited and buckets older ones', () => {
    const now = 10_000_000_000;
    trackEntryRevisited(now - 30_000, now);
    expect(names()).toEqual([]);
    trackEntryRevisited(now - 3 * 86_400_000, now);
    expect(captured[0]).toEqual(['dream_entry_revisited', { age_bucket: 'under_week' }]);
  });
});

describe('guardian practice', () => {
  it('reports completion once and only at 85% or more', () => {
    trackGuardianStarted('a1', 'g1');
    trackGuardianEnded('a1', 'g1', 50_000, 100_000);
    expect(names()).toEqual(['guardian_practice_started']);
    trackGuardianEnded('a1', 'g1', 90_000, 100_000);
    trackGuardianEnded('a1', 'g1', 100_000, 100_000);
    expect(names()).toEqual(['guardian_practice_started', 'guardian_practice_completed']);
    trackGuardianEnded('a2', 'g1', 10, 0);
    expect(names()).toHaveLength(2);
  });
});

describe('onboarding', () => {
  it('only reports completion for an install that reported a start, once', async () => {
    await trackOnboardingCompletedIfStarted();
    expect(names()).toEqual([]);
    await trackOnboardingStarted();
    await trackOnboardingStarted();
    await trackOnboardingCompletedIfStarted();
    await trackOnboardingCompletedIfStarted();
    expect(names()).toEqual(['onboarding_started', 'onboarding_completed']);
  });
});
