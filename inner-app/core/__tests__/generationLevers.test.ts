import { describe, expect, it } from '@jest/globals';
import * as fs from 'fs';
import * as path from 'path';
import { GENERATION_LEVERS, buildGenerationNotes, leverDefinition } from '../generationLevers';
import type { NightPlanConfiguration } from '../nightPlans';

const configuration: NightPlanConfiguration = {
  durationMinutes: 450,
  environment: 'ocean',
  feel: 'gentle',
  signalId: 'guardian',
  cuePlan: 'standard',
  recognitionWindowCount: 3,
  signalGainScale: 1,
};

const intention = {
  type: 'recurring_dream_sign' as const,
  sign: 'Flying',
  selectedAt: 1,
  evidence: { appearances: 4, rememberedDreams: 7 },
};

const note = (notes: ReturnType<typeof buildGenerationNotes>, lever: string) => notes.notes.find(item => item.lever === lever)!;

describe('generation lever registry', () => {
  it('only lists levers the generator reads', () => {
    const root = path.resolve(__dirname, '../..');
    for (const lever of GENERATION_LEVERS) {
      expect(lever.honoredBy.length).toBeGreaterThan(0);
      for (const reader of lever.honoredBy) {
        const source = fs.readFileSync(path.join(root, reader.file), 'utf8');
        expect({ lever: lever.id, file: reader.file, found: source.includes(reader.token) }).toEqual({ lever: lever.id, file: reader.file, found: true });
      }
    }
  });

  it('has unique ids and declares which levers change sleep audio', () => {
    expect(new Set(GENERATION_LEVERS.map(lever => lever.id)).size).toBe(GENERATION_LEVERS.length);
    expect(leverDefinition('prep_focus').altersSleepAudio).toBe(false);
    expect(leverDefinition('prep_voice').altersSleepAudio).toBe(false);
    expect(leverDefinition('prep_voice').stage).toBe('waking_preparation');
    expect(leverDefinition('prep_focus').stage).toBe('waking_preparation');
    for (const id of ['environment', 'feel', 'signal', 'signal_level', 'cue_plan'] as const) {
      expect(leverDefinition(id).altersSleepAudio).toBe(true);
    }
  });

  it('measures every lever against at least one outcome', () => {
    for (const lever of GENERATION_LEVERS) expect(lever.outcomes.length).toBeGreaterThan(0);
  });
});

