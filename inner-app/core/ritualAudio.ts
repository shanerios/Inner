import * as FileSystem from 'expo-file-system';

// Verified B2 recordings. When replacing a recording, update its size and digest.
export const RITUAL_AUDIO = {
  "clean_slate_pre": {
    "url": "https://f005.backblazeb2.com/file/inner-audio/DailyRituals/clean_slate_pre.m4a",
    "bytes": 498838,
    "md5": "2170c04484fa2ac2d3d567f48c83d269"
  },
  "clean_slate_exercise": {
    "url": "https://f005.backblazeb2.com/file/inner-audio/DailyRituals/clean_slate_exercise.m4a",
    "bytes": 1637210,
    "md5": "8306b5239573f351c97bdacf59e13c5f"
  },
  "inner_flame_preroll": {
    "url": "https://f005.backblazeb2.com/file/inner-audio/DailyRituals/inner_flame_preroll.m4a",
    "bytes": 774054,
    "md5": "34eb12ba20c1ee6617d7d7ec1ebfe330"
  },
  "inner_flame_exercise": {
    "url": "https://f005.backblazeb2.com/file/inner-audio/DailyRituals/inner_flame_exercise.m4a",
    "bytes": 2203439,
    "md5": "9ab7501a0c66789d89034ba01efbd16c"
  },
  "point_zero_preroll": {
    "url": "https://f005.backblazeb2.com/file/inner-audio/DailyRituals/point_zero_preroll.m4a",
    "bytes": 751934,
    "md5": "311b514c10f85bc61df65beff2a3c217"
  },
  "point_zero_exercise": {
    "url": "https://f005.backblazeb2.com/file/inner-audio/DailyRituals/point_zero_exercise.m4a",
    "bytes": 1582261,
    "md5": "2f587944cbea5afdbd389bc57de49e69"
  }
} as const;

export type RitualAudioId = keyof typeof RITUAL_AUDIO;
let transferSequence = 0;
const inFlight = new Map<RitualAudioId, Promise<string>>();

/** A bounded cache of six short clips (7.45 MB total), fetched only when requested.
 * Local playback preserves ritual timing and allows repeat use without a network.
 * Partial or incorrect downloads never become playable cache entries.
 */
export function getRitualAudioUri(id: RitualAudioId): Promise<string> {
  const existing = inFlight.get(id);
  if (existing) return existing;
  const request = load(id).finally(() => { inFlight.delete(id); });
  inFlight.set(id, request);
  return request;
}

async function load(id: RitualAudioId): Promise<string> {
  if (!FileSystem.cacheDirectory) throw new Error('Audio cache is unavailable.');
  const asset = RITUAL_AUDIO[id];
  const directory = `${FileSystem.cacheDirectory}ritual-audio-v1/`;
  const destination = `${directory}${id}.m4a`;
  await FileSystem.makeDirectoryAsync(directory, { intermediates: true });
  const cached = await FileSystem.getInfoAsync(destination, { md5: true });
  if (cached.exists && cached.size === asset.bytes && cached.md5 === asset.md5) return destination;
  if (cached.exists) await FileSystem.deleteAsync(destination, { idempotent: true });

  const temporary = `${destination}.${Date.now()}-${++transferSequence}.part`;
  const download = FileSystem.createDownloadResumable(asset.url, temporary, {});
  let timer: ReturnType<typeof setTimeout> | undefined;
  const transfer = download.downloadAsync();
  try {
    const result = await Promise.race([
      transfer,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          void download.cancelAsync().catch(() => {});
          reject(new Error('Audio download timed out. Please try again.'));
        }, 30_000);
      }),
    ]);
    if (!result || result.status !== 200) throw new Error('Audio download failed.');
    const info = await FileSystem.getInfoAsync(temporary, { md5: true });
    if (!info.exists || info.size !== asset.bytes || info.md5 !== asset.md5) {
      throw new Error('Audio download was incomplete. Please try again.');
    }
    await FileSystem.moveAsync({ from: temporary, to: destination });
    return destination;
  } finally {
    if (timer) clearTimeout(timer);
    // Also clean a late-settling native transfer after timeout/cancellation.
    void transfer.catch(() => {}).finally(() =>
      FileSystem.deleteAsync(temporary, { idempotent: true }).catch(() => {}));
  }
}
