import AsyncStorage from '@react-native-async-storage/async-storage';
import type { ExperimentContextSnapshot } from './practiceExperiments';
import type { SelectedRecommendation } from './recommendationMemory';
import type { NightRecipeV2 } from './nightRecipes';

export const NIGHT_PLANS_KEY = 'inner.nightPlans.v1';
const SCHEMA_VERSION = 1 as const;
const MAX_NIGHT_PLANS = 60;

type Storage = Pick<typeof AsyncStorage, 'getItem' | 'setItem'>;

export type NightPlanSource = 'manual' | 'recommendation' | 'experiment' | 'adaptive_rule';

export type NightPlanConfiguration = {
  durationMinutes: number;
  environment: string;
  feel: 'gentle' | 'deep' | 'immersive';
  signalId: string;
  cuePlan: 'standard' | 'gentle';
  recognitionWindowCount: number;
  /** Linear trim relative to the signal's calibrated base level. */
  signalGainScale?: number;
};

export type NightPlan = {
  schemaVersion: typeof SCHEMA_VERSION;
  id: string;
  createdAt: number;
  updatedAt: number;
  status: 'planned' | 'started';
  source: NightPlanSource;
  reason?: string;
  proposedConfiguration?: Partial<NightPlanConfiguration>;
  configuration: NightPlanConfiguration;
  userChanged: Array<keyof NightPlanConfiguration>;
  recommendation?: SelectedRecommendation;
  experiment?: ExperimentContextSnapshot;
  adaptiveRule?: {
    id: string;
    rule: 'gentler_signal' | 'clearer_signal' | 'supported_environment';
    title: string;
  };
  recipe?: NightRecipeV2;
  /**
   * The night was played deliberately quiet (for example beside a sleeping partner).
   * Its cue levels do not represent a normal listening level, so cue-level learning skips it.
   */
  quietNight?: boolean;
  journeySessionId?: string;
  journeyStartedAt?: number;
};

export type NightPlanContextSnapshot = Pick<
  NightPlan,
  'id' | 'createdAt' | 'source' | 'reason' | 'configuration' | 'userChanged' | 'adaptiveRule' | 'recipe' | 'quietNight'
>;

type NightPlanStore = {
  schemaVersion: typeof SCHEMA_VERSION;
  plans: NightPlan[];
};

const EMPTY_STORE: NightPlanStore = { schemaVersion: SCHEMA_VERSION, plans: [] };

function validNightPlan(value: unknown): value is NightPlan {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const plan = value as Partial<NightPlan>;
  return plan.schemaVersion === SCHEMA_VERSION
    && typeof plan.id === 'string'
    && typeof plan.createdAt === 'number'
    && ['planned', 'started'].includes(plan.status ?? '')
    && ['manual', 'recommendation', 'experiment', 'adaptive_rule'].includes(plan.source ?? '')
    && Boolean(plan.configuration)
    && Array.isArray(plan.userChanged);
}

async function loadStore(storage: Storage): Promise<NightPlanStore> {
  try {
    const raw = await storage.getItem(NIGHT_PLANS_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    if (parsed?.schemaVersion !== SCHEMA_VERSION || !Array.isArray(parsed.plans)) return EMPTY_STORE;
    return { schemaVersion: SCHEMA_VERSION, plans: parsed.plans.filter(validNightPlan).slice(0, MAX_NIGHT_PLANS) };
  } catch {
    return EMPTY_STORE;
  }
}

async function saveStore(store: NightPlanStore, storage: Storage): Promise<void> {
  await storage.setItem(NIGHT_PLANS_KEY, JSON.stringify({
    schemaVersion: SCHEMA_VERSION,
    plans: store.plans.slice(0, MAX_NIGHT_PLANS),
  }));
}

export function changedFields(
  proposed: Partial<NightPlanConfiguration> | undefined,
  final: NightPlanConfiguration,
): Array<keyof NightPlanConfiguration> {
  if (!proposed) return [];
  return (Object.keys(proposed) as Array<keyof NightPlanConfiguration>)
    .filter(key => proposed[key] !== undefined && proposed[key] !== final[key]);
}

export async function createNightPlan(
  input: {
    source: NightPlanSource;
    reason?: string;
    configuration: NightPlanConfiguration;
    proposedConfiguration?: Partial<NightPlanConfiguration>;
    recommendation?: SelectedRecommendation;
    experiment?: ExperimentContextSnapshot;
    adaptiveRule?: NightPlan['adaptiveRule'];
    recipe?: NightRecipeV2;
    quietNight?: boolean;
  },
  storage: Storage = AsyncStorage,
  now: () => number = Date.now,
): Promise<NightPlan> {
  const createdAt = now();
  const plan: NightPlan = {
    schemaVersion: SCHEMA_VERSION,
    id: `night-plan-${createdAt}-${Math.random().toString(36).slice(2, 8)}`,
    createdAt,
    updatedAt: createdAt,
    status: 'planned',
    source: input.source,
    reason: input.reason,
    configuration: input.configuration,
    proposedConfiguration: input.proposedConfiguration,
    userChanged: changedFields(input.proposedConfiguration, input.configuration),
    recommendation: input.recommendation,
    experiment: input.experiment,
    adaptiveRule: input.adaptiveRule,
    recipe: input.recipe,
    ...(input.quietNight ? { quietNight: true } : {}),
  };
  const store = await loadStore(storage);
  await saveStore({ schemaVersion: SCHEMA_VERSION, plans: [plan, ...store.plans] }, storage);
  return plan;
}

export async function loadNightPlan(id: string, storage: Storage = AsyncStorage): Promise<NightPlan | null> {
  const store = await loadStore(storage);
  return store.plans.find(plan => plan.id === id) ?? null;
}

export async function bindNightPlanToJourney(
  planId: string,
  journeySessionId: string,
  journeyStartedAt: number,
  storage: Storage = AsyncStorage,
  now: () => number = Date.now,
): Promise<NightPlan | null> {
  const store = await loadStore(storage);
  let bound: NightPlan | null = null;
  const plans = store.plans.map(plan => {
    if (plan.id !== planId) return plan;
    bound = {
      ...plan,
      status: 'started',
      journeySessionId,
      journeyStartedAt,
      updatedAt: now(),
    };
    return bound;
  });
  if (bound) await saveStore({ ...store, plans }, storage);
  return bound;
}

export function nightPlanContextSnapshot(plan: NightPlan): NightPlanContextSnapshot {
  return {
    id: plan.id,
    createdAt: plan.createdAt,
    source: plan.source,
    reason: plan.reason,
    configuration: plan.configuration,
    userChanged: plan.userChanged,
    adaptiveRule: plan.adaptiveRule,
    recipe: plan.recipe,
    ...(plan.quietNight ? { quietNight: true } : {}),
  };
}
