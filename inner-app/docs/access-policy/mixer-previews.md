# Mixer previews for premium worlds (internal)

Status: implemented on `access-policy-proposal`. Not released. Do not describe on the website until the app release ships.

## Behavior

- Ocean, Forest, Quiet, and Wind are unchanged.
- Temple, Abyssal Glass, Cosmic, and Fire have one shared 5-minute preview across Live Mix and the chamber mixer.
- Only audible time that the user selected in a mixer counts. Paused time, browsing, and timeline-driven stages do not count.
- "Temple resonance" (the Temple harmonic slider) counts as the Temple world.
- Full Experience members never consume preview time and never see the limit.
- When a world's time ends, only that world's layer fades out. Free layers and the chamber track keep playing.
- Membership bought during a preview stops charging and cancels the expiry. It does not fade anything.

## Storage

- Key: `inner.audio.premium-preview.v1`. Local to the device. Clearing app data or reinstalling resets the allowance. No server record exists.
- Unreadable or malformed usage is treated as used up, and it is not overwritten.
- A restart mid-preview charges the time since the open segment began, so a killed app cannot gain time.

## Verification

- Membership uses the existing tri-state check. `unknown` never claims non-membership. It offers a retry. If a preview minute remains, `unknown` still allows it.
- Membership is re-checked about every 30 seconds while a premium layer is audible.

## Exemptions

- Factory journeys, saved custom journeys, and their premium stages are not metered and not cut.
- Opening a mixer does not change the engine or charge time.
- Overnight, Journey Creator, Dream Log, and Morning Return are not touched by this change.

## Known limits

- Background expiry is best effort. Expiry is driven by a JavaScript timer and by reconciling on return to the foreground. If the OS suspends the JS runtime while a premium world is audible with the screen locked, the world can play past its allowance until the app returns to the foreground. A native scheduled fade would fix this. It is a substantial native change and was not made in this change.
- A world that a timeline sets, then is selected by the user in the mixer, is metered from that point.
- The selection rule relies on the engine config; if a native timeline changes a premium stage, the JavaScript config may briefly differ.

## Device checks before release

- Background and locked-screen expiry on iOS and Android.
- Purchase and restore during an active preview, with no fade.
- Restart mid-preview, and the allowance after app data is cleared.
- A factory journey with a premium stage, opened in the mixer mid-stage.
- Offline behavior: the retry message, and that cached membership is used.
