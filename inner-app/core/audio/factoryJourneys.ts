import type { AudioJourneyTimeline, AudioJourneyStage } from './types';

export type FactoryAudioJourney = {
  id: string;
  title: string;
  durationLabel: string;
  summary: string;
  timeline: AudioJourneyTimeline;
};

export type PersonalizedLucidJourneyAnswers = {
  intention: 'lucidity' | 'recall' | 'calm' | 'visualization';
  durationMinutes: 5 | 10 | 20 | 30;
  feel: 'gentle' | 'immersive' | 'grounded' | 'minimal';
  familiarity: 'new' | 'familiar' | 'experienced';
};

const stage = (
  id: string,
  label: string,
  durationMs: number,
  transitionMs: number,
  target: AudioJourneyStage['target'],
  spatialEvents: AudioJourneyStage['spatialEvents'] = [],
): AudioJourneyStage => ({
  id, label, durationMs, transitionMs,
  target: { spatialMode: 'drift', spatialTarget: 'noise', spatialDepth: 0.22, spatialRate: 0.3, ...target },
  spatialEvents,
});

export const FACTORY_AUDIO_JOURNEYS: FactoryAudioJourney[] = [
  {
    id: 'lucid-return-wbtb',
    title: 'Lucid Return',
    durationLabel: '8 min · WBTB',
    summary: 'A low-stimulation return-to-sleep sequence for dream recall, recognition rehearsal, and intention.',
    timeline: {
      id: 'lucid-return-wbtb',
      title: 'Lucid Return',
      fadeInMs: 4_000,
      stages: [
        stage('reorient', 'Reorient', 45_000, 12_000, {
          carrierHz: 528, toneGain: 0.12, binauralCarrierHz: 220, binauralDeltaHz: 10,
          binauralGain: 0.22, noiseColor: 'pink', noiseGain: 0.13, masterGain: 0.68,
        }),
        stage('recall', 'Recall the Dream', 75_000, 30_000, {
          toneGain: 0.1, binauralCarrierHz: 215, binauralDeltaHz: 8,
          binauralGain: 0.27, noiseColor: 'pink', noiseGain: 0.16, masterGain: 0.66,
        }),
        stage('notice', 'Notice the Anomaly', 75_000, 35_000, {
          toneGain: 0.12, binauralCarrierHz: 210, binauralDeltaHz: 7,
          binauralGain: 0.3, noiseColor: 'pink', noiseGain: 0.17, masterGain: 0.65,
        }),
        stage('recognize', 'Recognition Cue', 30_000, 10_000, {
          toneGain: 0.2, binauralCarrierHz: 206, binauralDeltaHz: 6,
          binauralGain: 0.32, noiseColor: 'pink', noiseGain: 0.12, masterGain: 0.66,
        }, [{ id: 'recognition-swoosh', atMs: 5_000, type: 'swoosh', direction: 'right', durationMs: 1_800, depth: 0.8 }]),
        stage('rehearse', 'Rehearse Lucidity', 120_000, 45_000, {
          toneGain: 0.13, binauralCarrierHz: 204, binauralDeltaHz: 6,
          binauralGain: 0.31, noiseColor: 'pink', noiseGain: 0.18, masterGain: 0.62,
        }),
        stage('remember', 'Remember', 30_000, 10_000, {
          toneGain: 0.2, binauralCarrierHz: 202, binauralDeltaHz: 5.5,
          binauralGain: 0.3, noiseColor: 'pink', noiseGain: 0.11, masterGain: 0.62,
        }),
        stage('release', 'Return to Sleep', 105_000, 90_000, {
          toneGain: 0.05, binauralCarrierHz: 196, binauralDeltaHz: 4.5,
          binauralGain: 0.2, noiseColor: 'brown', noiseGain: 0.16, masterGain: 0.42,
        }),
      ],
      guidance: [
        {
          id: 'remain-drowsy', atMs: 0, heading: 'Remain drowsy',
          prompt: 'Let your body remain still. There is no need to fully wake.',
        },
        {
          id: 'bring-back-dream', atMs: 45_000, heading: 'Recall',
          prompt: 'Try bringing back the dream you just left. One clear scene.',
        },
        {
          id: 'find-dream-sign', atMs: 120_000, heading: 'Notice',
          prompt: 'One detail that could have revealed the dream: a place, event, feeling, or impossibility.',
        },
        {
          id: 'question-reality', atMs: 195_000, heading: 'Recognize',
          prompt: 'Imagine noticing it now. With genuine curiosity ask: Could this be a dream?',
        },
        {
          id: 'rehearse-lucidity', atMs: 225_000, heading: 'Rehearse',
          prompt: 'See yourself recognizing the dream as it continues. Remain calm inside the scene.',
        },
        {
          id: 'set-intention', atMs: 345_000, heading: 'Remember',
          prompt: 'Form one intention: The next time I am dreaming, I will remember that I am dreaming.',
        },
        {
          id: 'release-to-sleep', atMs: 375_000, heading: 'Release',
          prompt: 'Let the words fade slowly. Keep only the intention, and allow sleep to return.',
        },
      ],
    },
  },
  {
    id: 'lucid-threshold',
    title: 'Lucid Threshold',
    durationLabel: '27 min · Practice',
    summary: 'A deeper training sequence for settling, dream recall, critical reflection, prospective intention, and release.',
    timeline: {
      id: 'lucid-threshold',
      title: 'Lucid Threshold',
      fadeInMs: 4_000,
      stages: [
        stage('settle', 'Settle', 2 * 60_000, 45_000, {
          carrierHz: 528, toneGain: 0.16, binauralCarrierHz: 224, binauralDeltaHz: 10,
          binauralGain: 0.25, noiseColor: 'pink', noiseGain: 0.16, masterGain: 0.72,
        }),
        stage('dream-recall', 'Dream Recall', 4 * 60_000, 90_000, {
          toneGain: 0.13, binauralCarrierHz: 218, binauralDeltaHz: 9,
          binauralGain: 0.3, noiseColor: 'pink', noiseGain: 0.19, masterGain: 0.69,
        }),
        stage('critical-reflection', 'Critical Reflection', 4 * 60_000, 90_000, {
          toneGain: 0.15, binauralCarrierHz: 212, binauralDeltaHz: 8,
          binauralGain: 0.32, noiseColor: 'pink', noiseGain: 0.18, masterGain: 0.68,
        }),
        stage('recognition-rehearsal', 'Recognition Rehearsal', 5 * 60_000, 2 * 60_000, {
          toneGain: 0.2, binauralCarrierHz: 206, binauralDeltaHz: 6,
          binauralGain: 0.35, noiseColor: 'pink', noiseGain: 0.16, masterGain: 0.67,
        }),
        stage('prospective-intention', 'Prospective Intention', 4 * 60_000, 90_000, {
          toneGain: 0.14, binauralCarrierHz: 202, binauralDeltaHz: 6,
          binauralGain: 0.34, noiseColor: 'pink', noiseGain: 0.2, masterGain: 0.64,
        }),
        stage('cue-association', 'Lucidity Cue', 3 * 60_000, 45_000, {
          toneGain: 0.22, binauralCarrierHz: 200, binauralDeltaHz: 5.5,
          binauralGain: 0.33, noiseColor: 'pink', noiseGain: 0.13, masterGain: 0.64,
        }),
        stage('deep-release', 'Release', 5 * 60_000, 4 * 60_000, {
          toneGain: 0.04, binauralCarrierHz: 192, binauralDeltaHz: 4,
          binauralGain: 0.18, noiseColor: 'brown', noiseGain: 0.17, masterGain: 0.38,
        }),
      ],
    },
  },
  {
    id: 'lucid-signal',
    title: 'Lucid Signal',
    durationLabel: '7 min · Cue Training',
    summary: 'Trains a fixed recognition tone against a reality check tonight, so the same tone can echo it back to you later while you sleep.',
    timeline: {
      id: 'lucid-signal',
      title: 'Lucid Signal',
      fadeInMs: 3_000,
      stages: [
        stage('learn', 'Learn the Signal', 60_000, 8_000, {
          carrierHz: 528, toneGain: 0.1, binauralCarrierHz: 218, binauralDeltaHz: 8,
          binauralGain: 0.2, noiseColor: 'pink', noiseGain: 0.12, masterGain: 0.66,
          spatialMode: 'still', spatialDepth: 0,
        }, [
          { id: 'learn-cue-1', atMs: 12_000, type: 'cue' },
        ]),
        stage('rehearse', 'Rehearse the Check', 90_000, 15_000, {
          toneGain: 0.09, binauralCarrierHz: 212, binauralDeltaHz: 7,
          binauralGain: 0.24, noiseColor: 'pink', noiseGain: 0.14, masterGain: 0.64,
          spatialMode: 'still', spatialDepth: 0,
        }, [
          { id: 'rehearse-cue-1', atMs: 10_000, type: 'cue' },
          { id: 'rehearse-cue-2', atMs: 35_000, type: 'cue' },
          { id: 'rehearse-cue-3', atMs: 65_000, type: 'cue' },
        ]),
        stage('drift', 'Drift', 180_000, 30_000, {
          toneGain: 0.05, binauralCarrierHz: 202, binauralDeltaHz: 5.5,
          binauralGain: 0.2, noiseColor: 'pink', noiseGain: 0.12, masterGain: 0.56,
          spatialMode: 'still', spatialDepth: 0,
        }, [
          // Increasing gaps between repeats, matching the published protocol's
          // "repeated at increasing intervals as the participant falls asleep."
          { id: 'drift-cue-1', atMs: 15_000, type: 'cue' },
          { id: 'drift-cue-2', atMs: 50_000, type: 'cue' },
          { id: 'drift-cue-3', atMs: 110_000, type: 'cue' },
        ]),
        stage('release', 'Release to Sleep', 90_000, 80_000, {
          toneGain: 0.03, binauralCarrierHz: 194, binauralDeltaHz: 4,
          binauralGain: 0.14, noiseColor: 'brown', noiseGain: 0.14, masterGain: 0.4,
          spatialMode: 'still', spatialDepth: 0,
        }),
      ],
      guidance: [
        {
          id: 'signal-intro', atMs: 0, heading: 'The Signal',
          prompt: 'A tone will sound. Each time you hear it tonight, ask: could this be a dream?',
        },
        {
          id: 'signal-first', atMs: 12_000, heading: 'Notice',
          prompt: 'There it is. Picture yourself hearing this exact sound inside a dream.',
        },
        {
          id: 'signal-rehearse', atMs: 60_000, heading: 'Rehearse',
          prompt: 'Each time it plays, perform a real reality check — look at your hands, question your surroundings.',
        },
        {
          id: 'signal-drift', atMs: 150_000, heading: 'Drift',
          prompt: 'Let your body grow heavy. The signal will keep returning as you fall asleep.',
        },
        {
          id: 'signal-release', atMs: 330_000, heading: 'Release',
          prompt: 'You may hear this same tone again later tonight. If you do, remember: you are dreaming.',
        },
      ],
    },
  },
];

