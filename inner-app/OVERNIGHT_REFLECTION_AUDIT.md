# Overnight reflection audit — September 11, 2026

Baseline: main at 3229dad; f72971c and 3e1a6c3 present; clean before edits.

## Data flow and focused change

LucidJourneyPlayerScreen creates a unique Journey Memory ID before native playback. Its screen-local ref routes diagnostics and finish writes to that ID. Completion is observed through position polling and native timer completion polling; manual exit records left_early. The session record survives restart, but the screen-local playback association does not.

Previously Morning Reflection queried only lucidSignalLearning, populated by notification scheduling. Native Overnight Recognition never created that notification record, so its reflections were absent rather than reliably linked. Development preview also persisted synthetic nights into real learning history.

Morning Reflection now selects a real overnight session from Journey Memory after its planned end and saves answers directly on that exact record. The same serialized write queue protects reflection and playback updates from overwriting each other. The modal identifies the start date/time, clears answers when its target changes, preserves answers after save failure, and refreshes on screen focus and app foreground. Closing it defers review until a later focus/restart. Pending records remain available within the existing 60-session retention limit. Failed and accelerated sessions cannot receive this reflection. Preview is now temporary and does not write learning history. Existing notification reflections retain their original path; overnight answers do not feed notification-plan recommendations.

The planned end only establishes review eligibility: an unknown native outcome stays unknown. A new night cannot redirect an older submitted reflection to itself. These additive fields do not require rewriting old records.

## Remaining field-test work

- Native process-death completion recovery and durable playback/session identity remain unresolved. Screen-local polling alone cannot establish what happened after termination. Do not infer completion from wall time.
- Normal overnight sessions on physical Android and iOS must verify background completion, return to the modal, selected signal, save/restart, and multiple pending nights. No full overnight hardware run was performed for this change.
- Review the duration/intensity matrix and native cue windows before expanding recommendations. Native audio and protocols were not modified here.
- Existing actualDurationMs records playback position, not measured listening time; scrubbing and pauses require separate accounting before using it as listening evidence.
- Historical preview nights lack a test marker and cannot be reliably distinguished retrospectively. This change prevents new preview contamination.
- Optional notes, signal preference, repeat/adjust intent, and an overnight reflection history/reset UI remain future slices.

Validation: TypeScript check and full Jest suite, including regression cases for reload recovery, review timing, exact session linkage, concurrent completion, and rejected missing/failed/development sessions. Physical UI and native builds were not run for this TypeScript-only change.
