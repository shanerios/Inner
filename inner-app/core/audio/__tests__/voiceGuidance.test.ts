import { describe, expect, it, jest } from '@jest/globals';
import { DEFAULT_PROCEDURAL_AUDIO_CONFIG } from '../config';
import { overnightJourney } from '../overnightJourney';
import { compileOvernightProtocol, createRecognitionOvernightProtocol } from '../overnightProtocol';
import { compileAudioJourneyTimeline } from '../timeline';
import {
  GENERIC_VOICE_SLUG,
  VOICE_BASE_URL,
  VOICE_SLOT_TIMES_MS,
  VOICE_TRIM_DB,
  voicePackPlans,
  voicePlanForSign,
  voiceSlugForSign,
  withPreparationVoice,
} from '../voiceGuidance';
import { cachedVoicePlan, prefetchVoicePack, resolveVoiceClips, type VoiceFileSystem } from '../voiceClips';
import { DREAM_SIGNS } from '../../dreamSigns';

jest.mock('expo-file-system', () => ({ documentDirectory: 'file:///docs/', getInfoAsync: jest.fn(), makeDirectoryAsync: jest.fn(), downloadAsync: jest.fn(), moveAsync: jest.fn(), deleteAsync: jest.fn() }));

function night(accelerated = false) {
  const protocol = compileOvernightProtocol(createRecognitionOvernightProtocol({
    environment: 'forest', feel: 'gentle', sleepDurationMinutes: 450, cuePlan: 'standard', signalId: 'guardian',
  }), DEFAULT_PROCEDURAL_AUDIO_CONFIG);
  return overnightJourney('forest', 'gentle', protocol, accelerated, 6284);
}

describe('voice plan', () => {
  it('has a recording slug for every dream sign, and each slug is unique and file-safe', () => {
    const slugs = DREAM_SIGNS.map(sign => voiceSlugForSign(sign));
    expect(slugs.every(slug => slug && /^[a-z]+(-[a-z]+)*$/.test(slug))).toBe(true);
    expect(new Set(slugs).size).toBe(DREAM_SIGNS.length);
    expect(voiceSlugForSign('Familiar Person')).toBe('familiar-person');
  });

  it('matches signs ignoring case and spacing, and has no slug for anything else', () => {
    expect(voiceSlugForSign('  shadow presence ')).toBe('shadow-presence');
    expect(voiceSlugForSign('Dragons')).toBeNull();
    expect(voiceSlugForSign('')).toBeNull();
    expect(voiceSlugForSign(undefined)).toBeNull();
  });

  it('plans three clips with the recorded file names, hosted over https', () => {
    const plan = voicePlanForSign('Water');
    expect(plan.slug).toBe('water');
    expect(plan.clips.map(clip => clip.fileName)).toEqual(['voice-prep-water-1.wav', 'voice-prep-water-2.wav', 'voice-prep-water-3.wav']);
    expect(plan.clips.map(clip => clip.atMs)).toEqual([...VOICE_SLOT_TIMES_MS]);
    expect(plan.clips.every(clip => clip.url === `${VOICE_BASE_URL}${clip.fileName}` && clip.url.startsWith('https://'))).toBe(true);
    expect(plan.clips.every(clip => clip.clipId === clip.fileName.replace('.wav', ''))).toBe(true);
  });

  it('falls back to the generic set for no sign or an unrecorded one', () => {
    for (const sign of [undefined, null, '', 'Dragons']) {
      const plan = voicePlanForSign(sign);
      expect(plan.slug).toBe(GENERIC_VOICE_SLUG);
      expect(plan.clips[0].fileName).toBe('voice-prep-generic-1.wav');
    }
  });

  it('applies a per-clip trim in dB as a bounded linear gain', () => {
    expect(voicePlanForSign('Water').clips.every(clip => clip.gain === 1)).toBe(true);
    VOICE_TRIM_DB['water-2'] = -6;
    VOICE_TRIM_DB['water-3'] = 40;
    try {
      const gains = voicePlanForSign('Water').clips.map(clip => clip.gain);
      expect(gains[1]).toBeCloseTo(0.501, 2);
      expect(gains[2]).toBe(2);
    } finally {
      delete VOICE_TRIM_DB['water-2'];
      delete VOICE_TRIM_DB['water-3'];
    }
  });
});