export function createJourneyPreview(
  journey: FactoryAudioJourney,
  totalPreviewMs = 56_000,
): AudioJourneyTimeline {
  const fullDurationMs = journey.timeline.stages.reduce((total, item) => total + item.durationMs, 0);
  const scale = totalPreviewMs / fullDurationMs;
  const stages = journey.timeline.stages.map(item => {
    const durationMs = Math.max(1_000, Math.round(item.durationMs * scale));
    const localScale = durationMs / item.durationMs;
    const sourceSpatialRate = item.target.spatialRate;
    const previewSpatialRate = typeof sourceSpatialRate === 'number'
      ? item.target.spatialMode === 'rain'
        ? Math.min(1.8, sourceSpatialRate / Math.sqrt(localScale))
        : Math.min(3, sourceSpatialRate / localScale)
      : undefined;
    return {
      ...item,
      durationMs,
      transitionMs: Math.min(durationMs, Math.round((item.transitionMs ?? 0) * localScale)),
      target: {
        ...item.target,
        spatialRate: previewSpatialRate,
      },
      spatialEvents: item.spatialEvents?.map(event => {
        const atMs = Math.min(durationMs - 500, Math.round(event.atMs * localScale));
        if (event.type === 'cue') return { ...event, atMs };
        return {
          ...event,
          atMs,
          durationMs: Math.min(
            5_000,
            durationMs - atMs,
            Math.max(500, Math.round(event.durationMs * localScale)),
          ),
        };
      }),
    };
  });
  // Preserve the exact requested preview length after per-stage rounding.
  stages[stages.length - 1].durationMs += totalPreviewMs - stages.reduce((total, item) => total + item.durationMs, 0);
  return {
    ...journey.timeline,
    id: `${journey.timeline.id}-preview`,
    title: `${journey.title} Preview`,
    stages,
    guidance: journey.timeline.guidance?.map(cue => ({
      ...cue,
      atMs: Math.min(totalPreviewMs - 1, Math.round(cue.atMs * scale)),
    })),
  };
}

