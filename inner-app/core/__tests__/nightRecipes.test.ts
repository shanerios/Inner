import { describe, expect, it } from '@jest/globals';
import { recognitionCueMinutesForDuration } from '../lucidSignalPlans';
import { createNightRecipeV2, nightRecipeCueSummary } from '../nightRecipes';

describe('Night Recipe v2', () => {
  it.each([420, 450, 480, 540])('keeps all three standard signals inside a %s-minute night', duration => {
    const cues = recognitionCueMinutesForDuration(duration, 'standard');
    expect(cues).toHaveLength(3);
    expect(cues).toEqual([...cues].sort((a, b) => a - b));
    expect(cues[0]).toBeGreaterThan(30);
    expect(cues.at(-1)).toBeLessThan(duration - 1);
  });

  it.each([420, 450, 480, 540])('keeps both gentle signals inside a %s-minute night', duration => {
    const cues = recognitionCueMinutesForDuration(duration, 'gentle');
    expect(cues).toHaveLength(2);
    expect(cues.at(-1)).toBeLessThan(duration - 1);
  });

  it('moves the old late signal into a seven-hour recipe instead of dropping it', () => {
    expect(recognitionCueMinutesForDuration(420, 'standard')).toEqual([250, 335, 385]);
  });

  it('freezes the exact planned recognition exposure', () => {
    const recipe = createNightRecipeV2({
      durationMinutes: 420,
      environment: 'forest',
      feel: 'gentle',
      signalId: 'guardian',
      cuePlan: 'gentle',
      seed: 42,
      createdAt: 100,
    });

    expect(recipe).toEqual(expect.objectContaining({
      schemaVersion: 2,
      id: 'night-recipe-100-42',
      seed: 42,
      environment: 'forest',
      recognition: expect.objectContaining({ signalId: 'guardian', cuePlan: 'gentle' }),
    }));
    expect(recipe.recognition.windows.map(window => window.cueAtMinute)).toEqual([300, 380]);
    expect(nightRecipeCueSummary(recipe)).toBe('5h · 6h 20m');
  });

  it('applies and bounds a learned signal-level trim to every window', () => {
    const recipe = createNightRecipeV2({
      durationMinutes: 420,
      environment: 'forest',
      feel: 'gentle',
      signalId: 'guardian',
      cuePlan: 'gentle',
      signalGainScale: 0.85,
      seed: 42,
      createdAt: 100,
    });
    expect(recipe.recognition.windows.map(window => window.signalGainScale)).toEqual([0.85, 0.85]);
    expect(createNightRecipeV2({
      durationMinutes: 420, environment: 'forest', feel: 'gentle', signalId: 'guardian', cuePlan: 'gentle', signalGainScale: 4, seed: 1,
    }).recognition.windows[0].signalGainScale).toBe(1.2);
  });

  it('freezes an accepted recurring dream sign into the night recipe', () => {
    const recipe = createNightRecipeV2({
      durationMinutes: 450,
      environment: 'ocean',
      feel: 'gentle',
      signalId: 'droplets',
      cuePlan: 'standard',
      recognitionIntention: {
        type: 'recurring_dream_sign',
        sign: ' Water ',
        selectedAt: 80,
        evidence: { appearances: 4, rememberedDreams: 7 },
      },
      seed: 42,
      createdAt: 100,
    });
    expect(recipe.recognition.intention).toEqual({
      type: 'recurring_dream_sign',
      sign: 'Water',
      selectedAt: 80,
      evidence: { appearances: 4, rememberedDreams: 7 },
    });
  });
});
