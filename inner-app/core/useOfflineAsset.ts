// core/useOfflineAsset.ts
import * as FileSystem from 'expo-file-system';
import { useCallback, useEffect, useRef, useState } from 'react';
import { TRACKS } from '../data/tracks';

type AssetType = 'chamber' | 'soundscape';

function resolveRemoteFromTracks(id: string | undefined): string | null {
  if (!id) return null;
  const t = TRACKS.find(x => x.id === id);
  return t && (t as any).remote ? String((t as any).remote) : null;
}

/** Guess extension from URL; default to m4a. */
function guessExtension(url?: string | null): string {
  if (!url) return 'm4a';
  const clean = url.split('?')[0];
  const m = clean.match(/\.([a-z0-9]+)$/i);
  return (m?.[1]?.toLowerCase() || 'm4a');
}

/** Stable local path so new versions overwrite, not duplicate. */
function targetPathFor(type: AssetType, id: string, remoteUrl?: string | null): string {
  const dir = FileSystem.cacheDirectory + (type === 'chamber' ? 'chambers/' : 'soundscapes/');
  const ext = guessExtension(remoteUrl);
  return `${dir}${id}.${ext}`;
}

export function useOfflineAsset(id: string | undefined, type: AssetType) {
  const [isCached, setIsCached] = useState(false);
  const [isWorking, setIsWorking] = useState(false);
  const [progress, setProgress] = useState(0);
  const [canDownload, setCanDownload] = useState(false);
  const lastUriRef = useRef<string | null>(null);

  const ensureDir = useCallback(async () => {
    const dir = FileSystem.cacheDirectory + (type === 'chamber' ? 'chambers/' : 'soundscapes/');
    await FileSystem.makeDirectoryAsync(dir, { intermediates: true }).catch(() => {});
    return dir;
  }, [type]);

  const check = useCallback(async () => {
    if (!id) return;
    const remote = resolveRemoteFromTracks(id);
    setCanDownload(!!remote);

    await ensureDir();
    const target = targetPathFor(type, id, remote);

    try {
      const stat = await FileSystem.getInfoAsync(target);
      const ok = !!stat.exists && (stat.size ?? 0) > 1024;
      setIsCached(ok);
      lastUriRef.current = ok ? target : null;
    } catch {
      setIsCached(false);
      lastUriRef.current = null;
    }
  }, [id, type, ensureDir]);

  useEffect(() => {
    check();
  }, [check]);

  // NOTE: This should ONLY be called from an explicit user action (e.g. “Download for offline”).
  // For streaming-by-default, playback should use `getPlayableUri()` and never call `download()` automatically.
  const download = useCallback(async () => {
    if (!id) return;
    setIsWorking(true);
    setProgress(0);

    try {
      const remote = resolveRemoteFromTracks(id);
      if (!remote) return;

      await ensureDir();
      const target = targetPathFor(type, id, remote);

      const dl = FileSystem.createDownloadResumable(
        remote,
        target,
        {},
        (p) => setProgress(p.totalBytesWritten / Math.max(1, p.totalBytesExpectedToWrite || 1))
      );

      const res = await dl.downloadAsync();
      if (!res || (res.status && res.status !== 200)) {
        throw new Error(`Download failed: ${res?.status}`);
      }

      lastUriRef.current = target;
      setIsCached(true);
    } finally {
      setIsWorking(false);
    }
  }, [id, type, ensureDir]);

  const remove = useCallback(async () => {
    if (!id) return;
    setIsWorking(true);
    try {
      const remote = resolveRemoteFromTracks(id);
      await ensureDir();
      const target = targetPathFor(type, id, remote);
      await FileSystem.deleteAsync(target, { idempotent: true });
    } finally {
      setIsWorking(false);
      setIsCached(false);
      setProgress(0);
      lastUriRef.current = null;
    }
  }, [id, type, ensureDir]);

  const getPlayableUri = useCallback((): string | null => {
    // Prefer the cached file if it exists; otherwise stream from the remote URL.
    if (lastUriRef.current) return lastUriRef.current;
    return resolveRemoteFromTracks(id);
  }, [id]);

  return { isCached, isWorking, progress, download, remove, refresh: check, canDownload, getPlayableUri };
}