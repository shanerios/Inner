import { normalizeProceduralAudioConfig } from './config';
import { LUCID_SIGNAL_CUE_OFFSETS_HOURS, type LucidSignalCuePlan } from '../lucidSignalPlans';
import type { RecognitionSignalId } from '../recognitionSignals';
import type { ProceduralAudioConfig, ProceduralAudioPatch, ProceduralEnvironment } from './types';

export type OvernightPhaseKind =
  | 'preparation'
  | 'descent'
  | 'sleepProtection'
  | 'recognitionWindow'
  | 'return';

export type OvernightTrigger =
  | { kind: 'phaseStart' }
  | { kind: 'phaseEnd'; beforeMs?: number }
  | { kind: 'elapsed'; atMs: number };

export type OvernightCondition =
  | { kind: 'cuePlanIs'; plan: LucidSignalCuePlan }
  | { kind: 'signalIs'; signalId: RecognitionSignalId }
  | { kind: 'environmentIs'; environment: ProceduralEnvironment };

export type OvernightAction =
  | { kind: 'applyAudio'; patch: ProceduralAudioPatch; rampMs?: number }
  | { kind: 'duckAudio'; gain: number; rampMs: number }
  | { kind: 'restoreAudio'; rampMs: number }
  | { kind: 'playRecognitionSignal' }
  | { kind: 'markEvent'; name: string }
  | { kind: 'requestMorningReflection' };

export type OvernightProtocolEvent = {
  id: string;
  trigger: OvernightTrigger;
  conditions?: OvernightCondition[];
  actions: OvernightAction[];
};

export type OvernightProtocolPhase = {
  id: string;
  label: string;
  kind: OvernightPhaseKind;
  durationMs: number;
  audio?: ProceduralAudioPatch;
  events?: OvernightProtocolEvent[];
};

export type OvernightProtocol = {
  schemaVersion: 2;
  id: string;
  title: string;
  intention: 'lucidity' | 'recall' | 'incubation' | 'hypnagogia' | 'sleep';
  environment: ProceduralEnvironment;
  signalId: RecognitionSignalId;
  cuePlan: LucidSignalCuePlan;
  phases: OvernightProtocolPhase[];
};

export type CompiledOvernightEvent = OvernightProtocolEvent & {
  phaseId: string;
  atMs: number;
};

export type CompiledOvernightPhase = OvernightProtocolPhase & {
  startsAtMs: number;
  endsAtMs: number;
  audioConfig: ProceduralAudioConfig;
};

export type CompiledOvernightProtocol = Omit<OvernightProtocol, 'phases'> & {
  totalDurationMs: number;
  phases: CompiledOvernightPhase[];
  events: CompiledOvernightEvent[];
};

export const OVERNIGHT_PROTOCOL_LIMITS = {
  minPhaseDurationMs: 1_000,
  maxTotalDurationMs: 12 * 60 * 60 * 1_000,
  maxPhases: 32,
  maxEvents: 96,
} as const;

function conditionMatches(condition: OvernightCondition, protocol: OvernightProtocol): boolean {
  if (condition.kind === 'cuePlanIs') return condition.plan === protocol.cuePlan;
  if (condition.kind === 'signalIs') return condition.signalId === protocol.signalId;
  return condition.environment === protocol.environment;
}