const PERSONALIZED_BLUEPRINTS: Record<PersonalizedLucidJourneyAnswers['intention'], AudioJourneyTimeline> = {
  lucidity: FACTORY_AUDIO_JOURNEYS[0].timeline,
  recall: {
    id: 'personal-recall-blueprint', title: 'Dream Recall', stages: [
      stage('remain-still', 'Remain Still', 60_000, 20_000, { carrierHz: 432, toneGain: 0.07, binauralCarrierHz: 216, binauralDeltaHz: 8, binauralGain: 0.2, noiseColor: 'pink', noiseGain: 0.14, masterGain: 0.62, spatialMode: 'still', spatialDepth: 0 }),
      stage('last-fragment', 'Last Fragment', 120_000, 35_000, { toneGain: 0.06, binauralCarrierHz: 212, binauralDeltaHz: 7.5, binauralGain: 0.23, noiseColor: 'pink', noiseGain: 0.16, spatialMode: 'rain', spatialDepth: 0.42, spatialRate: 0.55 }),
      stage('reverse-thread', 'Follow Backward', 120_000, 45_000, { toneGain: 0.05, binauralCarrierHz: 208, binauralDeltaHz: 7, binauralGain: 0.25, noiseColor: 'pink', noiseGain: 0.17, spatialMode: 'drift', spatialDepth: 0.38, spatialRate: 0.24 }),
      stage('restore-senses', 'Restore the Scene', 120_000, 45_000, { toneGain: 0.08, binauralCarrierHz: 206, binauralDeltaHz: 6.5, binauralGain: 0.26, noiseColor: 'pink', noiseGain: 0.15, spatialMode: 'rain', spatialDepth: 0.5, spatialRate: 0.7 }),
      stage('emotional-trace', 'Emotional Trace', 90_000, 35_000, { toneGain: 0.05, binauralCarrierHz: 204, binauralDeltaHz: 6, binauralGain: 0.23, noiseColor: 'pink', noiseGain: 0.16, spatialMode: 'drift', spatialDepth: 0.28, spatialRate: 0.2 }),
      stage('carry-memory', 'Carry the Memory', 90_000, 60_000, { toneGain: 0.03, binauralCarrierHz: 200, binauralDeltaHz: 6, binauralGain: 0.18, noiseColor: 'pink', noiseGain: 0.13, masterGain: 0.45, spatialMode: 'still', spatialDepth: 0 }),
    ], guidance: [
      { id: 'recall-still', atMs: 0, heading: 'Remain still', prompt: 'Keep your body quiet. Let the dream remain close.' },
      { id: 'recall-fragment', atMs: 60_000, heading: 'Find the edge', prompt: 'Notice the final image, feeling, voice, or place you remember.' },
      { id: 'recall-backward', atMs: 180_000, heading: 'Follow backward', prompt: 'What happened just before that? Let one moment lead gently into another.' },
      { id: 'recall-senses', atMs: 300_000, heading: 'Restore', prompt: 'Bring back the light, texture, sound, and space of the dream.' },
      { id: 'recall-feeling', atMs: 420_000, heading: 'Feel', prompt: 'Notice the emotion beneath the scene. Allow it to reveal what came before.' },
      { id: 'recall-carry', atMs: 510_000, heading: 'Remember', prompt: 'Hold the clearest thread lightly. Carry it with you as waking returns.' },
    ],
  },
  calm: {
    id: 'personal-calm-blueprint', title: 'Calm Return', stages: [
      stage('soften-breath', 'Soften the Breath', 120_000, 45_000, { toneGain: 0, binauralCarrierHz: 196, binauralDeltaHz: 6, binauralGain: 0.16, noiseColor: 'brown', noiseGain: 0.18, masterGain: 0.56, spatialMode: 'still' }),
      stage('release-body', 'Release the Body', 120_000, 60_000, { toneGain: 0, binauralCarrierHz: 194, binauralDeltaHz: 5, binauralGain: 0.18, noiseColor: 'brown', noiseGain: 0.2, spatialMode: 'still' }),
      stage('quiet-thought', 'Quiet the Thought', 120_000, 60_000, { toneGain: 0, binauralCarrierHz: 192, binauralDeltaHz: 4.5, binauralGain: 0.17, noiseColor: 'brown', noiseGain: 0.2, spatialMode: 'still' }),
      stage('simple-intention', 'Simple Intention', 90_000, 40_000, { toneGain: 0, binauralCarrierHz: 190, binauralDeltaHz: 4, binauralGain: 0.16, noiseColor: 'brown', noiseGain: 0.18, spatialMode: 'still' }),
      stage('return-sleep', 'Return to Sleep', 150_000, 120_000, { toneGain: 0, binauralCarrierHz: 188, binauralDeltaHz: 3.5, binauralGain: 0.1, noiseColor: 'brown', noiseGain: 0.14, masterGain: 0.36, spatialMode: 'still' }),
    ], guidance: [
      { id: 'calm-breath', atMs: 0, heading: 'Soften', prompt: 'Let each exhale become quieter than the one before it.' },
      { id: 'calm-body', atMs: 120_000, heading: 'Release', prompt: 'Allow the weight of your body to be completely held.' },
      { id: 'calm-thought', atMs: 240_000, heading: 'Let pass', prompt: 'Nothing needs to be solved now. Let each thought move beyond you.' },
      { id: 'calm-intention', atMs: 360_000, heading: 'Remember', prompt: 'If a dream comes, I may recognize it. There is nothing more to do.' },
      { id: 'calm-sleep', atMs: 450_000, heading: 'Return', prompt: 'Release even the intention. Allow sleep to receive you.' },
    ],
  },
  visualization: {
    id: 'personal-visualization-blueprint', title: 'Dream Visualization', stages: [
      stage('open-space', 'Open the Space', 90_000, 30_000, { carrierHz: 639, toneGain: 0.11, binauralCarrierHz: 220, binauralDeltaHz: 8, binauralGain: 0.22, noiseColor: 'grey', noiseGain: 0.11, masterGain: 0.62, spatialMode: 'drift', spatialTarget: 'both', spatialDepth: 0.34, spatialRate: 0.25 }),
      stage('form-scene', 'Form the Scene', 120_000, 50_000, { carrierHz: 639, toneGain: 0.14, binauralCarrierHz: 214, binauralDeltaHz: 7.5, binauralGain: 0.25, noiseColor: 'pink', noiseGain: 0.14, spatialMode: 'orbit', spatialTarget: 'both', spatialDepth: 0.48, spatialRate: 0.48 }),
      stage('awaken-senses', 'Awaken the Senses', 120_000, 50_000, { carrierHz: 639, toneGain: 0.15, binauralCarrierHz: 210, binauralDeltaHz: 7, binauralGain: 0.27, noiseColor: 'pink', noiseGain: 0.16, spatialMode: 'rain', spatialTarget: 'noise', spatialDepth: 0.58, spatialRate: 0.78 }),
      stage('enter-scene', 'Enter the Scene', 90_000, 40_000, { carrierHz: 639, toneGain: 0.16, binauralCarrierHz: 206, binauralDeltaHz: 6.5, binauralGain: 0.28, noiseColor: 'pink', noiseGain: 0.15, spatialMode: 'orbit', spatialTarget: 'both', spatialDepth: 0.62, spatialRate: 0.62 }),
      stage('place-sign', 'Place a Dream Sign', 90_000, 35_000, { carrierHz: 639, toneGain: 0.19, binauralCarrierHz: 204, binauralDeltaHz: 6, binauralGain: 0.29, noiseColor: 'grey', noiseGain: 0.12, spatialMode: 'pendulum', spatialTarget: 'both', spatialDepth: 0.7, spatialRate: 0.9 }, [{ id: 'dream-sign-swoosh', atMs: 18_000, type: 'swoosh', direction: 'left', durationMs: 2_100, depth: 0.8 }]),
      stage('recognize-scene', 'Recognize', 60_000, 25_000, { carrierHz: 639, toneGain: 0.17, binauralCarrierHz: 202, binauralDeltaHz: 6, binauralGain: 0.27, noiseColor: 'pink', noiseGain: 0.13, spatialMode: 'pendulum', spatialTarget: 'both', spatialDepth: 0.56, spatialRate: 0.7 }),
      stage('release-image', 'Release', 30_000, 25_000, { carrierHz: 639, toneGain: 0.05, binauralCarrierHz: 198, binauralDeltaHz: 5.5, binauralGain: 0.16, noiseColor: 'pink', noiseGain: 0.1, masterGain: 0.4, spatialMode: 'drift', spatialTarget: 'noise', spatialDepth: 0.18, spatialRate: 0.18 }),
    ], guidance: [
      { id: 'visual-open', atMs: 0, heading: 'Open', prompt: 'Let a quiet inner space appear. It does not need to be clear yet.' },
      { id: 'visual-scene', atMs: 90_000, heading: 'Form', prompt: 'Allow one familiar place to gather around you.' },
      { id: 'visual-senses', atMs: 210_000, heading: 'Sense', prompt: 'Notice its light, temperature, sound, and the surface beneath you.' },
      { id: 'visual-enter', atMs: 330_000, heading: 'Enter', prompt: 'Move through the scene as though you are already there.' },
      { id: 'visual-sign', atMs: 420_000, heading: 'Place', prompt: 'Let one impossible detail appear—something you can recognize in a dream.' },
      { id: 'visual-recognize', atMs: 510_000, heading: 'Recognize', prompt: 'See yourself noticing it and asking: Could this be a dream?' },
      { id: 'visual-release', atMs: 570_000, heading: 'Release', prompt: 'Let the image continue without effort as you move toward sleep.' },
    ],
  },
};

