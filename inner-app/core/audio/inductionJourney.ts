import { noiseForWorld, WORLD_PROFILES } from './worldProfiles';
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
 * follow, then the brown bed and the binaural field fade in as the drone builds. Four called Aum chants sound over it, and footsteps leave as it ends.
 *
 * The guidance lines below are placeholders for the recorded voice. They carry the same timing, so recording
 * them later changes no timeline.
 */
export const INDUCTION_JOURNEY_ID = 'the-induction';

/** The sound that is introduced and returns. Fixed, so the Induction never depends on the listener's own choice. */
export const INDUCTION_SIGNAL_ID = 'bell';

const SANCTUM = WORLD_PROFILES.sanctum;
const BREATH = SANCTUM.binaural.breath;
const BINAURAL_SCALE = SANCTUM.bed.binauralGainScale * 10 ** ((SANCTUM.binaural.trimDb + SANCTUM.binaural.levelDb) / 20);

/** The Sanctum's own bed, as it would reach a preparation stage designed on pink noise at 0.14. */
const BED = noiseForWorld('sanctum', { noiseColor: 'pink', noiseGain: 0.14 });

type WorldOptions = {
  /** No bed and no binaural field: the drone and the hall only. */
  quiet?: boolean;
  /** How heavy the brown bed is, as a multiple of the Sanctum's own level. */
  noiseScale?: number;
  /** How far the bed swings from ear to ear, like a very slow, very heavy pendulum. 0 holds it still. */
  swing?: number;
};

/** One full swing of the pendulum takes about fifteen seconds. */
const SWING_CYCLES_PER_MINUTE = 4;

const world = (
  descent: boolean,
  beatHz: number,
  target: Pick<ProceduralAudioPatch, 'environmentGain' | 'environmentIntensity' | 'identityPresence' | 'masterGain'>,
  options: WorldOptions = {},
): ProceduralAudioPatch => ({
  environment: 'sanctum',
  identityDensity: 1,
  // Each Aum is its own appearance: a different pitch of the group, a drift across the ears, some echo.
  identityVariety: 0.6,
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
  spatialMode: 'pendulum',
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
      // the drone builds a little fuller, and the bed begins to swing from ear to ear like a massive pendulum.
      stage('bed', 'The Floor', 25 * SECOND, 12 * SECOND, world(false, BEAT.prepEnd, {
        environmentGain: 0.48, environmentIntensity: 0.5, identityPresence: 1, masterGain: 0.7,
      }, { noiseScale: 1.6, swing: 0.8 })),
      // The chorus keeps building and the first Aum is chanted over it.
      stage('bloom', 'The Chorus', 25 * SECOND, 15 * SECOND, world(false, BEAT.prepEnd, {
        environmentGain: 0.5, environmentIntensity: 0.55, identityPresence: 1.1, masterGain: 0.7,
      }, { noiseScale: 2, swing: 0.85 }), [
        { id: 'induction-aum-1', atMs: 5 * SECOND, type: 'aum' },
      ]),
      // Around 1:30 the Bell is introduced, once, inside the hall. It is low: a thing to notice, not to be startled by.
      stage('introduce', 'The Sound', 40 * SECOND, 5 * SECOND, world(false, BEAT.descent, {
        environmentGain: 0.5, environmentIntensity: 0.55, identityPresence: 1.1, masterGain: 0.7,
      }, { noiseScale: 2, swing: 0.85 }), [
        { id: 'induction-bell-1', atMs: 3 * SECOND, type: 'cue', signalGainScale: BELL_GAIN_SCALE },
      ]),
      // The long middle: the drone and the swinging bed at their heaviest, two Aum chants, almost no words.
      stage('fullest', 'Deepen', 120 * SECOND, 40 * SECOND, world(true, BEAT.descent, {
        environmentGain: 0.55, environmentIntensity: 0.6, identityPresence: 1.6, masterGain: 0.68,
      }, { noiseScale: 3, swing: 0.85 }), [
        { id: 'induction-aum-2', atMs: 20 * SECOND, type: 'aum' },
        { id: 'induction-aum-3', atMs: 70 * SECOND, type: 'aum' },
      ]),
      // The Bell returns, and is named.
      stage('return', 'It Returns', 35 * SECOND, 10 * SECOND, world(true, BEAT.descent, {
        environmentGain: 0.52, environmentIntensity: 0.55, identityPresence: 1.3, masterGain: 0.68,
      }, { noiseScale: 2.5, swing: 0.85 }), [
        { id: 'induction-bell-2', atMs: 6 * SECOND, type: 'cue', signalGainScale: BELL_GAIN_SCALE },
      ]),
      // The drone falls away, the pendulum comes to rest, and the last Aum is chanted into the hall.
      stage('hall', 'The Hall', 45 * SECOND, 35 * SECOND, world(false, BEAT.prepEnd, {
        environmentGain: 0.5, environmentIntensity: 0.45, identityPresence: 0.12, masterGain: 0.62,
      }, { noiseScale: 1, swing: 0 }), [
        { id: 'induction-aum-4', atMs: 10 * SECOND, type: 'aum' },
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
      { id: 'induction-belief', atMs: 42 * SECOND, heading: 'The Induction', prompt: 'Sound can guide the mind into different kinds of awareness. With practice, one of them can be lucidity.' },
      { id: 'induction-chorus', atMs: 62 * SECOND, heading: 'The hall', prompt: 'Stay with the sound. There is nothing to do yet.' },
      { id: 'induction-listen', atMs: 76 * SECOND, heading: 'Listen', prompt: 'Notice where the sound sits. Is it close, or far away? Let it fill the space.' },
      { id: 'induction-sound', atMs: 84 * SECOND, heading: 'One sound', prompt: 'A single sound will come. Remember how it feels.' },
      { id: 'induction-deepen', atMs: 140 * SECOND, heading: 'Deepen', prompt: 'Let the hall hold you. Keep only a little attention on the sound.' },
      { id: 'induction-return', atMs: 256 * SECOND, heading: 'It returns', prompt: 'There it is again. Noticing it is the skill.' },
      { id: 'induction-hall', atMs: 288 * SECOND, heading: 'The hall', prompt: 'The voices fall away. The hall still holds the sound.' },
      { id: 'induction-leave', atMs: 336 * SECOND, heading: 'Surface', prompt: 'Come back slowly. What you just did is what Inner trains.' },
    ],
  },
};

/** Total length in milliseconds, for tests and the Home card. */
export const INDUCTION_DURATION_MS = INDUCTION_JOURNEY.timeline.stages.reduce((sum, item) => sum + item.durationMs, 0);
