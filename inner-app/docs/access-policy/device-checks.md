# Access gating: physical-device checks (internal)

Status: NOT YET RUN. Run on a physical iPhone and a physical Android device with a release-like build before submitting. Simulators and emulators do not cover RevenueCat sandbox or store behavior.

Use three states: a member, a non-member, and a lapsed member (has saved journeys, membership ended).

## Gates
- Non-member: Overnight with Temple, Abyssal Glass, Cosmic or Fire shows the paywall before audio starts. Ocean, Forest, Quiet start with no check.
- Non-member: an Ocean and Temple comparison night shows the paywall before the night starts, and a pending experiment night is not replaced.
- Non-member: Journey Creator opens to the paywall. Saving a new journey requires membership.
- Member: every item above starts without a paywall.

## Never blocked
- Resume a paused or interrupted Overnight Journey as a non-member, with a premium environment: it resumes with no check.
- Lapsed member: saved journeys play, including ones with premium stages. Deleting works.
- Factory journeys with premium stages, Dream Incubation, and the recurring-signal journey play for a non-member.
- Dream Log, Morning Return, and essential playback controls work in every state.
- An active session is not interrupted when membership expires or is refreshed mid-play.

## Origin validation (records decide, labels do not)
- Each entry into the journey player behaves as above: factory list, saved list, recurring-signal card, Dream Incubation (with a real Dream Seed), Home continue, Overnight, Creator begin and preview.
- A saved journey plays as a lapsed member. After deleting it, a stale route to it is gated by content rather than treated as saved.
- Storage failure UI (screen code, not unit-tested): force an unreadable saved-journeys or Journey Memory record and confirm the player shows "Try again" and "Back", never the paywall, and that Try again re-runs the start.
- A resume whose session has ended shows "The paused journey is no longer available", never the paywall.

## Unknown membership
- Airplane mode, cold start, non-member: a premium start shows "Membership not confirmed" with a way to retry, never "not a member".
- Back online: retry succeeds.
- Airplane mode as a member with a recent confirmed check: note whether RevenueCat serves its cached info, and what the app does.

## Purchase and restore
- Purchase from each paywall trigger (overnight, journey_creator) starts or returns correctly. Restore on a fresh install recognises the member.
- RevenueCat offerings, prices and trials are confirmed in the dashboard and stores, not assumed.

Record device, OS, build number, account state and result for each line.