export function compileOvernightProtocol(
  protocol: OvernightProtocol,
  initialConfig: ProceduralAudioConfig,
): CompiledOvernightProtocol {
  const id = protocol.id.trim();
  const title = protocol.title.trim();
  if (!id || !title) throw new Error('Overnight protocol requires an id and title');
  if (!protocol.phases.length || protocol.phases.length > OVERNIGHT_PROTOCOL_LIMITS.maxPhases) {
    throw new Error('Overnight protocol has an invalid phase count');
  }

  let cursorMs = 0;
  let config = normalizeProceduralAudioConfig(initialConfig);
  const phaseIds = new Set<string>();
  const eventIds = new Set<string>();
  const events: CompiledOvernightEvent[] = [];
  const phases = protocol.phases.map(phase => {
    const phaseId = phase.id.trim();
    if (!phaseId || phaseIds.has(phaseId)) throw new Error('Overnight phase ids must be present and unique');
    if (!phase.label.trim()) throw new Error(`Overnight phase ${phaseId} requires a label`);
    if (!Number.isFinite(phase.durationMs) || phase.durationMs < OVERNIGHT_PROTOCOL_LIMITS.minPhaseDurationMs) {
      throw new Error(`Overnight phase ${phaseId} has an invalid duration`);
    }
    phaseIds.add(phaseId);
    const startsAtMs = cursorMs;
    const endsAtMs = startsAtMs + phase.durationMs;
    config = normalizeProceduralAudioConfig({ ...config, ...phase.audio });

    for (const event of phase.events ?? []) {
      const eventId = event.id.trim();
      if (!eventId || eventIds.has(eventId)) throw new Error('Overnight event ids must be present and unique');
      if (!event.actions.length) throw new Error(`Overnight event ${eventId} requires at least one action`);
      eventIds.add(eventId);
      let withinPhaseMs = 0;
      if (event.trigger.kind === 'elapsed') withinPhaseMs = event.trigger.atMs;
      if (event.trigger.kind === 'phaseEnd') withinPhaseMs = phase.durationMs - (event.trigger.beforeMs ?? 0);
      if (!Number.isFinite(withinPhaseMs) || withinPhaseMs < 0 || withinPhaseMs > phase.durationMs) {
        throw new Error(`Overnight event ${eventId} has an invalid trigger`);
      }
      if ((event.conditions ?? []).every(condition => conditionMatches(condition, protocol))) {
        events.push({ ...event, id: eventId, phaseId, atMs: startsAtMs + withinPhaseMs });
      }
    }

    cursorMs = endsAtMs;
    return { ...phase, id: phaseId, label: phase.label.trim(), startsAtMs, endsAtMs, audioConfig: config };
  });

  if (cursorMs > OVERNIGHT_PROTOCOL_LIMITS.maxTotalDurationMs) {
    throw new Error('Overnight protocol exceeds the maximum duration');
  }
  if (events.length > OVERNIGHT_PROTOCOL_LIMITS.maxEvents) {
    throw new Error('Overnight protocol exceeds the maximum event count');
  }
  events.sort((left, right) => left.atMs - right.atMs);
  return { ...protocol, id, title, phases, events, totalDurationMs: cursorMs };
}

export type RecognitionOvernightOptions = {
  sleepDurationMinutes: number;
  environment: Exclude<ProceduralEnvironment, 'none' | 'wind'>;
  signalId: RecognitionSignalId;
  cuePlan: LucidSignalCuePlan;
  feel?: 'gentle' | 'deep' | 'immersive';
};

