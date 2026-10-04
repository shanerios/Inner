import { snapshotPracticeContext, type PracticeContextSnapshot, type PracticeLinkSnapshot } from './practiceContext';
import { listPracticeActivity, PRACTICE_LINK_WINDOW_MS, type RecordedPracticeType } from './practiceHistory';
import { loadRecurringSignalFocus } from './recurringDreamSignals';
import { loadSelectedRecommendation, recommendationForPracticeContext } from './recommendationMemory';
import { experimentContextForPractice } from './practiceExperiments';
import { loadNightPlan, nightPlanContextSnapshot } from './nightPlans';

const RECENT_PRACTICE_TYPES: RecordedPracticeType[] = ['chamber', 'soundscape', 'guardian', 'tuning'];

export async function buildPracticeContext(
  primaryLink?: PracticeLinkSnapshot,
  capturedAt = Date.now(),
  recentBeforeAt = primaryLink?.startedAt ?? capturedAt,
): Promise<PracticeContextSnapshot | undefined> {
  const [history, recurringFocus, selectedRecommendation] = await Promise.all([
    listPracticeActivity(),
    loadRecurringSignalFocus(),
    loadSelectedRecommendation(),
  ]);
  const lowerBound = recentBeforeAt - PRACTICE_LINK_WINDOW_MS;
  const recentLinks = RECENT_PRACTICE_TYPES.flatMap(type => {
    const record = history.find(item => item.type === type
      && item.startedAt <= recentBeforeAt
      && item.startedAt >= lowerBound
      && item.id !== primaryLink?.sessionId);
    if (!record) return [];
    return [{
      sessionId: record.id,
      type: record.type,
      contentId: record.contentId,
      contentTitle: record.contentTitle,
      startedAt: record.startedAt,
      endedAt: record.endedAt,
      linkReason: 'recent_practice' as const,
    }];
  });
  const focusLink = recurringFocus
    && recurringFocus.setAt <= recentBeforeAt
    && recurringFocus.setAt >= lowerBound
    ? [{
        sessionId: `dream-sign:${recurringFocus.sign.toLocaleLowerCase()}:${recurringFocus.setAt}`,
        type: 'recognition_signal' as const,
        contentId: `dream-sign:${recurringFocus.sign.toLocaleLowerCase()}`,
        contentTitle: `Recognition focus · ${recurringFocus.sign}`,
        startedAt: recurringFocus.setAt,
        endedAt: recurringFocus.setAt,
        linkReason: 'recent_practice' as const,
      }]
    : [];
  const links = primaryLink
    ? [primaryLink, ...focusLink, ...recentLinks]
    : [...focusLink, ...recentLinks];
  const context = snapshotPracticeContext(links.length ? links : undefined, capturedAt);
  const plan = primaryLink?.nightPlanId ? await loadNightPlan(primaryLink.nightPlanId) : null;
  const recommendation = plan?.recommendation
    ?? recommendationForPracticeContext(selectedRecommendation, recentBeforeAt);
  const experiment = plan?.experiment
    ?? (primaryLink?.type === 'overnight_journey'
      ? await experimentContextForPractice(primaryLink.environment, primaryLink.startedAt)
      : undefined);
  const nightPlan = plan ? nightPlanContextSnapshot(plan) : undefined;
  if (!context && !recommendation && !experiment && !nightPlan) return undefined;
  return {
    linkedAt: context?.linkedAt ?? capturedAt,
    links: context?.links ?? [],
    recommendation,
    experiment,
    nightPlan,
  };
}
