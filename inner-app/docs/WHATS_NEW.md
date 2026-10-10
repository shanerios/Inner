# Inner — What's New

This is the working release-notes ledger for Inner. Add user-visible improvements to the **Unreleased** section as they land. At release time, replace `Unreleased` with the shipped version, build numbers, and date; preserve the detailed notes; then create a fresh Unreleased section.

## Unreleased — next release after 3.1

Current production baseline: Inner 3.1 · iOS build 2076 · Android version code 63

### Store-ready draft

Inner now connects nighttime practice with what you remember in the morning. Morning Return offers a quick reflection after an eligible Overnight Journey, including one-tap voice entry, and can carry the result directly into the Dream Log.

Dream entries can now capture lucid awareness, agency, attempted control, what changed, and whether an Inner cue appeared. These details remain optional so it is still fast to record a dream.

New on-device Practice Memory begins connecting journeys, signals, environments, and dream outcomes. Inner can surface recurring dream signs, explain possible personal patterns, suggest a relevant next practice, and support small multi-night comparisons without treating correlation as proof.

Ocean, Forest, and Temple have gained more natural environmental detail, while Overnight Journeys now preserve an explicit Night Recipe, place recognition signals within the duration you choose, and include additional recovery and long-session reliability improvements. Inner can also make small, explained signal-level suggestions after enough comparable nights confirm whether cues were noticed or caused waking.

### Detailed product log

#### Morning Return and voice journaling

- Added Morning Return after eligible Overnight Journeys and valid early completions.
- Presents Morning Return when the app next opens or returns to the foreground, rather than interrupting overnight playback.
- Keeps the initial reflection short: dream recall, lucidity, signal recognition, and clarity can be recorded before opening the full journal.
- Added a direct path from Morning Return into the Dream Log.
- Added one-tap speech-to-text for the morning reflection and journal entry flow.
- Preserves dictated words in the editable text field before saving.
- Keeps listening across natural pauses and preserves each spoken fragment until the practitioner taps stop.
- Suggests likely dream signs from a dictated Morning Return on-device and saves only the signs the practitioner confirms.
- Improved Android speech startup by using the platform microphone permission state, accepting the audio-start event, adding a startup timeout, and allowing a pending start to be cancelled.
- Coordinated global Morning Return visibility with Home prompts so competing modals do not flash, dismiss one another, or repeatedly reappear.
- Makes Morning Return wait until Daily Arrival is completed or skipped, then presents the pending reflection instead of losing it behind the arrival screen.

#### Dream Log as a measurement system

- Expanded lucid-dream classification beyond a single yes/no field.
- Added optional awareness values: No, Maybe, and Yes.
- Added optional agency values: No, A little, and Yes.
- Added control-attempt tracking.
- Added control domains for body, emotion, movement, characters or people, place or environment, story or narrative, physics or impossible actions, and other attempts.
- Added control results: Did not work, Partly worked, and Worked.
- Added Inner cue recognition for sound, symbol, phrase, Guardian, place or environment, feeling, no recognition, and uncertainty.
- Kept all structured details skippable so freeform journaling remains the primary action.
- Reduced Dream Journal clutter by placing structured Dream Details behind a compact progressive-disclosure section.
- Added readable structured summaries to saved dream entries.
- Preserved compatibility with existing dream entries that do not contain the new metadata.
- Extended Dream Archive data handling so the new structured details can remain part of the user's record.

#### Night-to-dream connection

- Added automatic practice context that can associate a dream with relevant recent Inner activity.
- Added night records and practice links for Overnight Journeys, journey configuration, recognition signals, environments, timing, and available playback context.
- Added the foundation for showing the night that preceded a dream.
- Connected supported Chamber, Soundscape, Guardian, Tuning, and lucid-practice activity to the broader practice history where data is available.

#### Night Recipes and duration-aware signals

