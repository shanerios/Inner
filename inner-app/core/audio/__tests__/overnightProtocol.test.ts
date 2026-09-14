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

  it.each(['temple', 'ocean', 'forest', 'cosmic', 'fire'] as const)(
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
