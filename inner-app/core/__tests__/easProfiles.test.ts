jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'));

import { describe, expect, it, jest } from '@jest/globals';
import * as fs from 'fs';
import * as path from 'path';
import { classifyBuild, LAB_APPLICATION_ID } from '../analytics';

const root = path.join(__dirname, '../..');
const eas = JSON.parse(fs.readFileSync(path.join(root, 'eas.json'), 'utf8'));
const appJson = JSON.parse(fs.readFileSync(path.join(root, 'app.json'), 'utf8')).expo;
const profiles: Record<string, any> = eas.build;

/** Effective env of a profile, following `extends`. */
function effective(name: string): any {
  const profile = profiles[name];
  const base = profile.extends ? effective(profile.extends) : {};
  return { ...base, ...profile, env: { ...(base.env ?? {}), ...(profile.env ?? {}) } };
}

const EXPECTED: Record<string, { environment: string; channel: string }> = {
  development: { environment: 'development', channel: 'dev' },
  'development-client': { environment: 'development', channel: 'dev' },
  apk: { environment: 'production', channel: 'internal' },
  lab: { environment: 'preview', channel: 'lab' },
  internal: { environment: 'production', channel: 'internal' },
  preview: { environment: 'production', channel: 'beta' },
  production: { environment: 'production', channel: 'production' },
};

describe('EAS build profiles', () => {
  it('declares an explicit EAS environment and analytics channel for every profile', () => {
    expect(Object.keys(profiles).sort()).toEqual(Object.keys(EXPECTED).sort());
    for (const [name, expected] of Object.entries(EXPECTED)) {
      const profile = effective(name);
      expect({ name, environment: profile.environment }).toEqual({ name, environment: expected.environment });
      expect({ name, channel: profile.env.EXPO_PUBLIC_INNER_CHANNEL }).toEqual({ name, channel: expected.channel });
    }
  });

  it('Lab uses the preview environment, not production, and is flagged lab', () => {
    const lab = effective('lab');
    expect(lab.environment).toBe('preview');
    expect(lab.env.EXPO_PUBLIC_INNER_LAB).toBe('1');
    expect(lab.env.SENTRY_DISABLE_AUTO_UPLOAD).toBe('true');
  });

  it('every store profile keeps the production environment (RevenueCat, PostHog, Sentry values)', () => {
    for (const name of ['production', 'preview', 'internal', 'apk']) expect(effective(name).environment).toBe('production');
  });

  it('only the Lab profile builds the Lab flavor, and no store profile sets the Lab flag', () => {
    for (const [name, profile] of Object.entries(profiles)) {
      const gradle = String(effective(name).android?.gradleCommand ?? '');
      expect(gradle.includes('ProceduralDev')).toBe(name === 'lab');
      if (name !== 'lab') expect(profile.env?.EXPO_PUBLIC_INNER_LAB).toBeUndefined();
    }
  });

  it('the production profile is untouched: store distribution, bundle and auto-increment', () => {
    const production = effective('production');
    expect(production.distribution).toBe('store');
    expect(production.channel).toBe('production');
    expect(production.autoIncrement).toBe(true);
    expect(production.android.gradleCommand).toBe(':app:bundleProdRelease');
    expect(production.env.EXPO_NEW_ARCH_ENABLED).toBe('0');
  });

  it('keeps the production bundle IDs and has no secret values in eas.json', () => {
    expect(appJson.ios.bundleIdentifier).toBe('com.getinner.app');
    expect(appJson.android.package).toBe('com.getinner.app');
    const text = JSON.stringify(eas);
    expect(text).not.toMatch(/phc_|appl_|goog_|sentry\.io|sntrys_|ingest/i);
    expect(text).not.toMatch(/REVENUECAT|POSTHOG|SENTRY_DSN|SENTRY_AUTH_TOKEN/);
  });

  it('each profile channel classifies to the intended build_channel', () => {
    for (const [name, expected] of Object.entries(EXPECTED)) {
      const profile = effective(name);
      const lab = name === 'lab';
      const result = classifyBuild({
        applicationId: lab ? LAB_APPLICATION_ID : 'com.getinner.app',
        labEnv: profile.env.EXPO_PUBLIC_INNER_LAB,
        channelEnv: profile.env.EXPO_PUBLIC_INNER_CHANNEL,
        isDev: false,
      });
      expect({ name, result }).toEqual({ name, result: expected.channel });
    }
    // A development client always runs with __DEV__, so it is dev on the production bundle ID too.
    expect(classifyBuild({ applicationId: 'com.getinner.app', channelEnv: 'dev', isDev: true })).toBe('dev');
  });
});