- Added Night Recipe v2 as a versioned snapshot of the night the practitioner reviewed and began.
- Records the selected goal, duration, environment, feel, preparation, signal, cue plan, exact recognition windows, procedural arc, and random seed.
- Preserves the recipe with the Night Plan so later outcomes can be compared with what was actually intended.
- Carries an accepted recurring dream sign into Overnight setup as an optional recognition focus and freezes that intention into the Night Recipe.
- Replaced fixed clock offsets with recognition windows that scale to the selected night length.
- Standard nights now retain three recognition opportunities and gentle signal plans retain two across the supported durations.
- A seven-hour standard night now places signals near 4h 10m, 5h 35m, and 6h 25m instead of discarding a signal scheduled beyond the end of the night.
- Shows the planned signal times in the Overnight Journey review card before the practitioner begins.
- Defines cue times as the moment the signal actually plays, with protected quiet space before and after it.
- Uses the saved recipe as the playback source for signal level, number of presentations, environmental ducking, recovery time, selected signal, and procedural seed.
- Added a durable night execution receipt that separates planned recognition signals from signals the native audio renderer confirms were delivered.
- Carries delivered cue IDs and timing, missing cues, completion state, interruptions, audio route when available, and playback errors into Morning Return and Dream Log practice context.
- Added conservative personal signal-level adaptation: repeated confirmed waking can lower the next signal slightly, while repeated confirmed non-recognition without waking can raise it slightly.
- Added a stepped signal-volume control beside the Overnight Journey signal picker. Selecting a signal or releasing the slider previews the exact cue at that level before the journey begins, and Inner remembers a separate starting level for each signal.
- Keeps calibration inside Night setup, records the reviewed level in the Night Recipe, and reminds practitioners that their device media volume also affects what they hear.
- Aligned the Signal Volume, Quiet Night, and Your Night cards into one consistent setup column.
- Requires at least three comparable completed nights with full cue delivery, the same signal, cue plan, cue count, and audio route before proposing a signal-level change.
- Excludes accelerated tests, interrupted nights, incomplete delivery, missing sleep answers, and overridden signal levels from cue-volume learning.
- Added a Quiet Night switch to the Overnight Journey review. Nights played deliberately low, such as beside someone sleeping, are kept out of signal-level learning so a signal that was too quiet to hear is not mistaken for one that needs to be louder.
- Overnight Journeys now record the device's media volume, and cue-level learning skips nights played near mute or at a changing volume, and only compares nights heard at a similar volume. The first 15 minutes are ignored, so adjusting the volume while settling in does not count against a night. Nights from earlier builds have no volume record and are treated as before.
- Overnight Journeys now also record whether the audio output switched between headphones and speaker during the night, and cue-level learning skips any night where it did after the first 15 minutes. Nights from earlier builds have no route record and are treated as before.
- After playback resumes from an interruption, such as an alarm or a call, an overnight recognition signal that comes due within the next 90 seconds now waits until that window ends instead of sounding right as you may have just been woken. A signal is never held more than five minutes past its scheduled time, and the delay is recorded with the night.
- Shows an explained adaptive signal-level suggestion in the same control before the night begins while leaving the final starting level with the practitioner.

#### Inner Lab experiments (not in production builds)

- Added record-only bedside motion for Overnight Journeys in Inner Lab and development builds. It summarises the phone's accelerometer into one-minute readings (average, largest change, and how many readings arrived), stored on the device for the most recent 14 nights.
- Nothing in playback, signal timing, or learning reads this data yet. The aim is to learn whether a phone on a nightstand picks up anything useful, and what the recording costs in battery.
- Production installs do not record motion. The Journey Memory inspector in Inner Lab builds shows the latest night's summary.
- Needs a new native build, and has not yet been run on a physical device.

#### Practice Memory and personal patterns

- Added an on-device Practice Memory that organizes nights, practices, dream outcomes, and recognition results into a coherent history.
- Added a dedicated Practice Memory view.
- Added recurring dream-signal detection so repeated signs can become material for later recognition practice.
- Morning Return now asks separately whether the chosen dream sign appeared and whether it was recognized, then preserves that outcome with the dream and night record.
- Morning Return now distinguishes a recognition signal experienced in the dream, heard while waking, experienced in both states, or not noticed.
- When no dream was recalled, Morning Return limits signal-location answers to waking, uncertainty, or no recognition so contradictory outcomes are not recorded.
- Practice Memory summarizes recognition-focus outcomes with explicit observation and insufficient-evidence language; after three answered focus nights, those outcomes can refine and explain the next recognition-practice recommendation.
- Completing a personalized Recognition practice now links that exact session, dream sign, signal, and number of rehearsals to the next Night Recipe.
- Overnight setup shows whether tonight's signal matches the one used to rehearse the dream sign while leaving the final choice with the practitioner.
- Added Practice State v1, which keeps recall, sleep disruption, signal experience, and dream-sign recognition separate and identifies one transparent learning objective for the next night.
- Home can now recommend repeating the last verified Night Recipe when another comparable night is more useful than changing a setting; one tap restores the reviewed duration, environment, feel, signal, cue plan, and signal level.
- Every new Night Recipe freezes the Practice State objective and rules version that shaped it, so later reflections retain why the night was constructed.
- Practice Memory now includes a compact recent-night evidence ledger showing planned-versus-delivered signals, reported outcomes, whether a night was comparable, and why interrupted or incomplete nights were excluded from adaptation.
- Added transparent recommendation logic that explains the observations behind a suggestion.
- Uses careful confidence language to distinguish recorded observations, possible personal patterns, and cases where there is not enough information.
- Added local adaptive-night planning foundations that can select a relevant next practice from the user's history.
- Adaptive Night plans now propose one editable recipe change at a time. Environment suggestions compare only otherwise-matched completed nights with full cue delivery, stable playback, and no interruptions.
- Interrupted, incomplete, quiet, test, route-changing, and otherwise incomparable nights no longer count as evidence for an environment adjustment or its later evaluation.
- Added personal practice experiments for comparing conditions over multiple nights.
- Added Home cards for the current experiment, tonight's recommendation, and the next meaningful continuation.
- Removed the older general suggestion system after the more specific recommendation and continuation systems replaced it.
- Kept personalization local and rule-based; the system does not require AI or population research participation.

