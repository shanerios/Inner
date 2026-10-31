import { describe, expect, it } from '@jest/globals';
import { readFileSync } from 'fs';
import { join } from 'path';

const root = join(__dirname, '..', '..');
const read = (file: string) => readFileSync(join(root, file), 'utf8');
const home = read('screens/HomeScreen.tsx');
const player = read('screens/LucidJourneyPlayerScreen.tsx');
const card = read('components/InductionCard.tsx');
const welcome = read('components/InductionWelcome.tsx');

describe('The Induction welcomes a new visitor on Home and answers the tour', () => {
  it('holds the spotlight tour until the welcome has been answered, and until its state is known', () => {
    expect(home).toContain('if (homeWalkthroughLoading || !dailyChecked || inductionHoldsTheTour) return;');
    expect(home).toContain('const inductionHoldsTheTour = !inductionLoaded || inductionHoldsTour(inductionState, shouldShowHomeHelper);');
    expect(home).toContain('!dailyChecked');
  });

  it('keeps Arrive from meeting a new visitor until the tour is done, so it is not a run of screens', () => {
    const tourDone = home.indexOf("const tourDone = await isWalkthroughSeen('home_helper_v1');");
    const show = home.indexOf('const show = tourDone && (await shouldShowDailyMicroRitual());');
    expect(tourDone).toBeGreaterThan(-1);
    expect(show).toBeGreaterThan(tourDone);
    // Someone who has done the tour is unaffected: the ritual rule itself is unchanged.
    expect(home).toContain("navigation.navigate('DailyRitual');");
  });

  it('shows the welcome over Home with the orb in its place, never alongside the tour', () => {
    expect(home).toContain("const inductionWelcomeVisible = inductionVisibleOffer === 'welcome' && !tourRunning;");
    expect(home).toContain('<InductionWelcome');
    expect(home).toContain('orbLeft={ORB_LEFT}');
    expect(home).toContain('orbTop={ORB_TOP}');
    expect(home).toContain('orbSize={ORB_WIDTH}');
    // Drawn late in the tree, after the cards and the orb, so nothing sits above it.
    expect(home.indexOf('<InductionWelcome')).toBeGreaterThan(home.indexOf('{/* Portal / Orb */}'));
    expect(home.indexOf('<InductionWelcome')).toBeLessThan(home.lastIndexOf('<SettingsModal'));
  });

  it('says what it should: a welcome, the Induction, headphones suggested but optional, and two choices', () => {
    expect(welcome).toContain('Welcome to Inner');
    expect(welcome).toContain('The Induction');
    expect(welcome).toMatch(/Headphones are suggested for the best experience, but they're optional\./);
    expect(welcome).toContain('onPress={onListen}');
    expect(welcome).toContain('onPress={onSkip}');
    expect(welcome).toContain('>Listen<');
    expect(welcome).toContain('>Skip<');
  });

  it('skipping leaves the Induction as a card at the top of Home, which steps aside for the tour', () => {
    expect(home).toContain("setInductionState(await advanceInductionStatus('skipped'));");
    expect(home).toContain("const inductionCardVisible = inductionVisibleOffer === 'quiet' && !tourRunning;");
    expect(home).toContain(') : inductionCardVisible ? (');
    const morning = home.indexOf('morningReturnContinuation.visible ? (');
    const cardBranch = home.indexOf(') : inductionCardVisible ? (');
    const portal = home.indexOf('{/* Portal / Orb */}');
    expect(cardBranch).toBeGreaterThan(morning);
    expect(portal).toBeGreaterThan(cardBranch);
  });

  it('begins the Induction only when the person chooses, as a free factory journey', () => {
    expect(home).toContain("navigation.navigate('LucidJourneyPlayer', { journey: INDUCTION_JOURNEY, playbackKind: 'factory' });");
    for (const source of [card, welcome]) {
      // Neither can start audio: they import nothing that plays sound.
      expect(source).not.toMatch(/expo-av|track-player|proceduralAudioEngine|\bplay\(/i);
    }
    expect(card).toContain('onPress={onBegin}');
  });

  it('records the funnel: listen pressed, skipped, begun, finished or left early', () => {
    expect(home).toContain('trackInductionListenPressed(');
    expect(home).toContain('trackInductionSkipped(');
    expect(home).toContain('trackInductionDismissed(');
    expect(player).toContain('noteInductionStarted();');
    const confirmed = player.indexOf('startConfirmed = true;');
    expect(player.indexOf('noteInductionStarted();', confirmed)).toBeGreaterThan(confirmed);
    expect(player).toContain("advanceInductionStatus('started')");
    expect(player).toContain("advanceInductionStatus('completed')");
    expect(player).toContain('noteInductionEnded(outcome, positionOverrideMs ?? currentPositionRef.current);');
  });

  it('touches nothing about subscriptions or entitlements', () => {
    for (const source of [card, welcome, read('core/inductionState.ts'), read('core/inductionAnalytics.ts')]) {
      expect(source).not.toMatch(/Purchases|entitlement|paywall|membership|playbackPolicy/i);
    }
  });
});
