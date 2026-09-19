import { describe, expect, it } from '@jest/globals';
import * as fs from 'fs';
import * as path from 'path';
import { DEFAULT_PROCEDURAL_AUDIO_CONFIG, normalizeProceduralAudioConfig, PROCEDURAL_AUDIO_LIMITS } from '../config';
import {
  identityAchievedDb,
  identityPatch,
  identityPresenceFor,
  identityTargetDb,
  IDENTITY_FEEL_OFFSET_DB,
  IDENTITY_FEEL_VARIETY,
  IDENTITY_PRESENCE_MAX,
  IDENTITY_STAGE_DENSITY,
  type IdentityStage,
  type IdentityWorld,
} from '../identityArc';
import { compileOvernightProtocol, createRecognitionOvernightProtocol } from '../overnightProtocol';

const WORLDS: IdentityWorld[] = ['temple', 'abyssal', 'cosmic'];
const STAGES: IdentityStage[] = ['preparation', 'descent', 'earlySleep', 'remSleep', 'recognitionWindow'];

const ROOT = path.resolve(__dirname, '../../..');
const kotlinDir = path.join(ROOT, 'modules/inner-audio/android/src/main/java/expo/modules/inneraudio');
const kotlin = (file: string) => fs.readFileSync(path.join(kotlinDir, file), 'utf8');
const swift = fs.readFileSync(path.join(ROOT, 'modules/inner-audio/ios/InnerAudioModule.swift'), 'utf8');

function compile(environment: 'temple' | 'abyssal' | 'cosmic' | 'ocean', cuePlan: 'standard' | 'gentle' = 'standard') {
  return compileOvernightProtocol(createRecognitionOvernightProtocol({
    sleepDurationMinutes: 8 * 60,
    environment,
    signalId: 'chimes',
    cuePlan,
    feel: 'gentle',
  }), DEFAULT_PROCEDURAL_AUDIO_CONFIG);
}

