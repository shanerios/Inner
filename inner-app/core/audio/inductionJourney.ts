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
): ProceduralAudioPatch => ({
  environment: 'sanctum',
  identityDensity: 1,
  identityVariety: 0,
  toneGain: 0,
  templeGain: 0,
  noiseColor: BED.noiseColor,
  noiseGain: BED.noiseGain,
  noiseHighCutHz: BED.noiseHighCutHz,
  noiseWidth: BED.noiseWidth,
  noiseDriftDb: BED.noiseDriftDb,
  noiseDriftSeconds: BED.noiseDriftSeconds,
  binauralCarrierHz: SANCTUM.binaural.carrierHz,
  binauralDeltaHz: beatHz,
  binauralGain: 0.2 * BINAURAL_SCALE,
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
  summary: 'Six minutes in a vast resonant hall. A single sound is introduced, you learn to notice it, and it returns. Best with headphones.',
  fixedRecognitionSignalId: INDUCTION_SIGNAL_ID,
  timeline: {
    id: INDUCTION_JOURNEY_ID,
    title: 'The Induction',
    seed: 7_340_033,
    fadeInMs: 5 * SECOND,
    protocolVersion: 1,
    stages: [
      // The hall appears and the chorus has not begun: only stone air, breath and the odd drop.
      stage('arrive', 'Arrive', 50 * SECOND, 20 * SECOND, world(false, BEAT.entry, {
        environmentGain: 0.4, environmentIntensity: 0.4, identityPresence: 0, masterGain: 0.7,
      })),
      // The chorus blooms in over about six seconds and the hall opens.
      stage('threshold', 'Threshold', 40 * SECOND, 12 * SECOND, world(false, BEAT.prepEnd, {
        environmentGain: 0.46, environmentIntensity: 0.5, identityPresence: 0.5, masterGain: 0.7,
      })),
      // Full chorus. Nothing to do but listen to where the sound sits.
      stage('open', 'Open', 60 * SECOND, 25 * SECOND, world(false, BEAT.prepEnd, {
        environmentGain: 0.5, environmentIntensity: 0.55, identityPresence: 1, masterGain: 0.7,
      })),
      // The Bell is introduced, once, inside the hall.
      stage('introduce', 'The Sound', 40 * SECOND, 10 * SECOND, world(false, BEAT.descent, {
        environmentGain: 0.5, environmentIntensity: 0.55, identityPresence: 1, masterGain: 0.7,
      }), [
        { id: 'induction-bell-1', atMs: 6 * SECOND, type: 'cue' },
      ]),
      // The long middle: the chorus fuller, almost no words.
      stage('deepen', 'Deepen', 90 * SECOND, 40 * SECOND, world(true, BEAT.descent, {
        environmentGain: 0.55, environmentIntensity: 0.6, identityPresence: 1.4, masterGain: 0.68,
      })),
      // The Bell returns, and is named.
      stage('return', 'It Returns', 35 * SECOND, 15 * SECOND, world(true, BEAT.descent, {
        environmentGain: 0.52, environmentIntensity: 0.55, identityPresence: 1.1, masterGain: 0.68,
      }), [
        { id: 'induction-bell-2', atMs: 8 * SECOND, type: 'cue' },
      ]),
      // The chorus falls away and the hall is left to settle.
      stage('surface', 'Surface', 45 * SECOND, 30 * SECOND, world(false, BEAT.prepEnd, {
        environmentGain: 0.3, environmentIntensity: 0.4, identityPresence: 0.15, masterGain: 0.55,
      })),
    ],
    guidance: [
      { id: 'induction-headphones', atMs: 0, heading: 'Before you begin', prompt: 'Put on headphones, and find somewhere you can close your eyes.' },
      { id: 'induction-belief', atMs: 14 * SECOND, heading: 'The Induction', prompt: 'Sound can guide the mind into different kinds of awareness. With practice, one of them can be lucidity.' },
      { id: 'induction-threshold', atMs: 50 * SECOND, heading: 'Threshold', prompt: 'A hall opens around you. There is nothing to do yet.' },
      { id: 'induction-open', atMs: 90 * SECOND, heading: 'Listen', prompt: 'Notice where the sound sits. Is it close, or far away? Let it fill the space.' },
      { id: 'induction-sound', atMs: 150 * SECOND, heading: 'One sound', prompt: 'A single sound will come. Remember how it feels.' },
      { id: 'induction-deepen', atMs: 190 * SECOND, heading: 'Deepen', prompt: 'Let the hall hold you. Keep only a little attention on the sound.' },
      { id: 'induction-return', atMs: 288 * SECOND, heading: 'It returns', prompt: 'There it is again. Noticing it is the skill.' },
      { id: 'induction-surface', atMs: 323 * SECOND, heading: 'Surface', prompt: 'Come back slowly. What you just did is what Inner trains.' },
    ],
  },
};

/** Total length in milliseconds, for tests and the Home card. */
export const INDUCTION_DURATION_MS = INDUCTION_JOURNEY.timeline.stages.reduce((sum, item) => sum + item.durationMs, 0);
