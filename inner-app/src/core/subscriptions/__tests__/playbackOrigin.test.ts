import { describe, expect, it, jest } from '@jest/globals';
import { createDreamIncubationJourney, FACTORY_AUDIO_JOURNEYS } from '../../../../core/audio/factoryJourneys';
import { journeyForContinuation } from '../../../../core/journeyContinuation';
import { createRecurringSignalJourney } from '../../../../core/recurringDreamSignals';
import {
  isVerifiedFactoryJourney,
  resolvePlaybackStart,
  sameContent,
  type OriginDeps,
} from '../playbackOrigin';

jest.mock('react-native-purchases', () => ({ __esModule: true, default: { getCustomerInfo: jest.fn() } }));
jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: { getItem: jest.fn(), setItem: jest.fn(), removeItem: jest.fn() },
}));

type Journey = Parameters<typeof resolvePlaybackStart>[1];

const catalog = (id: string) => FACTORY_AUDIO_JOURNEYS.find(item => item.id === id)!;
const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value));

/** The journey with one stage forced into the given environment. */
function withEnvironment(journey: { id: string; timeline: any }, environment: string): Journey {
  const copy = clone(journey) as any;
  copy.timeline.stages[0].target = { ...copy.timeline.stages[0].target, environment, environmentGain: 0.2 };
  return copy;
}

const config = (environment: string) => ({ environment, environmentGain: 0.2 }) as any;

function session(overrides: Record<string, unknown> = {}): any {
  return {
    schemaVersion: 2,
    id: 'session-1',
    journeyId: 'overnight-ocean-1',
    title: 'Overnight Journey',
    startedAt: 1,
    plannedDurationMs: 600_000,
    endPolicy: 'fade',
    protocolVersion: 1,
    seed: 7,
    initialConfig: config('ocean'),
    stages: [
      { id: 'overnight-settle', durationMs: 300_000, config: config('ocean') },
      { id: 'overnight-deep', durationMs: 300_000, config: config('ocean') },
    ],
    events: [],
    ...overrides,
  };
}

function deps(overrides: Partial<OriginDeps> = {}): OriginDeps & { loadSavedJourneys: jest.Mock; loadSession: jest.Mock } {
  return {
    loadSavedJourneys: jest.fn(async () => ({ status: 'ok', value: [] })),
    loadSession: jest.fn(async () => ({ status: 'ok', value: undefined })),
    ...overrides,
  } as any;
}

const start = async (params: Parameters<typeof resolvePlaybackStart>[0], journey: Journey, d = deps()) => {
  const result = await resolvePlaybackStart(params, journey, d);
  if (result.status !== 'resolved') throw new Error(`unexpected ${result.status}`);
  return result.start;
};

const GATED = { kind: 'overnight_new', environment: 'temple' };

describe('sameContent', () => {
  it('compares structurally and treats undefined keys as absent', () => {
    expect(sameContent({ a: 1, b: undefined }, { a: 1 })).toBe(true);
    expect(sameContent({ a: [1, { b: 2 }] }, { a: [1, { b: 2 }] })).toBe(true);
    expect(sameContent({ a: [1] }, { a: [1, 2] })).toBe(false);
    expect(sameContent({ a: 1 }, { a: '1' })).toBe(false);
    expect(sameContent(null, {})).toBe(false);
  });
});

