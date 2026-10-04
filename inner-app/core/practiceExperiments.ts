import AsyncStorage from '@react-native-async-storage/async-storage';
import type { NightRecord } from './nightRecords';

export const PRACTICE_EXPERIMENTS_KEY = 'inner.practiceExperiments.v1';
const SCHEMA_VERSION = 1 as const;
const MAX_EXPERIMENTS = 12;
const ARM_WINDOW_MS = 24 * 60 * 60_000;

type Storage = Pick<typeof AsyncStorage, 'getItem' | 'setItem'>;

export type ExperimentConditionId = 'ocean' | 'temple';

export type PracticeExperimentOutcome = {
  nightRecordId: string;
  sourceSessionId: string;
  conditionId: ExperimentConditionId;
  conditionLabel: string;
  reflectedAt: number;
  recall: 'none' | 'fragment' | 'dream';
  awareness?: 'no' | 'maybe' | 'yes';
  agency?: 'no' | 'a_little' | 'yes';
  cueRecognized?: boolean;
};

export type PracticeExperiment = {
  schemaVersion: typeof SCHEMA_VERSION;
  id: string;
  kind: 'environment_comparison';
  status: 'active' | 'completed' | 'stopped';
  title: string;
  question: string;
  createdAt: number;
  updatedAt: number;
  completedAt?: number;
  targetNights: 5;
  sequence: ExperimentConditionId[];
  outcomes: PracticeExperimentOutcome[];
  armedNight?: {
    conditionId: ExperimentConditionId;
    armedAt: number;
  };
};

type ExperimentStore = {
  schemaVersion: typeof SCHEMA_VERSION;
  experiments: PracticeExperiment[];
};

export type ExperimentContextSnapshot = {
  experimentId: string;
  title: string;
  question: string;
  conditionId: ExperimentConditionId;
  conditionLabel: string;
  nightNumber: number;
  targetNights: number;
  armedAt: number;
};

export type PracticeExperimentView = {
  experiment: PracticeExperiment;
  completedNights: number;
  targetNights: number;
  nextCondition?: { id: ExperimentConditionId; label: string; nightNumber: number };
  observation?: string;
  evidence?: string;
};

const EMPTY_STORE: ExperimentStore = { schemaVersion: SCHEMA_VERSION, experiments: [] };

export function experimentConditionLabel(id: ExperimentConditionId): string {
  return id === 'ocean' ? 'Ocean' : 'Temple';
}

function validExperiment(value: unknown): value is PracticeExperiment {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const experiment = value as Partial<PracticeExperiment>;
  return experiment.schemaVersion === SCHEMA_VERSION
    && typeof experiment.id === 'string'
    && experiment.kind === 'environment_comparison'
    && ['active', 'completed', 'stopped'].includes(experiment.status ?? '')
    && typeof experiment.createdAt === 'number'
    && Array.isArray(experiment.sequence)
    && Array.isArray(experiment.outcomes);
}

