import React, { useEffect, useMemo, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useVideoPlayer, VideoView } from '../core/memorySafeVideo';
import {
  compileOvernightProtocol,
  createRecognitionOvernightProtocol,
  DEFAULT_PROCEDURAL_AUDIO_CONFIG,
  FACTORY_AUDIO_JOURNEYS,
  FactoryAudioJourney,
  CompiledOvernightProtocol,
  ProceduralEnvironment,
} from '../core/audio';
import { getLucidSignalCuePlan, LucidSignalCuePlan } from '../core/lucidSignalLearning';
import {
  getRecognitionSignalId,
  recognitionSignalById,
  RECOGNITION_SIGNALS,
  RecognitionSignalId,
  setRecognitionSignalId,
} from '../core/recognitionSignals';
import { Typography } from '../core/typography';

type OvernightEnvironment = Exclude<ProceduralEnvironment, 'none' | 'wind'>;
type OvernightFeel = 'gentle' | 'deep' | 'immersive';

const ENVIRONMENTS: Array<{ id: OvernightEnvironment; label: string }> = [
  { id: 'ocean', label: 'Ocean' },
  { id: 'forest', label: 'Forest' },
  { id: 'cosmic', label: 'Cosmic' },
  { id: 'fire', label: 'Fire' },
];
const DURATIONS = [420, 450, 480, 540] as const;
const FEELS: Array<{ id: OvernightFeel; label: string }> = [
  { id: 'gentle', label: 'Gentle' },
  { id: 'deep', label: 'Deep' },
  { id: 'immersive', label: 'Immersive' },
];

function durationLabel(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const remaining = minutes % 60;
  return remaining ? `${hours}h ${remaining}m` : `${hours}h`;
}

function overnightJourney(
  environment: OvernightEnvironment,
  feel: OvernightFeel,
  protocol: CompiledOvernightProtocol,
): FactoryAudioJourney {
  const base = FACTORY_AUDIO_JOURNEYS.find(journey => journey.id === 'lucid-signal')!;
  const gain = feel === 'immersive' ? 0.2 : feel === 'deep' ? 0.16 : 0.12;
  const preparationDurationMs = base.timeline.stages.reduce((total, stage) => total + stage.durationMs, 0);
  const maxNativeStageMs = 4 * 60 * 60_000;
  const overnightStages = protocol.phases
    .filter(phase => phase.kind !== 'preparation')
    .flatMap(phase => {
      const chunkCount = Math.ceil(phase.durationMs / maxNativeStageMs);
      return Array.from({ length: chunkCount }, (_, index) => {
        const durationMs = Math.min(maxNativeStageMs, phase.durationMs - index * maxNativeStageMs);
        return {
          id: `overnight-${phase.id}-${index + 1}`,
          label: phase.label,
          durationMs,
          transitionMs: Math.min(5_000, durationMs),
          target: phase.kind === 'recognitionWindow'
            ? { ...phase.audioConfig, masterGain: phase.audioConfig.masterGain * 0.55 }
            : phase.audioConfig,
        };
      });
    });
  return {
    ...base,
    title: 'Overnight Recognition',
    summary: `Recognition practice shaped around the ${environment} before later signals return during sleep.`,
    durationLabel: `${durationLabel(Math.round(protocol.totalDurationMs / 60_000))} · Overnight`,
    overnight: { sleepOnsetDelayMs: preparationDurationMs },
    timeline: {
      ...base.timeline,
      title: 'Overnight Recognition',
      stages: [
        ...base.timeline.stages.map(stage => ({
          ...stage,
          target: {
            ...stage.target,
            environment,
            environmentGain: stage.id === 'release' ? gain * 0.55 : gain,
            environmentIntensity: feel === 'immersive' ? 0.68 : feel === 'deep' ? 0.5 : 0.34,
          },
        })),
        ...overnightStages,
      ],
    },
  };
}

