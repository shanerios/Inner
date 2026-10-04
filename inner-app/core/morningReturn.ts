import { getPendingLucidSignalReflection, type LucidSignalNight } from './lucidSignalLearning';
import { loadJourneyMemory, pendingOvernightReflection, type JourneyMemoryState } from './journeyMemory';
import { practiceLinkFromOvernightSession, type PracticeLinkSnapshot } from './practiceContext';

export type PendingMorningReturn = LucidSignalNight & {
  journeySessionId?: string;
  nightPlanId?: string;
  preview?: boolean;
  testSession?: boolean;
  practiceLink?: PracticeLinkSnapshot;
};

export function selectPendingMorningReturn(
  journeyMemory: JourneyMemoryState,
  scheduledSignalReflection: LucidSignalNight | null,
  now = Date.now(),
): PendingMorningReturn | null {
  const overnight = pendingOvernightReflection(journeyMemory, now);
  if (overnight) {
    return {
      id: overnight.id,
      journeySessionId: overnight.id,
      nightPlanId: overnight.nightPlanId,
      scheduledAt: overnight.startedAt,
      sleepOnsetAt: overnight.startedAt,
      cueTimes: [],
      reviewAt: overnight.startedAt + overnight.plannedDurationMs,
      morningCaptureEntryId: overnight.morningCapture?.journalEntryId,
      testSession: overnight.testSession,
      practiceLink: practiceLinkFromOvernightSession(overnight),
    };
  }
  if (!scheduledSignalReflection) return null;
  return {
    ...scheduledSignalReflection,
    practiceLink: {
      sessionId: scheduledSignalReflection.id,
      type: 'recognition_signal',
      contentId: scheduledSignalReflection.cuePlan,
      contentTitle: 'Scheduled signal practice',
      startedAt: scheduledSignalReflection.sleepOnsetAt,
      endedAt: scheduledSignalReflection.reviewAt,
      linkReason: 'exact_signal_night',
      signalId: scheduledSignalReflection.signalId,
    },
  };
}

export async function loadPendingMorningReturn(now = Date.now()): Promise<PendingMorningReturn | null> {
  const [journeyMemory, scheduledSignalReflection] = await Promise.all([
    loadJourneyMemory(),
    getPendingLucidSignalReflection(undefined, () => now),
  ]);
  return selectPendingMorningReturn(journeyMemory, scheduledSignalReflection, now);
}

export const MORNING_RETURN_BLOCKED_ROUTES = new Set([
  'Splash',
  'Intro',
  'ValueCapture',
  'ValueHook',
  'Intention',
  'EssenceScreen',
  'JourneyPlayer',
  'LucidJourneyPlayer',
  'GuardianPlayer',
  'LiveMix',
  'PointZero',
  'CleanSlate',
  'InnerFlame',
  'DailyRitual',
  'Paywall',
  'AccountCreate',
]);

export function canPresentMorningReturn(routeName?: string): boolean {
  return Boolean(routeName && !MORNING_RETURN_BLOCKED_ROUTES.has(routeName));
}

export function canShowMorningReturnContinuation(routeName?: string): boolean {
  return routeName === 'Home';
}
