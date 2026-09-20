import { describe, expect, it } from '@jest/globals';
import { DEFAULT_PROCEDURAL_AUDIO_CONFIG } from '../config';
import { compileOvernightProtocol, createAcceleratedOvernightProtocol, createRecognitionOvernightProtocol } from '../overnightProtocol';

describe('overnight protocol', () => {
  it('builds an eight-hour recognition night with explicit phases and signal events', () => {
    const source = createRecognitionOvernightProtocol({
      sleepDurationMinutes: 8 * 60,
      environment: 'ocean',
      signalId: 'chimes',
      cuePlan: 'standard',
      feel: 'gentle',
    });
    const result = compileOvernightProtocol(source, DEFAULT_PROCEDURAL_AUDIO_CONFIG);

    expect(result.title).toBe('Lucid Journey · Recognition');
    expect(result.totalDurationMs).toBe((8 * 60 + 7) * 60_000);
    expect(result.phases.map(phase => phase.kind)).toEqual(expect.arrayContaining([
      'preparation', 'descent', 'sleepProtection', 'recognitionWindow', 'return',
    ]));
    expect(result.events.filter(event => event.actions.some(action => action.kind === 'playRecognitionSignal'))).toHaveLength(3);
    expect(result.schemaVersion).toBe(2);
    expect(result.phases.find(phase => phase.kind === 'descent')?.audioConfig.thresholdShift).toBe(1);
    expect(result.phases.find(phase => phase.kind === 'sleepProtection')?.audioConfig.thresholdShift).toBe(1);
    expect(result.phases.at(-1)?.audioConfig.thresholdShift).toBe(0);
    expect(result.phases[0].audioConfig.harmonicTranslation).toBeGreaterThan(0);
  });

  it('keeps a gentle plan to two later recognition windows', () => {
    const result = compileOvernightProtocol(createRecognitionOvernightProtocol({
      sleepDurationMinutes: 8 * 60,
      environment: 'forest',
      signalId: 'droplets',
      cuePlan: 'gentle',
    }), DEFAULT_PROCEDURAL_AUDIO_CONFIG);
    expect(result.events.filter(event => event.id.startsWith('signal-'))).toHaveLength(2);
  });

  describe('the bed under each world', () => {
    const expectNoise = (actual: Array<number | undefined>, expected: number[]) => {
      expect(actual).toHaveLength(expected.length);
      expected.forEach((value, index) => expect(actual[index]).toBeCloseTo(value, 10));
    };

    const bedOf = (environment: 'ocean' | 'abyssal' | 'forest' | 'temple' | 'cosmic' | 'fire') => {
      const phases = compileOvernightProtocol(createRecognitionOvernightProtocol({
        sleepDurationMinutes: 8 * 60,
        environment,
        signalId: 'chimes',
        cuePlan: 'standard',
        feel: 'gentle',
      }), DEFAULT_PROCEDURAL_AUDIO_CONFIG).phases;
      const at = (kind: string, which: 'first' | 'last' = 'first') => {
        const matching = phases.filter(phase => phase.kind === kind);
        return (which === 'first' ? matching[0] : matching[matching.length - 1]).audioConfig;
      };
      return {
        color: at('preparation').noiseColor,
        noise: [at('preparation').noiseGain, at('descent').noiseGain, at('sleepProtection', 'first').noiseGain, at('sleepProtection', 'last').noiseGain],
        binaural: [at('descent').binauralGain, at('sleepProtection', 'first').binauralGain, at('sleepProtection', 'last').binauralGain],
      };
    };

    // Each world's own bed: [noise color, share of the shared noise level, share of the standard binaural level].
    const beds: Array<[Parameters<typeof bedOf>[0], string, number, number]> = [
      ['ocean', 'brown', 0.5, 1],
      ['abyssal', 'brown', 0.75, 0.6],
      ['forest', 'brown', 0.5, 1],
      ['fire', 'brown', 0.5, 1],
      ['temple', 'pink', 0.63, 1],
      ['cosmic', 'pink', 0.5, 1],
    ];
    it.each(beds)('gives %s its own bed: %s noise at %s of the shared level, binaural at %s', (environment, color, noiseScale, binauralScale) => {
      const bed = bedOf(environment);
      expect(bed.color).toBe(color);
      expectNoise(bed.noise, [0.12, 0.13, 0.1, 0.08 * 0.67].map(level => level * noiseScale));
      expectNoise(bed.binaural, [0.18, 0.08, 0.05].map(level => level * binauralScale));
    });
  });

  it('thins the bed by about a third once the REM-rich hours begin, and not before', () => {
    const phases = compileOvernightProtocol(createRecognitionOvernightProtocol({
      sleepDurationMinutes: 8 * 60, environment: 'ocean', signalId: 'chimes', cuePlan: 'standard', feel: 'gentle',
    }), DEFAULT_PROCEDURAL_AUDIO_CONFIG).phases.filter(phase => phase.kind === 'sleepProtection');
    expect(phases.length).toBeGreaterThan(2);
    const ocean = 0.5;   // the ocean's noise runs at half the shared level
    expect(phases[0].audioConfig.noiseGain).toBeCloseTo(0.1 * ocean, 10);
    for (const phase of phases.slice(1, -1)) expect(phase.audioConfig.noiseGain).toBeCloseTo(0.1 * ocean * 0.67, 10);
    expect(phases[phases.length - 1].audioConfig.noiseGain).toBeCloseTo(0.08 * ocean * 0.67, 10);
  });

  it('limits harmonic translation to environments that benefit from implied depth', () => {
    const compile = (environment: 'ocean' | 'cosmic' | 'abyssal' | 'temple') => compileOvernightProtocol(
      createRecognitionOvernightProtocol({
        sleepDurationMinutes: 8 * 60,
        environment,
        signalId: 'chimes',
        cuePlan: 'gentle',
      }),
      DEFAULT_PROCEDURAL_AUDIO_CONFIG,
    );
    expect(compile('ocean').phases[0].audioConfig.harmonicTranslation).toBe(0.72);
    expect(compile('cosmic').phases[0].audioConfig.harmonicTranslation).toBe(0.72);
    expect(compile('abyssal').phases[0].audioConfig.harmonicTranslation).toBe(0.6);
    expect(compile('temple').phases[0].audioConfig.harmonicTranslation).toBe(0);
  });

  it.each(['temple', 'ocean', 'abyssal', 'forest', 'cosmic', 'fire'] as const)(
    'keeps the carrier beneath the %s environment',
    environment => {
      const result = compileOvernightProtocol(createRecognitionOvernightProtocol({
        sleepDurationMinutes: 8 * 60,
        environment,
        signalId: 'chimes',
        cuePlan: 'gentle',
      }), DEFAULT_PROCEDURAL_AUDIO_CONFIG);
      expect(result.phases[0].audioConfig.toneGain).toBe(0.01);
      expect(result.phases[1].audioConfig.toneGain).toBe(0.01);
    },
  );

  it('compresses a complete standard night below ten minutes without losing signal events', () => {
    const source = createRecognitionOvernightProtocol({
      sleepDurationMinutes: 8 * 60,
      environment: 'ocean',
      signalId: 'chimes',
      cuePlan: 'standard',
    });
    const result = compileOvernightProtocol(
      createAcceleratedOvernightProtocol(source),
      DEFAULT_PROCEDURAL_AUDIO_CONFIG,
    );

    expect(result.id).toBe('dev-test-overnight-recognition-ocean-standard');
    expect(result.totalDurationMs).toBeLessThan(10 * 60_000);
    expect(result.events.filter(event => event.actions.some(action => action.kind === 'playRecognitionSignal'))).toHaveLength(3);
    expect(result.phases.map(phase => phase.kind)).toEqual(expect.arrayContaining([
      'preparation', 'descent', 'sleepProtection', 'recognitionWindow', 'return',
    ]));
  });

  it('supports conditions without hard-wiring future events to timestamps', () => {
    const source = createRecognitionOvernightProtocol({
      sleepDurationMinutes: 8 * 60,
      environment: 'cosmic',
      signalId: 'bell',
      cuePlan: 'standard',
    });
    source.phases[0].events?.push({
      id: 'cosmic-only',
      trigger: { kind: 'phaseStart' },
      conditions: [{ kind: 'environmentIs', environment: 'cosmic' }],
      actions: [{ kind: 'markEvent', name: 'cosmic_selected' }],
    });
    source.phases[0].events?.push({
      id: 'ocean-only',
      trigger: { kind: 'phaseStart' },
      conditions: [{ kind: 'environmentIs', environment: 'ocean' }],
      actions: [{ kind: 'markEvent', name: 'ocean_selected' }],
    });
    const result = compileOvernightProtocol(source, DEFAULT_PROCEDURAL_AUDIO_CONFIG);
    expect(result.events.some(event => event.id === 'cosmic-only')).toBe(true);
    expect(result.events.some(event => event.id === 'ocean-only')).toBe(false);
  });

  it('rejects invalid triggers and duplicate phase ids', () => {
    const source = createRecognitionOvernightProtocol({
      sleepDurationMinutes: 8 * 60,
      environment: 'fire',
      signalId: 'ascending',
      cuePlan: 'standard',
    });
    source.phases[0].events = [{
      id: 'late', trigger: { kind: 'elapsed', atMs: source.phases[0].durationMs + 1 }, actions: [{ kind: 'playRecognitionSignal' }],
    }];
    expect(() => compileOvernightProtocol(source, DEFAULT_PROCEDURAL_AUDIO_CONFIG)).toThrow('invalid trigger');
    source.phases[0].events = [];
    source.phases[1].id = source.phases[0].id;
    expect(() => compileOvernightProtocol(source, DEFAULT_PROCEDURAL_AUDIO_CONFIG)).toThrow('unique');
  });
});
