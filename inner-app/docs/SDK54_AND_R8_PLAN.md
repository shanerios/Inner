# Expo SDK 54 upgrade and R8 minification — plan

Written 2026-10-15. Nothing in this plan has been applied to the repo. Evidence below comes from reading the code, the three patches, the config plugins, Expo's and Google's primary sources, and one throwaway R8 trial build (command-line flags only, no files changed).

## 1. Why, and by when

| Driver | Source | Date |
|---|---|---|
| Updates must target Android 16 (API 36). Inner has an extension. | Play Console notice; [Google's target API page](https://developer.android.com/google/play/requirements/target-sdk) | **Nov 1, 2026** (an update still on API 35 can be published before then, not after) |
| DEX code optimization below threshold (obfuscation 3%, needs 25%+) | Play Console, Android vitals | **Feb 2027** |
| Edge-to-edge and large-screen recommendations | Play Console | Recommended, no date |

Where the app is today: Expo SDK 53, React Native 0.79.6, compileSdk and targetSdk 35, Android Gradle Plugin 8.8.2, legacy architecture (`newArchEnabled: false`), minSdk 24, R8 off.

**Target:** Expo SDK 54 (React Native 0.81.5, targets Android 16) with the legacy architecture kept, then R8 on, shipped in two separate steps so any release-only crash can be attributed.

### Why SDK 54 and not newer
The latest Expo SDK is 58. SDK 55 and later require the New Architecture and remove `expo-av` (11 files use it). Each of those is its own migration. SDK 54 is the smallest step that satisfies Google, and it is the last SDK that still allows the legacy architecture. A later phase (section 8) covers SDK 55+ and the API 37 requirement that is expected in 2027.

## 2. Sequencing (recommended)

1. **Release from `main` first, on API 35, before Nov 1.** Everything verified so far (the overnight, voice and continuation work) is on `main`. The extension allows it. This keeps the big feature release from being tied to a framework upgrade.
2. **SDK 54 on a branch, starting now, in parallel.** Target: ready to ship within about 2–3 weeks of the first release, because after Nov 1 any hotfix needs API 36.
3. **R8 on top of SDK 54 as its own step** (separate build, separate device matrix).

Decision point **Oct 24**: if the SDK 54 branch is not building and passing on devices, ship step 1 and keep working. Nothing live breaks if SDK 54 is late; only updates are blocked after Nov 1.

## 3. SDK 54 — what has to change

### 3.1 JavaScript
| Change | Files | Why |
|---|---|---|
| `expo-file-system` → `expo-file-system/legacy` | 13 files: `App.tsx`, `learn/screens/LessonReader.tsx`, `learn/screens/LearnHub.tsx`, `core/useOfflineAsset.ts`, `core/ritualAudio.ts`, `core/audio/voiceClips.ts`, `utils/audioCache.ts`, `screens/DreamArchiveScreen.tsx`, `screens/PlaybackDiagnosticsScreen.tsx`, `screens/JourneyPlayer.tsx`, `components/SettingsModal.tsx`, plus 2 tests | In SDK 54 the default export is the new API; the old functions we use (`getInfoAsync`, `downloadAsync`, `createDownloadResumable`, `cacheDirectory`, ...) live at `/legacy` |
| Update the Jest mocks to the same path | `core/audio/__tests__/voiceGuidance.test.ts`, `core/__tests__/ritualAudio.test.ts` | Tests mock the module name; they would silently mock the wrong module |
| Reanimated stays on 3.x | `package.json`, `babel.config.js` | Reanimated 4 needs the New Architecture. 3.19.x is the only 3.x line that supports RN 0.81 on the legacy architecture ([Reanimated compatibility](https://docs.swmansion.com/react-native-reanimated/docs/3.x/guides/compatibility/)). Keep the babel plugin. |
| Remove unused `moti` | `package.json` | 0 imports in the code. Removes a Reanimated dependency edge. |
| Sentry stays at 8.15.1 | `package.json` → `expo.install.exclude` | `expo install --fix` would downgrade it to 7.2 and bring back the breadcrumb bug |

### 3.2 Config and plugins
| Change | Why |
|---|---|
| `react-native-edge-to-edge` plugin: install it directly, or replace with `androidNavigationBar.enforceContrast` | No longer a dependency of `expo` in SDK 54 ([Expo SDK 54 changelog](https://expo.dev/changelog/sdk-54)). Our `app.json` plugin list still names it. |
| `edgeToEdgeEnabled` in `app.json` | Always on in SDK 54; the key becomes redundant |
| `app.json` `version` and runtime version | `runtimeVersion` policy is `appVersion`; the release must use a new version (3.2) so no older binary can receive JS built for new native code |
| `plugins/withProceduralDevFlavor.js` | It patches `MainApplication.kt` and `app/build.gradle` by anchor strings. The SDK 54 template still contains every anchor it needs (`import android.app.Application`, `import com.facebook.react.PackageList`, `import com.facebook.react.defaults.DefaultReactNativeHost`), and the plugin throws if an anchor goes missing, so it fails loudly. `FrescoModule.hasBeenInitialized()` must be checked at compile time. |
| `android/` and `ios/` are generated (gitignored) | All native settings must live in config plugins, never in edited generated files |

### 3.3 Packages (Expo's SDK 54 targets)
`expo ~54.0.x`, `react 19.1.0`, `react-native 0.81.5`, `expo-av ~16.0.8`, `expo-video ~3.0.16`, `expo-notifications ~0.32.17`, `expo-updates ~29.0.20`, `expo-file-system ~19.0.24`, `react-native-gesture-handler ~2.28.0`, `react-native-screens ~4.16.0`, `react-native-safe-area-context ~5.6.0`, `react-native-svg 15.12.1`, `react-native-webview 13.15.0`, `lottie-react-native ~7.3.1`, `jest-expo ~54.0.18`. Third-party packages not tracked by Expo (RevenueCat, PostHog, Track Player, ChottuLink, spotlight tour, expo-speech-recognition) are addressed in the risk register.

### 3.4 Patches (patch-package)
| Patch | What it protects | On upgrade |
|---|---|---|
| `expo-speech-recognition+2.1.5` | **Privacy:** stops dictated text reaching logcat | Must still apply. The guard test `dictationLogging.test.ts` must pass. |
| `expo-video+2.2.3` | iOS race in `sourceLoad` payload (`Task { @MainActor in`) | Will **fail to apply** to expo-video 3.0.x. Upstream 3.0.16 still has the plain `Task {` at the same spot (checked), so the patch must be re-created as `expo-video+3.0.16.patch`. |
| `react-native-track-player+4.1.2` | Android crash on a null-intent restart of the sticky service | Package is already at its latest version (4.1.2); patch stays. |

patch-package fails the install on a patch that does not apply, so none of these can be dropped silently.

## 4. R8 minification — what to change

The trial (production flavor, SDK 53, R8 forced on with command-line flags) **succeeded in 3 minutes**:
- Obfuscation: **82% of classes** and **68% of members** renamed. The Play threshold is 25%.
- Code size: 3 DEX files, about 19 MB, against 5 DEX files, about 46 MB without R8 (not exactly like for like: Lab versus prod flavor).
- Only warning: a benign stack-map note from RevenueCat's bundled Amazon appstore jar (683 repeats, one source).
- The default rules file (`proguard-android.txt`) contains `-dontoptimize`, so R8 only **shrinks and renames**; it does not rewrite code. That is the conservative mode.
- Our `Record` classes and our module class are kept by `expo-modules-core`'s own consumer rules, so the native audio engine's JS-to-native data is protected. `usage.txt` shows only unused *members* removed from our classes (such as generated data-class component functions), not whole classes.

### Settings (in config, not in generated files)
Use `expo-build-properties` (SDK 54 names confirmed in its source):
- `enableMinifyInReleaseBuilds: true`
- `enableShrinkResourcesInReleaseBuilds: **false**` (see risk R4)
- `extraProguardRules`: start empty. Add a rule only for a specific, observed failure.

### Companion work
- Confirm Sentry uploads the ProGuard mapping (production EAS environment has `SENTRY_AUTH_TOKEN`) and that Play receives the mapping inside the AAB. Without this, release crashes are unreadable.
- Run a deliberate test crash on the R8 build and read it in Sentry.

## 5. Risk register

| # | Risk | Evidence | Safeguard | How to verify |
|---|---|---|---|---|
| R1 | Track Player 4.1.2 fails to compile or run on RN 0.81 | Latest release; no direct report found; RN 0.81 broke Kotlin `currentActivity` property access in some libraries | Our grep: Track Player has no `currentActivity` use; ChottuLink and RevenueCat use `getCurrentActivity()` from Java, which still works. Spike will confirm. Fallback: patch, or replace Track Player (4 files plus the service) | Debug and release build on Pixel; Chambers playback; lock-screen controls |
| R2 | `expo-speech-recognition` 2.1.5 incompatible with SDK 54 | Newer versions exist (3.1.3, then 56+) | Spike on a throwaway branch. If it must change, re-create the privacy patch against the new version | Morning Return voice capture on Pixel and iPhone; `dictationLogging.test.ts`; logcat check that no phrase is logged |
| R3 | expo-video 3.x behaves differently in our focus-based attach/detach wrapper | Changelog: no breaking API changes for our usage; 3.0.12 fixes player re-assignment on Android and rapid source replacement on iOS | Keep `memorySafeVideo.test.tsx`; re-create the iOS patch | Frame-by-frame transitions: Arrive→Home, Home→Archives, Home→Garden on both platforms |
| R4 | Resource shrinking removes the notification sound files (`res/raw/lucidity_cue.wav`, `signal_bell.wav`, `signal_chimes.wav`, `signal_droplets.wav`) that are referenced by name at runtime | Files are in `res/raw`; the shrinker cannot see name-based references | Keep `enableShrinkResourcesInReleaseBuilds` off. Play's DEX metric does not need it. | Schedule a wake notification and a signal notification on an R8 build |
| R5 | R8 renames something found by reflection (RevenueCat, Sentry, Fresco, our Records) | Libraries ship consumer rules; RevenueCat keeps almost everything (64 of 2,292 classes renamed); our Records are kept | Device test matrix below before anything ships | Full matrix on the R8 build |
| R6 | OTA update delivers new JS to an old binary (or the reverse) | `expo-updates` is installed with an update URL and policy `appVersion`; the code never calls it, but `eas update` could be used | Bump the app version for the release; never publish an update for 3.1 from the branch | `eas update:list` before release |
| R7 | Reanimated 3.19.x with Expo 54's babel preset | Docs table says 3.19.x supports 0.81 on the old architecture | Single real use is `components/SuggestionCard.tsx`. Spike builds it. Fallback: rewrite that one component with React Native `Animated` and drop Reanimated entirely. | Open the card on both platforms |
| R8 | iOS: `expo-video` patch rebase, chottulink `arm64`-only build, Pods | Known build quirk already documented in this repo | Same flags as the existing recipe; Xcode 26 image in `eas.json` | Simulator build, then a physical iPhone |
| R9 | Metro 0.83 import semantics (`experimentalImportSupport` default on) can change circular-import behaviour | Changelog | Full Jest suite plus a launch/smoke on both platforms | Jest green, app opens, all main tabs open |
| R10 | API 36 ignores portrait lock on screens 600 dp or wider | Changelog and Play notice. Manifest locks `portrait`. | Decide after seeing a tablet or fold emulator. Not a crash risk; a layout risk. | Android tablet emulator pass |
| R11 | `FrescoModule.hasBeenInitialized()` in our memory-trim plugin changes in RN 0.81 | Not checked yet | Compile will fail loudly | Release build |

## 6. Device test matrix (run on every candidate build, both platforms where applicable)

Launch and onboarding · paywall loads offerings, sandbox purchase and restore · Sentry test event arrives (deobfuscated on the R8 build) · PostHog events arrive and contain no user content · Overnight Journey: start, voice lines, all signals, kill the app, Continue from Home · a Chamber via Track Player with lock-screen controls · wake and signal notifications with their sounds (Android) · Morning Return voice capture · Dream Log save, edit, export (print and share) · voice pack download and "33 of 33" · video backgrounds across Home, Archives, Garden, Chambers, Lucid Journeys · deep links (ChottuLink) · a full 7-hour overnight with the screen off.

## 7. Phases and gates

| Phase | Work | Gate to pass before moving on |
|---|---|---|
| 0. Safety net (today) | Tag `main` as `pre-sdk54`; branch `sdk-54`. Record baselines: Jest count, DEX size, a clean Pixel night. | Tag and branch exist; baselines written down |
| 1. Spike (time-boxed, 1–2 days, throwaway worktree) | `npx expo install expo@^54 --fix` with Sentry excluded; resolve R1, R2, R3, R7, R11 | A debug build opens on the simulator and the Pixel; unknowns in section 5 are answered |
| 2. SDK 54 proper | Section 3 changes; re-create `expo-video` patch; Jest and `tsc` green | Gate A: `expo-doctor` clean, `tsc` clean, Jest green, release builds on both platforms |
| 3. Device verification | Section 6 matrix on a Lab build; one full overnight on each platform | Gate B: matrix passes, no new Sentry errors, overnight completes |
| 4. R8 | Section 4 settings on top of the SDK 54 branch | Gate C: the same matrix passes on the R8 build; mapping uploaded; test crash readable |
| 5. Release | Bump version and build numbers; internal testing track, then closed testing, then staged production rollout | Crash-free rate and ANRs in Play and Sentry for the first 24 hours |

**Rollback:** every phase is its own commit range on a branch. `main` and the `pre-sdk54` tag are never touched until Gate C. After release, a bad build is rolled back by halting the staged rollout and shipping the previous release's code, which stays buildable from the tag.

## 7a. Baselines recorded before any change (2026-10-15, commit `af5f588`, tag `pre-sdk54`)

- `tsc --noEmit`: clean (exit 0).
- Full Jest suite: **74 suites, 619 tests, 6 snapshots**, all passing.
- Android DEX without R8 (Lab release APK): 5 files, about 46 MB. With R8 forced on in the trial (prod flavor): 3 files, about 19 MB. Mapping: 82% of classes and 68% of members renamed.
- Last verified nights: Pixel, two full 7.1 h nights with 0 underruns; iPhone 12 Pro, one full night, all 10 signals on schedule.

## 7b. Phase 1 spike results (2026-10-16, branch `sdk-54-spike`, commit `c0a6f9f`)

**Gate result: passed.** The SDK 54 dependency set builds on Android (Lab release, targetSdk 36), compiles every iOS pod, bundles the iOS JavaScript (10.1 MB Hermes bundle), and passes `tsc` and the full Jest suite (74 suites, 619 tests, same as baseline). The Lab build was installed on the Pixel as an update (data preserved): splash, Re-tune Intentions, Arrive and Home render correctly, and the Arrive→Home and Home→Archives transitions are clean frame by frame (no ghost, no blank frame, no oversized still).

### Unknowns from section 5, now answered
| Risk | Outcome |
|---|---|
| R1 Track Player on RN 0.81 | **Compile failed** on two `Arguments.fromBundle(Bundle?)` calls (RN 0.81 wants a non-null Bundle). Fixed null-safely inside our existing patch; compiles. **Runtime playback still to test on a device.** |
| R2 expo-speech-recognition 2.1.5 | Compiles; privacy patch applies; dictation-logging guard test passes. Runtime still to test. |
| R3 expo-video 3.x | Compiles; iOS patch re-created as `expo-video+3.0.16.patch`; video transitions verified on the Pixel. iOS transitions still to test. |
| R7 Reanimated 3.19.5 | Builds and loads. Logs a caught `NoSuchFieldException: mIsFinished` at startup (Reanimated reflects on a field RN 0.81 removed). Benign, but a sign of fragility; only `SuggestionCard.tsx` uses it, so removing Reanimated is a live option for Phase 2. |
| R11 Fresco memory-trim plugin | Prebuild applied it and it compiles on RN 0.81 |
| ChottuLink | Compiles on Android and iOS |

### New findings (add to the risk register)
| # | Finding | Fix |
|---|---|---|
| R12 | `fmt` (bundled with RN 0.81) fails to compile with the local Xcode 26.6 (`consteval` errors). The EAS images pin Xcode 26.0, but local builds fail. | Force `FMT_USE_CONSTEVAL 0` in the `fmt` header from the Podfile via a config plugin |
| R13 | `@react-native-community/slider` 5.x compiles its New Architecture view unconditionally, so it cannot build on the legacy architecture (iOS) | Stay on 4.5.6 and add it to `expo.install.exclude` (done in the spike) |
| R14 | Gradle runs out of Metaspace on SDK 54 with the generated 512 MB limit; this affects EAS cloud builds too | Raise to `-Xmx4096m -XX:MaxMetaspaceSize=1024m` through a config plugin (not a hand-edited generated file) |
| R15 | `metro.config.js` imported `@expo/metro-config` (no longer reachable) and `metro-config/src/defaults/exclusionList` (gone in Metro 0.83); `babel-preset-expo` was nested out of reach | Use a plain `blockList` array; remove the unused import; add `babel-preset-expo` as an explicit dev dependency (all done in the spike) |
| R16 | Expo's `expo install --fix` would also move `@types/react` and TypeScript, and needs them aligned or npm fails with ERESOLVE | Set `@types/react ~19.1.10` and `typescript ~5.9.2` |
| R17 | The Android APK grew from about 130 MB to about 156 MB (native libraries +17 MB across four ABIs, DEX +6 MB). Users download only their own architecture from Play. | Measure the AAB per-device size in Phase 2; R8 reclaims most of the DEX growth |

### Changes made in the spike, to be carried into Phase 2
13 files moved to `expo-file-system/legacy`; edge-to-edge plugin replaced by `androidNavigationBar.enforceContrast`; two `Alert.prompt` callback types annotated; `moti` removed; Reanimated pinned to ~3.19.5; Sentry, Reanimated and slider excluded from `expo install --fix`; Track Player and `expo-video` patches updated; `metro.config.js` and dev dependencies fixed as above.

### Still to do before Gate A
Config plugins for R12 and R14; iOS simulator or device run (the spike's `/tmp` location breaks Xcode's bundling step through a symlinked path, so the iOS app run must happen from the real repo folder); `expo-doctor`.

## 7c. Phase 2 results and Gate A (2026-10-16, branch `sdk-54`, commit `512b4e9`)

**Gate A: passed.**
- `tsc --noEmit`: clean.
- Full Jest: **75 suites, 625 tests, 6 snapshots**, all passing (baseline 74 / 619, plus the new plugin suite).
- `expo-doctor`: 4 of 18 checks fail, all four also fail on `main` (the fifth failure on `main`, "packages match the installed Expo SDK", is fixed by the upgrade). The four: a gitignore false alarm about the local module's `android/ios` folders (its 43 source files are tracked), an `app.config.js`/`app.json` notice, the deliberate `disableHierarchicalLookup` Metro setting, and React Native Directory metadata (see "Later work").
- Android Lab release builds from a clean `expo prebuild`, with no hand-edited files.
- iOS simulator build succeeds from the real folder (no `/tmp` symlink issue), including JS bundling and the `fmt` workaround; the app launches in the simulator and the intro video plays.
- New config plugins, both registered in `app.json` and unit-tested: `withGradleMemory` (JVM limits for Gradle, also protects EAS cloud builds) and `withFmtConstevalFix` (Podfile patch for newer Xcode).

**Runtime checks on SDK 54 so far (Pixel, Lab build):** screens and transitions, voice capture, accelerated overnight with signals, Chamber playback with lock screen and controls. Notification sound files confirmed packaged in the APK.

**Decisions made in Phase 2:** keep Reanimated 3.19.5 for now (it works; one caught startup warning); leave the app version unchanged until release prep, because the first release from `main` and this one cannot both be 3.2.

**Still before Gate B:** a full 7-hour overnight on each platform, iOS device run, purchases on the Play internal testing track, notification channel check once a notification is scheduled.

## 7d. Phase 4 results: R8 minification (2026-10-16, branch `sdk-54-r8`, commit `94dd82a`)

**Configuration:** `expo-build-properties` (1.0.10) in `app.json`: `enableMinifyInReleaseBuilds: true`, `enableShrinkResourcesInReleaseBuilds: false`. No extra keep rules were needed. Nothing is hand-edited in the generated `android/` folder.

**Measured (from R8's mapping file):**
| | Before (no R8) | With R8 |
|---|---|---|
| Classes renamed | about 3% (Play's figure) | **84.4%** (22,978 of 27,212) |
| Members renamed | n/a | **68.9%** (392,484 of 569,384) |
| Lab APK, all architectures | 156.7 MB | 134.9 MB |
| DEX code | 23.8 MB | 20.4 MB |
| Production bundle (AAB) | n/a | 94.0 MB |

The Play threshold is 25%. The production flavor produced identical figures to the Lab flavor. Warnings: 683 repeats of one benign stack-map note from RevenueCat's bundled Amazon appstore jar; no errors, no missing classes.

**Bundle checks:** the R8 mapping (64.2 MB) is embedded in the AAB at `BUNDLE-METADATA/com.android.tools.build.obfuscation/proguard.map` and is identical to the build's own mapping file, so Play can decode crashes. Native debug symbols and baseline profiles are also included.

**Runtime verification on a Pixel (Lab flavor with R8, installed over existing data):** launch and splash; Morning Return voice capture; Overnight Journey with the screen on and off, with signals and voice lines firing (the accelerated variant was not used); Chamber playback with the screen on and off, and lock-screen controls; navigation through Home, Archives, Garden, Settings and the Dream Journal. The whole-session log contained no `ClassNotFound`, `NoSuchMethod`, `NoSuchField`, `NoClassDefFound` or fatal errors from our process (the only matches were from other apps' processes and the pre-existing harmless Reanimated warning).

**Gate C status: mostly passed.** Remaining before calling R8 done:
- Confirm Sentry receives its own copy of the mapping on the first EAS production build (needs the auth token; skipped locally on purpose). Until then rely on Play's copy.
- A full 7-hour overnight on an R8 build (today's runs were short).
- Google's own DEX optimization figure, which only updates after an R8 build has been on a Play track for a few days.
- Per-device download size, which Play Console shows after upload.

## 7e. Full overnights on the SDK 54 builds (night of 2026-10-16 to 17)

| | iPhone 12 Pro (iOS 18.6.2), SDK 54 Lab | Pixel 8 Pro, SDK 54 + R8 Lab |
|---|---|---|
| Completed | 427 of 427 min, ended by the sleep timer | 427 of 427 min; sleep timer and foreground service stopped at +427.0 min |
| Recognition signals | 10 of 10, 0 ms drift (windows at 257, 342, 392 min) | 10 of 10, 0 ms drift (windows at 257, 342, 392 min) |
| Voice lines | 3 of 3 on time (17.4 s, 100.4 s, 335.0 s) | 3 of 3 on time |
| Audio underruns | not recorded on iOS | 0 |
| Interruptions, route changes, errors | none | none |

Both ran on the phone speaker, regular (not accelerated) Overnight Journey, screen locked, charging. The Pixel's recorded wall-clock end (580 min) is only when the app was opened in the morning and finalised the record; the audio stopped at 427 min.

**This closes the last runtime unknown on both platforms.** What remains before a release candidate is store-side: purchases on the Play internal track and TestFlight, the first EAS cloud builds with the config plugins, Sentry's copy of the R8 mapping, and Google's own DEX figure after an upload.

## 8. Later work (not part of this plan)
- Move to SDK 55+: the New Architecture is required, and `expo-av` is removed (migrate the 11 files that use it to `expo-audio` and `expo-video`).
- React Native Directory flags `react-native-track-player` as unsupported on the New Architecture. SDK 55+ requires the New Architecture, so Track Player needs a plan (fork, patch, or replace; it is used in 4 files plus the playback service). It also flags `react-native-render-html` as unmaintained; it has no imports in the app and can be removed.
- The next Play target level (expected API 37) is due in 2027; SDK 54 will not satisfy it.
- Optionally enable resource shrinking later with an explicit `keep.xml` for `res/raw`.

## 9. Audit pass (second check of this plan)

| Claim | How it was checked | Result |
|---|---|---|
| Update deadline Aug 31, 2026 with extension to Nov 1, 2026 | Google's target API page, fetched | Confirmed |
| SDK 54 targets API 36 on RN 0.81 | Expo SDK 54 changelog | Confirmed |
| Current stack: RN 0.79.6, API 35, AGP 8.8.2, legacy arch | `libs.versions.toml`, `gradle.properties`, `app.json` | Confirmed |
| 13 files import `expo-file-system` | Repo-wide search. My first pass only covered some folders and found 10; the full search found 13 (it adds `learn/` and the two tests) | Corrected to 13 |
| Reanimated 3.19.x supports RN 0.81 on Paper | Reanimated 3.x compatibility table | Confirmed |
| `enableMinifyInReleaseBuilds`, `enableShrinkResourcesInReleaseBuilds`, `extraProguardRules` exist in SDK 54 | `expo-build-properties` source at the sdk-54 branch | Confirmed |
| R8 builds and obfuscates well above 25% | Trial build, `mapping.txt` | Confirmed: 82% classes, 68% members |
| Default rules disable optimization | `configuration.txt` shows `-dontoptimize` | Confirmed |
| Our Records are protected | `expo-modules-core` consumer rules and the mapping file | Confirmed |
| MainApplication plugin anchors survive in SDK 54 | SDK 54 template source | Confirmed |
| expo-video 3.x iOS patch location unchanged | Upstream `VideoPlayer.swift` at sdk-54 | Confirmed (patch must be re-created) |
| Track Player, expo-speech-recognition, ChottuLink and Fresco API on RN 0.81 | **Not verifiable without building** | **Open: resolved by the Phase 1 spike** |
| Runtime behaviour of the R8 build (reflection, notification sounds) | **Needs a device** | **Open: Gate C** |
| Whether any Play listing text, store privacy disclosure or screenshot copy mentions things this changes | Not examined | Open |
