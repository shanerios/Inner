import * as FileSystem from 'expo-file-system';
import { voicePackPlans, voicePlanForSign, VOICE_BASE_URL, type VoiceClipPlan, type VoicePlan } from './voiceGuidance';

/**
 * Voice clips live in the documents directory, so a downloaded clip stays available offline.
 *
 * What is available, and which revision of each recording is current, comes from a small
 * `manifest.json` next to the clips. The app downloads every clip the manifest lists, whatever sign
 * the practitioner has, so a request for one sign's file never reveals it. A night never touches the
 * network: it chooses from what is already on the device.
 */
const VOICE_DIRECTORY = 'overnight-voice/';
const MANIFEST_NAME = 'manifest.json';
const MIN_CLIP_BYTES = 1_024;
const CLIP_ID_PATTERN = /^voice-prep-[a-z]+(-[a-z]+)*-[123]$/;

export const VOICE_MANIFEST_URL = `${VOICE_BASE_URL}${MANIFEST_NAME}`;

/** Clip id -> the revision of its recording. Bump a revision when you re-upload a remixed clip. */
export type VoiceManifest = { version: 1; clips: Record<string, number> };

export type ResolvedVoiceClip = { id: string; uri: string; gain: number };

export type VoiceFileSystem = {
  directory: string;
  exists(path: string): Promise<{ exists: boolean; size?: number }>;
  makeDirectory(path: string): Promise<void>;
  download(url: string, path: string): Promise<{ status: number }>;
  move(from: string, to: string): Promise<void>;
  remove(path: string): Promise<void>;
  list(path: string): Promise<string[]>;
  readText(path: string): Promise<string | null>;
  writeText(path: string, text: string): Promise<void>;
  fetchText(url: string): Promise<string | null>;
};

export const defaultVoiceFileSystem: VoiceFileSystem = {
  get directory() { return `${FileSystem.documentDirectory ?? ''}${VOICE_DIRECTORY}`; },
  async exists(path) {
    const info = await FileSystem.getInfoAsync(path);
    return { exists: info.exists, size: info.exists ? (info as { size?: number }).size : undefined };
  },
  async makeDirectory(path) { await FileSystem.makeDirectoryAsync(path, { intermediates: true }).catch(() => {}); },
  async download(url, path) { const result = await FileSystem.downloadAsync(url, path); return { status: result.status }; },
  async move(from, to) { await FileSystem.moveAsync({ from, to }); },
  async remove(path) { await FileSystem.deleteAsync(path, { idempotent: true }).catch(() => {}); },
  async list(path) { return FileSystem.readDirectoryAsync(path).catch(() => []); },
  async readText(path) { return FileSystem.readAsStringAsync(path).catch(() => null); },
  async writeText(path, text) { await FileSystem.writeAsStringAsync(path, text); },
  async fetchText(url) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10_000);
    try {
      const response = await fetch(url, { signal: controller.signal });
      return response.ok ? await response.text() : null;
    } catch {
      return null;
    } finally {
      clearTimeout(timer);
    }
  },
};

function timeout<T>(promise: Promise<T>, ms: number): Promise<T | null> {
  return new Promise(resolve => {
    const timer = setTimeout(() => resolve(null), ms);
    promise.then(
      value => { clearTimeout(timer); resolve(value); },
      () => { clearTimeout(timer); resolve(null); },
    );
  });
}

/** Keeps only well-formed entries, so a bad manifest can never name an arbitrary path or URL. */
export function parseVoiceManifest(text: string | null): VoiceManifest | null {
  if (!text) return null;
  try {
    const parsed = JSON.parse(text) as { version?: unknown; clips?: unknown };
    if (parsed?.version !== 1 || !parsed.clips || typeof parsed.clips !== 'object' || Array.isArray(parsed.clips)) return null;
    const clips: Record<string, number> = {};
    for (const [id, revision] of Object.entries(parsed.clips as Record<string, unknown>)) {
      if (CLIP_ID_PATTERN.test(id) && Number.isInteger(revision) && (revision as number) >= 1 && (revision as number) <= 9_999) {
        clips[id] = revision as number;
      }
    }
    return { version: 1, clips };
  } catch {
    return null;
  }
}

const clipPath = (fs: VoiceFileSystem, clipId: string, revision: number) => `${fs.directory}${clipId}.r${revision}.wav`;

async function installedManifest(fs: VoiceFileSystem): Promise<VoiceManifest> {
  return parseVoiceManifest(await fs.readText(`${fs.directory}${MANIFEST_NAME}`).catch(() => null)) ?? { version: 1, clips: {} };
}

async function hasClip(fs: VoiceFileSystem, clipId: string, revision: number | undefined): Promise<boolean> {
  if (!revision) return false;
  const info = await fs.exists(clipPath(fs, clipId, revision));
  return info.exists && (info.size ?? 0) >= MIN_CLIP_BYTES;
}

/**
 * The clips as local files, or null when any is missing. All or nothing: a half-voiced preparation
 * would be stranger than a text-only one. Local only, never throws, never touches the network.
 */
export async function resolveVoiceClips(clips: VoiceClipPlan[], fs: VoiceFileSystem = defaultVoiceFileSystem): Promise<ResolvedVoiceClip[] | null> {
  if (!clips.length) return null;
  try {
    const resolved: ResolvedVoiceClip[] = [];
    for (const clip of clips) {
      if (!(await hasClip(fs, clip.clipId, clip.revision))) return null;
      resolved.push({ id: clip.clipId, uri: clipPath(fs, clip.clipId, clip.revision!), gain: clip.gain });
    }
    return resolved;
  } catch {
    return null;
  }
}

