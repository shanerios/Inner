# Overnight preparation voice — recording script (draft)

Three spoken lines in the 7-minute waking preparation of an Overnight Journey. Each of the 10 recognition signs gets its own three full-sentence clips, plus three generic clips for nights with no sign. 33 files in all.

The wording below is a **proposal**. It deliberately differs from today's on-screen text, which inserts the sign as-is and reads awkwardly for some signs ("noticing chased", "encounter lost"). Once recorded, the audio is permanent, so settle the wording first. After you approve it, the on-screen text will be changed to match so the screen and the voice say the same thing.

## When each line plays

| Slot | Plays at | Role |
|---|---|---|
| 1 | about 20 s | Right after the first tone ends |
| 2 | about 105 s | During rehearsal, after the second tone |
| 3 | about 335 s | At release, as the practice ends |

## The lines

- Line 1: "Picture noticing **{phrase}** inside a dream. Let the tone sharpen your attention."
- Line 2: "When you notice **{phrase}**, pause and ask: could this be a dream?"
- Line 3: "If you hear the tone, or notice **{phrase}**, remember: you may be dreaming."

### Phrase for each sign

| Sign | Phrase | File slug |
|---|---|---|
| Flying | yourself flying | `flying` |
| Falling | yourself falling | `falling` |
| Water | water | `water` |
| Chased | being chased | `chased` |
| Lost | being lost | `lost` |
| Mirror | a mirror | `mirror` |
| Teeth | your teeth | `teeth` |
| Familiar Person | a familiar person | `familiar-person` |
| Unknown Place | a place you don't know | `unknown-place` |
| Shadow Presence | a shadowy presence | `shadow-presence` |

### Generic lines (no sign selected)

These are today's authored prompts, unchanged.

| File | Line |
|---|---|
| `voice-prep-generic-1.wav` | "There it is. Picture yourself hearing this exact sound inside a dream." |
| `voice-prep-generic-2.wav` | "Each time it plays, perform a real reality check — look at your hands, question your surroundings." |
| `voice-prep-generic-3.wav` | "You may hear this same tone again later tonight. If you do, remember: you are dreaming." |

### Full list of file names

For each slug in the table above, three files:

```
voice-prep-{slug}-1.wav
voice-prep-{slug}-2.wav
voice-prep-{slug}-3.wav
```

For example, `voice-prep-chased-1.wav` is "Picture noticing being chased inside a dream. Let the tone sharpen your attention."

Thirty sign files plus three generic files make 33.

## Audio spec

- WAV, 16-bit PCM, **mono**. The engine places it centered. It only reads WAV.
- Sample rate: 48 kHz preferred. 44.1 kHz also works; the engine resamples.
- Peak at or below −3 dBFS.
- Normalised to the same integrated loudness across all 33 clips (suggest −23 LUFS). Level differences between clips would be audible as the lines play one after another. Fine tuning happens afterward by ear, with a per-line trim in the app.
- About 0.5 s of silence at the head and 0.5 s at the tail, so the clip does not start or end abruptly.
- Bake any room or reverb into the file. The engine adds none to voice.
- Each clip stands alone. They never play back to back.
- Calm, unhurried delivery. No breath or lip noise left in the head or tail.

## Before recording

- Confirm or edit the phrase for each sign. "Teeth" in particular could be "your teeth", "losing your teeth", or just "teeth".
- Confirm line 3. "If you hear the tone, or notice …" replaces today's "If the tone or … appears tonight", which breaks for phrases like "yourself flying".

## Where the files go

Upload all 33 files to the public Backblaze bucket, in this folder:

```
https://f005.backblazeb2.com/file/inner-audio/OvernightVoice/
```

For example, `https://f005.backblazeb2.com/file/inner-audio/OvernightVoice/voice-prep-chased-1.wav`. The app builds each URL from the file name, so the names above must match exactly.

## The manifest

Next to the clips, upload one small file named `manifest.json`. It tells the app which clips exist and which revision of each is current:

```json
{
  "version": 1,
  "clips": {
    "voice-prep-generic-1": 1,
    "voice-prep-generic-2": 1,
    "voice-prep-generic-3": 1,
    "voice-prep-flying-1": 1,
    "voice-prep-flying-2": 1,
    "voice-prep-flying-3": 1,
    "voice-prep-falling-1": 1,
    "voice-prep-falling-2": 1,
    "voice-prep-falling-3": 1
  }
}
```

- **You do not have to record everything.** List only the clips you have uploaded. A sign with no clips uses the generic voice lines, and the app never asks for files that are not listed, so a partial pack is fine. Add a sign later by uploading its three files and adding them to the manifest.
- **Re-mixed a clip?** Re-upload it under the same name and raise its number in the manifest (1 to 2). Phones that already have revision 1 will fetch revision 2 and delete the old one. Without that, a phone keeps the old recording.
- A sign needs all three of its clips listed before the app will use its own lines. Otherwise it falls back to generic.
- Without a `manifest.json`, the app downloads nothing and the preparation stays as text.

## How the app fetches them

- On the first visit to the Overnight setup with voice guidance on, the app downloads **every clip the manifest lists**, once, in the background, and keeps them on the device, so they work offline. It checks the manifest on later visits and fetches only what is new or revised.
- It downloads everything regardless of the person's sign, and never requests a clip when a night starts. This is on purpose: a request for one sign's file would tell the file host which dream sign someone is working with.
- So the total size of the clips matters, because every user downloads all of them. Your first nine clips (7 to 11 seconds each, 44.1 kHz mono) average 0.7 MB, which puts a full set of 33 at about 23 MB. Exporting at 24 kHz mono would bring that to about 12 MB. Speech holds up well at that rate, and the engine resamples to the device rate.
- If a sign's clips are not yet on the device, the night uses the generic voice lines. If nothing is downloaded yet, it uses the on-screen text. A night never waits for a download.

## Checking levels without guessing

You do not have to judge loudness by ear alone. Point the measuring tool at the folder:

```
npm run voice:measure -- "path/to/your/voice-prep folder"
```

For each clip it prints how loud the clip will be inside the app (the same measurement used to set the recognition signals), how far it is from the target, and the trim that would close the gap. It also prints the snippet to paste into `VOICE_TRIM_DB` in `core/audio/voiceGuidance.ts`.

- The recognition signals sit at -21.5 LU inside the app. Speech reads best a little under that, so the default target is -24 LU. Change it with `--target -23`.
- Clips that match each other matter more than hitting the target exactly, because trims can fix the average but not a clip that is louder than its neighbours.
- It reads 16-bit PCM WAV, mono or stereo. If a file was exported in another format it says so.
- Padding at the start and end is not needed. The engine waits 0.4 seconds before the first word, to let the soundscape ease down, and fades each clip in and out itself.
- Your ears still decide. Use the numbers to get all clips close, then audition on the phone and adjust the trims if one feels off.
