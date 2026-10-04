import type { JournalEntry } from './journalRepo';
import type { JourneyMemorySession } from './journeyMemory';
import type { NightRecord } from './nightRecords';
import type { DreamDetails, DreamRecall } from './dreamDetails';
import type { PracticeContextSnapshot } from './practiceContext';

export type PracticeMemoryInsight = {
  confidence: 'unknown' | 'observed' | 'possible_pattern';
  label: 'NOT ENOUGH INFORMATION' | 'EARLY OBSERVATION' | 'OBSERVED' | 'POSSIBLE PATTERN';
  text: string;
  evidence?: string;
};

type OutcomeCount = { total: number; positive: number };
type PracticeOutcome = {
  id: string;
  reflectedAt: number;
  recall?: DreamRecall;
  dreamDetails?: DreamDetails;
  practiceContext?: PracticeContextSnapshot;
};

function titleCase(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function dominantEnvironment(session: JourneyMemorySession): string | null {
  const durations = new Map<string, number>();
  for (const stage of session.stages) {
    const environment = stage.config.environment;
    if (!environment || environment === 'none' || stage.config.environmentGain <= 0) continue;
    durations.set(environment, (durations.get(environment) ?? 0) + stage.durationMs);
  }
  return [...durations.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
}

function overnightRecallInsight(
  sessions: JourneyMemorySession[],
  nightRecords: NightRecord[],
): PracticeMemoryInsight | null {
  const eligibleNightRecords = nightRecords.filter(record => !record.testSession);
  const recordedSessionIds = new Set(eligibleNightRecords.map(record => record.sourceSessionId));
  const recordedOutcomes = eligibleNightRecords.flatMap(record => {
    const overnightLink = record.practiceContext?.links.find(link => link.type === 'overnight_journey');
    if (!overnightLink?.environment) return [];
    return [{ reflectedAt: record.reflectedAt, environment: overnightLink.environment, recalled: record.outcome.recall !== 'none' }];
  });
  const legacyOutcomes = sessions
    .filter(session => !session.testSession && session.morningReflection && !recordedSessionIds.has(session.id))
    .flatMap(session => {
    const environment = dominantEnvironment(session);
    const answers = session.morningReflection?.answers;
    const recall = answers?.recall ?? answers?.dreamDetails?.recall;
    if (!environment || !recall) return [];
    return [{ reflectedAt: session.morningReflection?.savedAt ?? session.endedAt ?? session.startedAt, environment, recalled: recall !== 'none' }];
  });
  const outcomes = [...recordedOutcomes, ...legacyOutcomes]
    .sort((a, b) => b.reflectedAt - a.reflectedAt)
    .slice(0, 12);
  if (!outcomes.length) return null;

  const groups = new Map<string, OutcomeCount>();
  for (const outcome of outcomes) {
    const current = groups.get(outcome.environment) ?? { total: 0, positive: 0 };
    current.total += 1;
    if (outcome.recalled) current.positive += 1;
    groups.set(outcome.environment, current);
  }

  const candidates = [...groups.entries()].sort((a, b) => b[1].total - a[1].total);
  for (const [environment, count] of candidates) {
    const other = outcomes.filter(outcome => outcome.environment !== environment);
    const otherPositive = other.filter(outcome => outcome.recalled).length;
    if (count.total < 5 || count.positive < 3 || other.length < 3) continue;
    const rateDifference = count.positive / count.total - otherPositive / other.length;
    if (rateDifference < 0.25) continue;
    const name = titleCase(environment);
    return {
      confidence: 'possible_pattern',
      label: 'POSSIBLE PATTERN',
      text: `${name} may be associated with stronger dream recall for you.`,
      evidence: `Observed: ${count.positive} of ${count.total} ${name} nights included dream recall, compared with ${otherPositive} of ${other.length} other nights.`,
    };
  }

  const observed = candidates.find(([, count]) => count.total >= 3);
  if (!observed) return null;
  const [environment, count] = observed;
  const name = titleCase(environment);
  return {
    confidence: 'observed',
    label: 'OBSERVED',
    text: `You reported dream recall after ${count.positive} of your last ${count.total} ${name} nights.`,
    evidence: 'Inner will keep comparing future nights before treating this as a pattern.',
  };
}

function linkedPracticeInsight(entries: JournalEntry[], nightRecords: NightRecord[]): PracticeMemoryInsight | null {
  const eligibleNightRecords = nightRecords.filter(record => !record.testSession);
  const linkedEntryIds = new Set(eligibleNightRecords.flatMap(record => record.journalEntryId ? [record.journalEntryId] : []));
  const outcomes: PracticeOutcome[] = [
    ...eligibleNightRecords.map(record => ({
      id: record.id,
      reflectedAt: record.reflectedAt,
      recall: record.outcome.recall,
      dreamDetails: record.outcome.dreamDetails,
      practiceContext: record.practiceContext,
    })),
    ...entries
      .filter(entry => entry.kind === 'dream' && !entry.testSession && !linkedEntryIds.has(entry.id))
      .map(entry => ({
        id: entry.id,
        reflectedAt: entry.createdAt,
        recall: entry.dreamDetails?.recall,
        dreamDetails: entry.dreamDetails,
        practiceContext: entry.practiceContext,
      })),
  ].sort((a, b) => b.reflectedAt - a.reflectedAt);

  const groups = new Map<string, { title: string; outcomes: PracticeOutcome[] }>();
  for (const outcome of outcomes) {
    const seenTitles = new Set<string>();
    for (const link of outcome.practiceContext?.links ?? []) {
      const title = link.contentTitle?.trim();
      if (!title) continue;
      const key = title.toLocaleLowerCase();
      if (seenTitles.has(key)) continue;
      seenTitles.add(key);
      const group = groups.get(key) ?? { title, outcomes: [] };
      group.outcomes.push(outcome);
      groups.set(key, group);
    }
  }

  const repeated = [...groups.values()].sort((a, b) => b.outcomes.length - a.outcomes.length)[0];
  if (!repeated) return null;
  if (repeated.outcomes.length < 2) {
    return {
      confidence: 'unknown',
      label: 'EARLY OBSERVATION',
      text: 'Inner has linked one recorded dream to the practice before it.',
      evidence: 'More morning returns are needed before a pattern can be described.',
    };
  }

  const recallCount = repeated.outcomes.reduce<OutcomeCount>((count, outcome) => {
    if (!outcome.recall) return count;
    return { total: count.total + 1, positive: count.positive + (outcome.recall === 'none' ? 0 : 1) };
  }, { total: 0, positive: 0 });
  if (recallCount.total >= 3) {
    return {
      confidence: 'observed',
      label: 'OBSERVED',
      text: `Dream recall was reported after ${recallCount.positive} of ${recallCount.total} nights linked to ${repeated.title}.`,
      evidence: 'This includes nights when nothing was recalled and records association rather than cause.',
    };
  }

  const metrics: Array<{ label: string; count: OutcomeCount }> = [
    {
      label: 'Lucid awareness',
      count: repeated.outcomes.reduce<OutcomeCount>((count, outcome) => {
        if (!outcome.dreamDetails?.awareness) return count;
        return { total: count.total + 1, positive: count.positive + (outcome.dreamDetails.awareness === 'yes' ? 1 : 0) };
      }, { total: 0, positive: 0 }),
    },
    {
      label: 'Inner cue recognition',
      count: repeated.outcomes.reduce<OutcomeCount>((count, outcome) => {
        if (!outcome.dreamDetails?.innerCue?.status) return count;
        return { total: count.total + 1, positive: count.positive + (outcome.dreamDetails.innerCue.status === 'recognized' ? 1 : 0) };
      }, { total: 0, positive: 0 }),
    },
    {
      label: 'Intentional agency',
      count: repeated.outcomes.reduce<OutcomeCount>((count, outcome) => {
        if (!outcome.dreamDetails?.agency) return count;
        return { total: count.total + 1, positive: count.positive + (outcome.dreamDetails.agency !== 'no' ? 1 : 0) };
      }, { total: 0, positive: 0 }),
    },
  ];
  const metric = metrics.find(item => item.count.total >= 3);
  if (metric) {
    return {
      confidence: 'observed',
      label: 'OBSERVED',
      text: `${metric.label} was reported in ${metric.count.positive} of ${metric.count.total} dreams linked to ${repeated.title}.`,
      evidence: 'This records an association in your reports; it does not establish cause.',
    };
  }

  return {
    confidence: 'observed',
    label: 'OBSERVED',
    text: `${repeated.title} preceded ${repeated.outcomes.length} reflected nights.`,
    evidence: 'More answered Dream Details will show whether awareness, agency, or cue recognition also repeats.',
  };
}

export function derivePracticeMemoryInsights(
  entries: JournalEntry[],
  sessions: JourneyMemorySession[],
  nightRecords: NightRecord[] = [],
): PracticeMemoryInsight[] {
  const insights = [overnightRecallInsight(sessions, nightRecords), linkedPracticeInsight(entries, nightRecords)]
    .filter((insight): insight is PracticeMemoryInsight => Boolean(insight));
  if (insights.length) return insights.slice(0, 2);
  if (entries.some(entry => entry.kind === 'dream' && !entry.testSession)) {
    return [{
      confidence: 'unknown',
      label: 'NOT ENOUGH INFORMATION',
      text: 'There is not enough linked practice information for an observation yet.',
      evidence: 'Future Dream Details and Morning Returns will build the comparison.',
    }];
  }
  return [];
}