/**
 * Tonight's lines, chosen from what is on the device: the sign's own recording if all three clips are
 * kept, otherwise the generic set, otherwise null (text only). Local only, so choosing never reveals
 * the sign to anyone.
 */
export async function cachedVoicePlan(
  sign: string | null | undefined,
  fs: VoiceFileSystem = defaultVoiceFileSystem,
): Promise<VoicePlan | null> {
  try {
    const installed = await installedManifest(fs);
    const wanted = voicePlanForSign(sign);
    for (const plan of wanted.slug === 'generic' ? [wanted] : [wanted, voicePlanForSign(null)]) {
      const clips = plan.clips.map(clip => ({ ...clip, revision: installed.clips[clip.clipId] }));
      if (await resolveVoiceClips(clips, fs)) return { ...plan, clips };
    }
  } catch {
    // Choosing a plan is never allowed to cost the night.
  }
  return null;
}

/** Why a clip did not arrive, in a few plain words. Never includes anything about the practitioner. */
async function installClip(fs: VoiceFileSystem, clip: VoiceClipPlan, revision: number): Promise<{ ok: true } | { ok: false; reason: string }> {
  const target = clipPath(fs, clip.clipId, revision);
  const partial = `${target}.download`;
  try {
    await fs.makeDirectory(fs.directory);
    const result = await fs.download(clip.url, partial);
    const written = await fs.exists(partial);
    if (result.status !== 200) {
      await fs.remove(partial);
      return { ok: false, reason: `http ${result.status}` };
    }
    if (!written.exists || (written.size ?? 0) < MIN_CLIP_BYTES) {
      await fs.remove(partial);
      return { ok: false, reason: 'file too small' };
    }
    await fs.remove(target);
    await fs.move(partial, target);
    return { ok: true };
  } catch (error) {
    await fs.remove(partial);
    return { ok: false, reason: `error: ${String((error as Error)?.message ?? error).slice(0, 80)}` };
  }
}

/** Where a pack update stands, for showing the practitioner and for the night's record. */
export type VoicePackProgress = {
  phase: 'checking' | 'downloading' | 'ready' | 'unreachable' | 'empty';
  /** Clips on the device and current. */
  done: number;
  /** Clips the manifest lists. */
  total: number;
  failed: number;
  /** The most recent failure, in a few words. */
  lastFailure?: string;
};

/**
 * Brings the device up to date with the published manifest, in the background and one clip at a time.
 * Every listed clip is fetched whatever the practitioner's sign. With no manifest, or an unreachable
 * one, nothing is requested. A failed clip is retried on a later visit. Returns clips now available.
 */
export async function prefetchVoicePack(
  fs: VoiceFileSystem = defaultVoiceFileSystem,
  onProgress?: (progress: VoicePackProgress) => void,
): Promise<number> {
  const report = (progress: VoicePackProgress) => { try { onProgress?.(progress); } catch { /* a display problem never stops a download */ } };
  report({ phase: 'checking', done: 0, total: 0, failed: 0 });
  const remote = parseVoiceManifest(await fs.fetchText(VOICE_MANIFEST_URL).catch(() => null));
  if (!remote) {
    report({ phase: 'unreachable', done: 0, total: 0, failed: 0 });
    return 0;
  }
  const installed = await installedManifest(fs);
  const known = new Map<string, VoiceClipPlan>();
  for (const plan of voicePackPlans()) for (const clip of plan.clips) known.set(clip.clipId, clip);
  const listed = Object.entries(remote.clips).filter(([clipId]) => known.has(clipId));
  if (!listed.length) {
    report({ phase: 'empty', done: 0, total: 0, failed: 0 });
    return 0;
  }

  let done = 0;
  let failed = 0;
  let lastFailure: string | undefined;
  for (const [clipId, revision] of listed) {
    const clip = known.get(clipId)!;
    if (!clip.url.startsWith('https://')) { failed += 1; lastFailure = 'not https'; continue; }
    if (installed.clips[clipId] === revision && await hasClip(fs, clipId, revision)) {
      done += 1;
      report({ phase: 'downloading', done, total: listed.length, failed, lastFailure });
      continue;
    }
    const previous = installed.clips[clipId];
    const result = await timeout(installClip(fs, clip, revision), 30_000);
    if (result?.ok) {
      done += 1;
      installed.clips[clipId] = revision;
      // Record each clip as it arrives, so a night can use whatever is complete even if the rest fail.
      await fs.writeText(`${fs.directory}${MANIFEST_NAME}`, JSON.stringify(installed)).catch(() => {});
      if (previous && previous !== revision) await fs.remove(clipPath(fs, clipId, previous));
    } else {
      failed += 1;
      lastFailure = result ? result.reason : 'timed out';
    }
    report({ phase: 'downloading', done, total: listed.length, failed, lastFailure });
  }
  report({ phase: failed ? 'downloading' : 'ready', done, total: listed.length, failed, lastFailure });
  let available = 0;
  for (const [clipId, revision] of Object.entries(installed.clips)) {
    if (await hasClip(fs, clipId, revision)) available += 1;
  }
  return available;
}
