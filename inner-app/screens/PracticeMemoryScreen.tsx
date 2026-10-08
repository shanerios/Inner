import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Animated, Easing, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useHeaderHeight } from '@react-navigation/elements';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { VideoView, useVideoPlayer } from '../core/memorySafeVideo';
import { listEntries, type JournalEntry } from '../core/journalRepo';
import { loadJourneyMemory, type JourneyMemorySession } from '../core/journeyMemory';
import { loadNightRecords, type NightRecord } from '../core/nightRecords';
import { derivePracticeMemoryInsights } from '../core/practiceMemory';
import PracticeExperimentCard from '../components/PracticeExperimentCard';
import {
  armPracticeExperimentNight,
  loadCurrentPracticeExperiment,
  practiceExperimentView,
  startEnvironmentComparisonExperiment,
  stopPracticeExperiment,
  type PracticeExperiment,
} from '../core/practiceExperiments';
import {
  createRecurringSignalJourney,
  deriveRecurringDreamSignal,
  recurringSignalObservation,
  recurringSignalPrompt,
  saveRecurringSignalFocus,
} from '../core/recurringDreamSignals';
import { FACTORY_AUDIO_JOURNEYS } from '../core/audio';
import { deriveAdaptiveRuleEvaluations } from '../core/adaptiveNight';
import {
  deriveRecognitionFocusObservations,
  MIN_RECOGNITION_FOCUS_NIGHTS,
  recognitionFocusEvidenceText,
  recognitionFocusObservationText,
} from '../core/recognitionFocusLearning';
import { derivePracticeState } from '../core/practiceState';
import { nightLearningSample } from '../core/nightLearning';
import { adaptiveRecipeSample } from '../core/adaptiveRecipeLearning';

type Props = { navigation: any };

function recurringSigns(entries: JournalEntry[]) {
  const counts = new Map<string, number>();
  entries.filter(entry => !entry.testSession).forEach(entry => {
    ((entry as any).dreamSigns || []).forEach((sign: string) => counts.set(sign, (counts.get(sign) || 0) + 1));
  });
  return Array.from(counts.entries()).filter(([, count]) => count >= 2).sort((a, b) => b[1] - a[1]).slice(0, 5);
}

const EVIDENCE_EXCLUSION_LABELS: Record<string, string> = {
  test_session: 'test session',
  not_overnight: 'not an Overnight Journey',
  quiet_night: 'marked as a quiet night',
  route_changed: 'audio route changed',
  volume_low: 'device volume was near mute',
  volume_changed: 'device volume changed',
  missing_recipe: 'recipe unavailable',
  missing_execution: 'playback receipt unavailable',
  incomplete_execution: 'journey did not complete',
  missing_cues: 'one or more signals were not delivered',
  interrupted: 'playback was interrupted',
  missing_sleep_answer: 'sleep effect was unanswered',
  signal_level_overridden: 'signal level differed from the proposal',
  missing_recall_answer: 'dream recall was unanswered',
};

function signalExperienceLabel(record: NightRecord): string {
  const experience = record.outcome.signalExperience;
  if (experience === 'in_dream') return 'signal in dream';
  if (experience === 'while_waking') return 'signal while waking';
  if (experience === 'both') return 'signal in dream and while waking';
  if (experience === 'not_noticed') return 'signal not noticed';
  if (experience === 'unsure') return 'signal uncertain';
  if (record.outcome.signalNotice === 'yes') return 'signal noticed';
  if (record.outcome.signalNotice === 'no') return 'signal not noticed';
  if (record.outcome.signalNotice === 'unsure') return 'signal uncertain';
  return 'signal unanswered';
}

