# Overnight testing foundation — phases 1 and 2

## Shared production builder

`core/audio/overnightJourney.ts` is the original screen-local translation, moved without changing its body. Callers now supply acceleration and seed explicitly. The screen still chooses a fresh seed on Begin. No clock, DSP, gain, cue timing, completion policy, or route behavior was intentionally changed.

The characterization test hashes both authored and compiled output for 1,728 configurations: six worlds × three feels × six durations × two cue plans × four signals × normal/accelerated. The original function body was compared byte-for-byte, allowing only export/signature changes, before capturing the six per-world golden digests. Readable assertions also pin preparation cues, sleep cue offsets, stage chunk limits, recognition gain, and Return.

These tests cover production timeline construction, not rendered audio or background reliability. Signal selection still occurs through the existing preference read in the player; an immutable complete replay manifest belongs to a later phase.

## Native evidence

Both native platforms now retain a bounded journal (60 sessions) until JavaScript acknowledges a specific session after a successful Journey Memory write. Android migrates the previous single checkpoint when it first writes the journal. iOS uses an atomic Application Support file protected until first device unlock. Android uses committed SharedPreferences. Storage failures record a diagnostic and do not stop playback.

Checkpoints include position/stage, seed, process PID and per-process identity, expected completion timestamp when armed, route/playback state, bounded pending diagnostics, and stage-qualified planned/fired cue IDs. The process identity is local diagnostic metadata, not a persistent device identifier. Acknowledgement prevents a late captured heartbeat from recreating an already acknowledged record in that process.

Android retains its two-minute cadence. iOS adds a two-minute native timer and lifecycle writes. Disk writes never execute on an audio render callback. This is diagnostic persistence, not a renderer-state snapshot, progress watchdog, or automatic audio restoration.

Native normal completion and explicit stop write terminal receipts before resetting the engine. A later heartbeat cannot overwrite a terminal receipt, and a new journey cannot replace an older session's receipt. iOS module destruction and Android unexpected service destruction remain interruption evidence, not user-stop receipts.

Launch reconciliation skips matching live sessions, including paused iOS timelines. Each receipt's native events and outcome are committed in one serialized history write before acknowledgement. Read/write failures leave evidence available to retry. Known terminal receipts use their native timestamp and do not produce an unexpected-termination Sentry warning. A deliberate pause stays distinguishable from unexpected interruption. Android crash/OS-exit evidence takes precedence over inferred near-end completion. Legacy count-only checkpoints remain readable; new checkpoints require every planned cue identity before inferring near-end completion.

No new playback auto-resume policy is added. A hard kill can still lose up to the checkpoint interval of evidence; paused/suspended operation and sudden power loss require device validation. Journal retention is bounded, not an unlimited archival guarantee. Existing JS inferred completion and cue-history behavior is preserved.

## Repeatable checks

From `inner-app`:

```sh
npm run typecheck
npm test -- --no-cache --watchman=false
xcrun swiftc -module-cache-path /tmp/inner-swift-module-cache modules/inner-audio/ios/JourneyCheckpointStore.swift modules/inner-audio/tests/JourneyCheckpointStoreTests.swift -o /tmp/inner-checkpoint-tests
/tmp/inner-checkpoint-tests
```

The Swift host executable runs the production store against temporary files and covers relaunch, terminal retention, scoped acknowledgement, late heartbeat suppression, bounded retention, failed serialization, and corrupt files. It does not execute AVAudioEngine.

Compile `:inner-audio:compileDebugKotlin` through the Android Gradle wrapper. After installing the local pod source with `pod install --deployment --no-repo-update`, compile the `InnerAudio` CocoaPods target for the simulator. Production dependency versions are unchanged. Android JVM tests use test-only JUnit and JSON dependencies; run `:inner-audio:testDebugUnitTest` to exercise the production journal with injected storage failures.

## Device acceptance still required

Use lab builds, keep the exported evidence, and run each on Android and iOS:

1. Begin a normal journey, lock the device for more than two minutes, terminate the process, relaunch. Verify matching session/process evidence and a partial interrupted outcome; do not infer a kill cause without OS evidence.
2. Pause, terminate, relaunch. Verify the pause reason, no completion inference, and no unexpected-termination Sentry warning solely from that deliberate pause.
3. Let an accelerated journey complete with JS unavailable, then relaunch. Verify the native terminal receipt produces completion once with the native end timestamp.
4. Stop from media controls with JS unavailable, then relaunch. Verify user-stopped, not completed or unexplained interruption.
5. Start two journeys consecutively. Acknowledging the earlier one must preserve the later live checkpoint.
6. Recreate the bridge while playback survives (Android), and inspect paused native state (both platforms). Neither should close a genuinely live matching session.
7. Exercise route loss/reconnection and system interruption. Verify the existing playback policy is unchanged and the checkpoint reflects the event.
8. Simulate history write failure, retry recovery, and verify exactly one terminal history event without losing the native receipt.

A new native build is required; a JavaScript-only update cannot add iOS persistence or native terminal receipts. Full overnight soak validation and performance measurements are not replaced by these checks.

## Verification for this change

- `npm run check`: TypeScript passed; 42 Jest suites, 293 tests, and six golden snapshots passed.
- Android: native Kotlin compilation and all four `CheckpointJournalTest` JVM tests passed.
- iOS: `InnerAudio` target built successfully for arm64 and x86_64 simulators; the standalone production-store executable passed.
- `git diff --check`: passed.
- `expo-doctor` could not run because it was unavailable locally and the npm registry lookup failed (`ENOTFOUND`). No JavaScript or production native dependency versions were changed.
- No physical-device locked playback, process-kill, or overnight soak run was performed for this change.