#### Home continuity

- Made Home prioritize what the practitioner should do next based on unfinished or recently completed practice.
- Allows the Morning Return continuation to replace the standard “Tonight, a door is open” area when a return is available.
- Restyled the Home continuation card with a clear, lightweight surface consistent with the Dream Log add button.
- Improved eligibility handling so morning prompts appear only for relevant nights and do not compete with onboarding, navigation, or other global prompts.

#### Overnight Journey reliability

- Made accelerated-night controls available in standalone Inner Lab builds without requiring Metro or a cloud-build-only environment flag.
- Added native journey checkpoints to improve recovery after interruption or process loss.
- Added wall-clock reconciliation so long sessions can recover their correct position.
- Added a render heartbeat for stronger full-night playback monitoring.
- Preserved the established behavior of alarms and external audio routing during overnight playback.

#### Generative environments

- Added a continuous procedural cricket layer to Forest, integrated into its environmental bed.
- Added rare procedural seagull passes to Ocean.
- Added sparse, distant procedural footsteps to Temple.
- Tuned Temple footstep groupings so roughly 20% contain no footstep, 60% contain one, and 20% contain two.
- Increased the perceived distance of Temple footsteps so they sit within the environment instead of sounding close to the listener.
- Added Android/iOS parity coverage for crickets, gulls, and footsteps.

#### Recognition signals

- Added Guardian as a selectable recognition signal, drawn from Guardian 1's Cultivation track.
- Added stereo playback for recognition signals, so a signal's natural left/right character is preserved instead of being played identically to both ears.
- Level-matched Guardian to the same -21 to -22 LU window as every other recognition signal.

#### Interface polish

- Moved the orb-backed titles down by 24 pixels on Lucid Journeys, Lucid Return, Lucid Threshold, Lucid Signal, Create a Journey, and Live Mix.
- Kept Overnight Journey unchanged because that screen has no orb above its title.
- Moved dependent playback and mixer controls with their headings to preserve spacing.
- Fixed descriptor-chip clipping caused by wider bold text.

### Privacy and analytics notes

- Practice Memory and personalized recommendations are designed to work locally on the device.
- Structured dream outcomes can support aggregate event counts without sending freeform dream text.
- Freeform journal content should remain outside analytics unless a future, explicit policy and consent flow says otherwise.
- Population research remains separate from personal adaptation and requires an explicit opt-in before collection.

### Release verification completed so far

- TypeScript type checking passes.
- Full automated suite passes: 64 suites, 452 tests, and 6 snapshots.
- Android's native InnerAudio module compiles with recipe-driven gain and recovery fields; the matching iOS source passes Swift parsing.
- Android standalone release builds successfully after a clean native build.
- A standalone Inner Lab accelerated night completed on a physical Pixel 8 Pro and produced the expected Morning Return without Metro.
- Android Morning Return voice capture was verified on a physical Pixel 8 Pro: permission, recording, automatic stop, transcription, text insertion, save, and Dream Log persistence.
- Audio behavior has parity coverage across Android and iOS for the new procedural environment elements.
- Accelerated long-journey runs were previously reported as passing for the generative environments.

### Before publishing

- Confirm the final marketing version and iOS/Android build numbers.
- Recheck the store-ready draft against the exact contents of the release branch.
- Complete physical-device smoke tests on both iOS and Android for Morning Return, voice capture, Dream Log save/edit/export, and Overnight Journey recovery.
- Recheck the six adjusted Lucid screen headers on representative small and large devices.
- Confirm microphone permission copy and store privacy disclosures include speech-to-text behavior.
- Replace this section heading with the shipped version and release date, then create a new Unreleased section above it.