describe('voice events in the journey', () => {
  it('places each clip in the preparation stage that contains its time', () => {
    const journey = withPreparationVoice(night(), voicePlanForSign('Flying'));
    const stages = journey.timeline.stages;
    let cursor = 0;
    const found: Array<{ clipId: string; globalMs: number }> = [];
    for (const stage of stages) {
      for (const event of stage.spatialEvents ?? []) {
        if (event.type === 'voice') found.push({ clipId: event.clipId, globalMs: cursor + event.atMs });
      }
      cursor += stage.durationMs;
    }
    expect(found).toEqual(VOICE_SLOT_TIMES_MS.map((atMs, index) => ({ clipId: `voice-prep-flying-${index + 1}`, globalMs: atMs })));
    expect(journey.voiceClips).toHaveLength(3);
  });

  it('adds voice only to the waking preparation, never the sleep stages', () => {
    const journey = withPreparationVoice(night(), voicePlanForSign(undefined));
    const withVoice = journey.timeline.stages.filter(stage => (stage.spatialEvents ?? []).some(event => event.type === 'voice')).map(stage => stage.id);
    expect(withVoice.length).toBeGreaterThan(0);
    expect(withVoice.every(id => ['learn', 'rehearse', 'drift', 'release'].includes(id))).toBe(true);
  });

  it('leaves every audio stage, cue and the seed exactly as built', () => {
    const plain = night();
    const voiced = withPreparationVoice(night(), voicePlanForSign('Water'));
    const strip = (journey: typeof plain) => journey.timeline.stages.map(stage => ({
      ...stage, spatialEvents: (stage.spatialEvents ?? []).filter(event => event.type !== 'voice'),
    }));
    expect(strip(voiced)).toEqual(strip(plain));
    expect(voiced.timeline.seed).toBe(plain.timeline.seed);
    expect(voiced.overnight).toEqual(plain.overnight);
    const config = DEFAULT_PROCEDURAL_AUDIO_CONFIG;
    const compiledVoiced = compileAudioJourneyTimeline(voiced.timeline, config);
    const compiledPlain = compileAudioJourneyTimeline(plain.timeline, config);
    expect(compiledVoiced.totalDurationMs).toBe(compiledPlain.totalDurationMs);
    expect(compiledVoiced.stages.map(stage => stage.config)).toEqual(compiledPlain.stages.map(stage => stage.config));
  });

  it('does not touch the cue events that drive recognition', () => {
    const cues = (journey: ReturnType<typeof night>) => journey.timeline.stages.flatMap(stage => (stage.spatialEvents ?? []).filter(event => event.type === 'cue'));
    expect(cues(withPreparationVoice(night(), voicePlanForSign('Water')))).toEqual(cues(night()));
  });

  it('compiles, and rejects a voice event without a clip', () => {
    const journey = withPreparationVoice(night(), voicePlanForSign('Water'));
    expect(() => compileAudioJourneyTimeline(journey.timeline, DEFAULT_PROCEDURAL_AUDIO_CONFIG)).not.toThrow();
    const broken = { ...journey.timeline, stages: journey.timeline.stages.map(stage => ({
      ...stage, spatialEvents: (stage.spatialEvents ?? []).map(event => event.type === 'voice' ? { ...event, clipId: ' ' } : event),
    })) };
    expect(() => compileAudioJourneyTimeline(broken, DEFAULT_PROCEDURAL_AUDIO_CONFIG)).toThrow();
  });

  it('returns the journey unchanged when no clip falls inside the preparation', () => {
    const journey = night();
    const plan = { slug: 'x', clips: [{ clipId: 'late', fileName: 'late.wav', url: 'https://example.com/late.wav', atMs: 99_999_999, gain: 1 }] };
    expect(withPreparationVoice(journey, plan)).toBe(journey);
  });
});

const DIR = 'file:///docs/overnight-voice/';
const clipFile = (clipId: string, revision = 1) => `${DIR}${clipId}.r${revision}.wav`;
const ALL_IDS = voicePackPlans().flatMap(plan => plan.clips.map(clip => clip.clipId));
const manifestOf = (ids: string[], revision = 1) => JSON.stringify({ version: 1, clips: Object.fromEntries(ids.map(id => [id, revision])) });

