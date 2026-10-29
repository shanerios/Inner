import { describe, expect, it } from '@jest/globals';
import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * The first launch goes Splash -> Intention -> Home. `onboarding_started` once fired from the Intro
 * screen, which that flow skips, so new users silently produced neither start nor completion. These
 * checks pin where the two events are recorded.
 */
const read = (file: string) => readFileSync(join(__dirname, '..', '..', 'screens', file), 'utf8');

describe('onboarding funnel wiring', () => {
  it('records the start on the first-run splash tap, next to onboarding_splash_tapped', () => {
    const splash = read('SplashScreen.tsx');
    const tap = splash.indexOf("posthog?.capture('onboarding_splash_tapped')");
    expect(tap).toBeGreaterThan(-1);
    const block = splash.slice(Math.max(0, tap - 120), tap + 400);
    expect(block).toContain('!onboardingComplete');
    expect(block).toContain('trackOnboardingStarted()');
  });

  it('does not record a start from the Intro replay, which would count returning users as new', () => {
    expect(read('IntroScreen.tsx')).not.toContain('trackOnboardingStarted');
  });

  it('records the completion when Home mounts', () => {
    expect(read('HomeScreen.tsx')).toContain('trackOnboardingCompletedIfStarted()');
  });
});
