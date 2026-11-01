import { WORLD_PROFILES } from './worldProfiles';
import { INDUCTION_VOICE_CLIP_IDS } from './inductionVoiceIds';
import type { FactoryAudioJourney } from './factoryJourneys';
import type { AudioJourneyStage, ProceduralAudioPatch } from './types';

/**
 * The Induction: a free, six-minute first experience of Inner, set in the Sanctum. It is deliberately not part
 * of FACTORY_AUDIO_JOURNEYS, so no journey list, mixer or recommendation ever offers it; it is started by name.
 *
 * The arc teaches one skill, the one Inner's night work rests on: a sound is introduced, noticed, and later
 * returns. The returning sound is the Bell, fixed for this journey so every listener learns the same one.
 *
 * The drone greets the listener alone, rising from silence over the first twenty-five seconds. Hesitant footsteps
 * follow, then the brown bed and the binaural field fade in as the drone builds. Four called Aum chants sound over it (an approach, two plain, and a retreat), and footsteps leave as it ends.
 *
 * The voice speaks five times and the long middle is left to the sound: the opening, in two clips, once the footsteps
 * have finished; one line just before the Bell is introduced and one just after it returns, which say what the Bell is
 * for; and a closing, before the footsteps leave. The captions on screen say the same words at the same
 * moments, so a listener without sound, or whose voice could not load, still reads them.
 */
export const INDUCTION_JOURNEY_ID = 'the-induction';

/** The sound that is introduced and returns. Fixed, so the Induction never depends on the listener's own choice. */
export const INDUCTION_SIGNAL_ID = 'bell';

const SANCTUM = WORLD_PROFILES.sanctum;
const BREATH = SANCTUM.binaural.breath;
const BINAURAL_SCALE = SANCTUM.bed.binauralGainScale * 10 ** ((SANCTUM.binaural.trimDb + SANCTUM.binaural.levelDb) / 20);

/**
 * The Sanctum's own bed, as it would reach a preparation stage designed on pink noise at 0.14. Read straight from the
 * world's profile so every field is known to be there.
 */
const BED = {
  noiseColor: SANCTUM.bed.noiseColor,
  noiseGain: 0.14 * SANCTUM.bed.noiseGainScale,
  noiseHighCutHz: SANCTUM.bed.noiseHighCutHz,
  noiseWidth: SANCTUM.bed.noiseWidth,
  noiseDriftDb: SANCTUM.bed.noiseDriftDb,
  noiseDriftSeconds: SANCTUM.bed.noiseDriftSeconds,
} as const;

type WorldOptions = {
  /** No bed and no binaural field: the drone and the hall only. */
  quiet?: boolean;
  /** How heavy the brown bed is, as a multiple of the Sanctum's own level. */
  noiseScale?: number;
  /** How strongly the bed is carried by the overhead pass: sweeping across the head, swelling and brightening as it crosses. */
  swing?: number;
};

/** A pass every twenty seconds. Each takes four and a half seconds to cross, so it is quick but plainly heard. */
const SWING_CYCLES_PER_MINUTE = 3;

const world = (
  descent: boolean,
  beatHz: number,
  target: Pick<ProceduralAudioPatch, 'environmentGain' | 'environmentIntensity' | 'identityPresence' | 'masterGain'>,
  options: WorldOptions = {},
): ProceduralAudioPatch => ({
  environment: 'sanctum',
  identityDensity: 1,
  // Each Aum is called by hand with its own shape (see the aum events), so nothing about it is left to chance.
  identityVariety: 0,
  toneGain: 0,
  templeGain: 0,
  noiseColor: BED.noiseColor,
  noiseGain: options.quiet ? 0 : BED.noiseGain * (options.noiseScale ?? 1),
  noiseHighCutHz: BED.noiseHighCutHz,
  noiseWidth: BED.noiseWidth,
  noiseDriftDb: BED.noiseDriftDb,
  noiseDriftSeconds: BED.noiseDriftSeconds,
  binauralCarrierHz: SANCTUM.binaural.carrierHz,
  binauralDeltaHz: beatHz,
  binauralGain: options.quiet ? 0 : 0.2 * BINAURAL_SCALE,
  binauralBreathDb: descent ? BREATH.depthDb.descent : BREATH.depthDb.preparation,
  binauralBreathInSeconds: BREATH.inhaleSeconds,
  binauralBreathOutSeconds: BREATH.exhaleSeconds,
  binauralBreathVariation: BREATH.variation,
  spatialMode: 'overhead',
  spatialTarget: 'noise',
  spatialDepth: options.swing ?? 0,
  spatialRate: SWING_CYCLES_PER_MINUTE,
  ...target,
});

