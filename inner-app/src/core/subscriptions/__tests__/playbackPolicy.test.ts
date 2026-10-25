import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { createDreamIncubationJourney, FACTORY_AUDIO_JOURNEYS } from '../../../../core/audio/factoryJourneys';
import { PREMIUM_OVERNIGHT_ENVIRONMENTS } from '../constants';
import {
  checkStartAccess,
  decideStart,
  environmentsOfTimeline,
  experimentRequiresMembership,
  isPremiumOvernightEnvironment,
  playerStartFromRoute,
  verifiedPlaybackKind,
  type PlaybackStart,
  type PlaybackStartKind,
} from '../playbackPolicy';
import type { MembershipStatus } from '../membership';

jest.mock('react-native-purchases', () => ({
  __esModule: true,
  default: { getCustomerInfo: jest.fn() },
}));

const FREE_OVERNIGHT = ['ocean', 'forest', 'none'];
const PREMIUM_OVERNIGHT = ['temple', 'abyssal', 'cosmic', 'fire'];
const STATUSES: MembershipStatus[] = ['member', 'not_member', 'unknown'];

describe('premium overnight environments', () => {
  it('lists exactly the four gated worlds', () => {
    expect([...PREMIUM_OVERNIGHT_ENVIRONMENTS].sort()).toEqual([...PREMIUM_OVERNIGHT].sort());
  });

  it('keeps Ocean, Forest, and Quiet free', () => {
    for (const id of FREE_OVERNIGHT) expect(isPremiumOvernightEnvironment(id)).toBe(false);
    for (const id of PREMIUM_OVERNIGHT) expect(isPremiumOvernightEnvironment(id)).toBe(true);
  });
});

describe('decideStart', () => {
  it.each(FREE_OVERNIGHT)('allows a new overnight start in %s for every membership state', environment => {
    for (const status of STATUSES) {
      expect(decideStart({ kind: 'overnight_new', environment }, status)).toEqual({ allowed: true });
    }
  });

  it.each(PREMIUM_OVERNIGHT)('gates a new overnight start in %s by membership', environment => {
    const start: PlaybackStart = { kind: 'overnight_new', environment };
    expect(decideStart(start, 'member')).toEqual({ allowed: true });
    expect(decideStart(start, 'not_member')).toEqual({
      allowed: false, reason: 'membership_required', trigger: 'overnight',
    });
    expect(decideStart(start, 'unknown')).toEqual({ allowed: false, reason: 'verification_failed' });
  });

  it('gates new custom journey creation and save by membership', () => {
    const start: PlaybackStart = { kind: 'custom_new' };
    expect(decideStart(start, 'member')).toEqual({ allowed: true });
    expect(decideStart(start, 'not_member')).toEqual({
      allowed: false, reason: 'membership_required', trigger: 'journey_creator',
    });
    expect(decideStart(start, 'unknown')).toEqual({ allowed: false, reason: 'verification_failed' });
  });

  it.each<PlaybackStart>([
    { kind: 'factory' },
    { kind: 'saved_custom' },
    { kind: 'live_mix' },
    { kind: 'chamber_mixer' },
  ])('never gates $kind for any membership state', start => {
    for (const status of STATUSES) expect(decideStart(start, status)).toEqual({ allowed: true });
  });
});

describe('checkStartAccess', () => {
  it('never queries membership for resumes, so expiry or refresh failure cannot block them', async () => {
    const membership = jest.fn<() => Promise<MembershipStatus>>(async () => 'unknown');
    await expect(checkStartAccess({ kind: 'resume' }, { membership })).resolves.toEqual({ allowed: true });
    await expect(checkStartAccess({ kind: 'factory' }, { membership })).resolves.toEqual({ allowed: true });
    await expect(checkStartAccess({ kind: 'saved_custom' }, { membership })).resolves.toEqual({ allowed: true });
    expect(membership).not.toHaveBeenCalled();
  });

  it('queries membership when a premium new start needs it', async () => {
    const membership = jest.fn<() => Promise<MembershipStatus>>(async () => 'not_member');
    const decision = await checkStartAccess({ kind: 'overnight_new', environment: 'temple' }, { membership });
    expect(membership).toHaveBeenCalledTimes(1);
    expect(decision).toEqual({ allowed: false, reason: 'membership_required', trigger: 'overnight' });
  });

  it('treats an expired member the same as any non-member for new starts only', async () => {
    const start: PlaybackStart = { kind: 'overnight_new', environment: 'cosmic' };
    const beforeExpiry = await checkStartAccess(start, { membership: async () => 'member' });
    const afterExpiry = await checkStartAccess(start, { membership: async () => 'not_member' });
    expect(beforeExpiry).toEqual({ allowed: true });
    expect(afterExpiry.allowed).toBe(false);
    // Resuming the same night after expiry is still allowed.
    await expect(checkStartAccess({ kind: 'resume' }, { membership: async () => 'not_member' }))
      .resolves.toEqual({ allowed: true });
  });
});

describe('environmentsOfTimeline', () => {
  it('reads environments from stage targets and ignores none', () => {
    expect(environmentsOfTimeline({
      stages: [
        { target: { environment: 'ocean' } },
        { target: { environment: 'none' } },
        { target: { environment: 'cosmic' } },
        { target: {} },
      ],
    })).toEqual(['ocean', 'cosmic']);
  });

  it('returns an empty list for a missing timeline', () => {
    expect(environmentsOfTimeline(undefined)).toEqual([]);
  });
});

