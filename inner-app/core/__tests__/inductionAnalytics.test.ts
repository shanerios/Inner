import { afterEach, describe, expect, it, jest } from '@jest/globals';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'));

import { resetAnalyticsForTests, setAnalyticsClient } from '../analytics';
import {
  trackInductionCompleted,
  trackInductionDismissed,
  trackInductionLeftEarly,
  trackInductionOffered,
  trackInductionStarted,
} from '../inductionAnalytics';

describe('The Induction funnel events', () => {
  afterEach(() => resetAnalyticsForTests());

  it('sends only how it was offered and how far someone got', () => {
    const capture = jest.fn();
    setAnalyticsClient({ capture });
    trackInductionOffered('new');
    trackInductionStarted('new');
    trackInductionCompleted('new', 359.6);
    trackInductionLeftEarly('returning', 41.7);
    trackInductionDismissed(null);
    expect(capture.mock.calls).toEqual([
      ['induction_offered', { entry: 'new' }],
      ['induction_started', { entry: 'new' }],
      ['induction_completed', { entry: 'new', duration_s: 360 }],
      ['induction_left_early', { entry: 'returning', progress_pct: 42 }],
      ['induction_dismissed', { entry: 'unknown' }],
    ]);
  });

  it('bounds how far someone got', () => {
    const capture = jest.fn();
    setAnalyticsClient({ capture });
    trackInductionLeftEarly('new', 250);
    trackInductionLeftEarly('new', -5);
    expect(capture.mock.calls.map(call => (call[1] as { progress_pct: number }).progress_pct)).toEqual([100, 0]);
  });
});
