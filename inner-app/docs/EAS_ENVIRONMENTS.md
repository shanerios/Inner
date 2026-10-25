# EAS environments and build channels

How each EAS build profile maps to an EAS environment (which variables the build gets) and to an analytics
**build channel** (how its PostHog events and Sentry events are labelled). The channel says where a build came
from. `is_internal` is separate and says who is using it, so external beta testers can be measured as real users.

## Profile map

| Profile | Used for | EAS environment | Build channel (`EXPO_PUBLIC_INNER_CHANNEL`) | Counted in public metrics |
|---|---|---|---|---|
| `production` | Store release (App Store, Google Play production) | `production` | `production` | Yes |
| `preview` | Builds for external testers (TestFlight external, Play closed testing) | `production` | `beta` | Yes, shown separately by `build_channel` |
| `internal` | Team-only store tracks (TestFlight internal, Play internal) | `production` | `internal` | No |
| `apk` | Sideloaded production-ID APK for testing | `production` | `internal` | No |
| `lab` | Inner Lab (`com.getinner.app.proceduraldev`) | `preview` | `lab` | No |
| `development`, `development-client` | Dev clients | `development` | `dev` | No |

Local builds (`expo run:*`, Xcode, Gradle) are classified in code: any `__DEV__` build is `dev` even on the
production bundle ID, and the Lab bundle ID is always `lab`. A build with no channel is `production`.

The environments are the ones each profile already resolved to before this change; `eas.json` now states them
explicitly so they cannot drift. Store profiles keep the `production` environment because it holds the
RevenueCat, PostHog and Sentry values for the production bundle IDs.

## Variables you need to add in EAS (Lab analytics and crash reporting)

The Lab profile uses the **preview** environment, which today has only the RevenueCat keys. Add these three to
`preview` so EAS-built Lab builds send PostHog events (tagged `build_channel=lab`) and Sentry events (tagged
`environment=lab`). Use the same values as production; the PostHog key and Sentry DSN are public client values.

| Name | Value | Visibility |
|---|---|---|
| `EXPO_PUBLIC_POSTHOG_KEY` | the project key (`phc_…`), same as production | Plain text |
| `EXPO_PUBLIC_POSTHOG_HOST` | `https://us.i.posthog.com` | Plain text |
| `EXPO_PUBLIC_SENTRY_DSN` | the project DSN, same as production | Plain text |

Dashboard: expo.dev → project → Environment variables → environment **preview** → Create. Or the CLI, once per
variable (the value is prompted for if you leave `--value` off, which keeps it out of your shell history):

```bash
npx eas env:create preview --name EXPO_PUBLIC_POSTHOG_KEY --visibility plaintext
npx eas env:create preview --name EXPO_PUBLIC_POSTHOG_HOST --value https://us.i.posthog.com --visibility plaintext
npx eas env:create preview --name EXPO_PUBLIC_SENTRY_DSN --visibility plaintext
```

Optional, only if you build development clients on EAS and want them to report: add the same three to
`development`. Local Metro runs already read them from `.env`.

Notes:
- Lab builds skip the Sentry source-map upload (`SENTRY_DISABLE_AUTO_UPLOAD`), so Lab JavaScript stack traces
  arrive minified. Production symbolication is unaffected.
- `EXPO_PUBLIC_POSTHOG_KEY_LAB` is still supported if you later create a separate PostHog project for Lab.
- The channel is fixed when a build is made. Do not promote an `internal` or `preview` build to the production
  track; build it with the `production` profile instead, or it will be labelled `internal`/`beta`.

## Who is "internal"

`is_internal` is set per device with a 1.5 second long-press on the version line at the bottom of Settings
(it shows "· internal"). Do this on every device you and your team test with, including `preview` builds. External
beta testers are not marked, so they are counted as real users, and you can isolate them with
`build_channel = beta`.

## PostHog dashboard filter

Public dashboards exclude `build_channel` in (`lab`, `dev`, `internal`), `is_internal = true`, and the Lab bundle
namespace. Events that predate these properties have none of them set and are kept. To look at store-release users
only, add `build_channel = production`; to look at external beta testers only, use `build_channel = beta`.
