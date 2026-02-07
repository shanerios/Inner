import { useEffect } from 'react';
import { TRACKS, getTrackUrl } from '../data/tracks';
import { cacheRemoteOnce, isCached } from '../utils/audioCache';

// Streaming-by-default:
// Precaching should ONLY run when explicitly enabled (e.g. dev/testing or an explicit “Download for offline” flow).
// Otherwise iOS will happily accumulate very large cached .m4a files.

type Options = {
  kind?: Array<'soundscape' | 'chamber'>;
  limit?: number;
  enabled?: boolean;
};

export function usePrecacheTracks(
  opts: Options = { kind: ['soundscape'], limit: 2, enabled: false }
) {
  useEffect(() => {
  // 🔒 Disabled: Inner streams by default.
  // Offline caching is not currently supported.
  return;

  if (!opts.enabled) return;

  const kinds = new Set(opts.kind ?? []);
  const list = TRACKS
    .filter((t) => (kinds.size ? kinds.has((t as any).kind) : true))
    .slice(0, opts.limit ?? 8);

  (async () => {
    for (const t of list) {
      try {
        const { url } = getTrackUrl(t);

        const already = await isCached(url);
        if (already) continue;

        await cacheRemoteOnce(url);
      } catch {
        // ignore
      }
    }
  })();
}, [opts.enabled, opts.limit, JSON.stringify(opts.kind)]);
}