function fakeFs(options: {
  remote?: string | null;
  installed?: Record<string, number>;
  downloadStatus?: number;
  downloadSize?: number;
  failFor?: string;
  hang?: boolean;
} = {}) {
  const files = new Map<string, number>();
  const texts = new Map<string, string>();
  for (const [id, revision] of Object.entries(options.installed ?? {})) files.set(clipFile(id, revision), 40_000);
  if (options.installed) texts.set(`${DIR}manifest.json`, JSON.stringify({ version: 1, clips: options.installed }));
  const downloads: string[] = [];
  const fetched: string[] = [];
  const fs: VoiceFileSystem = {
    directory: DIR,
    exists: async path => ({ exists: files.has(path), size: files.get(path) }),
    makeDirectory: async () => {},
    download: async (url, path) => {
      downloads.push(url);
      if (options.hang) await new Promise(() => {});
      if (options.failFor && url.includes(options.failFor)) throw new Error('network');
      files.set(path, options.downloadSize ?? 50_000);
      return { status: options.downloadStatus ?? 200 };
    },
    move: async (from, to) => { files.set(to, files.get(from) ?? 0); files.delete(from); },
    remove: async path => { files.delete(path); },
    list: async () => [...files.keys()].map(path => path.replace(DIR, '')),
    readText: async path => texts.get(path) ?? null,
    writeText: async (path, text) => { texts.set(path, text); },
    fetchText: async url => { fetched.push(url); return options.remote === undefined ? manifestOf(ALL_IDS) : options.remote; },
  };
  return { fs, files, texts, downloads, fetched };
}

const installedIds = (ids: string[], revision = 1) => Object.fromEntries(ids.map(id => [id, revision]));
const idsFor = (slug: string) => [1, 2, 3].map(slot => `voice-prep-${slug}-${slot}`);

describe('choosing tonight\'s lines from the device', () => {
  it('never goes to the network: it only looks at what is kept', async () => {
    const env = fakeFs();
    expect(await cachedVoicePlan('Chased', env.fs)).toBeNull();
    expect(env.downloads).toHaveLength(0);
    expect(env.fetched).toHaveLength(0);
  });

  it('uses the sign\'s own recording, with the revision that is on the device', async () => {
    const env = fakeFs({ installed: installedIds(idsFor('chased'), 3) });
    const plan = await cachedVoicePlan('Chased', env.fs);
    expect(plan?.slug).toBe('chased');
    expect(plan?.clips.map(clip => clip.revision)).toEqual([3, 3, 3]);
  });

  it('falls back to the generic set when the sign\'s clips are missing or incomplete, then to nothing', async () => {
    const generic = fakeFs({ installed: installedIds(idsFor('generic')) });
    expect((await cachedVoicePlan('Chased', generic.fs))?.slug).toBe('generic');
    expect((await cachedVoicePlan(null, generic.fs))?.slug).toBe('generic');
    const partial = fakeFs({ installed: { ...installedIds(idsFor('generic')), 'voice-prep-chased-1': 1, 'voice-prep-chased-2': 1 } });
    expect((await cachedVoicePlan('Chased', partial.fs))?.slug).toBe('generic');
    expect(await cachedVoicePlan('Chased', fakeFs().fs)).toBeNull();
  });

  it('ignores a listed clip whose file is gone or truncated', async () => {
    const env = fakeFs({ installed: installedIds(idsFor('generic')) });
    env.files.set(clipFile('voice-prep-generic-2'), 10);
    expect(await cachedVoicePlan(null, env.fs)).toBeNull();
    env.files.delete(clipFile('voice-prep-generic-2'));
    expect(await cachedVoicePlan(null, env.fs)).toBeNull();
  });

  it('hands the engine local files at the planned gain, and never throws', async () => {
    const env = fakeFs({ installed: installedIds(idsFor('water'), 2) });
    const plan = (await cachedVoicePlan('Water', env.fs))!;
    expect(await resolveVoiceClips(plan.clips, env.fs)).toEqual(plan.clips.map(clip => ({ id: clip.clipId, uri: clipFile(clip.clipId, 2), gain: 1 })));
    expect(await resolveVoiceClips([{ ...plan.clips[0], revision: undefined }], env.fs)).toBeNull();
    expect(await resolveVoiceClips([], env.fs)).toBeNull();
    const broken = { ...env.fs, exists: async () => { throw new Error('disk'); } };
    expect(await resolveVoiceClips(plan.clips, broken)).toBeNull();
    expect(await cachedVoicePlan('Water', broken)).toBeNull();
  });
});