describe('identity arc', () => {
  it('lands every stage on its target above the bed, never hitting the presence cap', () => {
    for (const world of WORLDS) {
      for (const stage of STAGES) {
        expect(identityPresenceFor(world, stage)).toBeLessThan(IDENTITY_PRESENCE_MAX);
        expect(identityAchievedDb(world, stage)).toBeCloseTo(identityTargetDb(world, stage), 6);
      }
    }
  });

  it('is most present in stage 1, gentler in early sleep, gentler and sparser in REM, and steps aside at a signal', () => {
    for (const world of WORLDS) {
      const db = (stage: IdentityStage) => identityTargetDb(world, stage);
      expect(db('preparation')).toBe(db('descent'));
      expect(db('descent')).toBeGreaterThan(db('earlySleep'));
      expect(db('earlySleep')).toBeGreaterThan(db('remSleep'));
      expect(db('remSleep')).toBeGreaterThan(db('recognitionWindow'));
      // Always audible: even in REM the sound stands clearly above the bed in its own band.
      expect(db('remSleep')).toBeGreaterThanOrEqual(5);
      expect(IDENTITY_STAGE_DENSITY.earlySleep).toBe(1);
      expect(IDENTITY_STAGE_DENSITY.remSleep).toBeLessThan(1);
      expect(IDENTITY_STAGE_DENSITY.remSleep).toBeGreaterThanOrEqual(PROCEDURAL_AUDIO_LIMITS.identityDensity.min);
    }
  });

  it('leaves worlds without an identity sound exactly as they were', () => {
    for (const environment of ['ocean', 'forest', 'fire', 'wind', 'none'] as const) {
      for (const stage of STAGES) expect(identityPatch(environment, stage)).toEqual({});
    }
    const ocean = compile('ocean');
    for (const phase of ocean.phases) {
      expect(phase.audioConfig.identityPresence).toBe(1);
      expect(phase.audioConfig.identityDensity).toBe(1);
    }
  });

  it('sets each protocol phase from its stage: 1 preparation and descent, 2 early sleep, 3 from the first signal', () => {
    for (const world of WORLDS) {
      const phases = compile(world).phases;
      const presence = (id: string) => phases.find(phase => phase.id === id)!.audioConfig.identityPresence;
      const density = (id: string) => phases.find(phase => phase.id === id)!.audioConfig.identityDensity;
      expect(presence('preparation')).toBeCloseTo(identityPresenceFor(world, 'preparation'), 10);
      expect(presence('descent')).toBeCloseTo(identityPresenceFor(world, 'descent'), 10);
      expect(presence('sleep-protection-1')).toBeCloseTo(identityPresenceFor(world, 'earlySleep'), 10);
      expect(presence('sleep-protection-2')).toBeCloseTo(identityPresenceFor(world, 'remSleep'), 10);
      expect(presence('sleep-protection-final')).toBeCloseTo(identityPresenceFor(world, 'remSleep'), 10);
      expect(density('sleep-protection-1')).toBe(1);
      expect(density('sleep-protection-2')).toBe(IDENTITY_STAGE_DENSITY.remSleep);
      for (const window of phases.filter(phase => phase.kind === 'recognitionWindow')) {
        expect(window.audioConfig.identityPresence).toBeCloseTo(identityPresenceFor(world, 'recognitionWindow'), 10);
        expect(window.audioConfig.identityPresence).toBeLessThan(presence('sleep-protection-2'));
      }
    }
  });

  it('raises the Aum 2 dB in Immersive only, and leaves Gentle and Deep exactly as they were', () => {
    expect(IDENTITY_FEEL_OFFSET_DB.temple).toEqual({ gentle: 0, deep: 0, immersive: 2 });
    for (const stage of STAGES) {
      const gentle = identityPresenceFor('temple', stage);
      expect(identityPresenceFor('temple', stage, 'gentle')).toBe(gentle);
      expect(identityPresenceFor('temple', stage, 'deep')).toBe(gentle);
      expect(identityPresenceFor('temple', stage, 'immersive') / gentle).toBeCloseTo(10 ** (2 / 20), 10);
      expect(identityAchievedDb('temple', stage, 'immersive') - identityAchievedDb('temple', stage)).toBeCloseTo(2, 8);
    }
    // The other sounds are unchanged until their gestures are designed, and no feel reaches the cap.
    for (const world of WORLDS) {
      for (const feel of ['gentle', 'deep', 'immersive'] as const) {
        for (const stage of STAGES) expect(identityPresenceFor(world, stage, feel)).toBeLessThan(IDENTITY_PRESENCE_MAX);
        if (world !== 'temple') expect(identityPresenceFor(world, 'preparation', feel)).toBe(identityPresenceFor(world, 'preparation'));
      }
    }
  });

  it('carries the Immersive Aum level into every protocol phase', () => {
    const presences = (feel: 'gentle' | 'deep' | 'immersive') => compileOvernightProtocol(createRecognitionOvernightProtocol({
      sleepDurationMinutes: 8 * 60, environment: 'temple', signalId: 'chimes', cuePlan: 'standard', feel,
    }), DEFAULT_PROCEDURAL_AUDIO_CONFIG).phases.map(phase => phase.audioConfig.identityPresence);
    const gentle = presences('gentle');
    expect(presences('deep')).toEqual(gentle);
    presences('immersive').forEach((value, index) => expect(value / gentle[index]).toBeCloseTo(10 ** (2 / 20), 8));
  });

  it('sets how much each appearance varies by feel: Gentle none, Deep some, Immersive the most', () => {
    const varietyFor = (feel: 'gentle' | 'deep' | 'immersive') => compileOvernightProtocol(createRecognitionOvernightProtocol({
      sleepDurationMinutes: 8 * 60, environment: 'temple', signalId: 'chimes', cuePlan: 'standard', feel,
    }), DEFAULT_PROCEDURAL_AUDIO_CONFIG).phases.map(phase => phase.audioConfig.identityVariety);
    expect(new Set(varietyFor('gentle'))).toEqual(new Set([0]));
    expect(new Set(varietyFor('deep'))).toEqual(new Set([IDENTITY_FEEL_VARIETY.deep]));
    expect(new Set(varietyFor('immersive'))).toEqual(new Set([IDENTITY_FEEL_VARIETY.immersive]));
    expect(IDENTITY_FEEL_VARIETY.gentle).toBe(0);
    expect(IDENTITY_FEEL_VARIETY.deep).toBeLessThan(IDENTITY_FEEL_VARIETY.immersive);
    // No feel is left at the default when none is chosen: the plan without a feel is Gentle.
    expect(new Set(compile('temple').phases.map(phase => phase.audioConfig.identityVariety))).toEqual(new Set([0]));
  });

  it('treats sleep after the first signal as REM, including on the gentle plan', () => {
    const gentle = compile('cosmic', 'gentle').phases;
    const early = gentle.find(phase => phase.id === 'sleep-protection-1')!.audioConfig.identityPresence;
    const rem = gentle.find(phase => phase.id === 'sleep-protection-final')!.audioConfig.identityPresence;
    expect(early).toBeCloseTo(identityPresenceFor('cosmic', 'earlySleep'), 10);
    expect(rem).toBeCloseTo(identityPresenceFor('cosmic', 'remSleep'), 10);
    expect(rem).toBeLessThan(early);
  });
});