describe('generation notes', () => {
  it('records a manual night as chosen, with no sign applied', () => {
    const notes = buildGenerationNotes({ configuration, planSource: 'manual' });
    expect(notes.notes.map(item => item.lever)).toEqual(['environment', 'feel', 'signal', 'signal_level', 'cue_plan', 'prep_focus']);
    expect(notes.notes.slice(0, 5).every(item => item.source === 'chosen')).toBe(true);
    expect(note(notes, 'prep_focus')).toEqual({ lever: 'prep_focus', value: null, source: 'default' });
    expect(note(notes, 'environment').value).toBe('ocean');
    expect(note(notes, 'signal_level').value).toBe(1);
  });

  it('credits an accepted proposal to its source, with the reason', () => {
    const notes = buildGenerationNotes({
      configuration: { ...configuration, environment: 'temple' },
      planSource: 'adaptive_rule',
      planReason: 'Temple nights carried stronger recall.',
      proposedConfiguration: { environment: 'temple' },
      userChanged: [],
    });
    expect(note(notes, 'environment')).toEqual({
      lever: 'environment', value: 'temple', source: 'adaptive_rule', reason: 'Temple nights carried stronger recall.',
    });
    expect(note(notes, 'feel').source).toBe('chosen');
  });

  it('credits each kind of proposal correctly', () => {
    for (const source of ['recommendation', 'experiment', 'adaptive_rule'] as const) {
      const notes = buildGenerationNotes({ configuration, planSource: source, proposedConfiguration: { cuePlan: 'standard' }, userChanged: [] });
      expect(note(notes, 'cue_plan').source).toBe(source);
    }
  });

  it('records a changed proposal as the practitioner\'s choice', () => {
    const notes = buildGenerationNotes({
      configuration: { ...configuration, environment: 'forest' },
      planSource: 'adaptive_rule',
      planReason: 'Temple nights carried stronger recall.',
      proposedConfiguration: { environment: 'temple' },
      userChanged: ['environment'],
    });
    expect(note(notes, 'environment')).toMatchObject({ value: 'forest', source: 'chosen' });
    expect(note(notes, 'environment').reason).toContain('Changed from the proposal');
  });

  it('records the dream sign, its evidence, and that it shapes the preparation only', () => {
    const notes = buildGenerationNotes({ configuration, planSource: 'manual', recognitionIntention: intention });
    expect(note(notes, 'prep_focus')).toMatchObject({ value: 'Flying', source: 'dream_sign' });
    expect(note(notes, 'prep_focus').reason).toContain('4 appearances in 7 remembered dreams');
    expect(note(notes, 'prep_focus').reason).toContain('waking preparation only');
  });

  it('records whether the preparation is spoken, and who decided', () => {
    const spoken = buildGenerationNotes({ configuration, planSource: 'manual', voiceDelivery: 'voice' });
    expect(note(spoken, 'prep_voice')).toEqual({ lever: 'prep_voice', value: 'voice', source: 'default' });
    const declined = buildGenerationNotes({ configuration, planSource: 'manual', voiceDelivery: 'text', voiceDeclined: true });
    expect(note(declined, 'prep_voice')).toMatchObject({ value: 'text', source: 'chosen', reason: 'Voice guidance was turned off.' });
    const skipped = buildGenerationNotes({ configuration, planSource: 'manual', voiceDelivery: 'text', voiceDeclined: false });
    expect(note(skipped, 'prep_voice').reason).toContain('skipped for this night');
    const unavailable = buildGenerationNotes({ configuration, planSource: 'manual', voiceDelivery: 'text', voiceUnavailable: true });
    expect(note(unavailable, 'prep_voice')).toMatchObject({ value: 'text', source: 'default' });
    expect(note(unavailable, 'prep_voice').reason).toContain('not on the device');
    expect(note(buildGenerationNotes({ configuration, planSource: 'manual', voiceDelivery: 'voice', voiceLines: 'generic' }), 'prep_voice').reason).toBe('Generic lines.');
    expect(note(buildGenerationNotes({ configuration, planSource: 'manual', voiceDelivery: 'voice', voiceLines: 'chased' }), 'prep_voice').reason).toBe('Lines recorded for chased.');
    // Callers that predate the voice add no note.
    expect(buildGenerationNotes({ configuration, planSource: 'manual' }).notes.some(item => item.lever === 'prep_voice')).toBe(false);
  });

  it('treats a blank sign as no sign', () => {
    const notes = buildGenerationNotes({ configuration, planSource: 'manual', recognitionIntention: { ...intention, sign: '  ' } });
    expect(note(notes, 'prep_focus').value).toBeNull();
  });

  it('is deterministic and serialisable', () => {
    const input = { configuration, planSource: 'manual' as const, recognitionIntention: intention };
    expect(buildGenerationNotes(input)).toEqual(buildGenerationNotes(input));
    expect(JSON.parse(JSON.stringify(buildGenerationNotes(input)))).toEqual(buildGenerationNotes(input));
  });
});

describe('the Overnight screen', () => {
  it('names the sign in the preparation from the frozen recipe and records the notes', () => {
    const screen = fs.readFileSync(path.resolve(__dirname, '../../screens/OvernightJourneyScreen.tsx'), 'utf8');
    expect(screen).toContain('recipe.recognition.intention?.sign');
    expect(screen.match(/withPreparationFocus\(/g)).toHaveLength(1);
    expect(screen).toContain('generation: buildGenerationNotes({');
    expect(screen).toMatch(/withPreparationFocus\(\s*overnightJourney\(environment, feel, compiledNight,/);
  });

  it('only speaks the preparation when allowed, and not on a Quiet Night or an accelerated test', () => {
    const screen = fs.readFileSync(path.resolve(__dirname, '../../screens/OvernightJourneyScreen.tsx'), 'utf8');
    expect(screen).toContain('const voiceWillPlay = voiceGuidance && !quietNight && !(accelerated && INNER_LAB_BUILD);');
    expect(screen.match(/withPreparationVoice\(/g)).toHaveLength(1);
    expect(screen).toContain('journey: voicePlan ? withPreparationVoice(preparedJourney, voicePlan) : preparedJourney');
    expect(screen).toContain("voiceDelivery: voicePlan ? 'voice' : 'text'");
    // Chosen from the device only: starting a night never asks the network for a sign's clips.
    expect(screen).toContain('await cachedVoicePlan(recipe.recognition.intention?.sign)');
    expect(screen).toContain('prefetchVoicePack()');
    expect(screen).not.toContain('prefetchVoiceClips');
  });

  it('loads the clips before the timeline starts and falls back to text without blocking', () => {
    const player = fs.readFileSync(path.resolve(__dirname, '../../screens/LucidJourneyPlayerScreen.tsx'), 'utf8');
    expect(player.match(/resolveVoiceClips\(/g)).toHaveLength(1);
    expect(player.indexOf('resolveVoiceClips(')).toBeLessThan(player.indexOf('await session.startTimeline('));
    expect(player).toContain("type: 'voice_clip_missing'");
    expect(player).toContain('.catch(() => null)');
  });
});
