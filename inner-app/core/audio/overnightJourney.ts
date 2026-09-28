import { FACTORY_AUDIO_JOURNEYS, type FactoryAudioJourney } from './factoryJourneys';
import { identityPatch } from './identityArc';
import { binauralForWorld, noiseForWorld } from './worldProfiles';
import { toneGainForEnvironment } from './config';
import type { CompiledOvernightProtocol } from './overnightProtocol';
import type { ProceduralEnvironment } from './types';

export type OvernightEnvironment = Exclude<ProceduralEnvironment, 'none' | 'wind'>;
export type OvernightFeel = 'gentle' | 'deep' | 'immersive';

function durationLabel(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const remaining = minutes % 60;
  return remaining ? `${hours}h ${remaining}m` : `${hours}h`;
}

/** Production translation. Randomness is chosen by the caller so a run can be replayed. */
export function overnightJourney(
  environment: OvernightEnvironment,
  feel: OvernightFeel,
  protocol: CompiledOvernightProtocol,
  accelerated: boolean,
  seed: number,
): FactoryAudioJourney {
  const base = FACTORY_AUDIO_JOURNEYS.find(journey => journey.id === 'lucid-signal')!;
  const gain = feel === 'immersive' ? 0.2 : feel === 'deep' ? 0.16 : 0.12;
  const preparationDurationMs = base.timeline.stages.reduce((total, stage) => total + stage.durationMs, 0);
  const maxNativeStageMs = 4 * 60 * 60_000;
  const overnightStages = protocol.phases
    .filter(phase => phase.kind !== 'preparation')
    .flatMap(phase => {
      const chunkCount = Math.ceil(phase.durationMs / maxNativeStageMs);
      return Array.from({ length: chunkCount }, (_, index) => {
        const chunkStartMs = index * maxNativeStageMs;
        const durationMs = Math.min(maxNativeStageMs, phase.durationMs - index * maxNativeStageMs);
        return {
          id: `overnight-${phase.id}-${index + 1}`,
          label: phase.label,
          durationMs,
          transitionMs: Math.min(5_000, durationMs),
          target: phase.kind === 'recognitionWindow'
            ? { ...phase.audioConfig, masterGain: phase.audioConfig.masterGain * 0.55 }
            : phase.audioConfig,
          spatialEvents: protocol.events
            .filter(event => event.phaseId === phase.id)
            .filter(event => event.actions.some(action => action.kind === 'playRecognitionSignal'))
            .map(event => ({ event, withinPhaseMs: event.atMs - phase.startsAtMs }))
            .filter(({ withinPhaseMs }) => withinPhaseMs >= chunkStartMs && withinPhaseMs <= chunkStartMs + durationMs)
            .map(({ event, withinPhaseMs }) => ({
              id: event.id,
              type: 'cue' as const,
              atMs: withinPhaseMs - chunkStartMs,
              recognitionSpace: true,
            })),
        };
      });
    });
  const preparationScale = accelerated ? (3 * 60_000) / preparationDurationMs : 1;
  const preparationStages = base.timeline.stages.map(stage => ({
    ...stage,
    durationMs: Math.max(1_000, Math.round(stage.durationMs * preparationScale)),
    transitionMs: Math.min(
      Math.max(1_000, Math.round((stage.transitionMs ?? 0) * preparationScale)),
      Math.max(1_000, Math.round(stage.durationMs * preparationScale)),
    ),
    spatialEvents: stage.spatialEvents?.map(event => ({
      ...event,
      atMs: Math.min(
        Math.max(1_000, Math.round(stage.durationMs * preparationScale)),
        Math.round(event.atMs * preparationScale),
      ),
    })),
  }));
  const scaledPreparationDurationMs = preparationStages.reduce((total, stage) => total + stage.durationMs, 0);
  return {
    ...base,
    // Keep overnight playback distinct from the standalone Lucid Signal
    // trainer; all of its cue events belong to the native overnight timeline.
    id: protocol.id,
    title: 'Overnight Recognition',
    summary: `Recognition practice shaped around the ${environment} before later signals return during sleep.`,
    durationLabel: `${durationLabel(Math.round(protocol.totalDurationMs / 60_000))} · Overnight`,
    overnight: { sleepOnsetDelayMs: scaledPreparationDurationMs },
    timeline: {
      ...base.timeline,
      id: protocol.id,
      title: 'Overnight Recognition',
      endPolicy: 'protocolControlled',
      protocolVersion: protocol.schemaVersion,
      // Fresh each night: without a seed the engine reuses one derived from the journey id.
      seed,
      stages: [
        ...preparationStages.map(stage => ({
          ...stage,
          target: {
            ...stage.target,
            toneGain: typeof stage.target.toneGain === 'number'
              ? toneGainForEnvironment(stage.target.toneGain, environment)
              : undefined,
            environment,
            environmentGain: stage.id === 'release' ? gain * 0.55 : gain,
            environmentIntensity: feel === 'immersive' ? 0.68 : feel === 'deep' ? 0.5 : 0.34,
            ...identityPatch(environment, 'preparation', feel),
            ...binauralForWorld(environment, stage.id, stage.target),
            ...(typeof stage.target.noiseGain === 'number'
              ? noiseForWorld(environment, { noiseColor: stage.target.noiseColor ?? null, noiseGain: stage.target.noiseGain })
              : {}),
          },
        })),
        ...overnightStages,
      ],
    },
  };
}

