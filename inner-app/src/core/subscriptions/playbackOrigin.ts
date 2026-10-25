import { createDreamIncubationJourney, FACTORY_AUDIO_JOURNEYS } from '../../../core/audio/factoryJourneys';
import { journeyForContinuation } from '../../../core/journeyContinuation';
import type { JourneyMemorySession } from '../../../core/journeyMemory';
import { playerStartFromRoute, type PlaybackStart, type PlaybackStartKind } from './playbackPolicy';

/**
 * Resolves what a journey-player route is from the records that own it: the
 * factory catalog, the saved-journey store, or the Journey Memory session. A
 * route's id, session id or label only names the record to look up. It never
 * authorizes the content the route carries: that content must match the record.
 * Content that does not match is classified by what it plays, so it cannot ride
 * on a free origin.
 */

type JourneyLike = {
  id: string;
  timeline: { id?: string; stages?: unknown[]; guidance?: unknown } & Record<string, unknown>;
} & Record<string, unknown>;

type RouteParams = {
  resumeSessionId?: string;
  nightPlanId?: string;
  playbackKind?: PlaybackStartKind;
};

export type ReadResult<T> = { status: 'ok'; value: T } | { status: 'unreadable' };

export type OriginDeps = {
  /** The saved journeys, or `unreadable` when storage cannot be read or parsed. */
  loadSavedJourneys(): Promise<ReadResult<Array<{ id: string; timeline: unknown }>>>;
  /** The open or ended session with this id, or undefined when none exists. */
  loadSession(id: string): Promise<ReadResult<JourneyMemorySession | undefined>>;
};

export type OriginResolution =
  | { status: 'resolved'; start: PlaybackStart }
  /** A record that must be read to decide could not be read. Offer retry, never a paywall. */
  | { status: 'unreadable'; source: 'saved_journeys' | 'journey_memory' }
  /** The session this resume names does not exist or has already ended. */
  | { status: 'session_missing' };

/**
 * The supported factory variations. Everything not listed here must equal the
 * catalog record exactly. `journey` fields are top-level; `timeline` fields are
 * inside `timeline`.
 */
const FACTORY_VARIATIONS: Record<string, { journey: string[]; timeline: string[] }> = {
  // Recurring dream sign practice personalizes the copy and guidance of this journey.
  'lucid-signal': {
    journey: ['title', 'subtitle', 'summary', 'recognitionPractice'],
    timeline: ['title', 'guidance'],
  },
};

/** A Dream Incubation is generated: only the id, the summary and the guidance carry the Dream Seed. */
const INCUBATION_ID = /^dream-incubation-\d+$/;
const INCUBATION_VARIATION = { journey: ['id', 'summary'], timeline: ['id', 'guidance'] };

/** Structural equality. Keys whose value is undefined are treated as absent. */
export function sameContent(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== typeof b || a === null || b === null || typeof a !== 'object') return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((item, index) => sameContent(item, b[index]));
  }
  const left = a as Record<string, unknown>;
  const right = b as Record<string, unknown>;
  const keys = new Set([...Object.keys(left), ...Object.keys(right)]);
  for (const key of keys) {
    if (!sameContent(left[key], right[key])) return false;
  }
  return true;
}

function withoutFields(journey: JourneyLike, variation: { journey: string[]; timeline: string[] }): unknown {
  const { timeline, ...rest } = journey;
  const copy: Record<string, unknown> = { ...rest };
  for (const field of variation.journey) delete copy[field];
  const timelineCopy: Record<string, unknown> = { ...timeline };
  for (const field of variation.timeline) delete timelineCopy[field];
  return { ...copy, timeline: timelineCopy };
}

/** True when the journey is a catalog record, or a supported variation of one. */
export function isVerifiedFactoryJourney(journey: JourneyLike): boolean {
  const catalog = FACTORY_AUDIO_JOURNEYS.find(item => item.id === journey.id);
  if (catalog) {
    const variation = FACTORY_VARIATIONS[journey.id] ?? { journey: [], timeline: [] };
    return sameContent(withoutFields(journey, variation), withoutFields(catalog as unknown as JourneyLike, variation));
  }
  if (INCUBATION_ID.test(journey.id)) {
    const template = createDreamIncubationJourney('template') as unknown as JourneyLike;
    return sameContent(withoutFields(journey, INCUBATION_VARIATION), withoutFields(template, INCUBATION_VARIATION));
  }
  return false;
}

/** True when the journey is exactly the saved record with its id. */
function matchesSavedJourney(journey: JourneyLike, saved: { id: string; timeline: unknown } | undefined): boolean {
  return !!saved && saved.id === journey.id && sameContent(saved.timeline, journey.timeline);
}

/**
 * True when the journey is what this session would rebuild: the same id, and the
 * same stages with the same durations and audio targets. Cue details come from
 * the night plan and are not part of what decides what is audible.
 */
function matchesSession(journey: JourneyLike, session: JourneyMemorySession): boolean {
  if (journey.id !== session.journeyId) return false;
  const rebuilt = journeyForContinuation(session, null).timeline.stages;
  const supplied = (journey.timeline.stages ?? []) as Array<{ id?: string; durationMs?: number; target?: unknown }>;
  return supplied.length === rebuilt.length && rebuilt.every((stage, index) => {
    const other = supplied[index];
    return other.id === stage.id && other.durationMs === stage.durationMs && sameContent(other.target, stage.target);
  });
}

export async function resolvePlaybackStart(
  params: RouteParams,
  journey: JourneyLike,
  deps: OriginDeps,
): Promise<OriginResolution> {
  // The kind that has been proven from a record. Anything else is left undefined,
  // and the journey is then classified by its content.
  let proven: PlaybackStartKind | undefined;

  if (params.resumeSessionId) {
    const read = await deps.loadSession(params.resumeSessionId);
    if (read.status === 'unreadable') return { status: 'unreadable', source: 'journey_memory' };
    const session = read.value;
    if (!session || session.endedAt) return { status: 'session_missing' };
    if (matchesSession(journey, session)) return { status: 'resolved', start: { kind: 'resume' } };
  } else if (params.playbackKind === 'saved_custom') {
    const read = await deps.loadSavedJourneys();
    if (read.status === 'unreadable') return { status: 'unreadable', source: 'saved_journeys' };
    const saved = read.value.find(item => item.id === journey.id);
    if (matchesSavedJourney(journey, saved)) proven = 'saved_custom';
  } else if (params.playbackKind === 'factory') {
    if (isVerifiedFactoryJourney(journey)) proven = 'factory';
  } else if (params.playbackKind === 'overnight_new' || params.playbackKind === 'custom_new') {
    // These are the gated kinds; claiming one only ever makes the start stricter.
    proven = params.playbackKind;
  }

  return {
    status: 'resolved',
    start: playerStartFromRoute({ nightPlanId: params.nightPlanId, playbackKind: proven }, journey.timeline),
  };
}