describe('factory journeys keep their premium-environment stages free', () => {
  it('finds a cosmic stage in Dream Incubation, which stays free', () => {
    const journey = createDreamIncubationJourney('a quiet lake');
    expect(environmentsOfTimeline(journey.timeline)).toContain('cosmic');
    const start = playerStartFromRoute({ playbackKind: 'factory' }, journey.timeline);
    expect(start).toEqual({ kind: 'factory' });
    expect(decideStart(start, 'not_member')).toEqual({ allowed: true });
  });

  it('keeps every shipped factory journey free for non-members', () => {
    for (const journey of FACTORY_AUDIO_JOURNEYS) {
      const start = playerStartFromRoute({ playbackKind: 'factory' }, journey.timeline);
      expect(decideStart(start, 'not_member')).toEqual({ allowed: true });
    }
  });
});

describe('playerStartFromRoute entry points', () => {
  const premiumTimeline = { stages: [{ target: { environment: 'temple' } }] };
  const freeTimeline = { stages: [{ target: { environment: 'ocean' } }] };

  it('classifies a resume regardless of environment', () => {
    expect(playerStartFromRoute({ resumeSessionId: 's1' }, premiumTimeline)).toEqual({ kind: 'resume' });
  });

  it('classifies an overnight start from its night plan', () => {
    expect(playerStartFromRoute(
      { nightPlanId: 'p1', playbackKind: 'overnight_new' }, premiumTimeline,
    )).toEqual({ kind: 'overnight_new', environment: 'temple' });
  });

  it('treats an unlabelled premium journey as a new overnight start, not a free one', () => {
    expect(playerStartFromRoute({}, premiumTimeline)).toEqual({ kind: 'overnight_new', environment: 'temple' });
  });

  it('treats an unlabelled free journey as factory', () => {
    expect(playerStartFromRoute({}, freeTimeline)).toEqual({ kind: 'factory' });
  });

  it('passes saved and custom kinds through unchanged', () => {
    expect(playerStartFromRoute({ playbackKind: 'saved_custom' }, premiumTimeline)).toEqual({ kind: 'saved_custom' });
    expect(playerStartFromRoute({ playbackKind: 'custom_new' }, premiumTimeline)).toEqual({ kind: 'custom_new' });
  });
});

describe('playback origin verification', () => {
  const premiumTimeline = { stages: [{ target: { environment: 'temple' } }] };
  const custom = { id: 'custom-1', timeline: premiumTimeline };
  const route = (playbackKind: PlaybackStartKind) => ({ playbackKind });
  const classify = (kind: PlaybackStartKind, journey: typeof custom, saved: string[] = []) =>
    playerStartFromRoute({ playbackKind: verifiedPlaybackKind(route(kind), journey, saved) }, journey.timeline);

  it('does not let a custom premium journey claim to be factory', () => {
    expect(classify('factory', custom)).toEqual({ kind: 'overnight_new', environment: 'temple' });
  });

  it('keeps every catalog journey and a Dream Incubation factory', () => {
    for (const journey of FACTORY_AUDIO_JOURNEYS) {
      expect(verifiedPlaybackKind(route('factory'), journey, [])).toBe('factory');
    }
    expect(verifiedPlaybackKind(route('factory'), createDreamIncubationJourney('a lake'), [])).toBe('factory');
  });

  it('rejects a catalog id carrying an environment the original lacks', () => {
    const base = FACTORY_AUDIO_JOURNEYS.find(item => !environmentsOfTimeline(item.timeline).includes('fire'))!;
    const forged = { id: base.id, timeline: { stages: [{ target: { environment: 'fire' } }] } };
    expect(verifiedPlaybackKind(route('factory'), forged, [])).toBeUndefined();
  });

  it('accepts saved_custom only for an id in the saved store', () => {
    expect(classify('saved_custom', custom, ['custom-1'])).toEqual({ kind: 'saved_custom' });
    expect(classify('saved_custom', custom, [])).toEqual({ kind: 'overnight_new', environment: 'temple' });
  });

  it('does not treat a resume label without a session as a resume', () => {
    expect(playerStartFromRoute({ playbackKind: 'resume' }, premiumTimeline)).toEqual({ kind: 'overnight_new', environment: 'temple' });
  });

  it('does not let a mixer label skip the check in the journey player', () => {
    expect(playerStartFromRoute({ playbackKind: 'live_mix' }, premiumTimeline)).toEqual({ kind: 'overnight_new', environment: 'temple' });
    expect(playerStartFromRoute({ playbackKind: 'chamber_mixer' }, premiumTimeline)).toEqual({ kind: 'overnight_new', environment: 'temple' });
  });

  it('still gates custom_new', () => {
    expect(classify('custom_new', custom)).toEqual({ kind: 'custom_new' });
  });
});

describe('experiment identity and membership', () => {
  it('requires membership for any Ocean and Temple comparison', () => {
    expect(experimentRequiresMembership({ sequence: ['ocean', 'temple', 'ocean'] })).toBe(true);
  });

  it('does not require membership for an experiment with no premium condition', () => {
    expect(experimentRequiresMembership({ sequence: ['ocean', 'ocean'] })).toBe(false);
  });
});
