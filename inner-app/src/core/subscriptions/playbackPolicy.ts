import { PREMIUM_OVERNIGHT_ENVIRONMENTS } from './constants';
import { resolveMembership, type MembershipStatus } from './membership';
import type { PaywallTrigger } from './paywallController';

/**
 * Every playback start is classified before audio begins. Only new starts and
 * new creations are gated. Resumes, factory journeys, saved custom journeys,
 * and the mixers never check membership here.
 */
export type PlaybackStart =
  | { kind: 'overnight_new'; environment: string }
  | { kind: 'resume' }
  | { kind: 'factory' }
  | { kind: 'saved_custom' }
  | { kind: 'custom_new' }
  | { kind: 'live_mix' }
  | { kind: 'chamber_mixer' };

export type PlaybackStartKind = PlaybackStart['kind'];

export type AccessDecision =
  | { allowed: true }
  | { allowed: false; reason: 'membership_required'; trigger: PaywallTrigger }
  | { allowed: false; reason: 'verification_failed' };

export function isPremiumOvernightEnvironment(id: string | null | undefined): boolean {
  return !!id && (PREMIUM_OVERNIGHT_ENVIRONMENTS as readonly string[]).includes(id);
}

/** True only when this start must verify membership before beginning. */
export function requiresMembershipCheck(start: PlaybackStart): boolean {
  if (start.kind === 'custom_new') return true;
  if (start.kind === 'overnight_new') return isPremiumOvernightEnvironment(start.environment);
  return false;
}

export function decideStart(start: PlaybackStart, membership: MembershipStatus): AccessDecision {
  if (!requiresMembershipCheck(start)) return { allowed: true };
  if (membership === 'member') return { allowed: true };
  if (membership === 'unknown') return { allowed: false, reason: 'verification_failed' };
  return {
    allowed: false,
    reason: 'membership_required',
    trigger: start.kind === 'custom_new' ? 'journey_creator' : 'overnight',
  };
}

/**
 * Resolves membership only when the start needs it. Resume and free starts never
 * touch the entitlement check, so expiry or refresh failure cannot block them.
 */
export async function checkStartAccess(
  start: PlaybackStart,
  deps: { membership?: () => Promise<MembershipStatus> } = {},
): Promise<AccessDecision> {
  if (!requiresMembershipCheck(start)) return { allowed: true };
  const membership = await (deps.membership ?? resolveMembership)();
  return decideStart(start, membership);
}

type TimelineLike = { stages?: Array<{ target?: { environment?: string } }> };

/** Environments named by a journey's stages, excluding "none". */
export function environmentsOfTimeline(timeline: TimelineLike | null | undefined): string[] {
  const found = new Set<string>();
  for (const stage of timeline?.stages ?? []) {
    const environment = stage.target?.environment;
    if (environment && environment !== 'none') found.add(environment);
  }
  return [...found];
}

type RouteStart = {
  resumeSessionId?: string;
  nightPlanId?: string;
  playbackKind?: PlaybackStartKind;
};

/**
 * Maps player route params to a start classification. An explicit kind from the
 * entry screen always wins. Without one, a journey with a premium environment is
 * treated as a new overnight start, so an unlabelled entry cannot bypass the gate.
 */
export function playerStartFromRoute(
  params: RouteStart,
  timeline: TimelineLike | null | undefined,
): PlaybackStart {
  if (params.resumeSessionId) return { kind: 'resume' };
  const environments = environmentsOfTimeline(timeline);
  const premium = environments.find(isPremiumOvernightEnvironment);
  const primary = premium ?? environments[0] ?? 'none';
  if (params.playbackKind === 'overnight_new') return { kind: 'overnight_new', environment: primary };
  if (params.playbackKind === 'custom_new') return { kind: 'custom_new' };
  if (params.playbackKind === 'saved_custom') return { kind: 'saved_custom' };
  if (params.playbackKind === 'factory') return { kind: 'factory' };
  if (params.playbackKind === 'live_mix') return { kind: 'live_mix' };
  if (params.playbackKind === 'chamber_mixer') return { kind: 'chamber_mixer' };
  if (params.playbackKind === 'resume') return { kind: 'resume' };
  if (params.nightPlanId || premium) return { kind: 'overnight_new', environment: primary };
  return { kind: 'factory' };
}

/**
 * A pending experiment night is never silently replaced. Membership is needed when
 * the comparison includes Temple, which is the case for every Ocean and Temple run.
 */
export function experimentRequiresMembership(experiment: { sequence?: string[] }): boolean {
  return (experiment.sequence ?? []).some(condition => isPremiumOvernightEnvironment(condition));
}
