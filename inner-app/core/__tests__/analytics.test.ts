jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'));

import {
  classifyBuild,
  resolvePostHogConfig,
  sanitizeProps,
  track,
  trackOnce,
  setAnalyticsClient,
  resetAnalyticsForTests,
  initAnalytics,
  setInternalUser,
  newSessionId,
  LAB_APPLICATION_ID,
} from '../analytics';

describe('build classification', () => {
  it('treats the lab application id as lab', () => {
    expect(classifyBuild({ applicationId: LAB_APPLICATION_ID, isDev: false })).toBe('lab');
  });
  it('treats the lab env flag as lab', () => {
    expect(classifyBuild({ applicationId: 'com.getinner.app', labEnv: '1', isDev: false })).toBe('lab');
  });
  it('classifies a __DEV__ build on the production bundle id as dev, never production', () => {
    expect(classifyBuild({ applicationId: 'com.getinner.app', isDev: true })).toBe('dev');
  });
  it('classifies a release build on the production id as production', () => {
    expect(classifyBuild({ applicationId: 'com.getinner.app', isDev: false })).toBe('production');
  });
});

describe('posthog config', () => {
  it('uses the production key only for production', () => {
    const cfg = resolvePostHogConfig('production', { prodKey: 'p', labKey: 'l' });
    expect(cfg).toMatchObject({ apiKey: 'p', disabled: false });
  });
  it('uses the lab key for lab and dev', () => {
    expect(resolvePostHogConfig('lab', { prodKey: 'p', labKey: 'l' }).apiKey).toBe('l');
    expect(resolvePostHogConfig('dev', { prodKey: 'p', labKey: 'l' }).apiKey).toBe('l');
  });
  it('shares the production project (tagged by build_channel) when no lab key exists', () => {
    expect(resolvePostHogConfig('dev', { prodKey: 'p' })).toMatchObject({ apiKey: 'p', disabled: false });
    expect(resolvePostHogConfig('lab', { prodKey: 'p' })).toMatchObject({ apiKey: 'p', disabled: false });
  });
  it('never sends production builds to the lab key', () => {
    expect(resolvePostHogConfig('production', { labKey: 'l' })).toMatchObject({ apiKey: '', disabled: true });
  });
  it('sends nothing when no key is configured at all', () => {
    expect(resolvePostHogConfig('lab', {})).toMatchObject({ apiKey: '', disabled: true });
  });
});

describe('sanitizeProps', () => {
  it('keeps short primitives and drops text-like keys, long strings and objects', () => {
    const out = sanitizeProps({
      practice_id: 'guardian_1',
      duration_s: 42,
      eligible: true,
      dream_text: 'x',
      entry_title: 'my dream',
      transcript: 'hello',
      long_value: 'a'.repeat(65),
      nested: { a: 1 } as any,
      nothing: undefined,
    });
    expect(out).toEqual({ practice_id: 'guardian_1', duration_s: 42, eligible: true });
  });
});

describe('track', () => {
  beforeEach(() => resetAnalyticsForTests());

  it('never throws when the client throws or is missing', () => {
    expect(() => track('x')).not.toThrow();
    setAnalyticsClient({ capture: () => { throw new Error('boom'); } });
    expect(() => track('x', { a: 1 })).not.toThrow();
  });

  it('trackOnce fires a key only once', () => {
    const capture = jest.fn();
    setAnalyticsClient({ capture });
    trackOnce('s1:started', 'overnight_started', { session_id: 's1' });
    trackOnce('s1:started', 'overnight_started', { session_id: 's1' });
    trackOnce('s2:started', 'overnight_started', { session_id: 's2' });
    expect(capture).toHaveBeenCalledTimes(2);
  });

  it('newSessionId is unique', () => {
    expect(newSessionId()).not.toBe(newSessionId());
  });
});

describe('internal tagging', () => {
  beforeEach(() => resetAnalyticsForTests());

  it('registers properties without resetting identity', async () => {
    const register = jest.fn();
    const identify = jest.fn();
    const reset = jest.fn();
    const client: any = { capture: jest.fn(), register, identify, reset, getDistinctId: () => 'abc' };
    await initAnalytics(client, 'production');
    expect(register).toHaveBeenCalledWith({ build_channel: 'production', is_internal: false });
    await setInternalUser(true);
    expect(register).toHaveBeenLastCalledWith({ is_internal: true });
    expect(identify).toHaveBeenCalledWith('abc', { is_internal: true });
    expect(reset).not.toHaveBeenCalled();
  });
});
