import { describe, expect, it, jest } from '@jest/globals';
import {
  bindNightPlanToJourney,
  createNightPlan,
  loadNightPlan,
  nightPlanContextSnapshot,
} from '../nightPlans';
import { createNightRecipeV2 } from '../nightRecipes';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    getItem: jest.fn(async (key: string) => values.get(key) ?? null),
    setItem: jest.fn(async (key: string, value: string) => { values.set(key, value); }),
  };
}

const configuration = {
  durationMinutes: 450,
  environment: 'ocean',
  feel: 'gentle' as const,
  signalId: 'droplets',
  cuePlan: 'standard' as const,
  recognitionWindowCount: 2,
};

describe('Night Plans', () => {
  it('freezes the reviewed configuration, provenance, and user changes', async () => {
    const storage = memoryStorage();
    const recipe = createNightRecipeV2({
      durationMinutes: 450,
      environment: 'ocean',
      feel: 'gentle',
      signalId: 'droplets',
      cuePlan: 'standard',
      seed: 12,
      createdAt: 90,
    });
    const plan = await createNightPlan({
      source: 'adaptive_rule',
      reason: 'Ocean accompanied stronger recall in recent reports.',
      proposedConfiguration: { environment: 'temple', cuePlan: 'standard' },
      configuration,
      recommendation: {
        id: 'environment:temple',
        kind: 'repeat_environment',
        title: 'Return to Temple',
        reason: 'Ocean accompanied stronger recall in recent reports.',
        selectedAt: 90,
      },
      adaptiveRule: {
        id: 'adaptive:environment:temple',
        rule: 'supported_environment',
        title: 'Return to Temple',
      },
      recipe,
    }, storage as any, () => 100);

    expect(plan.status).toBe('planned');
    expect(plan.userChanged).toEqual(['environment']);
    expect(nightPlanContextSnapshot(plan)).toEqual(expect.objectContaining({
      id: plan.id,
      source: 'adaptive_rule',
      configuration,
      recipe,
      adaptiveRule: expect.objectContaining({ rule: 'supported_environment' }),
    }));
  });

  it('carries the quiet-night flag into the practice snapshot only when set', async () => {
    const storage = memoryStorage();
    const quiet = await createNightPlan({ source: 'manual', configuration, quietNight: true }, storage as any, () => 100);
    const normal = await createNightPlan({ source: 'manual', configuration }, storage as any, () => 101);
    expect(nightPlanContextSnapshot(quiet).quietNight).toBe(true);
    expect(nightPlanContextSnapshot(normal)).not.toHaveProperty('quietNight');
    await expect(loadNightPlan(quiet.id, storage as any)).resolves.toEqual(expect.objectContaining({ quietNight: true }));
  });

  it('binds one plan to the exact Journey Memory session', async () => {
    const storage = memoryStorage();
    const plan = await createNightPlan({ source: 'manual', configuration }, storage as any, () => 100);
    await bindNightPlanToJourney(plan.id, 'journey-1', 200, storage as any, () => 210);
    await expect(loadNightPlan(plan.id, storage as any)).resolves.toEqual(expect.objectContaining({
      status: 'started',
      journeySessionId: 'journey-1',
      journeyStartedAt: 200,
      updatedAt: 210,
    }));
  });
});