export function createPersonalizedLucidJourney(
  answers: PersonalizedLucidJourneyAnswers,
  seed = Math.floor(Math.random() * 0xffff_ffff) || 1,
): FactoryAudioJourney {
  const sourceTimeline = PERSONALIZED_BLUEPRINTS[answers.intention];
  const totalMs = answers.durationMinutes * 60_000;
  const sourceTotal = sourceTimeline.stages.reduce((sum, item) => sum + item.durationMs, 0);
  const durationScale = totalMs / sourceTotal;
  const feelGain = answers.feel === 'gentle' ? 0.86 : answers.feel === 'immersive' ? 1.12 : 1;
  const familiarityGain = answers.familiarity === 'new' ? 0.9 : answers.familiarity === 'experienced' ? 1.06 : 1;
  const gainScale = feelGain * familiarityGain;
  const toneScale = answers.intention === 'visualization' ? 1.12
    : answers.intention === 'recall' ? 0.9
      : answers.intention === 'calm' ? 0.82 : 1;

  const stages = sourceTimeline.stages.map(item => {
    const sourceDepth = item.target.spatialDepth ?? 0.22;
    const sourceRate = item.target.spatialRate ?? 0.3;
    const sourceMode = item.target.spatialMode ?? 'drift';
    const spatialMode = answers.feel === 'grounded' ? 'still' as const
      : answers.feel === 'minimal' && sourceMode !== 'rain' ? 'still' as const
        : answers.feel === 'immersive' && sourceMode === 'drift' ? 'pendulum' as const
          : sourceMode;
    const spatialDepth = answers.feel === 'immersive' ? Math.min(0.8, sourceDepth * 1.25)
      : answers.feel === 'gentle' ? sourceDepth * 0.72
        : answers.feel === 'minimal' ? sourceDepth * 0.35
          : 0;
    const spatialRate = answers.feel === 'immersive' ? Math.min(3, sourceRate * 1.3)
      : answers.feel === 'gentle' ? sourceRate * 0.82
        : answers.feel === 'minimal' ? sourceRate * 0.65
          : sourceRate;
    const spatialEvents = answers.feel === 'grounded' || answers.feel === 'minimal'
      ? []
      : (item.spatialEvents ?? []).map(event => event.type === 'cue'
        ? { ...event, atMs: Math.round(event.atMs * durationScale) }
        : {
          ...event,
          atMs: Math.round(event.atMs * durationScale),
          durationMs: Math.max(500, Math.min(5_000, Math.round(event.durationMs * Math.min(1, durationScale)))),
          depth: answers.feel === 'gentle' ? event.depth * 0.75 : event.depth,
        });
    return {
    ...item,
    durationMs: Math.round(item.durationMs * durationScale),
    transitionMs: Math.round((item.transitionMs ?? 0) * durationScale),
    target: {
      ...item.target,
      toneGain: typeof item.target.toneGain === 'number' ? Math.min(1, item.target.toneGain * toneScale) : undefined,
      binauralGain: typeof item.target.binauralGain === 'number' ? Math.min(1, item.target.binauralGain * gainScale) : undefined,
      noiseGain: answers.feel === 'minimal' ? 0.05 : item.target.noiseGain,
      noiseColor: answers.feel === 'grounded' ? 'brown' as const : item.target.noiseColor,
      binauralDeltaHz: answers.intention === 'calm' && typeof item.target.binauralDeltaHz === 'number'
        ? Math.max(4, item.target.binauralDeltaHz - 1)
        : item.target.binauralDeltaHz,
      spatialMode,
      spatialTarget: item.target.spatialTarget ?? (answers.intention === 'visualization' ? 'both' as const : 'noise' as const),
      spatialDepth,
      spatialRate,
    },
    spatialEvents,
  };
  });
  // Absorb rounding so the chosen duration remains exact.
  stages[stages.length - 1].durationMs += totalMs - stages.reduce((sum, item) => sum + item.durationMs, 0);

  const intentionLabel = {
    lucidity: 'lucid recognition', recall: 'dream recall', calm: 'a calm return to sleep', visualization: 'dream visualization',
  }[answers.intention];
  const feelLabel = { gentle: 'gentle', immersive: 'immersive', grounded: 'grounded', minimal: 'minimal' }[answers.feel];

  return {
    id: `personal-lucid-${answers.durationMinutes}-${answers.intention}-${answers.feel}-${seed}`,
    title: 'Personal Lucid Journey',
    durationLabel: `${answers.durationMinutes} min · Personalized`,
    summary: `A ${feelLabel} ${answers.durationMinutes}-minute practice shaped around ${intentionLabel}.`,
    timeline: {
      ...sourceTimeline,
      id: `personal-lucid-${answers.durationMinutes}-${answers.intention}-${answers.feel}-${seed}`,
      title: 'Personal Lucid Journey',
      seed,
      fadeInMs: 4_000,
      stages,
      guidance: sourceTimeline.guidance?.map(cue => ({ ...cue, atMs: Math.round(cue.atMs * durationScale) })),
    },
  };
}