describe('keeping the voice pack on the device', () => {
  it('downloads every listed clip whatever the sign, and keeps them for offline use', async () => {
    const env = fakeFs();
    expect(await prefetchVoicePack(env.fs)).toBe(33);
    expect(env.fetched).toEqual(['https://f005.backblazeb2.com/file/inner-audio/OvernightVoice/manifest.json']);
    expect(new Set(env.downloads).size).toBe(33);
    expect(env.downloads[0]).toContain('voice-prep-generic-1.wav');
    expect([...env.files.keys()].some(path => path.endsWith('.download'))).toBe(false);
    expect((await cachedVoicePlan('Water', env.fs))?.slug).toBe('water');
    // A second visit requests only the manifest.
    env.downloads.length = 0;
    expect(await prefetchVoicePack(env.fs)).toBe(33);
    expect(env.downloads).toHaveLength(0);
  });

  it('supports a partial pack: only listed clips are fetched, and the rest are never requested', async () => {
    const listed = [...idsFor('generic'), ...idsFor('flying'), ...idsFor('falling')];
    const env = fakeFs({ remote: manifestOf(listed) });
    expect(await prefetchVoicePack(env.fs)).toBe(9);
    expect(env.downloads).toHaveLength(9);
    expect(env.downloads.some(url => url.includes('chased'))).toBe(false);
    expect((await cachedVoicePlan('Flying', env.fs))?.slug).toBe('flying');
    expect((await cachedVoicePlan('Chased', env.fs))?.slug).toBe('generic');
    env.downloads.length = 0;
    await prefetchVoicePack(env.fs);
    expect(env.downloads).toHaveLength(0);
  });

  it('fetches a clip again when its revision goes up, and removes the old file', async () => {
    const env = fakeFs({ installed: installedIds(idsFor('generic'), 1), remote: manifestOf(idsFor('generic'), 2) });
    expect(await prefetchVoicePack(env.fs)).toBe(3);
    expect(env.downloads).toHaveLength(3);
    expect(env.files.has(clipFile('voice-prep-generic-1', 2))).toBe(true);
    expect(env.files.has(clipFile('voice-prep-generic-1', 1))).toBe(false);
    expect((await cachedVoicePlan(null, env.fs))?.clips.map(clip => clip.revision)).toEqual([2, 2, 2]);
  });

  it('keeps using the old recording until the new one has fully arrived', async () => {
    const env = fakeFs({ installed: installedIds(idsFor('generic'), 1), remote: manifestOf(idsFor('generic'), 2), failFor: 'generic-2' });
    await prefetchVoicePack(env.fs);
    // Clip 2 failed, so the set is mixed; each clip is still on a revision that exists.
    const plan = await cachedVoicePlan(null, env.fs);
    expect(plan?.clips.map(clip => clip.revision)).toEqual([2, 1, 2]);
  });

  it('requests nothing when there is no manifest or it is unreadable', async () => {
    for (const remote of [null, 'not json', JSON.stringify({ version: 2, clips: {} }), JSON.stringify([])]) {
      const env = fakeFs({ remote });
      expect(await prefetchVoicePack(env.fs)).toBe(0);
      expect(env.downloads).toHaveLength(0);
    }
  });

  it('ignores manifest entries that are not real clips, so a bad manifest cannot name a path or URL', async () => {
    const hostile = JSON.stringify({ version: 1, clips: {
      '../../etc/passwd': 1, 'voice-prep-water-9': 1, 'voice-prep-water-1': 0, 'voice-prep-water-2': 'x', 'voice-prep-water-3': 1,
      'voice-prep-unknown-1': 1,
    } });
    const env = fakeFs({ remote: hostile });
    expect(await prefetchVoicePack(env.fs)).toBe(1);
    expect(env.downloads).toHaveLength(1);
    expect(env.downloads[0]).toContain('voice-prep-water-3.wav');
  });

  it('rejects an error page or an empty file instead of keeping it, and retries next time', async () => {
    expect(await prefetchVoicePack(fakeFs({ downloadStatus: 404 }).fs)).toBe(0);
    const empty = fakeFs({ downloadSize: 100 });
    expect(await prefetchVoicePack(empty.fs)).toBe(0);
    expect(empty.files.size).toBe(0);
  });

  it('keeps going when some clips fail, and fetches only what is missing next time', async () => {
    const first = fakeFs({ failFor: 'water-' });
    expect(await prefetchVoicePack(first.fs)).toBe(30);
    const installed = JSON.parse(first.texts.get(`${DIR}manifest.json`)!).clips;
    const second = fakeFs({ installed });
    expect(await prefetchVoicePack(second.fs)).toBe(33);
    expect(second.downloads).toHaveLength(3);
  });

  it('refuses a non-https clip url and never throws', async () => {
    const env = fakeFs();
    const broken = { ...env.fs, fetchText: async () => { throw new Error('offline'); } };
    expect(await prefetchVoicePack(broken)).toBe(0);
  });
});
