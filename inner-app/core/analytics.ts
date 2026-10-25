import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Shared, failure-safe analytics helper. Every capture goes through here so that:
 * - a build is classified once (production / lab / dev) and routed to its own PostHog project,
 * - analytics can never throw into playback or journaling,
 * - properties are limited to short primitives (no free text can ride along),
 * - once-per-session events cannot double fire.
 */

/**
 * Where a build came from, kept separate from `is_internal` (who is using it):
 * - production: the store release build
 * - beta: external testers on a store track (real users, analysed on their own)
 * - internal: internal-distribution store tracks used by the team (excluded from public metrics)
 * - lab: Inner Lab builds
 * - dev: local development builds (any __DEV__ build, even on the production bundle ID)
 */
export type BuildChannel = 'production' | 'beta' | 'internal' | 'lab' | 'dev';

export const LAB_APPLICATION_ID = 'com.getinner.app.proceduraldev';

const STORE_CHANNELS: ReadonlySet<string> = new Set(['production', 'beta', 'internal']);

/**
 * Pure classification so it can be tested. Order matters:
 * 1. Lab is decided by its own bundle ID or flag, or an explicit lab channel.
 * 2. Any __DEV__ build is dev, whatever its bundle ID or profile, so it is never production.
 * 3. Otherwise the channel the EAS profile declared (EXPO_PUBLIC_INNER_CHANNEL) applies.
 * 4. A build with no or unrecognised channel is production, which is what a store build is.
 */
export function classifyBuild(input: {
  applicationId?: string | null;
  labEnv?: string | null;
  channelEnv?: string | null;
  isDev: boolean;
}): BuildChannel {
  if (input.applicationId === LAB_APPLICATION_ID || input.labEnv === '1' || input.channelEnv === 'lab') return 'lab';
  if (input.isDev || input.channelEnv === 'dev') return 'dev';
  if (input.channelEnv && STORE_CHANNELS.has(input.channelEnv)) return input.channelEnv as BuildChannel;
  return 'production';
}

export type PostHogRuntimeConfig = {
  channel: BuildChannel;
  apiKey: string;
  host: string;
  /** True when no key is configured: nothing is sent anywhere. */
  disabled: boolean;
};

/**
 * Production, beta and internal store builds always use the production key. Only lab and dev builds
 * use the lab key when one is configured (a separate PostHog project); otherwise they share the
 * production project, where every event carries `build_channel` so dashboards can exclude them.
 * With no key at all nothing is sent.
 */
export function resolvePostHogConfig(
  channel: BuildChannel,
  env: { prodKey?: string; labKey?: string; host?: string },
): PostHogRuntimeConfig {
  const host = env.host || 'https://us.i.posthog.com';
  const usesLabKey = channel === 'lab' || channel === 'dev';
  const apiKey = (usesLabKey ? env.labKey || env.prodKey : env.prodKey) ?? '';
  return { channel, apiKey, host, disabled: apiKey.length === 0 };
}

export type AnalyticsClient = {
  capture: (event: string, properties?: Record<string, any>) => void;
  register?: (properties: Record<string, any>) => Promise<void> | void;
  identify?: (distinctId?: string, properties?: Record<string, any>) => void;
  getDistinctId?: () => string;
};

export type AnalyticsProps = Record<string, string | number | boolean | undefined | null>;

const MAX_STRING_LENGTH = 64;
/** Keys that would indicate user-authored material; dropped even if a caller passes them. */
const BLOCKED_KEY = /(^|_)(text|title|content|note|notes|transcript|body|message|intention|sign|signs|name|email|line)($|_)/i;

/** Keeps short primitives only. Exported for tests. */
export function sanitizeProps(props?: AnalyticsProps): Record<string, string | number | boolean> | undefined {
  if (!props) return undefined;
  const out: Record<string, string | number | boolean> = {};
  for (const [key, value] of Object.entries(props)) {
    if (value === undefined || value === null) continue;
    if (BLOCKED_KEY.test(key)) continue;
    if (typeof value === 'string') {
      if (value.length > MAX_STRING_LENGTH) continue;
      out[key] = value;
    } else if (typeof value === 'number') {
      if (Number.isFinite(value)) out[key] = value;
    } else if (typeof value === 'boolean') {
      out[key] = value;
    }
  }
  return out;
}

let client: AnalyticsClient | null = null;
let channel: BuildChannel = 'production';
let internal = false;
const firedOnce = new Set<string>();

export const INTERNAL_FLAG_KEY = 'inner.analytics.internal';

export function setAnalyticsClient(next: AnalyticsClient | null) {
  client = next;
}

export function getBuildChannel(): BuildChannel {
  return channel;
}

/** Safe to call from anywhere, including during audio playback. Never throws. */
export function track(event: string, props?: AnalyticsProps): void {
  try {
    client?.capture(event, sanitizeProps(props));
  } catch {
    // Analytics must never interrupt the app.
  }
}

/** Fires at most once per app run for a given key (e.g. a session id plus event name). */
export function trackOnce(key: string, event: string, props?: AnalyticsProps): void {
  if (firedOnce.has(key)) return;
  firedOnce.add(key);
  track(event, props);
}

/** Test seam. */
export function resetAnalyticsForTests() {
  client = null;
  firedOnce.clear();
  internal = false;
  channel = 'production';
}

/** Random id for correlating one overnight run's events; not derived from anything personal. */
export function newSessionId(): string {
  const bytes = () => Math.random().toString(36).slice(2, 10);
  return `${Date.now().toString(36)}-${bytes()}${bytes()}`;
}

/**
 * Registers super properties on every later event and reads the persisted internal flag.
 * Existing identities are untouched: only properties are registered.
 */
export async function initAnalytics(next: AnalyticsClient, buildChannel: BuildChannel) {
  client = next;
  channel = buildChannel;
  try {
    internal = (await AsyncStorage.getItem(INTERNAL_FLAG_KEY)) === '1';
  } catch {
    internal = false;
  }
  try {
    await next.register?.({ build_channel: buildChannel, is_internal: internal });
  } catch {}
}

export function isInternalUser(): boolean {
  return internal;
}

/** Turns internal tagging on or off. Sets event super property and person property; never resets identity. */
export async function setInternalUser(on: boolean): Promise<void> {
  internal = on;
  try {
    await AsyncStorage.setItem(INTERNAL_FLAG_KEY, on ? '1' : '0');
  } catch {}
  try {
    await client?.register?.({ is_internal: on });
    const id = client?.getDistinctId?.();
    if (id) client?.identify?.(id, { is_internal: on });
  } catch {}
}
