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
 * The drone greets the listener alone. Hesitant footsteps follow, then the drone builds and the brown bed and the
 * binaural field fade in. Four called Aum chants sound over it, and footsteps leave as it ends.
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

const world = (
  descent: boolean,
  beatHz: number,
  target: Pick<ProceduralAudioPatch, 'environmentGain' | 'environmentIntensity' | 'identityPresence' | 'masterGain'>,
  options: { quiet?: boolean } = {},
): ProceduralAudioPatch => ({
  environment: 'sanctum',
  identityDensity: 1,
  // Each Aum is its own appearance: a different pitch of the group, a drift across the ears, some echo.
  identityVariety: 0.6,
  toneGain: 0,
  templeGain: 0,
  noiseColor: BED.noiseColor,
  noiseGain: options.quiet ? 0 : BED.noiseGain,
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
  spatialMode: 'still',
  spatialDepth: 0,
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
    fadeInMs: 3 * SECOND,
    protocolVersion: 2,
    stages: [
      // The drone greets the listener alone, fading in over ten seconds. Footsteps then come in, hesitantly, around
      // twelve seconds. The bed and the binaural field have not begun.
      stage('greet', 'Arrive', 25 * SECOND, 10 * SECOND, world(false, BEAT.entry, {
        environmentGain: 0.4, environmentIntensity: 0.4, identityPresence: 0.7, masterGain: 0.7,
      }, { quiet: true }), [
        { id: 'induction-steps-in', atMs: 12 * SECOND, type: 'footsteps', direction: 'approach' },
      ]),
      // After the footsteps the drone builds fuller, and the brown bed and the binaural field fade in over ten seconds.
      stage('bed', 'The Floor', 20 * SECOND, 10 * SECOND, world(false, BEAT.prepEnd, {
        environmentGain: 0.46, environmentIntensity: 0.5, identityPresence: 0.9, masterGain: 0.7,
      })),
      // The chorus keeps building, and the first Aum is chanted over it.
      stage('bloom', 'The Chorus', 30 * SECOND, 30 * SECOND, world(false, BEAT.prepEnd, {
        environmentGain: 0.5, environmentIntensity: 0.55, identityPresence: 1.1, masterGain: 0.7,
      }), [
        { id: 'induction-aum-1', atMs: 17 * SECOND, type: 'aum' },
      ]),
      // Nothing to do but listen to where the sound sits.
      stage('open', 'Open', 15 * SECOND, 5 * SECOND, world(false, BEAT.prepEnd, {
        environmentGain: 0.5, environmentIntensity: 0.55, identityPresence: 1.1, masterGain: 0.7,
      })),
      // Around 1:30 the Bell is introduced, once, inside the hall.
      stage('introduce', 'The Sound', 40 * SECOND, 5 * SECOND, world(false, BEAT.descent, {
        environmentGain: 0.5, environmentIntensity: 0.55, identityPresence: 1.1, masterGain: 0.7,
      }), [
        { id: 'induction-bell-1', atMs: 3 * SECOND, type: 'cue' },
      ]),
      // The long middle: the chorus at its fullest, with two Aum chants and almost no words.
      stage('fullest', 'Deepen', 120 * SECOND, 40 * SECOND, world(true, BEAT.descent, {
        environmentGain: 0.55, environmentIntensity: 0.6, identityPresence: 1.6, masterGain: 0.68,
      }), [
        { id: 'induction-aum-2', atMs: 20 * SECOND, type: 'aum' },
        { id: 'induction-aum-3', atMs: 70 * SECOND, type: 'aum' },
      ]),
      // The Bell returns, and is named.
      stage('return', 'It Returns', 35 * SECOND, 10 * SECOND, world(true, BEAT.descent, {
        environmentGain: 0.52, environmentIntensity: 0.55, identityPresence: 1.3, masterGain: 0.68,
      }), [
        { id: 'induction-bell-2', atMs: 6 * SECOND, type: 'cue' },
      ]),
      // The chorus falls away and the last Aum is chanted into the empty hall.
      stage('hall', 'The Hall', 45 * SECOND, 35 * SECOND, world(false, BEAT.prepEnd, {
        environmentGain: 0.5, environmentIntensity: 0.45, identityPresence: 0.12, masterGain: 0.62,
      }), [
        { id: 'induction-aum-4', atMs: 10 * SECOND, type: 'aum' },
      ]),
      // Footsteps again, this time leaving.
      stage('leave', 'Leave', 30 * SECOND, 5 * SECOND, world(false, BEAT.prepEnd, {
        environmentGain: 0.4, environmentIntensity: 0.4, identityPresence: 0.12, masterGain: 0.55,
      }), [
        { id: 'induction-steps-out', atMs: 4 * SECOND, type: 'footsteps', direction: 'recede' },
      ]),
    ],
    guidance: [
      { id: 'induction-headphones', atMs: 0, heading: 'Before you begin', prompt: 'Put on headphones, and find somewhere you can close your eyes.' },
      { id: 'induction-belief', atMs: 21 * SECOND, heading: 'The Induction', prompt: 'Sound can guide the mind into different kinds of awareness. With practice, one of them can be lucidity.' },
      { id: 'induction-chorus', atMs: 47 * SECOND, heading: 'The hall', prompt: 'Voices rise around you. There is nothing to do yet.' },
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
