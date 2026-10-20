import { describe, expect, it } from '@jest/globals';
import { DEFAULT_PROCEDURAL_AUDIO_CONFIG } from '../config';
import { compileOvernightProtocol, createRecognitionOvernightProtocol, SILENT_BED } from '../overnightProtocol';
import { overnightJourney } from '../overnightJourney';
import { overnightModeForJourneyId } from '../../overnightMode';

const CONTINUOUS_LAYERS = ['environmentGain', 'toneGain', 'binauralGain', 'noiseGain', 'templeGain'] as const;

function build(mode: 'full' | 'recognition_only', minutes = 450, cuePlan: 'standard' | 'gentle' = 'standard') {
  const protocol = createRecognitionOvernightProtocol({
    sleepDurationMinutes: minutes,
    environment: mode === 'full' ? 'ocean' : 'none',
    mode,
    signalId: 'bell',
    cuePlan,
    feel: 'deep',
  });
  const compiled = compileOvernightProtocol(protocol, DEFAULT_PROCEDURAL_AUDIO_CONFIG);
  return { protocol, compiled, journey: overnightJourney(mode === 'full' ? 'ocean' : 'none', 'deep', compiled, false, 7) };
}

describe('Recognition Only overnight mode', () => {
  it('turns every continuous layer off in every phase, including the return', () => {
    const { compiled } = build('recognition_only');
    for (const phase of compiled.phases) {
      for (const layer of CONTINUOUS_LAYERS) expect(phase.audioConfig[layer]).toBe(0);
      expect(phase.audioConfig.environment).toBe('none');
      expect(phase.audioConfig.noiseColor).toBeNull();
      expect(phase.audioConfig.thresholdShift).toBe(0);
      expect(phase.audioConfig.harmonicTranslation).toBe(0);
    }
  });

  it('silences the waking preparation stages and every later native stage', () => {
    const { journey } = build('recognition_only');
    expect(journey.timeline.stages.length).toBeGreaterThan(4);
    for (const stage of journey.timeline.stages) {
      for (const layer of CONTINUOUS_LAYERS) expect(stage.target[layer]).toBe(0);
      expect(stage.target.environment).toBe('none');
    }
  });

  it('does not fade in from the default config, which carries a tone', () => {
    const { journey } = build('recognition_only');
    expect(journey.timeline.stages[0].transitionMs).toBe(0);
    expect(DEFAULT_PROCEDURAL_AUDIO_CONFIG.toneGain).toBeGreaterThan(0);
  });

  it('keeps the full night timing, stage durations, master levels and cue events', () => {
    const full = build('full');
    const only = build('recognition_only');
    expect(only.compiled.totalDurationMs).toBe(full.compiled.totalDurationMs);
    expect(only.compiled.phases.map(p => [p.kind, p.startsAtMs, p.durationMs])).toEqual(
      full.compiled.phases.map(p => [p.kind, p.startsAtMs, p.durationMs]),
    );
    expect(only.compiled.phases.map(p => p.audioConfig.masterGain)).toEqual(full.compiled.phases.map(p => p.audioConfig.masterGain));
    const stages = (journey: typeof full.journey) => journey.timeline.stages.map(stage => ({
      id: stage.id,
      durationMs: stage.durationMs,
      masterGain: stage.target.masterGain,
      cues: (stage.spatialEvents ?? []).filter(event => event.type === 'cue').map(event => [event.id, event.atMs, event.signalGainScale, event.recoverySeconds]),
    }));
    expect(stages(only.journey)).toEqual(stages(full.journey));
    const cueCount = only.journey.timeline.stages.flatMap(stage => stage.spatialEvents ?? []).filter(event => event.type === 'cue').length;
    expect(cueCount).toBeGreaterThanOrEqual(3 + 7);
  });

  it('keeps recognition windows with the same ducking and signal events', () => {
    const full = build('full').compiled;
    const only = build('recognition_only').compiled;
    const signals = (c: typeof full) => c.events.filter(event => event.actions.some(a => a.kind === 'playRecognitionSignal')).map(event => [event.id, event.atMs]);
    expect(signals(only)).toEqual(signals(full));
    expect(signals(only).length).toBe(3);
  });

  it('uses an overnight-prefixed id that identifies the mode, and labels the journey', () => {
    const { protocol, journey } = build('recognition_only', 450, 'gentle');
    expect(protocol.id).toBe('overnight-recognition-only-gentle');
    expect(protocol.environment).toBe('none');
    expect(journey.id.startsWith('overnight-')).toBe(true);
    expect(journey.title).toBe('Recognition Only');
    expect(overnightModeForJourneyId(journey.id)).toBe('recognition_only');
    expect(overnightModeForJourneyId('overnight-recognition-ocean-standard')).toBe('full');
    expect(overnightModeForJourneyId('lucid-signal')).toBe('full');
  });

  it('exports a bed patch that is fully off', () => {
    for (const layer of CONTINUOUS_LAYERS) expect(SILENT_BED[layer]).toBe(0);
  });

  it('does not make the full journey silent', () => {
    const { compiled } = build('full');
    expect(compiled.phases.some(phase => phase.audioConfig.environmentGain > 0)).toBe(true);
    expect(compiled.phases.some(phase => phase.audioConfig.binauralGain > 0)).toBe(true);
  });
});
