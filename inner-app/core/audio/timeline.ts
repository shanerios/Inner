import { normalizeProceduralAudioConfig } from './config';
import type {
  AudioJourneyTimeline,
  CompiledAudioJourneyTimeline,
  ProceduralAudioConfig,
} from './types';

export const AUDIO_TIMELINE_LIMITS = {
  maxStages: 32,
  minStageDurationMs: 1_000,
  maxStageDurationMs: 4 * 60 * 60 * 1_000,
  maxTotalDurationMs: 12 * 60 * 60 * 1_000,
} as const;

export function compileAudioJourneyTimeline(
  timeline: AudioJourneyTimeline,
  initialConfig: ProceduralAudioConfig,
): CompiledAudioJourneyTimeline {
  const id = timeline.id.trim();
  const title = timeline.title.trim();
  if (!id) throw new Error('Audio journey timeline requires an id');
  if (!title) throw new Error('Audio journey timeline requires a title');
  if (!timeline.stages.length) throw new Error('Audio journey timeline requires at least one stage');
  if (timeline.stages.length > AUDIO_TIMELINE_LIMITS.maxStages) {
    throw new Error(`Audio journey timeline supports at most ${AUDIO_TIMELINE_LIMITS.maxStages} stages`);
  }

  let previous = normalizeProceduralAudioConfig(initialConfig);
  let totalDurationMs = 0;
  const seen = new Set<string>();
  const stages = timeline.stages.map(stage => {
    const stageId = stage.id.trim();
    const label = stage.label.trim();
    if (!stageId || seen.has(stageId)) throw new Error('Audio journey stage ids must be present and unique');
    if (!label) throw new Error(`Audio journey stage ${stageId} requires a label`);
    seen.add(stageId);
    if (!Number.isFinite(stage.durationMs)
      || stage.durationMs < AUDIO_TIMELINE_LIMITS.minStageDurationMs
      || stage.durationMs > AUDIO_TIMELINE_LIMITS.maxStageDurationMs) {
      throw new Error(`Audio journey stage ${stageId} has an invalid duration`);
    }
    const transitionMs = stage.transitionMs ?? 0;
    if (!Number.isFinite(transitionMs) || transitionMs < 0 || transitionMs > stage.durationMs) {
      throw new Error(`Audio journey stage ${stageId} has an invalid transition`);
    }
    const config = normalizeProceduralAudioConfig({ ...previous, ...stage.target });
    previous = config;
    totalDurationMs += stage.durationMs;
    const spatialEvents = (stage.spatialEvents ?? []).map(event => {
      if (!event.id.trim()) throw new Error(`Audio journey stage ${stageId} has a spatial event without an id`);
      if (!Number.isFinite(event.atMs) || event.atMs < 0 || event.atMs >= stage.durationMs) {
        throw new Error(`Audio journey spatial event ${event.id} has an invalid start time`);
      }
      if (event.type === 'cue') {
        return { ...event, id: event.id.trim() };
      }
      if (!Number.isFinite(event.durationMs) || event.durationMs < 500 || event.durationMs > 5_000 || event.atMs + event.durationMs > stage.durationMs) {
        throw new Error(`Audio journey spatial event ${event.id} has an invalid duration`);
      }
      return { ...event, id: event.id.trim(), depth: Math.min(0.8, Math.max(0, event.depth)) };
    });
    return { id: stageId, label, durationMs: stage.durationMs, transitionMs, config, spatialEvents };
  });

  if (totalDurationMs > AUDIO_TIMELINE_LIMITS.maxTotalDurationMs) {
    throw new Error('Audio journey timeline exceeds the maximum total duration');
  }
  const fadeInMs = Math.min(10_000, Math.max(0, Number.isFinite(timeline.fadeInMs) ? timeline.fadeInMs! : 0));
  const fallbackSeed = Array.from(id).reduce((seed, character) => (
    Math.imul(seed ^ character.charCodeAt(0), 16_777_619) >>> 0
  ), 2_166_136_261);
  const seed = Number.isFinite(timeline.seed)
    ? Math.max(1, Math.trunc(timeline.seed!) >>> 0)
    : Math.max(1, fallbackSeed);
  return { id, title, seed, loop: timeline.loop === true, fadeInMs, totalDurationMs, stages };
}