const stage = (
  id: string,
  label: string,
  durationMs: number,
  transitionMs: number,
  target: ProceduralAudioPatch,
  spatialEvents: AudioJourneyStage['spatialEvents'] = [],
): AudioJourneyStage => ({ id, label, durationMs, transitionMs, target, spatialEvents });

const SECOND = 1_000;

/** The Bell is much lower here than in a night: a sound to notice, not one that startles. About -10 dB. */
const BELL_GAIN_SCALE = 0.3;
const BEAT = SANCTUM.binaural.beatHz;

export const INDUCTION_JOURNEY: FactoryAudioJourney = {
  id: INDUCTION_JOURNEY_ID,
  title: 'The Induction',
  subtitle: 'Your first experience of Inner',
  durationLabel: '6 min · Introduction',
  summary: 'Six minutes in a vast resonant hall. Footsteps bring you in, a single sound is introduced, you learn to notice it, and it returns. Best with headphones.',
  fixedRecognitionSignalId: INDUCTION_SIGNAL_ID,
  timeline: {
    id: INDUCTION_JOURNEY_ID,
    title: 'The Induction',
    seed: 7_340_033,
    fadeInMs: 2 * SECOND,
    protocolVersion: 3,
    stages: [
      // A moment of true silence, so nothing of the engine's default start state (it includes a 528 Hz carrier tone) is
      // ever heard; the drone then rises out of it.
      stage('hush', 'Hush', 1 * SECOND, 0, world(false, BEAT.entry, {
        environmentGain: 0, environmentIntensity: 0.4, identityPresence: 0.9, masterGain: 0.7,
      }, { quiet: true })),
      // The drone greets the listener alone, rising from nothing to full over the next twenty-four seconds. No bed, no
      // binaural, no chimes or bells.
      stage('greet', 'Arrive', 24 * SECOND, 24 * SECOND, world(false, BEAT.entry, {
        environmentGain: 0.44, environmentIntensity: 0.4, identityPresence: 0.9, masterGain: 0.7,
      }, { quiet: true })),
      // The drone is at full volume. Hesitant footsteps come in at 26 seconds.
      stage('steps', 'Steps', 15 * SECOND, 0, world(false, BEAT.entry, {
        environmentGain: 0.44, environmentIntensity: 0.4, identityPresence: 0.9, masterGain: 0.7,
      }, { quiet: true }), [
        { id: 'induction-steps-in', atMs: 1 * SECOND, type: 'footsteps', direction: 'approach' },
      ]),
      // After the footsteps, at 40 seconds, the brown bed and the binaural field fade in together over twelve seconds,
      // the drone builds a little fuller, and the bed begins to be carried by a massive body passing overhead.
      // The opening is spoken over it: the long part at 0:41 (about nineteen seconds), the short one at 1:02, so the
      // first Aum at 1:10 meets silence.
      stage('bed', 'The Floor', 25 * SECOND, 12 * SECOND, world(false, BEAT.prepEnd, {
        environmentGain: 0.48, environmentIntensity: 0.5, identityPresence: 1, masterGain: 0.7,
      }, { noiseScale: 1.6, swing: 0.8 }), [
        { id: 'induction-voice-open-1', atMs: 1 * SECOND, type: 'voice', clipId: INDUCTION_VOICE_CLIP_IDS.open1 },
        { id: 'induction-voice-open-2', atMs: 22 * SECOND, type: 'voice', clipId: INDUCTION_VOICE_CLIP_IDS.open2 },
      ]),
      // The chorus keeps building and the first Aum is chanted over it.
      stage('bloom', 'The Chorus', 25 * SECOND, 15 * SECOND, world(false, BEAT.prepEnd, {
        environmentGain: 0.5, environmentIntensity: 0.55, identityPresence: 1.1, masterGain: 0.7,
      }, { noiseScale: 2, swing: 0.85 }), [
        { id: 'induction-aum-1', atMs: 5 * SECOND, type: 'aum', direction: 'approach' },
        // Once the first Aum has settled, a line that says what the Bell is for, ending about three seconds before it.
        { id: 'induction-voice-cue-1', atMs: 18 * SECOND, type: 'voice', clipId: INDUCTION_VOICE_CLIP_IDS.cue1 },
      ]),
      // Around 1:30 the Bell is introduced, once, inside the hall. It is low: a thing to notice, not to be startled by.
      stage('introduce', 'The Sound', 40 * SECOND, 5 * SECOND, world(false, BEAT.descent, {
        environmentGain: 0.5, environmentIntensity: 0.55, identityPresence: 1.1, masterGain: 0.7,
      }, { noiseScale: 2, swing: 0.85 }), [
        { id: 'induction-bell-1', atMs: 3 * SECOND, type: 'cue', signalGainScale: BELL_GAIN_SCALE },
      ]),
      // The long middle: the drone and the passing bed at their heaviest, two Aum chants, almost no words.
      stage('fullest', 'Deepen', 120 * SECOND, 40 * SECOND, world(true, BEAT.descent, {
        environmentGain: 0.55, environmentIntensity: 0.6, identityPresence: 1.6, masterGain: 0.68,
      }, { noiseScale: 3, swing: 0.85 }), [
        { id: 'induction-aum-2', atMs: 20 * SECOND, type: 'aum', direction: 'still' },
        { id: 'induction-aum-3', atMs: 70 * SECOND, type: 'aum', direction: 'still' },
      ]),
      // The Bell returns, and is named.
      stage('return', 'It Returns', 35 * SECOND, 10 * SECOND, world(true, BEAT.descent, {
        environmentGain: 0.52, environmentIntensity: 0.55, identityPresence: 1.3, masterGain: 0.68,
      }, { noiseScale: 2.5, swing: 0.85 }), [
        { id: 'induction-bell-2', atMs: 6 * SECOND, type: 'cue', signalGainScale: BELL_GAIN_SCALE },
        // As the Bell finishes ringing (about 3.5 seconds), a line that says what its return means. It is heard about two
        // seconds after the ring has gone.
        { id: 'induction-voice-cue-2', atMs: 11 * SECOND, type: 'voice', clipId: INDUCTION_VOICE_CLIP_IDS.cue2 },
      ]),
      // The drone falls away, the passes cease, and the last Aum is chanted into the hall.
      stage('hall', 'The Hall', 45 * SECOND, 35 * SECOND, world(false, BEAT.prepEnd, {
        environmentGain: 0.5, environmentIntensity: 0.45, identityPresence: 0.12, masterGain: 0.62,
      }, { noiseScale: 1, swing: 0 }), [
        { id: 'induction-aum-4', atMs: 10 * SECOND, type: 'aum', direction: 'retreat' },
        // The closing, once the last Aum has settled, ending about ten seconds before the footsteps leave.
        { id: 'induction-voice-close', atMs: 27 * SECOND, type: 'voice', clipId: INDUCTION_VOICE_CLIP_IDS.close },
      ]),
      // Footsteps again, this time leaving.
      stage('leave', 'Leave', 30 * SECOND, 5 * SECOND, world(false, BEAT.prepEnd, {
        environmentGain: 0.4, environmentIntensity: 0.4, identityPresence: 0.12, masterGain: 0.55,
      }, { noiseScale: 0.6, swing: 0 }), [
        { id: 'induction-steps-out', atMs: 4 * SECOND, type: 'footsteps', direction: 'recede' },
      ]),
    ],
    guidance: [
      { id: 'induction-headphones', atMs: 0, heading: 'Before you begin', prompt: 'Put on headphones, and find somewhere you can close your eyes.' },
      { id: 'induction-open-1', atMs: 41 * SECOND, heading: 'The Induction', prompt: 'You’ve entered a space between waking and sleep. Where sound becomes more than something you hear. It becomes a guide through different states of awareness and depths of focus, towards doors like lucid dreaming and beyond the body.' },
      { id: 'induction-open-2', atMs: 62 * SECOND, heading: 'The Induction', prompt: 'Awareness is the threshold. Practice is the unveiling.' },
      { id: 'induction-listen', atMs: 72 * SECOND, heading: 'Listen', prompt: 'Just listen.' },
      { id: 'induction-cue-1', atMs: 83 * SECOND, heading: 'The Induction', prompt: 'Audible cues can guide the sleeping mind if you learn to notice them.' },
      { id: 'induction-listen-2', atMs: 96 * SECOND, heading: 'Listen', prompt: 'Just listen.' },
      { id: 'induction-cue-2', atMs: 261 * SECOND, heading: 'The Induction', prompt: 'The same cue can wake you to where you are while the body remains asleep.' },
      { id: 'induction-listen-3', atMs: 276 * SECOND, heading: 'Listen', prompt: 'Just listen.' },
      { id: 'induction-close', atMs: 312 * SECOND, heading: 'The Induction', prompt: 'You’ve stood at the threshold. And beyond this hall lie other states to unveil further. It begins when you choose to return.' },
    ],
  },
};

/** Total length in milliseconds, for tests and the Home card. */
export const INDUCTION_DURATION_MS = INDUCTION_JOURNEY.timeline.stages.reduce((sum, item) => sum + item.durationMs, 0);
