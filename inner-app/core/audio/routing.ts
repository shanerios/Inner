import type { TrackMeta } from '../../data/tracks';
import { normalizeProceduralAudioConfig } from './config';
import type { NoiseColor, ProceduralAudioConfig } from './types';

export type AudioBackend = 'legacy' | 'procedural';

export type AudioRoute =
  | { backend: 'legacy'; reason: 'flag-disabled' | 'unsupported-track' | 'engine-unavailable' }
  | { backend: 'procedural'; config: ProceduralAudioConfig };

export type AudioRoutingContext = {
  proceduralEnabled: boolean;
  proceduralEngineAvailable: boolean;
};

const NOISE_BY_TRACK_ID: Record<string, NoiseColor> = {
  noise_white: 'white',
  noise_pink: 'pink',
  noise_brown: 'brown',
  noise_grey: 'grey',
};

export function proceduralConfigForTrack(track: TrackMeta): ProceduralAudioConfig | null {
  if (track.category === 'tones') {
    const carrierHz = track.frequencies?.[0];
    if (typeof carrierHz !== 'number') return null;
    return normalizeProceduralAudioConfig({ carrierHz, toneGain: 1, masterGain: 1 });
  }

  const noiseColor = NOISE_BY_TRACK_ID[track.id];
  if (track.category === 'noise' && noiseColor) {
    return normalizeProceduralAudioConfig({ toneGain: 0, noiseColor, noiseGain: 1, masterGain: 1 });
  }

  return null;
}

export function selectAudioRoute(track: TrackMeta, context: AudioRoutingContext): AudioRoute {
  if (!context.proceduralEnabled) return { backend: 'legacy', reason: 'flag-disabled' };

  const config = proceduralConfigForTrack(track);
  if (!config) return { backend: 'legacy', reason: 'unsupported-track' };
  if (!context.proceduralEngineAvailable) return { backend: 'legacy', reason: 'engine-unavailable' };

  return { backend: 'procedural', config };
}
