import { describe, expect, it } from '@jest/globals';
import { proceduralConfigForTrack, selectAudioRoute } from '../routing';
import type { TrackMeta } from '../../../data/tracks';

const track = (value: Partial<TrackMeta>): TrackMeta => ({
  id: 'test',
  title: 'Test',
  kind: 'soundscape',
  ...value,
});

describe('procedural audio routing', () => {
  it('keeps legacy playback when the feature flag is disabled', () => {
    expect(selectAudioRoute(track({ category: 'tones', frequencies: [528] }), {
      proceduralEnabled: false,
      proceduralEngineAvailable: true,
    })).toEqual({ backend: 'legacy', reason: 'flag-disabled' });
  });

  it('keeps legacy playback until a procedural engine is available', () => {
    expect(selectAudioRoute(track({ category: 'noise', id: 'noise_pink' }), {
      proceduralEnabled: true,
      proceduralEngineAvailable: false,
    })).toEqual({ backend: 'legacy', reason: 'engine-unavailable' });
  });

  it('maps existing tone metadata without changing the catalog', () => {
    expect(proceduralConfigForTrack(track({ category: 'tones', frequencies: [396] }))).toMatchObject({
      carrierHz: 396,
      toneGain: 1,
      noiseColor: null,
    });
  });

  it('maps existing noise ids to procedural noise colors', () => {
    expect(proceduralConfigForTrack(track({ category: 'noise', id: 'noise_brown' }))).toMatchObject({
      toneGain: 0,
      noiseColor: 'brown',
      noiseGain: 1,
    });
  });
});
