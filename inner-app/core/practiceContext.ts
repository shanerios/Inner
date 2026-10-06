import type { JourneyMemorySession } from './journeyMemory';
import { nightExecutionForSession, type NightExecutionRecord } from './nightExecution';
import type { SelectedRecommendation } from './recommendationMemory';
import type { ExperimentContextSnapshot } from './practiceExperiments';
import type { NightPlanContextSnapshot } from './nightPlans';

export type PracticeType = 'chamber' | 'soundscape' | 'overnight_journey' | 'recognition_signal' | 'guardian' | 'tuning';

export type PracticeLinkSnapshot = {
  sessionId: string;
  type: PracticeType;
  contentId?: string;
  contentTitle?: string;
  startedAt: number;
  endedAt?: number;
  minutesBeforeCapture?: number;
  linkReason: 'exact_overnight_session' | 'exact_signal_night' | 'recent_practice';
  audioRoute?: 'private' | 'speaker' | 'unknown';
  environment?: string;
  signalId?: string;
  stageIds?: string[];
  firedCueIds?: string[];
  nightPlanId?: string;
  nightExecution?: NightExecutionRecord;
};

export type PracticeContextSnapshot = {
  linkedAt: number;
  links: PracticeLinkSnapshot[];
  recommendation?: SelectedRecommendation;
  experiment?: ExperimentContextSnapshot;
  nightPlan?: NightPlanContextSnapshot;
};

function unique(values: Array<string | undefined>): string[] {
  return [...new Set(values.filter((value): value is string => Boolean(value)))];
}

