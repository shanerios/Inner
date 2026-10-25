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

---

## Results log

### Pixel 8 Pro, Android, Inner Lab build (`com.getinner.app.proceduraldev`), non-member, 2026-10-24

Build: `access-gating-release`. Lab's RevenueCat returned customer info (a definite "no entitlement"), so it can check non-member gates. It cannot check purchase, restore, offerings, or member and lapsed states.

| Check | Result |
| --- | --- |
| Free Overnight worlds (Ocean, Forest, Quiet) start | Pass |
| Premium Overnight worlds show the paywall before audio | Pass |
| Journey Creator gated | Pass |
| Resume through the Home Continue card after the app was swiped away | Pass, no prompt |
| Factory journey plays | Pass |
| Dream Log opens | Pass |
| Ocean and Temple comparison: notice shown, Temple night paywalled at start | Pass |
| Offline, non-member, Temple | Paywall (not the unknown message), see below |
| Offline, Ocean starts | Pass |
| Back online, Temple | Paywall |
| Dream Incubation, recurring-signal journey | Not run |
| Morning Return | Not run |

Findings:
- A first on-device run showed "Membership not confirmed" for every premium start. That was a bug (RevenueCat was not configured when the gate ran) and is fixed in `ce711d9`. The run did show the unknown-membership dialog and its wording on a real device.
- Offline, the gate resolved to the paywall rather than the unknown message. The RevenueCat SDK serves its cached customer info offline, so the check returns a cached "not a member". The unknown path (no cache, SDK error, or timeout) was not reproduced on a device. It is covered by unit tests only.
- Pause then background then foreground returns to the same player screen. That is ordinary playback, not a resume start, and does not exercise the gate.

Still open: purchase, restore, member and lapsed states, the iPhone, and the rest of the "not run" rows.