describe('identity controls across JS and both native engines', () => {
  it('defaults to the world\'s own level and clamps like the native engines', () => {
    expect(DEFAULT_PROCEDURAL_AUDIO_CONFIG.identityPresence).toBe(1);
    expect(DEFAULT_PROCEDURAL_AUDIO_CONFIG.identityDensity).toBe(1);
    expect(normalizeProceduralAudioConfig({}).identityPresence).toBe(1);
    expect(normalizeProceduralAudioConfig({ identityPresence: 99 }).identityPresence).toBe(PROCEDURAL_AUDIO_LIMITS.identityPresence.max);
    expect(normalizeProceduralAudioConfig({ identityPresence: -2 }).identityPresence).toBe(0);
    expect(normalizeProceduralAudioConfig({ identityDensity: 0 }).identityDensity).toBe(PROCEDURAL_AUDIO_LIMITS.identityDensity.min);
    expect(normalizeProceduralAudioConfig({ identityDensity: 3 }).identityDensity).toBe(1);
    expect(DEFAULT_PROCEDURAL_AUDIO_CONFIG.identityVariety).toBe(0);
    expect(normalizeProceduralAudioConfig({}).identityVariety).toBe(0);
    expect(normalizeProceduralAudioConfig({ identityVariety: 7 }).identityVariety).toBe(PROCEDURAL_AUDIO_LIMITS.identityVariety.max);
    expect(normalizeProceduralAudioConfig({ identityVariety: -1 }).identityVariety).toBe(0);
  });

  it('uses the same limits in Kotlin, Swift and JS', () => {
    const { identityPresence, identityDensity } = PROCEDURAL_AUDIO_LIMITS;
    expect(identityPresence.max).toBe(IDENTITY_PRESENCE_MAX);
    const engine = kotlin('ProceduralAudioEngine.kt');
    expect(engine).toContain(`identityPresence = clamp(raw.identityPresence, ${identityPresence.min.toFixed(1)}, ${identityPresence.max.toFixed(1)})`);
    expect(engine).toContain(`identityDensity = clamp(raw.identityDensity, ${identityDensity.min.toFixed(1)}, ${identityDensity.max.toFixed(1)})`);
    const { identityVariety } = PROCEDURAL_AUDIO_LIMITS;
    expect(engine).toContain(`identityVariety = clamp(raw.identityVariety, ${identityVariety.min.toFixed(1)}, ${identityVariety.max.toFixed(1)})`);
    expect(swift).toContain(`identityVariety: clamp(raw.identityVariety, ${identityVariety.min}, ${identityVariety.max})`);
    expect(kotlin('Records.kt')).toMatch(/@Field var identityVariety: Double = 0\.0/);
    expect(swift).toMatch(/@Field var identityVariety = 0\.0/);
    expect(swift).toContain(`identityPresence: clamp(raw.identityPresence, ${identityPresence.min}, ${identityPresence.max})`);
    expect(swift).toContain(`identityDensity: clamp(raw.identityDensity, ${identityDensity.min}, ${identityDensity.max})`);
    // Records default to "unchanged" so an older JS bundle keeps today's sound.
    expect(kotlin('Records.kt')).toMatch(/@Field var identityPresence: Double = 1\.0/);
    expect(kotlin('Records.kt')).toMatch(/@Field var identityDensity: Double = 1\.0/);
    expect(swift).toMatch(/@Field var identityPresence = 1\.0/);
    expect(swift).toMatch(/@Field var identityDensity = 1\.0/);
  });

  it('interpolates both controls between stages in both engines', () => {
    expect(kotlin('ProceduralAudioEngine.kt')).toContain('output.identityPresence = lerp(from.identityPresence, to.identityPresence)');
    expect(kotlin('ProceduralAudioEngine.kt')).toContain('output.identityDensity = lerp(from.identityDensity, to.identityDensity)');
    expect(kotlin('ProceduralAudioEngine.kt')).toContain('output.identityVariety = lerp(from.identityVariety, to.identityVariety)');
    expect(swift).toContain('identityVariety: lerp(from.identityVariety, to.identityVariety)');
    expect(swift).toContain('identityPresence: lerp(from.identityPresence, to.identityPresence)');
    expect(swift).toContain('identityDensity: lerp(from.identityDensity, to.identityDensity)');
  });

  it('applies presence and density to the Aum the same way in both engines', () => {
    const chant = kotlin('AumChant.kt');
    // Every Nth 31 s cycle, gated over a quarter second, level scaled by presence.
    expect(chant).toContain('val chantEvery = max(1, Math.round(1.0 / density).toInt())');
    expect(chant).toContain('gate += (chantOpen - gate) / max(1.0, sampleRate * 0.25)');
    expect(chant).toContain('val chantLevel = chantEnvelope * (0.18 + intensity * 0.12) * presence * gesture.level');
    expect(swift).toContain('let chantEvery = max(1, Int((1.0 / density).rounded()))');
    expect(swift).toContain('gate += (chantOpen - gate) / max(1, sampleRate * 0.25)');
    expect(swift).toContain('let chantLevel = chantGated * (0.18 + intensity * 0.12) * presence * gesture.level');
  });

  it('applies presence and density to the whale call the same way in both engines', () => {
    const abyssal = kotlin('AbyssalModel.kt');
    expect(abyssal).toContain('creatureCountdown = rate * (42.0 + unit() * 58.0) / density');
    expect(abyssal).toContain('creatureLeft = answerLeft * presence');
    expect(abyssal).toContain('creatureLeft = (voice * (1.0 - travel) * 0.68 + answerLeft) * presence');
    expect(swift).toContain('creatureCountdown = rate * (42 + unit() * 58) / density');
    expect(swift).toContain('return (answerLeft * presence, answerRight * presence)');
    expect(swift).toContain('return ((voice * (1 - travel) * 0.68 + answerLeft) * presence, (voice * (1 + travel) * 0.68 + answerRight) * presence)');
  });

  it('applies presence and density to the Cosmic voice the same way in both engines', () => {
    const cosmic = kotlin('CosmicModel.kt');
    // Every Nth 31 s breath, gated over 1.5 s, level scaled by presence.
    expect(cosmic).toContain('val every = max(1, Math.round(1.0 / density).toInt())');
    expect(cosmic).toContain('moanGate += (open - moanGate) / max(1.0, rate * 1.5)');
    expect(cosmic).toContain('* identityPresence * moanGate');
    expect(cosmic).toContain('if (nextBreath >= PI * 2.0) moanCycle++');
    expect(swift).toContain('let every = max(1, Int((1.0 / density).rounded()))');
    expect(swift).toContain('moanGate += (open - moanGate) / max(1, rate * 1.5)');
    expect(swift).toContain('* identityPresence * moanGate');
    expect(swift).toContain('if nextBreath >= Double.pi * 2 { moanCycle += 1 }');
  });

  it('gives the other worlds no identity control', () => {
    const engine = kotlin('ProceduralAudioEngine.kt');
    for (const world of ['Ocean', 'Wind', 'Fire', 'Forest']) {
      expect(engine).not.toMatch(new RegExp(`next${world}\\([^)]*presence`));
    }
  });
});