function dominantEnvironment(session: JourneyMemorySession): string | undefined {
  const durations = new Map<string, number>();
  for (const stage of session.stages) {
    const environment = stage.config.environment;
    if (!environment || environment === 'none' || stage.config.environmentGain <= 0) continue;
    durations.set(environment, (durations.get(environment) ?? 0) + stage.durationMs);
  }
  return [...durations.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
}

export function practiceLinkFromOvernightSession(session: JourneyMemorySession): PracticeLinkSnapshot {
  const routeEvent = [...session.events]
    .reverse()
    .find(event => event.type === 'audio_route_changed' && event.route);
  const signalEvent = [...session.events]
    .reverse()
    .find(event => (event.type === 'recognition_signal_selected' || event.type === 'recognition_signal_fired') && event.signalId);
  const plannedEnd = session.startedAt + session.plannedDurationMs;
  return {
    sessionId: session.id,
    type: 'overnight_journey',
    contentId: session.journeyId,
    contentTitle: session.title,
    startedAt: session.startedAt,
    endedAt: session.endedAt ?? plannedEnd,
    linkReason: 'exact_overnight_session',
    audioRoute: session.nativeCheckpoint?.audioRoute ?? (routeEvent?.route as PracticeLinkSnapshot['audioRoute']),
    environment: dominantEnvironment(session),
    signalId: signalEvent?.signalId ?? session.nativeCheckpoint?.firedSignalIds?.[0],
    stageIds: unique(session.stages.map(stage => stage.id)),
    firedCueIds: unique([
      ...session.events
        .filter(event => event.type === 'cue_played' || event.type === 'recognition_signal_fired')
        .map(event => event.cueId),
      ...(session.nativeCheckpoint?.firedCueIds ?? []),
    ]),
    nightPlanId: session.nightPlanId,
    nightExecution: nightExecutionForSession(session),
  };
}

export function snapshotPracticeContext(
  link: PracticeLinkSnapshot | PracticeLinkSnapshot[] | undefined,
  capturedAt = Date.now(),
): PracticeContextSnapshot | undefined {
  if (!link) return undefined;
  const links = Array.isArray(link) ? link : [link];
  return {
    linkedAt: capturedAt,
    links: links.map(item => ({
      ...item,
      minutesBeforeCapture: Math.max(0, Math.round((capturedAt - (item.endedAt ?? item.startedAt)) / 60_000)),
    })),
  };
}

export function practiceContextSummary(context?: PracticeContextSnapshot): string[] {
  return practiceContextSections(context).flat();
}

export function practiceContextSections(context?: PracticeContextSnapshot): string[][] {
  const nightPlan = context?.nightPlan
    ? [[
        `Tonight's plan · ${context.nightPlan.configuration.environment.charAt(0).toUpperCase()}${context.nightPlan.configuration.environment.slice(1)}`,
        `${context.nightPlan.configuration.durationMinutes} min · ${context.nightPlan.configuration.feel} · ${context.nightPlan.configuration.recognitionWindowCount} recognition ${context.nightPlan.configuration.recognitionWindowCount === 1 ? 'window' : 'windows'}`,
        ...(context.nightPlan.configuration.signalGainScale !== undefined && context.nightPlan.configuration.signalGainScale !== 1
          ? [`Signal level: ${Math.round(context.nightPlan.configuration.signalGainScale * 100)}% of calibrated level`]
          : []),
        ...(context.nightPlan.quietNight ? ['Quiet night: kept out of signal-level learning'] : []),
        `Source: ${context.nightPlan.source === 'experiment' ? 'Personal experiment' : context.nightPlan.source === 'recommendation' ? 'Inner recommendation' : context.nightPlan.source === 'adaptive_rule' ? 'Adaptive rule' : 'Shaped manually'}`,
        ...(context.nightPlan.reason ? [`Why: ${context.nightPlan.reason}`] : []),
      ]]
    : [];
  const recommendation = context?.recommendation
    ? [[`Inner suggested · ${context.recommendation.title}`, context.recommendation.reason]]
    : [];
  const experiment = context?.experiment
    ? [[
        `Personal experiment · ${context.experiment.conditionLabel}`,
        `Night ${context.experiment.nightNumber} of ${context.experiment.targetNights} · ${context.experiment.title}`,
      ]]
    : [];
  const links = (context?.links ?? []).map(link => {
    const lines = [link.contentTitle || (link.type === 'recognition_signal' ? 'Scheduled signal practice' : 'Inner practice')];
    if (link.environment) {
      lines.push(`Environment: ${link.environment.charAt(0).toUpperCase()}${link.environment.slice(1)}`);
    }
    if (link.signalId) {
      const signalLabels: Record<string, string> = {
        ascending: 'Ascending Tone',
        bell: 'Bell',
        chimes: 'Chimes',
        droplets: 'Droplets',
      };
      lines.push(`Recognition signal: ${signalLabels[link.signalId] ?? link.signalId}`);
    }
    if (link.firedCueIds?.length && !link.nightExecution?.plannedCues.length) {
      lines.push(`${link.firedCueIds.length} ${link.firedCueIds.length === 1 ? 'cue' : 'cues'} presented`);
    }
    if (link.nightExecution?.plannedCues.length) {
      const { plannedCues, deliveredCues, interruptionCount } = link.nightExecution;
      lines.push(`Night delivery: ${deliveredCues.length} of ${plannedCues.length} planned ${plannedCues.length === 1 ? 'signal' : 'signals'}`);
      if (interruptionCount) lines.push(`${interruptionCount} playback ${interruptionCount === 1 ? 'interruption' : 'interruptions'} recorded`);
    }
    if (link.audioRoute === 'private') lines.push('Audio route: Headphones or private output');
    if (link.audioRoute === 'speaker') lines.push('Audio route: Speaker');
    if (typeof link.minutesBeforeCapture === 'number') {
      const minutes = link.minutesBeforeCapture;
      if (minutes <= 10) {
        lines.push('Reflection captured near the end of the night');
      } else if (minutes < 120) {
        lines.push(`Reflection captured ${minutes} min later`);
      } else if (minutes < 48 * 60) {
        const hours = Math.round(minutes / 60);
        lines.push(`Reflection captured ${hours} ${hours === 1 ? 'hour' : 'hours'} later`);
      } else {
        const days = Math.round(minutes / (24 * 60));
        lines.push(`Reflection captured ${days} ${days === 1 ? 'day' : 'days'} later`);
      }
    }
    return lines;
  });
  return [...nightPlan, ...experiment, ...recommendation, ...links];
}
