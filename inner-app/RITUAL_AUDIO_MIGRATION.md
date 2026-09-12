# Daily ritual audio migration

The Clean Slate, Inner Flame, and Point 0 exercises and prerolls now load from the existing public B2 bucket under `DailyRituals/`. All six provided URLs returned HTTP 200 with Content-Type audio/mp4 and byte-for-byte content identical to the original local recordings.

`core/ritualAudio.ts` centralizes URLs, expected byte lengths, and MD5 digests. A recording downloads only when requested, then plays from verified local storage with the existing platform player. Cached recordings work offline until the OS clears its cache. Completed cache entries total at most 7.45 MB for these six recordings. Initial uncached playback requires a connection. Failed or corrupt downloads can be retried, requests are deduplicated, and a stalled download times out after 30 seconds. Exercise buttons show loading state and reject duplicate presses. Returning while downloading prevents late autoplay.

The six originals are retained in assets/audio as source backups but no longer referenced by Metro. Both production exports were checked by content hash and exclude all six. Compressed assets plus JavaScript dropped from approximately 200.44 MB to 193.17 MB per platform, a reduction of approximately 7.27 MB before native/store packaging. Existing installations only see a smaller bundled footprint after installing a new native release.

Validation: TypeScript and Jest; 19 suites, 85 tests. Cache regressions cover offline reuse, simultaneous requests, corrupt cache entries, HTTP errors, incorrect downloaded content, timeout, and retry. Physical iOS/Android playback remains a release check: first visit, cached offline repeat, airplane mode with empty cache, retry after reconnect, and exit during download.

Static tone/noise files and Garden/Tuning navigation are unchanged. Their later replacement requires a separate parity and saved-entry migration audit.