export default function PracticeMemoryScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const returnOpacity = useRef(new Animated.Value(0)).current;
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [sessions, setSessions] = useState<JourneyMemorySession[]>([]);
  const [nights, setNights] = useState<NightRecord[]>([]);
  const [experiment, setExperiment] = useState<PracticeExperiment | null>(null);

  const load = useCallback(async () => {
    const [nextEntries, memory, nextNights, nextExperiment] = await Promise.all([
      listEntries(), loadJourneyMemory(), loadNightRecords(), loadCurrentPracticeExperiment(),
    ]);
    setEntries(nextEntries);
    setSessions(memory.sessions);
    setNights(nextNights);
    setExperiment(nextExperiment);
  }, []);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => navigation.addListener('focus', load), [navigation, load]);
  useLayoutEffect(() => {
    navigation.setOptions({
      headerTitle: 'Practice Memory',
      headerTitleAlign: 'center',
      headerTintColor: '#EDEAF6',
      headerBackTitleVisible: false,
      headerTitleStyle: { color: '#EDEAF6' },
      headerStyle: { backgroundColor: 'transparent' },
      headerTransparent: true,
      headerLeft: () => (
        <Animated.View style={{ opacity: returnOpacity, marginLeft: 16 }}>
          <Pressable onPress={() => navigation.goBack()} hitSlop={20} accessibilityRole="button" accessibilityLabel="Return to Dream Log">
            <Text style={styles.return}>RETURN</Text>
          </Pressable>
        </Animated.View>
      ),
    });
    Animated.timing(returnOpacity, { toValue: 0.65, duration: 700, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  }, [navigation, returnOpacity]);

  const bgPlayer = useVideoPlayer(require('../assets/videos/dream_journal_bg.mp4'), player => {
    player.loop = true;
    player.muted = true;
    player.audioMixingMode = 'mixWithOthers';
    player.play();
  });
  const insights = derivePracticeMemoryInsights(entries, sessions, nights);
  const signs = recurringSigns(entries);
  const signal = deriveRecurringDreamSignal(entries);
  const experimentView = experiment ? practiceExperimentView(experiment) : null;
  const adaptiveEvaluations = deriveAdaptiveRuleEvaluations(nights);
  const focusObservations = deriveRecognitionFocusObservations(nights).slice(0, 3);
  const practiceState = derivePracticeState(nights, Date.now(), sessions);
  const remembered = entries.filter(entry => !entry.testSession).length;
  const recentNightEvidence = nights
    .filter(record => !record.testSession && record.source === 'overnight_journey')
    .sort((left, right) => right.reflectedAt - left.reflectedAt)
    .slice(0, 5);

  return (
    <View style={styles.container}>
      <VideoView player={bgPlayer} contentFit="cover" style={StyleSheet.absoluteFill} nativeControls={false} allowsFullscreen={false} allowsPictureInPicture={false} />
      <ScrollView contentContainerStyle={{ paddingTop: headerHeight + 18, paddingBottom: insets.bottom + 32, paddingHorizontal: 18 }}>
        <Text style={styles.intro}>A record of what Inner has observed across your practice. Patterns remain possibilities until enough nights support them.</Text>

        <View style={styles.section}>
          <Text style={styles.eyebrow}>OBSERVATIONS</Text>
          {insights.length ? insights.map((insight, index) => (
            <View key={`${insight.label}-${index}`} style={index ? styles.itemLater : undefined}>
              <Text style={styles.label}>{insight.label}</Text>
              <Text style={styles.body}>{insight.text}</Text>
              {!!insight.evidence && <Text style={styles.evidence}>{insight.evidence}</Text>}
            </View>
          )) : (
            <Text style={styles.empty}>Inner needs a few reflected nights before it can surface an observation.</Text>
          )}
          {!!remembered && <Text style={styles.count}>{remembered} {remembered === 1 ? 'dream' : 'dreams'} remembered</Text>}
        </View>

        {!!recentNightEvidence.length && (
          <View style={styles.section}>
            <Text style={styles.eyebrow}>RECENT NIGHT EVIDENCE</Text>
            {recentNightEvidence.map((record, index) => {
              const signalSample = nightLearningSample(record);
              const recipeSample = adaptiveRecipeSample(record);
              const execution = record.practiceContext?.links.find(link => link.type === 'overnight_journey')?.nightExecution;
              const recipe = record.practiceContext?.nightPlan?.recipe;
              const exclusions = [...new Set([signalSample.exclusion, recipeSample.exclusion].filter(Boolean))]
                .map(exclusion => EVIDENCE_EXCLUSION_LABELS[exclusion!] ?? exclusion);
              const fullyComparable = signalSample.eligibleForCueLevel && recipeSample.eligibleForEnvironment;
              const partlyComparable = signalSample.eligibleForCueLevel || recipeSample.eligibleForEnvironment;
              return (
                <View key={record.id} style={index ? styles.itemLater : undefined}>
                  <Text style={styles.label}>
                    {fullyComparable ? 'COMPARABLE NIGHT' : partlyComparable ? 'PARTIAL EVIDENCE' : 'NOT USED FOR ADAPTATION'}
                  </Text>
                  <Text style={styles.body}>
                    {new Date(record.reflectedAt).toLocaleDateString()} · {recipe?.environment ?? 'Unknown environment'} · {recipe?.recognition.signalId ?? 'Unknown signal'}
                  </Text>
                  <Text style={styles.evidence}>
                    Recall: {record.outcome.recall} · {signalExperienceLabel(record)} · Sleep: {record.outcome.sleepImpact ?? 'unanswered'}
                  </Text>
                  {!!execution?.plannedCues.length && (
                    <Text style={styles.evidence}>Delivered {execution.deliveredCues.length} of {execution.plannedCues.length} planned signals.</Text>
                  )}
                  {!!exclusions.length && <Text style={styles.exclusion}>Excluded from some learning: {exclusions.join(' · ')}.</Text>}
                </View>
              );
            })}
          </View>
        )}

        <View style={styles.section}>
          <Text style={styles.eyebrow}>CURRENT PRACTICE STATE · {practiceState.confidence.toLocaleUpperCase()}</Text>
          <Text style={styles.body}>{practiceState.objective.title}</Text>
          <Text style={styles.evidence}>{practiceState.objective.reason}</Text>
          {!!practiceState.nightsObserved && (
            <Text style={styles.stateEvidence}>
              Recall {practiceState.recall.rememberedNights}/{practiceState.recall.answeredNights}
              {' · '}Signal in dream {practiceState.signalExperience.inDreamNights + practiceState.signalExperience.bothNights}/{practiceState.signalExperience.answeredNights}
              {' · '}Comparable sleep reports {practiceState.sleepSafety.comparableNights}
            </Text>
          )}
          {!!practiceState.recognition.focus && (
            <Text style={styles.stateEvidence}>
              {practiceState.recognition.focus} preparation matched the overnight signal on {practiceState.recognition.matchedPreparationNights} focused {practiceState.recognition.matchedPreparationNights === 1 ? 'night' : 'nights'}.
            </Text>
          )}
        </View>

        {!!adaptiveEvaluations.length && (
          <View style={styles.section}>
            <Text style={styles.eyebrow}>ADAPTIVE NIGHTS</Text>
            {adaptiveEvaluations.map((evaluation, index) => (
              <View key={evaluation.rule} style={index ? styles.itemLater : undefined}>
                <Text style={styles.label}>{evaluation.label}</Text>
                <Text style={styles.body}>{evaluation.text}</Text>
                <Text style={styles.evidence}>{evaluation.evidence}</Text>
              </View>
            ))}
          </View>
        )}

        <View style={styles.section}>
          <PracticeExperimentCard
            view={experimentView}
            onStart={() => { void (async () => { try { await Haptics.selectionAsync(); } catch {} setExperiment(await startEnvironmentComparisonExperiment()); })(); }}
            onContinue={() => {
              if (!experiment || !experimentView?.nextCondition) return;
              void (async () => {
                try { await Haptics.selectionAsync(); } catch {}
                const armed = await armPracticeExperimentNight(experiment.id);
                if (!armed) return;
                navigation.navigate('OvernightJourney', { suggestedEnvironment: experimentView.nextCondition?.id, experimentId: experiment.id });
              })();
            }}
            onStop={() => {
              if (!experiment) return;
              void (async () => { try { await Haptics.selectionAsync(); } catch {} await stopPracticeExperiment(experiment.id); setExperiment(await loadCurrentPracticeExperiment()); })();
            }}
          />
        </View>

        {!!signs.length && (
          <View style={styles.section}>
            <Text style={styles.eyebrow}>RECURRING SIGNALS</Text>
            <View style={styles.signRow}>
              {signs.map(([sign, count]) => <View key={sign} style={styles.signChip}><Text style={styles.signText}>{sign} · {count}</Text></View>)}
            </View>
          </View>
        )}

        {!!focusObservations.length && (
          <View style={styles.section}>
            <Text style={styles.eyebrow}>RECOGNITION FOCUS OUTCOMES</Text>
            {focusObservations.map((observation, index) => (
              <View key={observation.sign.toLocaleLowerCase()} style={index ? styles.itemLater : undefined}>
                <Text style={styles.label}>
                  {observation.answeredNights >= MIN_RECOGNITION_FOCUS_NIGHTS ? 'OBSERVED' : 'NOT ENOUGH INFORMATION'}
                </Text>
                <Text style={styles.body}>{recognitionFocusObservationText(observation)}</Text>
                <Text style={styles.evidence}>{recognitionFocusEvidenceText(observation)}</Text>
              </View>
            ))}
          </View>
        )}

        {!!signal && (
          <View style={styles.section}>
            <Text style={styles.eyebrow}>RECOGNITION PRACTICE</Text>
            <Text style={styles.body}>{recurringSignalObservation(signal)}</Text>
            <Text style={styles.evidence}>{recurringSignalPrompt(signal.sign)}</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Practice recognizing ${signal.sign} as a dream sign`}
              onPress={async () => {
                const base = FACTORY_AUDIO_JOURNEYS.find(journey => journey.id === 'lucid-signal');
                if (!base) return;
                try { await Haptics.selectionAsync(); } catch {}
                await saveRecurringSignalFocus(signal);
                navigation.navigate('LucidJourneyPlayer', { journey: createRecurringSignalJourney(base, signal.sign) });
              }}
              style={styles.button}
            >
              <Text style={styles.buttonText}>PRACTICE WITH {signal.sign.toLocaleUpperCase()}</Text>
            </Pressable>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#07050D' },
  return: { fontFamily: 'CalSans-Regular', fontSize: 11, letterSpacing: 3.5, color: '#FFFFFF' },
  intro: { color: '#C8C0D5', fontFamily: 'Inter-Light', fontSize: 12, lineHeight: 18, marginBottom: 18 },
  section: { marginBottom: 14, padding: 16, borderRadius: 16, borderWidth: 1, borderColor: 'rgba(255,255,255,0.09)', backgroundColor: 'rgba(10,8,20,0.46)' },
  eyebrow: { color: '#A99BC8', fontFamily: 'Inter-Medium', fontSize: 9, letterSpacing: 1.35, marginBottom: 9 },
  label: { color: '#9F96C5', fontFamily: 'Inter-Medium', fontSize: 9, letterSpacing: 1.1, marginBottom: 3 },
  body: { color: '#E3DEEF', fontFamily: 'Inter-Light', fontSize: 12, lineHeight: 18 },
  evidence: { color: '#B9B2C7', fontFamily: 'Inter-Light', fontSize: 10, lineHeight: 15, marginTop: 4 },
  stateEvidence: { color: '#8F87A0', fontFamily: 'Inter-ExtraLight', fontSize: 9, lineHeight: 14, marginTop: 9 },
  exclusion: { color: '#9E8E9D', fontFamily: 'Inter-ExtraLight', fontSize: 9, lineHeight: 14, marginTop: 4 },
  itemLater: { marginTop: 14, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: 'rgba(255,255,255,0.09)' },
  empty: { color: '#BDB5C9', fontFamily: 'Inter-Light', fontSize: 12, lineHeight: 18 },
  count: { color: '#9F96C5', fontFamily: 'Inter-Light', fontSize: 10, marginTop: 12 },
  signRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  signChip: { paddingHorizontal: 9, paddingVertical: 5, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.06)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.09)' },
  signText: { color: '#D8D3EA', fontFamily: 'Inter-Light', fontSize: 11 },
  button: { alignSelf: 'flex-start', minHeight: 36, justifyContent: 'center', marginTop: 11, paddingHorizontal: 14, borderRadius: 18, borderWidth: 1, borderColor: 'rgba(205,194,255,0.30)', backgroundColor: 'rgba(142,136,216,0.14)' },
  buttonText: { color: '#DDD6EF', fontFamily: 'Inter-Medium', fontSize: 9, letterSpacing: 1.05 },
});