describe('factory origin', () => {
  it('verifies every catalog journey as supplied', async () => {
    for (const journey of FACTORY_AUDIO_JOURNEYS) {
      expect(isVerifiedFactoryJourney(journey as any)).toBe(true);
      expect(await start({ playbackKind: 'factory' }, journey as any)).toEqual({ kind: 'factory' });
    }
  });

  it('keeps the recurring dream sign variation of Lucid Signal factory', async () => {
    const personalized = createRecurringSignalJourney(catalog('lucid-signal'), 'falling');
    expect(await start({ playbackKind: 'factory' }, personalized as any)).toEqual({ kind: 'factory' });
  });

  it('keeps a generated Dream Incubation factory, whatever the seed', async () => {
    for (const seed of ['a quiet lake', 'x'.repeat(200)]) {
      const incubation = createDreamIncubationJourney(seed);
      expect(await start({ playbackKind: 'factory' }, incubation as any)).toEqual({ kind: 'factory' });
    }
  });

  it('does not let a forged catalog id authorize different audio', async () => {
    const forged = withEnvironment(catalog('lucid-signal'), 'temple');
    expect(forged.id).toBe('lucid-signal');
    expect(await start({ playbackKind: 'factory' }, forged)).toEqual(GATED);
  });

  it('does not let a catalog id carry extra stages', async () => {
    const forged = clone(catalog('lucid-signal')) as any;
    forged.timeline.stages.push({ ...forged.timeline.stages[0], id: 'extra', target: { ...forged.timeline.stages[0].target, environment: 'temple' } });
    expect(await start({ playbackKind: 'factory' }, forged)).toEqual(GATED);
  });

  it('permits only the listed variations: other journeys cannot change their title or copy', async () => {
    const other = FACTORY_AUDIO_JOURNEYS.find(item => item.id !== 'lucid-signal')!;
    const edited = { ...clone(other), title: 'Renamed' } as any;
    expect(isVerifiedFactoryJourney(edited)).toBe(false);
  });

  it('does not let the Lucid Signal variation change audio fields', async () => {
    const personalized = createRecurringSignalJourney(catalog('lucid-signal'), 'falling') as any;
    personalized.timeline.fadeInMs = (personalized.timeline.fadeInMs ?? 0) + 1000;
    expect(isVerifiedFactoryJourney(personalized)).toBe(false);
  });

  it('does not let an incubation-shaped id carry other audio', async () => {
    const forged = withEnvironment(createDreamIncubationJourney('seed') as any, 'temple');
    expect(await start({ playbackKind: 'factory' }, forged)).toEqual(GATED);
    const unknown = { ...clone(createDreamIncubationJourney('seed')), id: 'dream-incubation-abc' } as any;
    expect(isVerifiedFactoryJourney(unknown)).toBe(false);
  });

  it('classifies an unverified free journey as free by content, and a premium one as gated', async () => {
    const free = withEnvironment(catalog('lucid-signal'), 'ocean');
    free.id = 'made-up';
    expect(await start({ playbackKind: 'factory' }, free)).toEqual({ kind: 'factory' });
    const premium = withEnvironment(catalog('lucid-signal'), 'temple');
    premium.id = 'made-up';
    expect(await start({ playbackKind: 'factory' }, premium)).toEqual(GATED);
  });
});

describe('saved origin', () => {
  const saved = withEnvironment(catalog('lucid-signal'), 'temple');
  saved.id = 'personal-lucid-saved-1-abc';
  (saved as any).timeline.id = saved.id;
  const record = { id: saved.id, timeline: (saved as any).timeline };

  it('accepts a journey that is exactly the saved record', async () => {
    const d = deps({ loadSavedJourneys: jest.fn(async () => ({ status: 'ok', value: [record] })) as any });
    expect(await start({ playbackKind: 'saved_custom' }, saved, d)).toEqual({ kind: 'saved_custom' });
  });

  it('does not accept an id that is not in the store', async () => {
    expect(await start({ playbackKind: 'saved_custom' }, saved)).toEqual(GATED);
  });

  it('does not let a saved id authorize a different payload', async () => {
    const d = deps({ loadSavedJourneys: jest.fn(async () => ({ status: 'ok', value: [{ id: saved.id, timeline: withEnvironment(catalog('lucid-signal'), 'ocean').timeline }] })) as any });
    expect(await start({ playbackKind: 'saved_custom' }, saved, d)).toEqual(GATED);
  });

  it('reports unreadable storage instead of classifying', async () => {
    const d = deps({ loadSavedJourneys: jest.fn(async () => ({ status: 'unreadable' })) as any });
    expect(await resolvePlaybackStart({ playbackKind: 'saved_custom' }, saved, d)).toEqual({ status: 'unreadable', source: 'saved_journeys' });
  });

  it('does not read saved storage for other origins', async () => {
    const d = deps();
    await start({ playbackKind: 'factory' }, catalog('lucid-signal') as any, d);
    expect(d.loadSavedJourneys).not.toHaveBeenCalled();
  });
});

