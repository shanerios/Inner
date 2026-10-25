# Access gating: physical-device checks (internal)

Status: PARTLY RUN (see the results log at the end). Still to run: Dream Incubation, recurring-signal journey and Morning Return as a non-member, restore success, the lapsed member state, and the unknown-membership path on a device. Run on a physical iPhone and a physical Android device with a release-like build before submitting. Simulators and emulators do not cover RevenueCat sandbox or store behavior.

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

### Pixel 8 Pro, Android, Play internal build (`com.getinner.app`, versionCode 67), member, 2026-10-24

Build: `8d0e9fc`, the head of the merged gating PR. It does not include the later merges on main.

| Check | Result |
| --- | --- |
| Overnight with Temple as a member | Pass, no paywall |

Only this check was reported. The member checks for the other premium worlds, Journey Creator saving, and a premium resume were not run on Android. The Pixel account is a member and there is no non-member Google account, so non-member and purchase checks on the store build were not run on Android.

### iPhone 12 Pro, iOS, TestFlight 3.4 (buildNumber 2082), 2026-10-25

Build: `8d0e9fc`. The version number 3.4 and the build number were set only on a throwaway branch so Apple would accept the upload.

Non-member (fresh entitlement):

| Check | Result |
| --- | --- |
| Ocean and Forest start | Pass |
| Quiet | Not applicable: it is the no-environment selection, which the gate does not cover |
| Abyssal Glass, Cosmic, Fire, Temple show the paywall | Pass |
| Journey Creator gated | Pass |
| Factory journey plays, Dream Log opens | Pass |
| Pause, swipe the app away, reopen: Home offers "Continue your journey", Continue resumes with no paywall or prompt | Pass |
| Paywall shows yearly, monthly, lifetime with correct prices, "Start 7-day trial" and "Maybe later" | Pass (prices and wording confirmed by the owner) |

Purchase and member (sandbox):

| Check | Result |
| --- | --- |
| Purchase of the monthly plan with the trial | Succeeded. The sheet's wording said it was for testing; the literal "[Environment: Sandbox]" label was not read out |
| Temple, Abyssal Glass, Cosmic, Fire start with no paywall | Pass |
| Journey Creator opens | Pass |
| A journey with a premium stage saved ("Temple Experience") | Saved |
| Restore Purchases | Not reachable as a member: the button only exists on the paywall, which members do not see. Restore success is untested |
| Lapse: saved journey still plays, Temple and Journey Creator gated again, Dream Log still opens, Restore finds nothing | Not observed: Apple's sandbox kept the subscription active for hours after it was cancelled. Covered by unit tests and the non-member checks above |

Findings:
- A TestFlight purchase goes through the Apple ID in Media & Purchases, not the "Sandbox Apple Account" setting in Developer. The purchase prompt asked for the account in Media & Purchases. The sandbox account had to be signed into Media & Purchases to proceed.
- A swipe-away while the night was still playing did not produce a Continue card. The same swipe after pausing did. The resume and checkpoint code is identical to the shipped iOS release, so this is not part of the gating. It is unexplained.
- The "Resume - Chamber" shortcut on Home is the existing last-session shortcut. The gating change does not touch it.

### Not covered by any device check
- The unknown-membership path (no cached customer info, SDK error, or timeout) on a device. Unit tests only.
- Android paywall offerings and prices on a store build.
- Aeris conversation limits, which are server-side.
- `main` as a whole. The builds above predate the onboarding and intention rewrite, the Dream Log recollections work and the Android text fix. A build from `main` needs a short regression pass: first launch and onboarding, the Intention screen, Overnight, and a Dream Log entry.

