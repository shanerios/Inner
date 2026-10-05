import type { JournalEntry } from './journalRepo';
import type { JourneyMemorySession } from './journeyMemory';
import type { NightRecord } from './nightRecords';
import { deriveRecurringDreamSignal } from './recurringDreamSignals';
import { deriveCueLevelAdjustment } from './nightLearning';

export type TonightRecommendation = {
  id: string;
  kind: 'gentler_signal' | 'clearer_signal' | 'recurring_signal' | 'repeat_environment' | 'recognition_refresh';
  title: string;
  reason: string;
  actionLabel: string;
  sign?: string;
  environment?: string;
  signalGainScale?: number;
};

function titleCase(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function environmentFromSession(session: JourneyMemorySession): string | null {
  const durations = new Map<string, number>();
  for (const stage of session.stages) {
    const environment = stage.config.environment;
    if (!environment || environment === 'none' || stage.config.environmentGain <= 0) continue;
    durations.set(environment, (durations.get(environment) ?? 0) + stage.durationMs);
  }
  return [...durations.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
}

function environmentRecommendation(
  records: NightRecord[],
  sessions: JourneyMemorySession[],
): TonightRecommendation | null {
  const recordedIds = new Set(records.map(record => record.sourceSessionId));
  const outcomes = [
    ...records.flatMap(record => {
      const link = record.practiceContext?.links.find(item => item.type === 'overnight_journey');
      return link?.environment
        ? [{ environment: link.environment, recalled: record.outcome.recall !== 'none', at: record.reflectedAt }]
        : [];
    }),
    ...sessions.flatMap(session => {
      if (session.testSession || recordedIds.has(session.id) || !session.morningReflection) return [];
      const environment = environmentFromSession(session);
      const recall = session.morningReflection.answers.recall ?? session.morningReflection.answers.dreamDetails?.recall;
      return environment && recall
        ? [{ environment, recalled: recall !== 'none', at: session.morningReflection.savedAt }]
        : [];
    }),
  ].sort((a, b) => b.at - a.at).slice(0, 12);
  const groups = new Map<string, { total: number; recalled: number }>();
  for (const outcome of outcomes) {
    const group = groups.get(outcome.environment) ?? { total: 0, recalled: 0 };
    group.total += 1;
    if (outcome.recalled) group.recalled += 1;
    groups.set(outcome.environment, group);
  }
  for (const [environment, group] of [...groups.entries()].sort((a, b) => b[1].total - a[1].total)) {
    const others = outcomes.filter(outcome => outcome.environment !== environment);
    const otherRecall = others.filter(outcome => outcome.recalled).length;
    if (group.total < 5 || group.recalled < 3 || others.length < 3) continue;
    if (group.recalled / group.total - otherRecall / others.length < 0.25) continue;
    const label = titleCase(environment);
    return {
      id: `environment:${environment}`,
      kind: 'repeat_environment',
      title: `Return to ${label}`,
      reason: `You recalled dreams after ${group.recalled} of ${group.total} ${label} nights, compared with ${otherRecall} of ${others.length} other nights.`,
      actionLabel: `SHAPE ANOTHER ${label.toLocaleUpperCase()} NIGHT`,
      environment,
    };
  }
  return null;
}

export function deriveTonightRecommendation(
  entries: JournalEntry[],
  records: NightRecord[],
  sessions: JourneyMemorySession[],
  now = Date.now(),
  options: { excludedKinds?: TonightRecommendation['kind'][] } = {},
): TonightRecommendation | null {
  const excludedKinds = new Set(options.excludedKinds ?? []);
  const eligibleEntries = entries.filter(entry => !entry.testSession);
  const eligibleRecords = records.filter(record => !record.testSession);
  const cueLevelAdjustment = deriveCueLevelAdjustment(eligibleRecords);
  if (cueLevelAdjustment?.direction === 'lower' && !excludedKinds.has('gentler_signal')) {
    return {
      id: 'signal:gentler',
      kind: 'gentler_signal',
      title: 'Lower the recognition signal',
      reason: cueLevelAdjustment.reason,
      actionLabel: 'REVIEW A QUIETER SIGNAL NIGHT',
      signalGainScale: cueLevelAdjustment.proposedGainScale,
    };
  }
  if (cueLevelAdjustment?.direction === 'raise' && !excludedKinds.has('clearer_signal')) {
    return {
      id: 'signal:clearer',
      kind: 'clearer_signal',
      title: 'Make the recognition signal slightly clearer',
      reason: cueLevelAdjustment.reason,
      actionLabel: 'REVIEW A CLEARER SIGNAL NIGHT',
      signalGainScale: cueLevelAdjustment.proposedGainScale,
    };
  }

  const recurring = deriveRecurringDreamSignal(eligibleEntries);
  if (!excludedKinds.has('recurring_signal') && recurring) {
    return {
      id: `dream-sign:${recurring.sign.toLocaleLowerCase()}`,
      kind: 'recurring_signal',
      title: `Recognize ${recurring.sign}`,
      reason: `${recurring.sign} appeared in ${recurring.count} of your last ${recurring.rememberedDreams} remembered dreams.`,
      actionLabel: `PRACTICE WITH ${recurring.sign.toLocaleUpperCase()}`,
      sign: recurring.sign,
    };
  }

  if (!excludedKinds.has('repeat_environment')) {
    const environment = environmentRecommendation(eligibleRecords, sessions);
    if (environment) return environment;
  }

  const recentCutoff = now - 7 * 24 * 60 * 60_000;
  const outcomeCutoff = now - 30 * 24 * 60 * 60_000;
  const recentRecognition = sessions.some(session => session.journeyId === 'lucid-signal' && session.startedAt >= recentCutoff);
  const hasRecentOutcome = eligibleRecords.some(record => record.reflectedAt >= outcomeCutoff);
  if (!excludedKinds.has('recognition_refresh') && eligibleRecords.length >= 3 && hasRecentOutcome && !recentRecognition) {
    return {
      id: 'recognition:refresh',
      kind: 'recognition_refresh',
      title: 'Refresh recognition',
      reason: 'Recognition practice has not appeared in your last seven days of recorded practice.',
      actionLabel: 'OPEN LUCID SIGNAL',
    };
  }
  return null;
}