describe('resumed origin', () => {
  const open = session();
  const payload = journeyForContinuation(open, null) as unknown as Journey;
  const withSession = (value: unknown) => deps({ loadSession: jest.fn(async () => ({ status: 'ok', value })) as any });

  it('resumes the journey its session would rebuild', async () => {
    expect(await start({ resumeSessionId: 'session-1' }, payload, withSession(open))).toEqual({ kind: 'resume' });
  });

  it('accepts cue details added by the night plan', async () => {
    const withCues = clone(payload) as any;
    withCues.timeline.stages[0].spatialEvents = [{ id: 'cue', type: 'cue', atMs: 1000 }];
    expect(await start({ resumeSessionId: 'session-1' }, withCues, withSession(open))).toEqual({ kind: 'resume' });
  });

  it('reports a session that does not exist', async () => {
    expect(await resolvePlaybackStart({ resumeSessionId: 'nope' }, payload, withSession(undefined))).toEqual({ status: 'session_missing' });
  });

  it('reports a session that has already ended', async () => {
    expect(await resolvePlaybackStart({ resumeSessionId: 'session-1' }, payload, withSession(session({ endedAt: 5 })))).toEqual({ status: 'session_missing' });
  });

  it('does not let a real session id authorize different audio', async () => {
    const forged = withEnvironment(payload as any, 'temple');
    expect(await start({ resumeSessionId: 'session-1' }, forged, withSession(open))).toEqual(GATED);
  });

  it('does not let a real session id authorize a different journey', async () => {
    const other = { ...clone(payload), id: 'overnight-other' } as any;
    other.timeline.id = 'overnight-other';
    const premium = withEnvironment(other, 'temple');
    expect(await start({ resumeSessionId: 'session-1' }, premium, withSession(open))).toEqual(GATED);
  });

  it('does not accept a different number of stages', async () => {
    const shorter = clone(payload) as any;
    shorter.timeline.stages.pop();
    shorter.timeline.stages[0].target = { ...shorter.timeline.stages[0].target, environment: 'temple' };
    expect(await start({ resumeSessionId: 'session-1' }, shorter, withSession(open))).toEqual(GATED);
  });

  it('reports unreadable Journey Memory instead of classifying', async () => {
    const d = deps({ loadSession: jest.fn(async () => ({ status: 'unreadable' })) as any });
    expect(await resolvePlaybackStart({ resumeSessionId: 'session-1' }, payload, d)).toEqual({ status: 'unreadable', source: 'journey_memory' });
  });

  it('does not treat a resume label without a session id as a resume', async () => {
    const forged = withEnvironment(catalog('lucid-signal'), 'temple');
    expect(await start({ playbackKind: 'resume' }, forged)).toEqual(GATED);
    expect(await start({ playbackKind: 'live_mix' }, forged)).toEqual(GATED);
    expect(await start({ playbackKind: 'chamber_mixer' }, forged)).toEqual(GATED);
  });
});

describe('gated labels', () => {
  it('only make a start stricter', async () => {
    const free = catalog('lucid-signal') as any;
    expect(await start({ playbackKind: 'custom_new' }, free)).toEqual({ kind: 'custom_new' });
    expect(await start({ nightPlanId: 'p', playbackKind: 'overnight_new' }, withEnvironment(free, 'temple'))).toEqual(GATED);
  });
});
