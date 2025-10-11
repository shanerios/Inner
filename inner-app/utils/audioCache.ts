// utils/audioCache.ts
import * as FileSystem from 'expo-file-system';

export async function getCachedPath(url: string): Promise<string | null> {
  await ensureDir();
  const hash = await keyFrom(url);
  const dest = `${CACHE_DIR}${hash}.m4a`;
  const info = await FileSystem.getInfoAsync(dest);
  return info.exists && (info.size ?? 0) > 0 ? dest : null;
}

export async function isCached(url: string): Promise<boolean> {
  return (await getCachedPath(url)) !== null;
}

const CACHE_DIR = FileSystem.cacheDirectory + 'inner_audio/';

async function ensureDir() {
  try { await FileSystem.makeDirectoryAsync(CACHE_DIR, { intermediates: true }); } catch {}
}

async function keyFrom(url: string): Promise<string> {
  if (typeof crypto !== 'undefined' && crypto.subtle && crypto.subtle.digest) {
    const encoder = new TextEncoder();
    const data = encoder.encode(url);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    return hashHex;
  } else {
    // Fallback: simple hash function (not cryptographically secure)
    let hash = 0;
    for (let i = 0; i < url.length; i++) {
      const chr = url.charCodeAt(i);
      hash = ((hash << 5) - hash) + chr;
      hash |= 0;
    }
    return Math.abs(hash).toString(16).padStart(64, '0');
  }
}

/** Returns a file:// URI – downloads once, reuses afterward. */
export async function cacheRemoteOnce(url: string): Promise<string> {
  await ensureDir();
  const hash = await keyFrom(url);
  const dest = `${CACHE_DIR}${hash}.m4a`;
  const info = await FileSystem.getInfoAsync(dest);
  if (info.exists && (info.size ?? 0) > 0) return dest;
  const { uri } = await FileSystem.downloadAsync(url, dest);
  return uri;
}

/** Preloads without playing (for a “Make available offline” action). */
export async function prefetch(url: string): Promise<boolean> {
  try { await cacheRemoteOnce(url); return true; } catch { return false; }
}

/** Optional: cap cache size with a simple LRU eviction. */
export async function evictIfOver(maxBytes = 400 * 1024 * 1024) {
  await ensureDir();
  const names = await FileSystem.readDirectoryAsync(CACHE_DIR);
  const entries = await Promise.all(names.map(async n => {
    const p = CACHE_DIR + n;
    const s = await FileSystem.getInfoAsync(p);
    return { p, size: s.size ?? 0, mtime: s.modificationTime ?? 0 };
  }));
  const total = entries.reduce((a, b) => a + b.size, 0);
  if (total <= maxBytes) return;

  entries.sort((a, b) => a.mtime - b.mtime); // oldest first
  let cur = total;
  for (const e of entries) {
    if (cur <= maxBytes) break;
    try { await FileSystem.deleteAsync(e.p, { idempotent: true }); } catch {}
    cur -= e.size;
  }
}