export default function OvernightJourneyScreen() {
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const [durationMinutes, setDurationMinutes] = useState<(typeof DURATIONS)[number]>(450);
  const [environment, setEnvironment] = useState<OvernightEnvironment>('ocean');
  const [feel, setFeel] = useState<OvernightFeel>('gentle');
  const [signalId, setSignalId] = useState<RecognitionSignalId>('ascending');
  const [cuePlan, setCuePlan] = useState<LucidSignalCuePlan>('standard');
  const background = useVideoPlayer(require('../assets/videos/lucidscreen.mp4'), player => {
    player.loop = true; player.muted = true; player.audioMixingMode = 'mixWithOthers'; player.play();
  });

  useEffect(() => {
    void Promise.all([getRecognitionSignalId(), getLucidSignalCuePlan()]).then(([storedSignal, storedPlan]) => {
      setSignalId(storedSignal);
      setCuePlan(storedPlan);
    });
  }, []);

  const compiled = useMemo(() => compileOvernightProtocol(createRecognitionOvernightProtocol({
    sleepDurationMinutes: durationMinutes,
    environment,
    signalId,
    cuePlan,
    feel,
  }), DEFAULT_PROCEDURAL_AUDIO_CONFIG), [cuePlan, durationMinutes, environment, feel, signalId]);
  const recognitionWindows = compiled.phases.filter(phase => phase.kind === 'recognitionWindow').length;

  const chooseSignal = async (nextSignalId: RecognitionSignalId) => {
    setSignalId(nextSignalId);
    await setRecognitionSignalId(nextSignalId);
  };

  const begin = async () => {
    await setRecognitionSignalId(signalId);
    navigation.navigate('LucidJourneyPlayer', { journey: overnightJourney(environment, feel, compiled) });
  };

  const choiceGroup = <T extends string | number>(
    label: string,
    values: Array<{ id: T; label: string }>,
    selected: T,
    select: (value: T) => void,
  ) => (
    <View style={styles.group}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.choices}>
        {values.map(value => {
          const active = value.id === selected;
          return (
            <Pressable key={String(value.id)} onPress={() => select(value.id)} style={[styles.choice, active && styles.choiceSelected]} accessibilityRole="button" accessibilityState={{ selected: active }}>
              <Text style={[styles.choiceText, active && styles.choiceTextSelected]}>{value.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );

  return (
    <View style={styles.root}>
      <VideoView player={background} contentFit="cover" style={StyleSheet.absoluteFill} nativeControls={false} allowsFullscreen={false} allowsPictureInPicture={false} />
      <View style={styles.veil} pointerEvents="none" />
      <ScrollView contentContainerStyle={[styles.content, { paddingTop: insets.top + 96, paddingBottom: insets.bottom + 34 }]} showsVerticalScrollIndicator={false}>
        <Text style={[Typography.display, styles.title, Platform.OS === 'android' && styles.androidTitleOffset]}>Overnight Journey</Text>
        <Text style={[Typography.body, styles.subtitle]}>Tell Inner where you want to go. The complexity stays beneath the surface.</Text>

        <View style={styles.intention}>
          <Text style={styles.label}>WHAT ARE YOU SEEKING TONIGHT?</Text>
          <Text style={[Typography.display, styles.intentionValue]}>Become Lucid</Text>
        </View>

        {choiceGroup('WHERE WOULD YOU LIKE TO GO?', ENVIRONMENTS, environment, setEnvironment)}
        {choiceGroup('HOW LONG WILL YOU BE AWAY?', DURATIONS.map(id => ({ id, label: durationLabel(id) })), durationMinutes, setDurationMinutes)}
        {choiceGroup('HOW SHOULD IT FEEL?', FEELS, feel, setFeel)}
        {choiceGroup('YOUR SIGNAL', RECOGNITION_SIGNALS.map(signal => ({ id: signal.id, label: signal.name })), signalId, value => { void chooseSignal(value); })}

        <View style={styles.readyCard}>
          <Text style={styles.readyEyebrow}>YOUR NIGHT</Text>
          <Text style={[Typography.display, styles.readyTitle]}>Recognition · {environment.charAt(0).toUpperCase() + environment.slice(1)}</Text>
          <Text style={styles.readyLine}>{durationLabel(durationMinutes)} · {recognitionWindows} later recognition windows</Text>
          <Text style={styles.readyLine}>{recognitionSignalById(signalId).name} · {feel}</Text>
          <Text style={styles.readyCopy}>Your journey begins with a seven-minute waking preparation, then continues quietly through descent, protected sleep, recognition windows, and return.</Text>
        </View>

        <Pressable onPress={() => { void begin(); }} style={styles.begin} accessibilityRole="button">
          <Text style={styles.beginText}>BEGIN JOURNEY</Text>
        </Pressable>
        <Pressable onPress={() => navigation.goBack()} style={styles.returnButton} accessibilityRole="button">
          <Text style={styles.returnText}>RETURN</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#02040B' },
  veil: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.61)' },
  content: { paddingHorizontal: 24 },
  title: { color: '#F4F1FA', fontSize: 24, textAlign: 'center' },
  androidTitleOffset: { marginTop: 30 },
  subtitle: { color: '#D7D1E0', fontFamily: 'Inter-ExtraLight', fontSize: 13, lineHeight: 19, textAlign: 'center', maxWidth: 280, alignSelf: 'center', marginTop: 8, marginBottom: 22 },
  intention: { alignItems: 'center', marginTop: 10, marginBottom: 4 },
  intentionValue: { color: '#F2EDF9', fontSize: 19, marginTop: 8 },
  group: { marginTop: 22 },
  label: { color: '#AFA4D5', fontFamily: 'Inter-Medium', fontSize: 8, letterSpacing: 1.35, textAlign: 'center' },
  choices: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 7, marginTop: 10 },
  choice: { minHeight: 34, justifyContent: 'center', paddingHorizontal: 13, borderRadius: 17, borderWidth: 1, borderColor: 'rgba(205,194,255,0.18)', backgroundColor: 'rgba(3,5,13,0.46)' },
  choiceSelected: { borderColor: 'rgba(205,194,255,0.62)', backgroundColor: 'rgba(105,83,171,0.36)' },
  choiceText: { color: '#AAA2B5', fontFamily: 'Inter-Medium', fontSize: 9 },
  choiceTextSelected: { color: '#F0EAFB' },
  readyCard: { maxWidth: 300, width: '100%', alignSelf: 'center', alignItems: 'center', marginTop: 30, paddingHorizontal: 18, paddingVertical: 18, borderRadius: 21, borderWidth: 1, borderColor: 'rgba(190,174,238,0.28)', backgroundColor: 'rgba(7,8,19,0.72)' },
  readyEyebrow: { color: '#AFA4D5', fontFamily: 'Inter-Medium', fontSize: 7, letterSpacing: 1.5 },
  readyTitle: { color: '#F0ECF7', fontSize: 17, marginTop: 7, textAlign: 'center' },
  readyLine: { color: '#C4BCCF', fontFamily: 'Inter-ExtraLight', fontSize: 9, marginTop: 7, textTransform: 'capitalize' },
  readyCopy: { color: '#9991A4', fontFamily: 'Inter-ExtraLight', fontSize: 10, lineHeight: 15, textAlign: 'center', marginTop: 12 },
  begin: { width: 214, minHeight: 47, alignSelf: 'center', alignItems: 'center', justifyContent: 'center', marginTop: 22, borderRadius: 24, borderWidth: 1, borderColor: 'rgba(218,207,255,0.65)', backgroundColor: 'rgba(95,73,157,0.44)' },
  beginText: { color: '#F3EEFF', fontFamily: 'Inter-Medium', fontSize: 10, letterSpacing: 1.65 },
  returnButton: { alignSelf: 'center', paddingHorizontal: 25, paddingVertical: 16, marginTop: 12 },
  returnText: { color: '#C8C0D2', fontFamily: 'Inter-Medium', fontSize: 9, letterSpacing: 1.6 },
});
