import { afterEach, describe, expect, it, jest } from '@jest/globals';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'));

import { resetAnalyticsForTests, setAnalyticsClient } from '../analytics';
import {
  trackInductionCompleted,
  trackInductionDismissed,
  trackInductionLeftEarly,
  trackInductionListenPressed,
  trackInductionOffered,
  trackInductionSkipped,
  trackInductionStarted,
} from '../inductionAnalytics';

describe('The Induction funnel events', () => {
  afterEach(() => resetAnalyticsForTests());

  it('sends only how it was offered, from where, and how far someone got', () => {
    const capture = jest.fn();
    setAnalyticsClient({ capture });
    trackInductionOffered('new', 'welcome');
    trackInductionListenPressed('new', 'welcome');
    trackInductionSkipped('new');
    trackInductionOffered('new', 'card');
    trackInductionDismissed('new');
    trackInductionStarted('new');
    trackInductionCompleted('new', 359.6);
    trackInductionLeftEarly('returning', 41.7);
    trackInductionDismissed(null);
    expect(capture.mock.calls).toEqual([
      ['induction_offered', { entry: 'new', surface: 'welcome' }],
      ['induction_listen_pressed', { entry: 'new', surface: 'welcome' }],
      ['induction_skipped', { entry: 'new', surface: 'welcome' }],
      ['induction_offered', { entry: 'new', surface: 'card' }],
      ['induction_dismissed', { entry: 'new', surface: 'card' }],
      ['induction_started', { entry: 'new' }],
      ['induction_completed', { entry: 'new', duration_s: 360 }],
      ['induction_left_early', { entry: 'returning', progress_pct: 42 }],
      ['induction_dismissed', { entry: 'unknown', surface: 'card' }],
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
