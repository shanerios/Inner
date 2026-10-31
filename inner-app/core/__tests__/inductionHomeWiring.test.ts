import { describe, expect, it } from '@jest/globals';
import { readFileSync } from 'fs';
import { join } from 'path';

const root = join(__dirname, '..', '..');
const read = (file: string) => readFileSync(join(root, file), 'utf8');
const home = read('screens/HomeScreen.tsx');
const player = read('screens/LucidJourneyPlayerScreen.tsx');
const card = read('components/InductionCard.tsx');

describe('The Induction is offered on Home and answers the tour', () => {
  it('holds the spotlight tour until the Induction has been answered, and until its state is known', () => {
    expect(home).toContain('if (homeWalkthroughLoading || !dailyChecked || inductionHoldsTheTour) return;');
    expect(home).toContain('const inductionHoldsTheTour = !inductionLoaded || inductionHoldsTour(inductionState, shouldShowHomeHelper);');
    // The tour still waits for the daily check-in as well.
    expect(home).toContain('!dailyChecked');
  });

  it('leads the first-visit offer ahead of every other Home card, and keeps the quiet one last', () => {
    const prominent = home.indexOf("inductionVisibleOffer === 'prominent' ? (");
    const morning = home.indexOf('morningReturnContinuation.visible ? (', prominent);
    const quiet = home.indexOf("inductionVisibleOffer === 'quiet' ? (");
    const portal = home.indexOf('{/* Portal / Orb */}');
    expect(prominent).toBeGreaterThan(-1);
    expect(morning).toBeGreaterThan(prominent);
    expect(quiet).toBeGreaterThan(morning);
    expect(portal).toBeGreaterThan(quiet);
    expect(home).toContain('variant="prominent"');
    expect(home).toContain('variant="quiet"');
  });

  it('begins the Induction only when the person chooses, as a free factory journey', () => {
    expect(home).toContain("navigation.navigate('LucidJourneyPlayer', { journey: INDUCTION_JOURNEY, playbackKind: 'factory' });");
    // The card cannot start audio: it imports nothing that plays sound.
    expect(card).not.toMatch(/expo-av|track-player|proceduralAudioEngine|\bplay\(/i);
    expect(card).toContain('onPress={onBegin}');
  });

  it('answers the Induction by playing it: begun when audio is confirmed, completed or left early at the end', () => {
    expect(player).toContain('noteInductionStarted();');
    const confirmed = player.indexOf('startConfirmed = true;');
    expect(player.indexOf('noteInductionStarted();', confirmed)).toBeGreaterThan(confirmed);
    expect(player).toContain("advanceInductionStatus('started')");
    expect(player).toContain("advanceInductionStatus('completed')");
    expect(player).toContain('noteInductionEnded(outcome, positionOverrideMs ?? currentPositionRef.current);');
  });

  it('touches nothing about subscriptions or entitlements', () => {
    for (const source of [card, read('core/inductionState.ts'), read('core/inductionAnalytics.ts')]) {
      expect(source).not.toMatch(/Purchases|entitlement|paywall|membership|playbackPolicy/i);
    }
  });
});