export function createRecognitionOvernightProtocol(options: RecognitionOvernightOptions): OvernightProtocol {
  const sleepDurationMs = Math.min(10 * 60 * 60_000, Math.max(6 * 60 * 60_000, options.sleepDurationMinutes * 60_000));
  const preparationMs = 7 * 60_000;
  const descentMs = 30 * 60_000;
  const returnMs = 60_000;
  const cueOffsets = LUCID_SIGNAL_CUE_OFFSETS_HOURS[options.cuePlan]
    .map(hours => hours * 60 * 60_000)
    .filter(offset => offset < sleepDurationMs - returnMs);
  const environmentGain = options.feel === 'immersive' ? 0.2 : options.feel === 'deep' ? 0.16 : 0.12;
  const harmonicTranslation = options.environment === 'ocean' || options.environment === 'cosmic'
    ? 0.72
    : options.environment === 'abyssal' ? 0.6 : 0;
  const phases: OvernightProtocolPhase[] = [
    {
      id: 'preparation', label: 'Recognition Practice', kind: 'preparation', durationMs: preparationMs,
      audio: {
        environment: options.environment,
        environmentGain,
        harmonicTranslation,
        thresholdShift: 0,
        noiseColor: 'pink',
        noiseGain: 0.12,
        masterGain: 0.58,
        toneGain: 0.01,
      },
      events: [{ id: 'journey-begins', trigger: { kind: 'phaseStart' }, actions: [{ kind: 'markEvent', name: 'overnight_started' }] }],
    },
    {
      id: 'descent', label: 'Descent', kind: 'descent', durationMs: descentMs,
      audio: { binauralCarrierHz: 208, binauralDeltaHz: 5, binauralGain: 0.18, environmentGain, noiseGain: 0.13, masterGain: 0.48, thresholdShift: 1 },
    },
  ];

  let sleepCursorMs = descentMs;
  cueOffsets.forEach((cueOffsetMs, index) => {
    const protectionMs = Math.max(0, cueOffsetMs - sleepCursorMs - 60_000);
    if (protectionMs >= 1_000) {
      phases.push({
        id: `sleep-protection-${index + 1}`, label: 'Sleep Protection', kind: 'sleepProtection', durationMs: protectionMs,
        audio: { toneGain: 0, binauralGain: 0.08, noiseGain: 0.1, environmentGain: environmentGain * 0.75, masterGain: 0.35 },
      });
    }
    phases.push({
      id: `recognition-window-${index + 1}`, label: 'Recognition Window', kind: 'recognitionWindow', durationMs: 60_000,
      events: [
        { id: `duck-${index + 1}`, trigger: { kind: 'phaseStart' }, actions: [{ kind: 'duckAudio', gain: 0.55, rampMs: 5_000 }] },
        { id: `signal-${index + 1}`, trigger: { kind: 'elapsed', atMs: 15_000 }, actions: [{ kind: 'playRecognitionSignal' }] },
        { id: `restore-${index + 1}`, trigger: { kind: 'elapsed', atMs: 25_000 }, actions: [{ kind: 'restoreAudio', rampMs: 5_000 }] },
      ],
    });
    sleepCursorMs = cueOffsetMs;
  });

  const remainingSleepMs = sleepDurationMs - sleepCursorMs - returnMs;
  if (remainingSleepMs >= 1_000) {
    phases.push({
      id: 'sleep-protection-final', label: 'Sleep Protection', kind: 'sleepProtection', durationMs: remainingSleepMs,
      audio: { toneGain: 0, binauralGain: 0.05, noiseGain: 0.08, environmentGain: environmentGain * 0.6, masterGain: 0.3 },
    });
  }
  phases.push({
    id: 'return', label: 'Return', kind: 'return', durationMs: returnMs,
    audio: { toneGain: 0, binauralGain: 0, noiseGain: 0, environmentGain: 0, masterGain: 0, thresholdShift: 0, harmonicTranslation: 0 },
    events: [{ id: 'morning-reflection', trigger: { kind: 'phaseEnd' }, actions: [{ kind: 'requestMorningReflection' }] }],
  });

  return {
    schemaVersion: 2,
    id: `overnight-recognition-${options.environment}-${options.cuePlan}`,
    title: 'Lucid Journey · Recognition',
    intention: 'lucidity',
    environment: options.environment,
    signalId: options.signalId,
    cuePlan: options.cuePlan,
    phases,
  };
}

/**
 * Development-only clock compression for exercising a complete overnight
 * lifecycle without waiting through a real night. Callers remain responsible
 * for guarding access with __DEV__.
 */
export function createAcceleratedOvernightProtocol(protocol: OvernightProtocol): OvernightProtocol {
  const durationFor = (phase: OvernightProtocolPhase): number => {
    if (phase.kind === 'preparation') return 3 * 60_000;
    if (phase.kind === 'descent') return 60_000;
    if (phase.kind === 'recognitionWindow') return 40_000;
    if (phase.kind === 'return') return 30_000;
    return 25_000;
  };

  return {
    ...protocol,
    id: `dev-test-${protocol.id}`,
    title: `${protocol.title} · Accelerated Test`,
    phases: protocol.phases.map(phase => {
      const durationMs = durationFor(phase);
      const scaleElapsed = (atMs: number) => Math.min(durationMs, Math.max(0, Math.round((atMs / phase.durationMs) * durationMs)));
      return {
        ...phase,
        durationMs,
        events: phase.events?.map(event => ({
          ...event,
          trigger: event.trigger.kind === 'elapsed'
            ? { kind: 'elapsed' as const, atMs: scaleElapsed(event.trigger.atMs) }
            : event.trigger.kind === 'phaseEnd'
              ? { kind: 'phaseEnd' as const, beforeMs: scaleElapsed(event.trigger.beforeMs ?? 0) }
              : event.trigger,
        })),
      };
    }),
  };
}