export async function loadPracticeExperiments(storage: Storage = AsyncStorage): Promise<ExperimentStore> {
  try {
    const raw = await storage.getItem(PRACTICE_EXPERIMENTS_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    if (parsed?.schemaVersion !== SCHEMA_VERSION || !Array.isArray(parsed.experiments)) return EMPTY_STORE;
    return {
      schemaVersion: SCHEMA_VERSION,
      experiments: parsed.experiments.filter(validExperiment).slice(0, MAX_EXPERIMENTS),
    };
  } catch {
    return EMPTY_STORE;
  }
}

async function saveStore(store: ExperimentStore, storage: Storage): Promise<void> {
  await storage.setItem(PRACTICE_EXPERIMENTS_KEY, JSON.stringify({
    schemaVersion: SCHEMA_VERSION,
    experiments: store.experiments.slice(0, MAX_EXPERIMENTS),
  }));
}

export async function startEnvironmentComparisonExperiment(
  storage: Storage = AsyncStorage,
  now: () => number = Date.now,
): Promise<PracticeExperiment> {
  const createdAt = now();
  const first: ExperimentConditionId = Math.floor(createdAt / 86_400_000) % 2 === 0 ? 'ocean' : 'temple';
  const second: ExperimentConditionId = first === 'ocean' ? 'temple' : 'ocean';
  const experiment: PracticeExperiment = {
    schemaVersion: SCHEMA_VERSION,
    id: `environment-${createdAt}-${Math.random().toString(36).slice(2, 8)}`,
    kind: 'environment_comparison',
    status: 'active',
    title: 'Ocean and Temple',
    question: 'Does either environment accompany stronger dream recall for you?',
    createdAt,
    updatedAt: createdAt,
    targetNights: 5,
    sequence: [first, second, first, second, first],
    outcomes: [],
  };
  const store = await loadPracticeExperiments(storage);
  const stopped = store.experiments.map(item => item.status === 'active'
    ? { ...item, status: 'stopped' as const, updatedAt: createdAt }
    : item);
  await saveStore({ schemaVersion: SCHEMA_VERSION, experiments: [experiment, ...stopped] }, storage);
  return experiment;
}

export async function armPracticeExperimentNight(
  experimentId: string,
  storage: Storage = AsyncStorage,
  now: () => number = Date.now,
): Promise<PracticeExperiment | null> {
  const store = await loadPracticeExperiments(storage);
  let armed: PracticeExperiment | null = null;
  const armedAt = now();
  const experiments = store.experiments.map(experiment => {
    if (experiment.id !== experimentId || experiment.status !== 'active') return experiment;
    const conditionId = experiment.sequence[experiment.outcomes.length];
    if (!conditionId) return experiment;
    armed = { ...experiment, updatedAt: armedAt, armedNight: { conditionId, armedAt } };
    return armed;
  });
  if (armed) await saveStore({ ...store, experiments }, storage);
  return armed;
}

export async function stopPracticeExperiment(
  experimentId: string,
  storage: Storage = AsyncStorage,
  now: () => number = Date.now,
): Promise<void> {
  const store = await loadPracticeExperiments(storage);
  const updatedAt = now();
  await saveStore({
    ...store,
    experiments: store.experiments.map(experiment => experiment.id === experimentId && experiment.status === 'active'
      ? { ...experiment, status: 'stopped', updatedAt, armedNight: undefined }
      : experiment),
  }, storage);
}

export async function experimentContextForPractice(
  environment: string | undefined,
  practiceStartedAt: number,
  storage: Storage = AsyncStorage,
): Promise<ExperimentContextSnapshot | undefined> {
  if (!environment) return undefined;
  const store = await loadPracticeExperiments(storage);
  const experiment = store.experiments.find(item => item.status === 'active');
  const armed = experiment?.armedNight;
  if (!experiment || !armed || armed.conditionId !== environment) return undefined;
  if (armed.armedAt > practiceStartedAt || practiceStartedAt - armed.armedAt > ARM_WINDOW_MS) return undefined;
  return {
    experimentId: experiment.id,
    title: experiment.title,
    question: experiment.question,
    conditionId: armed.conditionId,
    conditionLabel: experimentConditionLabel(armed.conditionId),
    nightNumber: experiment.outcomes.length + 1,
    targetNights: experiment.targetNights,
    armedAt: armed.armedAt,
  };
}

export async function recordPracticeExperimentOutcome(
  record: NightRecord,
  storage: Storage = AsyncStorage,
): Promise<PracticeExperiment | null> {
  const snapshot = record.practiceContext?.experiment;
  if (!snapshot || record.testSession) return null;
  const store = await loadPracticeExperiments(storage);
  let result: PracticeExperiment | null = null;
  const experiments = store.experiments.map(experiment => {
    if (experiment.id !== snapshot.experimentId || experiment.status !== 'active') return experiment;
    if (experiment.outcomes.some(outcome => outcome.nightRecordId === record.id)) {
      result = experiment;
      return experiment;
    }
    const outcome: PracticeExperimentOutcome = {
      nightRecordId: record.id,
      sourceSessionId: record.sourceSessionId,
      conditionId: snapshot.conditionId,
      conditionLabel: snapshot.conditionLabel,
      reflectedAt: record.reflectedAt,
      recall: record.outcome.recall,
      awareness: record.outcome.dreamDetails?.awareness,
      agency: record.outcome.dreamDetails?.agency,
      cueRecognized: record.outcome.dreamDetails?.innerCue?.status === 'recognized',
    };
    const outcomes = [...experiment.outcomes, outcome];
    const complete = outcomes.length >= experiment.targetNights;
    result = {
      ...experiment,
      outcomes,
      status: complete ? 'completed' : 'active',
      completedAt: complete ? record.reflectedAt : undefined,
      updatedAt: record.reflectedAt,
      armedNight: undefined,
    };
    return result;
  });
  if (result) await saveStore({ ...store, experiments }, storage);
  return result;
}

export function practiceExperimentView(experiment: PracticeExperiment): PracticeExperimentView {
  const completedNights = experiment.outcomes.length;
  const nextId = experiment.status === 'active' ? experiment.sequence[completedNights] : undefined;
  const groups = (['ocean', 'temple'] as const).map(id => {
    const outcomes = experiment.outcomes.filter(outcome => outcome.conditionId === id);
    return { id, label: experimentConditionLabel(id), total: outcomes.length, recalled: outcomes.filter(outcome => outcome.recall !== 'none').length };
  });
  const evidence = completedNights
    ? groups.filter(group => group.total > 0).map(group => `${group.label}: ${group.recalled} of ${group.total} nights included recall.`).join(' ')
    : undefined;
  return {
    experiment,
    completedNights,
    targetNights: experiment.targetNights,
    nextCondition: nextId ? { id: nextId, label: experimentConditionLabel(nextId), nightNumber: completedNights + 1 } : undefined,
    observation: experiment.status === 'completed' ? 'Five nights observed. Inner can now compare what you reported under each condition.' : undefined,
    evidence,
  };
}

export async function loadCurrentPracticeExperiment(storage: Storage = AsyncStorage): Promise<PracticeExperiment | null> {
  const store = await loadPracticeExperiments(storage);
  return store.experiments.find(item => item.status === 'active')
    ?? store.experiments.find(item => item.status === 'completed')
    ?? null;
}
