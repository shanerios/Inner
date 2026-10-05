import { normalizeProceduralAudioConfig } from './config';
import { identityPatch } from './identityArc';
import { worldBed, worldBinaural } from './worldProfiles';
import { recognitionCueMinutesForDuration, type LucidSignalCuePlan } from '../lucidSignalPlans';
import type { NightRecipeRecognitionWindow } from '../nightRecipes';
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
  | { kind: 'playRecognitionSignal'; gainScale?: number; recoverySeconds?: number }
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
  /** Exact signal presentation times from the end of waking preparation. */
  cueOffsetsMinutes?: number[];
  /** Complete authored recognition windows. When present, these are the playback source of truth. */
  recognitionWindows?: NightRecipeRecognitionWindow[];
  feel?: 'gentle' | 'deep' | 'immersive';
};

export function createRecognitionOvernightProtocol(options: RecognitionOvernightOptions): OvernightProtocol {
  const sleepDurationMs = Math.min(10 * 60 * 60_000, Math.max(6 * 60 * 60_000, options.sleepDurationMinutes * 60_000));
  const preparationMs = 7 * 60_000;
  const descentMs = 30 * 60_000;
  const returnMs = 60_000;
  const recognitionWindows = (options.recognitionWindows ?? (
    options.cueOffsetsMinutes ?? recognitionCueMinutesForDuration(options.sleepDurationMinutes, options.cuePlan)
  ).map((cueAtMinute, index) => ({
    id: `recognition-${index + 1}`,
    cueAtMinute,
    signalGainScale: 1,
    presentations: 1,
    backgroundDuckGain: 0.55,
    recoverySeconds: 35,
  }))).map(window => ({
    ...window,
    cueAtMs: window.cueAtMinute * 60_000,
    signalGainScale: Math.min(2, Math.max(0.1, window.signalGainScale)),
    presentations: Math.min(3, Math.max(1, Math.round(window.presentations))),
    backgroundDuckGain: Math.min(1, Math.max(0.25, window.backgroundDuckGain)),
    recoverySeconds: Math.min(120, Math.max(10, window.recoverySeconds)),
  })).filter(window => {
    const lastPresentationMs = window.cueAtMs + (window.presentations - 1) * 6_000;
    return window.cueAtMs >= descentMs + 15_000
      && lastPresentationMs + window.recoverySeconds * 1_000 < sleepDurationMs - returnMs;
  });
  const feel = options.feel ?? 'gentle';
  const environmentGain = options.feel === 'immersive' ? 0.2 : options.feel === 'deep' ? 0.16 : 0.12;
  const bed = worldBed(options.environment);
  const field = worldBinaural(options.environment);
  const binauralWorldScale = bed.binauralGainScale * 10 ** ((field.trimDb + field.levelDb) / 20);
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
        noiseColor: bed.noiseColor,
        noiseGain: 0.12 * bed.noiseGainScale,
        noiseHighCutHz: bed.noiseHighCutHz,
        noiseWidth: bed.noiseWidth,
        noiseDriftDb: bed.noiseDriftDb,
        noiseDriftSeconds: bed.noiseDriftSeconds,
        binauralBreathDb: field.breath.depthDb.preparation,
        binauralBreathInSeconds: field.breath.inhaleSeconds,
        binauralBreathOutSeconds: field.breath.exhaleSeconds,
        binauralBreathVariation: field.breath.variation,
        masterGain: 0.58,
        toneGain: 0.01,
        ...identityPatch(options.environment, 'preparation', feel),
      },
      events: [{ id: 'journey-begins', trigger: { kind: 'phaseStart' }, actions: [{ kind: 'markEvent', name: 'overnight_started' }] }],
    },
    {
      id: 'descent', label: 'Descent', kind: 'descent', durationMs: descentMs,
      audio: { binauralCarrierHz: field.carrierHz, binauralDeltaHz: field.beatHz.descent, binauralBreathDb: field.breath.depthDb.descent, binauralGain: 0.18 * binauralWorldScale, environmentGain, noiseGain: 0.13 * bed.noiseGainScale, masterGain: 0.48, thresholdShift: 1, ...identityPatch(options.environment, 'descent', feel) },
    },
  ];

  let sleepCursorMs = descentMs;
  recognitionWindows.forEach((window, index) => {
    // A recognition window begins fifteen seconds before the scheduled signal,
    // then uses the recipe's presentation count and recovery period.
    const recognitionWindowStartMs = window.cueAtMs - 15_000;
    const recognitionWindowDurationMs = 15_000
      + (window.presentations - 1) * 6_000
      + window.recoverySeconds * 1_000;
    const protectionMs = Math.max(0, recognitionWindowStartMs - sleepCursorMs);
    if (protectionMs >= 1_000) {
      phases.push({
        id: `sleep-protection-${index + 1}`, label: 'Sleep Protection', kind: 'sleepProtection', durationMs: protectionMs,
        audio: { toneGain: 0, binauralDeltaHz: index === 0 ? field.beatHz.earlySleep : field.beatHz.remSleep, binauralBreathDb: index === 0 ? field.breath.depthDb.earlySleep : field.breath.depthDb.remSleep, binauralGain: 0.08 * binauralWorldScale, noiseGain: 0.1 * bed.noiseGainScale * (index === 0 ? 1 : bed.remNoiseTaper), environmentGain: environmentGain * 0.75, masterGain: 0.35, ...identityPatch(options.environment, index === 0 ? 'earlySleep' : 'remSleep', feel) },
      });
    }
    phases.push({
      id: `recognition-window-${index + 1}`, label: 'Recognition Window', kind: 'recognitionWindow', durationMs: recognitionWindowDurationMs,
      audio: identityPatch(options.environment, 'recognitionWindow', feel),
      events: [
        { id: `duck-${index + 1}`, trigger: { kind: 'phaseStart' }, actions: [{ kind: 'duckAudio', gain: window.backgroundDuckGain, rampMs: 5_000 }] },
        ...Array.from({ length: window.presentations }, (_, presentationIndex) => ({
          id: window.presentations === 1 ? `signal-${index + 1}` : `signal-${index + 1}-${presentationIndex + 1}`,
          trigger: { kind: 'elapsed' as const, atMs: 15_000 + presentationIndex * 6_000 },
          actions: [{
            kind: 'playRecognitionSignal' as const,
            gainScale: window.signalGainScale,
            recoverySeconds: window.recoverySeconds,
          }],
        })),
        { id: `restore-${index + 1}`, trigger: { kind: 'phaseEnd', beforeMs: 0 }, actions: [{ kind: 'restoreAudio', rampMs: 5_000 }] },
      ],
    });
    sleepCursorMs = recognitionWindowStartMs + recognitionWindowDurationMs;
  });

  const remainingSleepMs = sleepDurationMs - sleepCursorMs - returnMs;
  if (remainingSleepMs >= 1_000) {
    phases.push({
      id: 'sleep-protection-final', label: 'Sleep Protection', kind: 'sleepProtection', durationMs: remainingSleepMs,
      audio: { toneGain: 0, binauralDeltaHz: recognitionWindows.length ? field.beatHz.remSleep : field.beatHz.earlySleep, binauralBreathDb: recognitionWindows.length ? field.breath.depthDb.remSleep : field.breath.depthDb.earlySleep, binauralGain: 0.05 * binauralWorldScale, noiseGain: 0.08 * bed.noiseGainScale * (recognitionWindows.length ? bed.remNoiseTaper : 1), environmentGain: environmentGain * 0.6, masterGain: 0.3, ...identityPatch(options.environment, recognitionWindows.length ? 'remSleep' : 'earlySleep', feel) },
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
