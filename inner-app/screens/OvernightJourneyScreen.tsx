import React, { useEffect, useMemo, useState } from 'react';
import { Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useVideoPlayer, VideoView } from '../core/memorySafeVideo';
import {
  compileOvernightProtocol,
  createAcceleratedOvernightProtocol,
  createRecognitionOvernightProtocol,
  DEFAULT_PROCEDURAL_AUDIO_CONFIG,
  FACTORY_AUDIO_JOURNEYS,
  FactoryAudioJourney,
  CompiledOvernightProtocol,
  ProceduralEnvironment,
  OVERNIGHT_WORLD_PROFILES,
  toneGainForEnvironment,
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
import { createMorningReturnTestSession, loadJourneyMemory, type JourneyMemorySession } from '../core/journeyMemory';

type OvernightEnvironment = Exclude<ProceduralEnvironment, 'none' | 'wind'>;
type OvernightFeel = 'gentle' | 'deep' | 'immersive';

const ENVIRONMENTS: Array<{ id: OvernightEnvironment; label: string }> =
  OVERNIGHT_WORLD_PROFILES.map(({ id, label }) => ({ id, label }));
const DURATIONS = [420, 450, 480, 540] as const;
const FEELS: Array<{ id: OvernightFeel; label: string }> = [
  { id: 'gentle', label: 'Gentle' },
  { id: 'deep', label: 'Deep' },
  { id: 'immersive', label: 'Immersive' },
];
const INNER_LAB_BUILD = __DEV__ || process.env.EXPO_PUBLIC_INNER_LAB === '1';

function durationLabel(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const remaining = minutes % 60;
  return remaining ? `${hours}h ${remaining}m` : `${hours}h`;
}

function clockLabel(milliseconds: number): string {
  const totalSeconds = Math.max(0, Math.round(milliseconds / 1_000));
  const hours = Math.floor(totalSeconds / 3_600);
  const minutes = Math.floor((totalSeconds % 3_600) / 60);
  const seconds = totalSeconds % 60;
  return hours
    ? `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
    : `${minutes}:${String(seconds).padStart(2, '0')}`;
}

function eventLabel(event: JourneyMemorySession['events'][number]): string {
  if (event.type === 'stage_changed') return `Entered ${event.stageId ?? 'stage'}`;
  if (event.type === 'cue_played') return `Signal · ${event.cueId ?? 'cue'}`;
  if (event.type === 'recognition_signal_selected') return `Selected signal · ${event.signalId ?? 'unknown'}`;
  if (event.type === 'recognition_signal_fired') {
    const drift = event.driftMs === undefined ? '' : ` · drift ${Math.round(event.driftMs)}ms`;
    return `Native signal fired · ${event.signalId ?? 'unknown'}${drift}`;
  }
  if (event.type === 'seeked') return `Scrubbed from ${clockLabel(event.fromPositionMs ?? 0)}`;
  if (event.type === 'app_state_changed') return `App state · ${event.appState ?? event.reason ?? 'changed'}`;
  if (event.type === 'playback_paused') return `Playback paused${event.reason ? ` · ${event.reason}` : ''}`;
  if (event.type === 'playback_resumed') return `Playback resumed${event.reason ? ` · ${event.reason}` : ''}`;
  if (event.type === 'playback_stopped') return `Playback stopped${event.reason ? ` · ${event.reason}` : ''}`;
  if (event.type === 'start_step') return `Start · ${event.reason ?? 'step'}${event.message ? ` · ${event.message}` : ''}`;
  if (event.type === 'start_stalled') return `Start stalled${event.reason ? ` · ${event.reason}` : ''}${event.message ? ` · ${event.message}` : ''}`;
  if (event.type === 'sleep_timer_fired') return `Sleep timer fired${event.message ? ` · ${event.message}` : ''}`;
  if (event.type === 'audio_route_changed') return `Audio route · ${event.route ?? 'changed'}${event.reason ? ` · ${event.reason}` : ''}`;
  if (event.type === 'interruption_began') return `Interruption began${event.reason ? ` · ${event.reason}` : ''}`;
  if (event.type === 'interruption_ended') return `Interruption ended${event.reason ? ` · ${event.reason}` : ''}`;
  if (event.type === 'user_stopped') return 'Stopped by user';
  if (event.type === 'recovered_interrupted') return `Recovered after interruption${event.message ? ` · ${event.message}` : ''}`;
  if (event.type === 'abandoned_interrupted') return `Abandoned after interruption${event.message ? ` · ${event.message}` : ''}`;
  if (event.type === 'os_terminated') return `Ended by the OS${event.message ? ` · ${event.message}` : ''}`;
  if (event.type === 'unknown') return `Ended, reason unknown${event.message ? ` · ${event.message}` : ''}`;
  if (event.type === 'completed') return 'Journey completed';
  if (event.type === 'error') return `Error${event.message || event.reason ? ` · ${event.message ?? event.reason}` : ''}`;
  return 'Journey started';
}

function overnightJourney(
  environment: OvernightEnvironment,
  feel: OvernightFeel,
  protocol: CompiledOvernightProtocol,
  accelerated = false,
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
        const chunkStartMs = index * maxNativeStageMs;
        const durationMs = Math.min(maxNativeStageMs, phase.durationMs - index * maxNativeStageMs);
        return {
          id: `overnight-${phase.id}-${index + 1}`,
          label: phase.label,
          durationMs,
          transitionMs: Math.min(5_000, durationMs),
          target: phase.kind === 'recognitionWindow'
            ? { ...phase.audioConfig, masterGain: phase.audioConfig.masterGain * 0.55 }
            : phase.audioConfig,
          spatialEvents: protocol.events
            .filter(event => event.phaseId === phase.id)
            .filter(event => event.actions.some(action => action.kind === 'playRecognitionSignal'))
            .map(event => ({ event, withinPhaseMs: event.atMs - phase.startsAtMs }))
            .filter(({ withinPhaseMs }) => withinPhaseMs >= chunkStartMs && withinPhaseMs <= chunkStartMs + durationMs)
            .map(({ event, withinPhaseMs }) => ({
              id: event.id,
              type: 'cue' as const,
              atMs: withinPhaseMs - chunkStartMs,
              recognitionSpace: true,
            })),
        };
      });
    });
  const preparationScale = accelerated ? (3 * 60_000) / preparationDurationMs : 1;
  const preparationStages = base.timeline.stages.map(stage => ({
    ...stage,
    durationMs: Math.max(1_000, Math.round(stage.durationMs * preparationScale)),
    transitionMs: Math.min(
      Math.max(1_000, Math.round((stage.transitionMs ?? 0) * preparationScale)),
      Math.max(1_000, Math.round(stage.durationMs * preparationScale)),
    ),
    spatialEvents: stage.spatialEvents?.map(event => ({
      ...event,
      atMs: Math.min(
        Math.max(1_000, Math.round(stage.durationMs * preparationScale)),
        Math.round(event.atMs * preparationScale),
      ),
    })),
  }));
  const scaledPreparationDurationMs = preparationStages.reduce((total, stage) => total + stage.durationMs, 0);
  return {
    ...base,
    // Keep overnight playback distinct from the standalone Lucid Signal
    // trainer; all of its cue events belong to the native overnight timeline.
    id: protocol.id,
    title: 'Overnight Recognition',
    summary: `Recognition practice shaped around the ${environment} before later signals return during sleep.`,
    durationLabel: `${durationLabel(Math.round(protocol.totalDurationMs / 60_000))} · Overnight`,
    overnight: { sleepOnsetDelayMs: scaledPreparationDurationMs },
    timeline: {
      ...base.timeline,
      id: protocol.id,
      title: 'Overnight Recognition',
      endPolicy: 'protocolControlled',
      protocolVersion: protocol.schemaVersion,
      stages: [
        ...preparationStages.map(stage => ({
          ...stage,
          target: {
            ...stage.target,
            toneGain: typeof stage.target.toneGain === 'number'
              ? toneGainForEnvironment(stage.target.toneGain, environment)
              : undefined,
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
  const [accelerated, setAccelerated] = useState(false);
  const [inspectorVisible, setInspectorVisible] = useState(false);
  const [latestMemory, setLatestMemory] = useState<JourneyMemorySession | null>(null);
  const background = useVideoPlayer(require('../assets/videos/lucidscreen.mp4'), player => {
    player.loop = true; player.muted = true; player.audioMixingMode = 'mixWithOthers'; player.play();
  });

  useEffect(() => {
    void Promise.all([getRecognitionSignalId(), getLucidSignalCuePlan()]).then(([storedSignal, storedPlan]) => {
      setSignalId(storedSignal);
      setCuePlan(storedPlan);
    });
  }, []);

  const compiled = useMemo(() => {
    const realProtocol = createRecognitionOvernightProtocol({
      sleepDurationMinutes: durationMinutes,
      environment,
      signalId,
      cuePlan,
      feel,
    });
    return compileOvernightProtocol(
      accelerated && INNER_LAB_BUILD ? createAcceleratedOvernightProtocol(realProtocol) : realProtocol,
      DEFAULT_PROCEDURAL_AUDIO_CONFIG,
    );
  }, [accelerated, cuePlan, durationMinutes, environment, feel, signalId]);
  const recognitionWindows = compiled.phases.filter(phase => phase.kind === 'recognitionWindow').length;

  const chooseSignal = async (nextSignalId: RecognitionSignalId) => {
    setSignalId(nextSignalId);
    await setRecognitionSignalId(nextSignalId);
  };

  const begin = async () => {
    await setRecognitionSignalId(signalId);
    navigation.navigate('LucidJourneyPlayer', { journey: overnightJourney(environment, feel, compiled, accelerated && INNER_LAB_BUILD) });
  };

  const openMemoryInspector = async () => {
    const memory = await loadJourneyMemory();
    setLatestMemory(memory.sessions[0] ?? null);
    setInspectorVisible(true);
  };

  const openMorningReturnTest = async () => {
    await createMorningReturnTestSession({
      ...DEFAULT_PROCEDURAL_AUDIO_CONFIG,
      environment: 'forest',
      environmentGain: 0.12,
    });
    navigation.goBack();
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
      <View
        pointerEvents="none"
        style={[styles.fixedHeader, { top: insets.top + 66 }, Platform.OS === 'android' && styles.androidFixedHeader]}
      >
        <Text style={[Typography.display, styles.title]}>Overnight Journey</Text>
        <Text style={[Typography.body, styles.subtitle]}>Tell Inner where you want to go. The complexity stays beneath the surface.</Text>
      </View>
      <ScrollView contentContainerStyle={[styles.content, { paddingTop: insets.top + (Platform.OS === 'android' ? 210 : 180), paddingBottom: insets.bottom + 34 }]} showsVerticalScrollIndicator={false}>
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

        {INNER_LAB_BUILD ? (
          <View style={styles.developmentTools}>
            <Pressable
              onPress={() => setAccelerated(value => !value)}
              style={[styles.testMode, accelerated && styles.testModeSelected]}
              accessibilityRole="switch"
              accessibilityState={{ checked: accelerated }}
            >
              <Text style={styles.testModeTitle}>ACCELERATED NIGHT TEST</Text>
              <Text style={styles.testModeCopy}>
                {accelerated ? `ON · Full lifecycle in ${durationLabel(Math.ceil(compiled.totalDurationMs / 60_000))}` : 'OFF · Development builds only'}
              </Text>
            </Pressable>
            <Pressable onPress={() => { void openMemoryInspector(); }} style={styles.inspectMemory} accessibilityRole="button">
              <Text style={styles.inspectMemoryText}>INSPECT LATEST JOURNEY MEMORY</Text>
            </Pressable>
            <Pressable onPress={() => { void openMorningReturnTest(); }} style={styles.inspectMemory} accessibilityRole="button">
              <Text style={styles.inspectMemoryText}>TEST MORNING RETURN</Text>
            </Pressable>
          </View>
        ) : null}

        <Pressable onPress={() => { void begin(); }} style={styles.begin} accessibilityRole="button">
          <Text style={styles.beginText}>BEGIN JOURNEY</Text>
        </Pressable>
        <Pressable onPress={() => navigation.goBack()} style={styles.returnButton} accessibilityRole="button">
          <Text style={styles.returnText}>RETURN</Text>
        </Pressable>
      </ScrollView>
      <LinearGradient
        colors={['rgba(2,4,11,0.98)', 'rgba(2,4,11,0.9)', 'rgba(2,4,11,0)']}
        locations={[0, 0.72, 1]}
        pointerEvents="none"
        style={[styles.headerFade, { height: insets.top + (Platform.OS === 'android' ? 230 : 205) }]}
      />
      {INNER_LAB_BUILD ? (
        <Modal visible={inspectorVisible} transparent animationType="fade" onRequestClose={() => setInspectorVisible(false)}>
          <View style={styles.inspectorBackdrop}>
            <View style={[styles.inspectorSheet, { paddingBottom: insets.bottom + 18 }]}>
              <View style={styles.inspectorHeader}>
                <View>
                  <Text style={styles.inspectorEyebrow}>DEVELOPMENT ONLY</Text>
                  <Text style={[Typography.display, styles.inspectorTitle]}>Journey Memory</Text>
                </View>
                <Pressable onPress={() => setInspectorVisible(false)} hitSlop={12} accessibilityRole="button" accessibilityLabel="Close Journey Memory">
                  <Text style={styles.inspectorClose}>CLOSE</Text>
                </Pressable>
              </View>
              {latestMemory ? (
                <ScrollView style={styles.inspectorScroll} showsVerticalScrollIndicator={false}>
                  <Text style={styles.inspectorJourney}>{latestMemory.title}</Text>
                  <Text style={styles.inspectorId}>{latestMemory.journeyId}</Text>
                  <View style={styles.inspectorSummary}>
                    <View style={styles.inspectorMetric}>
                      <Text style={styles.inspectorMetricLabel}>OUTCOME</Text>
                      <Text style={styles.inspectorMetricValue}>{latestMemory.outcome ?? 'active'}</Text>
                    </View>
                    <View style={styles.inspectorMetric}>
                      <Text style={styles.inspectorMetricLabel}>PLANNED</Text>
                      <Text style={styles.inspectorMetricValue}>{clockLabel(latestMemory.plannedDurationMs)}</Text>
                    </View>
                    <View style={styles.inspectorMetric}>
                      <Text style={styles.inspectorMetricLabel}>LISTENED</Text>
                      <Text style={styles.inspectorMetricValue}>{clockLabel(latestMemory.elapsedWallTimeMs ?? (Date.now() - latestMemory.startedAt))}</Text>
                    </View>
                  </View>
                  <Text style={styles.inspectorPolicy}>END · {latestMemory.endReason ?? latestMemory.endPolicy}</Text>
                  <Text style={styles.inspectorEligibility}>
                    {latestMemory.journeyId.startsWith('dev-test-')
                      ? 'EXCLUDED FROM PERSONALIZATION · TEST SESSION'
                      : latestMemory.outcome === 'failed'
                        ? 'EXCLUDED FROM PERSONALIZATION · DIAGNOSTIC'
                        : 'ELIGIBLE FOR PERSONALIZATION'}
                  </Text>
                  <Text style={styles.inspectorEventsTitle}>EVENT TIMELINE · {latestMemory.events.length}</Text>
                  {latestMemory.events.map((event, index) => (
                    <View key={`${event.at}-${event.type}-${index}`} style={styles.inspectorEvent}>
                      <Text style={styles.inspectorEventTime}>{clockLabel(event.positionMs)}</Text>
                      <Text style={styles.inspectorEventText}>{eventLabel(event)}</Text>
                    </View>
                  ))}
                </ScrollView>
              ) : (
                <Text style={styles.inspectorEmpty}>No Journey Memory has been recorded yet.</Text>
              )}
            </View>
          </View>
        </Modal>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#02040B' },
  veil: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.61)' },
  content: { paddingHorizontal: 24 },
  headerFade: { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 2 },
  fixedHeader: { position: 'absolute', left: 24, right: 24, zIndex: 3, alignItems: 'center' },
  androidFixedHeader: { transform: [{ translateY: 30 }] },
  title: { color: '#F4F1FA', fontSize: 24, textAlign: 'center' },
  subtitle: { color: '#D7D1E0', fontFamily: 'Inter-ExtraLight', fontSize: 13, lineHeight: 19, textAlign: 'center', maxWidth: 280, alignSelf: 'center', marginTop: 8 },
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
  developmentTools: { width: 240, alignSelf: 'center', marginTop: 18 },
  testMode: { width: '100%', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, borderRadius: 16, borderWidth: 1, borderColor: 'rgba(190,174,238,0.22)', backgroundColor: 'rgba(7,8,19,0.6)' },
  testModeSelected: { borderColor: 'rgba(205,194,255,0.7)', backgroundColor: 'rgba(105,83,171,0.35)' },
  testModeTitle: { color: '#C8BDF1', fontFamily: 'Inter-Medium', fontSize: 8, letterSpacing: 1.35 },
  testModeCopy: { color: '#AAA2B5', fontFamily: 'Inter-ExtraLight', fontSize: 9, marginTop: 5 },
  inspectMemory: { alignItems: 'center', paddingVertical: 13 },
  inspectMemoryText: { color: '#AFA4D5', fontFamily: 'Inter-Medium', fontSize: 8, letterSpacing: 1.25 },
  inspectorBackdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.7)' },
  inspectorSheet: { maxHeight: '82%', borderTopLeftRadius: 28, borderTopRightRadius: 28, borderWidth: 1, borderBottomWidth: 0, borderColor: 'rgba(190,174,238,0.34)', backgroundColor: '#080A15', paddingTop: 22, paddingHorizontal: 22 },
  inspectorHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingBottom: 16 },
  inspectorEyebrow: { color: '#9E8FD2', fontFamily: 'Inter-Medium', fontSize: 7, letterSpacing: 1.45 },
  inspectorTitle: { color: '#F2EEF9', fontSize: 21, marginTop: 5 },
  inspectorClose: { color: '#BEB5CA', fontFamily: 'Inter-Medium', fontSize: 8, letterSpacing: 1.3 },
  inspectorScroll: { flexGrow: 0 },
  inspectorJourney: { color: '#E9E3F3', fontFamily: 'Inter-Medium', fontSize: 13, marginTop: 3 },
  inspectorId: { color: '#777084', fontFamily: 'Inter-ExtraLight', fontSize: 8, marginTop: 5 },
  inspectorSummary: { flexDirection: 'row', gap: 8, marginTop: 16 },
  inspectorMetric: { flex: 1, minHeight: 55, justifyContent: 'center', paddingHorizontal: 10, borderRadius: 13, backgroundColor: 'rgba(100,80,155,0.14)' },
  inspectorMetricLabel: { color: '#8F83B5', fontFamily: 'Inter-Medium', fontSize: 6, letterSpacing: 1.05 },
  inspectorMetricValue: { color: '#E4DEED', fontFamily: 'Inter-Medium', fontSize: 11, marginTop: 5, textTransform: 'capitalize' },
  inspectorPolicy: { color: '#ABA2B9', fontFamily: 'Inter-ExtraLight', fontSize: 9, marginTop: 14, textTransform: 'uppercase' },
  inspectorEligibility: { color: '#B9A9F0', fontFamily: 'Inter-Medium', fontSize: 7, letterSpacing: 1.05, marginTop: 7 },
  inspectorEventsTitle: { color: '#AFA4D5', fontFamily: 'Inter-Medium', fontSize: 8, letterSpacing: 1.2, marginTop: 23, marginBottom: 7 },
  inspectorEvent: { flexDirection: 'row', alignItems: 'flex-start', paddingVertical: 9, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(190,174,238,0.13)' },
  inspectorEventTime: { width: 52, color: '#817792', fontFamily: 'Inter-Medium', fontSize: 8 },
  inspectorEventText: { flex: 1, color: '#CFC7D8', fontFamily: 'Inter-ExtraLight', fontSize: 10, lineHeight: 14 },
  inspectorEmpty: { color: '#AAA2B5', fontFamily: 'Inter-ExtraLight', fontSize: 12, textAlign: 'center', paddingVertical: 45 },
  returnButton: { alignSelf: 'center', paddingHorizontal: 25, paddingVertical: 16, marginTop: 12 },
  returnText: { color: '#C8C0D2', fontFamily: 'Inter-Medium', fontSize: 9, letterSpacing: 1.6 },
});
