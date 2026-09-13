import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, AppState, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useVideoPlayer, VideoView } from '../core/memorySafeVideo';
import {
  DEFAULT_PROCEDURAL_AUDIO_CONFIG,
  createDreamIncubationJourney,
  deletePersonalizedJourney,
  FACTORY_AUDIO_JOURNEYS,
  loadPersonalizedJourneys,
  proceduralAudioEngine,
  ProceduralPlaybackSession,
  SavedPersonalizedJourney,
} from '../core/audio';
import { Typography } from '../core/typography';
import {
  cancelLucidityCueNotifications,
  hasLucidityCueNotificationsScheduled,
  scheduleRecognitionSignalTestNotification,
} from '../utils/notifications';
import {
  abandonPendingLucidSignalNight,
  getPendingLucidSignalReflection,
  getLucidSignalCuePlan,
  loadLucidSignalLearning,
  lucidSignalLearningSummary,
  lucidSignalRecommendation,
  LucidSignalCuePlan,
  LucidSignalLearningSummary,
  LucidSignalNight,
  resetLucidSignalLearning,
  saveLucidSignalReflection,
  saveLucidSignalMorningCapture,
  setLucidSignalCuePlan,
  SignalNotice,
  SleepImpact,
  DreamRecall,
} from '../core/lucidSignalLearning';
import { clearDreamSeed, DreamSeed, loadDreamSeed, saveDreamSeed } from '../core/dreamIncubation';
import {
  createRecognitionSignalSound,
  getRecognitionSignalId,
  recognitionSignalById,
  RECOGNITION_SIGNALS,
  RecognitionSignalId,
  setRecognitionSignalId,
} from '../core/recognitionSignals';
import {
  pendingOvernightReflection,
  saveOvernightReflection,
  saveOvernightMorningCapture,
  deriveJourneyMemoryProfile,
  JourneyMemoryProfile,
  loadJourneyMemory,
} from '../core/journeyMemory';
import { createEntry } from '../core/journalRepo';
import type { Audio } from 'expo-av';

export default function LucidJourneysScreen() {
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const [expandedJourneyId, setExpandedJourneyId] = useState<string | null>(null);
  const [savedJourneys, setSavedJourneys] = useState<SavedPersonalizedJourney[]>([]);
  const [savedJourneysVisible, setSavedJourneysVisible] = useState(false);
  const [cueScheduled, setCueScheduled] = useState(false);
  const [previewingSignal, setPreviewingSignal] = useState(false);
  const [pendingReflection, setPendingReflection] = useState<(LucidSignalNight & { journeySessionId?: string; preview?: boolean }) | null>(null);
  const [morningReflectionVisible, setMorningReflectionVisible] = useState(false);
  const [learningSummary, setLearningSummary] = useState<LucidSignalLearningSummary | null>(null);
  const [learningNights, setLearningNights] = useState<LucidSignalNight[]>([]);
  const [cuePlan, setCuePlan] = useState<LucidSignalCuePlan>('standard');
  const [insightExpanded, setInsightExpanded] = useState(false);
  const [historyExpanded, setHistoryExpanded] = useState(false);
  const [dreamSeedExpanded, setDreamSeedExpanded] = useState(false);
  const [innerReflectionsVisible, setInnerReflectionsVisible] = useState(false);
  const [journeyPatternsExpanded, setJourneyPatternsExpanded] = useState(false);
  const [journeyMemoryProfile, setJourneyMemoryProfile] = useState<JourneyMemoryProfile | null>(null);
  const [dreamSeed, setDreamSeed] = useState<DreamSeed | null>(null);
  const [dreamSeedDraft, setDreamSeedDraft] = useState('');
  const [recognitionSignalId, setRecognitionSignalIdState] = useState<RecognitionSignalId>('ascending');
  const [noticed, setNoticed] = useState<SignalNotice | null>(null);
  const [lucid, setLucid] = useState<boolean | null>(null);
  const [sleepImpact, setSleepImpact] = useState<SleepImpact | null>(null);
  const [dreamRecall, setDreamRecall] = useState<DreamRecall | null>(null);
  const [morningStep, setMorningStep] = useState<'capture' | 'reflection'>('capture');
  const [morningCapture, setMorningCapture] = useState('');
  const [morningCaptureEntryId, setMorningCaptureEntryId] = useState<string | null>(null);
  const [morningCaptureSaving, setMorningCaptureSaving] = useState(false);
  const previewSessionRef = useRef(new ProceduralPlaybackSession(proceduralAudioEngine));
  const recognitionSoundRef = useRef<Audio.Sound | null>(null);
  const previewStopTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const background = useVideoPlayer(require('../assets/videos/lucidscreen.mp4'), player => {
    player.loop = true;
    player.muted = true;
    player.audioMixingMode = 'mixWithOthers';
    player.play();
  });

  const lucidReturn = FACTORY_AUDIO_JOURNEYS.find(item => item.id === 'lucid-return-wbtb')!;
  const lucidThreshold = FACTORY_AUDIO_JOURNEYS.find(item => item.id === 'lucid-threshold')!;
  const lucidSignal = FACTORY_AUDIO_JOURNEYS.find(item => item.id === 'lucid-signal')!;

  const stopSignalPreview = useCallback(async () => {
    if (previewStopTimerRef.current) clearTimeout(previewStopTimerRef.current);
    previewStopTimerRef.current = null;
    const signalSound = recognitionSoundRef.current;
    recognitionSoundRef.current = null;
    if (signalSound) {
      await signalSound.stopAsync().catch(() => {});
      await signalSound.unloadAsync().catch(() => {});
    }
    await previewSessionRef.current.stop().catch(() => {});
    setPreviewingSignal(false);
  }, []);

  const begin = async (journeyId: string) => {
    if (previewingSignal) await stopSignalPreview();
    navigation.navigate('LucidJourneyPlayer', { journeyId });
  };
  const beginSaved = (journey: SavedPersonalizedJourney) => navigation.navigate('LucidJourneyPlayer', { journey });

  const previewSignal = useCallback(async () => {
    try {
      if (!previewSessionRef.current.isAvailable()) throw new Error('The procedural audio engine is unavailable in this build.');
      await stopSignalPreview();
      await previewSessionRef.current.start({
        ...DEFAULT_PROCEDURAL_AUDIO_CONFIG,
        toneGain: 0,
        binauralGain: 0,
        noiseColor: null,
        noiseGain: 0,
        environment: 'none',
        environmentGain: 0,
        templeGain: 0,
        masterGain: 0.8,
      }, 'Lucid Signal Preview');
      setPreviewingSignal(true);
      const sound = await createRecognitionSignalSound(recognitionSignalId);
      recognitionSoundRef.current = sound;
      await sound.playAsync();
      previewStopTimerRef.current = setTimeout(
        () => { void stopSignalPreview(); },
        recognitionSignalById(recognitionSignalId).durationMs + 500,
      );
    } catch (previewError) {
      setPreviewingSignal(false);
      Alert.alert('Preview unavailable', previewError instanceof Error ? previewError.message : String(previewError));
    }
  }, [recognitionSignalId, stopSignalPreview]);

  const testSignalNotification = useCallback(async () => {
    const scheduled = await scheduleRecognitionSignalTestNotification();
    if (!scheduled) {
      Alert.alert('Test unavailable', 'Allow notifications for Inner Lab in Settings, then try again.');
      return;
    }
    Alert.alert(
      'Signal scheduled',
      `${recognitionSignalById(recognitionSignalId).name} will arrive in about 8 seconds. Go to the simulator Home Screen now.`,
    );
  }, [recognitionSignalId]);

  const chooseRecognitionSignal = useCallback(async (id: RecognitionSignalId) => {
    await stopSignalPreview();
    await setRecognitionSignalId(id);
    setRecognitionSignalIdState(id);
  }, [stopSignalPreview]);

  const cancelTonight = useCallback(async () => {
    await cancelLucidityCueNotifications();
    await abandonPendingLucidSignalNight();
    setCueScheduled(false);
  }, []);

  useEffect(() => {
    setNoticed(null);
    setLucid(null);
    setSleepImpact(null);
    setDreamRecall(null);
    setMorningStep(pendingReflection?.morningCaptureEntryId ? 'reflection' : 'capture');
    setMorningCapture('');
    setMorningCaptureEntryId(null);
  }, [pendingReflection?.id, pendingReflection?.morningCaptureEntryId]);

  const offeredReflectionIdRef = useRef<string | null>(null);

  const captureMorningDream = useCallback(async () => {
    if (!pendingReflection || !morningCapture.trim() || morningCaptureSaving) return;
    if (pendingReflection.preview) {
      setMorningStep('reflection');
      return;
    }
    setMorningCaptureSaving(true);
    let entryId = morningCaptureEntryId;
    try {
      if (!entryId) {
        const entry = await createEntry({
          body: morningCapture.trim(),
          kind: 'dream',
          journeySessionId: pendingReflection.journeySessionId,
          captureSource: 'morning_return',
        });
        entryId = entry.id;
        setMorningCaptureEntryId(entry.id);
      }
      if (pendingReflection.journeySessionId) {
        await saveOvernightMorningCapture(pendingReflection.journeySessionId, entryId);
      } else {
        await saveLucidSignalMorningCapture(pendingReflection.id, entryId);
      }
      setMorningStep('reflection');
    } catch {
      Alert.alert(
        entryId ? 'Dream saved' : 'Dream not saved',
        entryId
          ? 'Your dream is safe in the Journal, but Inner could not link it to this journey yet. Please try again.'
          : 'Your words are still here. Please try again.',
      );
    } finally {
      setMorningCaptureSaving(false);
    }
  }, [morningCapture, morningCaptureEntryId, morningCaptureSaving, pendingReflection]);

  const continueWithoutRecall = useCallback(() => {
    setDreamRecall('none');
    setMorningStep('reflection');
  }, []);

  const submitReflection = useCallback(async () => {
    if (!pendingReflection || !dreamRecall || !noticed || lucid === null || !sleepImpact) return;
    try {
      if (pendingReflection.journeySessionId) {
        await saveOvernightReflection(pendingReflection.journeySessionId, { recall: dreamRecall, noticed, lucid, sleepImpact });
      } else if (!pendingReflection.preview) {
        const learning = await saveLucidSignalReflection(pendingReflection.id, { recall: dreamRecall, noticed, lucid, sleepImpact });
        setLearningNights(learning.nights);
        setLearningSummary(lucidSignalLearningSummary(learning.nights));
      }
    } catch {
      Alert.alert('Reflection not saved', 'Your answers are still here. Please try again.');
      return;
    }
    setPendingReflection(null);
    setMorningReflectionVisible(false);
    setNoticed(null);
    setLucid(null);
    setSleepImpact(null);
    setDreamRecall(null);
    setMorningCapture('');
    setMorningCaptureEntryId(null);
    setMorningStep('capture');
  }, [dreamRecall, lucid, noticed, pendingReflection, sleepImpact]);

  const previewMorningReflection = useCallback(async () => {
    const now = Date.now();
    const testNight = {
      id: 'preview', scheduledAt: now, sleepOnsetAt: now,
      cueTimes: [], reviewAt: now, preview: true,
    };
    setPendingReflection(testNight);
    setMorningReflectionVisible(true);
  }, []);

  useEffect(() => () => {
    if (previewStopTimerRef.current) clearTimeout(previewStopTimerRef.current);
    void previewSessionRef.current.stop();
  }, []);

  useFocusEffect(useCallback(() => {
    let active = true;
    offeredReflectionIdRef.current = null;
    const refresh = () => {
      void Promise.all([
      loadPersonalizedJourneys(),
      hasLucidityCueNotificationsScheduled(),
      getPendingLucidSignalReflection(),
      loadLucidSignalLearning(),
      getLucidSignalCuePlan(),
      loadDreamSeed(),
      getRecognitionSignalId(),
      loadJourneyMemory(),
    ]).then(([journeys, hasCues, reflection, learning, selectedCuePlan, savedDreamSeed, selectedSignalId, journeyMemory]) => {
      if (!active) return;
      setSavedJourneys(journeys);
      setCueScheduled(hasCues);
      const overnight = pendingOvernightReflection(journeyMemory);
      const pending = overnight ? {
        id: overnight.id, journeySessionId: overnight.id,
        scheduledAt: overnight.startedAt, sleepOnsetAt: overnight.startedAt,
        cueTimes: [], reviewAt: overnight.startedAt + overnight.plannedDurationMs,
        morningCaptureEntryId: overnight.morningCapture?.journalEntryId,
      } : reflection;
      if ((pending?.id ?? null) !== offeredReflectionIdRef.current) {
        offeredReflectionIdRef.current = pending?.id ?? null;
        setPendingReflection(pending);
        setMorningReflectionVisible(Boolean(pending));
      }
      setLearningNights(learning.nights);
      setLearningSummary(lucidSignalLearningSummary(learning.nights));
      setCuePlan(selectedCuePlan);
      setDreamSeed(savedDreamSeed);
      setDreamSeedDraft(savedDreamSeed?.text ?? '');
      setRecognitionSignalIdState(selectedSignalId);
      setJourneyMemoryProfile(deriveJourneyMemoryProfile(journeyMemory));
      }).catch(() => {});
    };
    refresh();
    const subscription = AppState.addEventListener('change', state => {
      if (state === 'active') refresh();
    });
    return () => { active = false; subscription.remove(); };
  }, []));

  const removeSavedJourney = (journey: SavedPersonalizedJourney) => {
    Alert.alert('Remove saved journey?', journey.title, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove', style: 'destructive', onPress: () => {
          void deletePersonalizedJourney(journey.id).then(setSavedJourneys);
          setExpandedJourneyId(current => current === journey.id ? null : current);
        },
      },
    ]);
  };

  const useRecommendedPlan = async (plan: LucidSignalCuePlan) => {
    await setLucidSignalCuePlan(plan);
    setCuePlan(plan);
  };

  const resetLearning = () => {
    Alert.alert(
      'Reset Lucid Signal learning?',
      'This removes your private reflection history and returns future cue plans to the standard schedule. Cues already scheduled for tonight will remain.',
      [
        { text: 'Keep Learning', style: 'cancel' },
        {
          text: 'Reset',
          style: 'destructive',
          onPress: () => {
            void resetLucidSignalLearning().then(() => {
              setLearningNights([]);
              setLearningSummary(null);
              setPendingReflection(null);
              setMorningReflectionVisible(false);
              setCuePlan('standard');
              setInsightExpanded(false);
              setHistoryExpanded(false);
            });
          },
        },
      ],
    );
  };

  const recommendation = lucidSignalRecommendation(learningNights, cuePlan);
  const completedNights = learningNights.filter(night => night.reflection);
  const rememberedJourneyTitle = journeyMemoryProfile?.mostRepeatedJourneyId
    ? [...FACTORY_AUDIO_JOURNEYS, ...savedJourneys]
      .find(item => item.id === journeyMemoryProfile.mostRepeatedJourneyId)?.title ?? null
    : null;
  const typicalJourneyMinutes = journeyMemoryProfile?.typicalCompletedDurationMs
    ? Math.round(journeyMemoryProfile.typicalCompletedDurationMs / 60_000)
    : null;
  const environmentName = journeyMemoryProfile?.preferredEnvironment
    ? journeyMemoryProfile.preferredEnvironment[0].toUpperCase() + journeyMemoryProfile.preferredEnvironment.slice(1)
    : null;
  const noiseName = journeyMemoryProfile?.preferredNoiseColor
    ? journeyMemoryProfile.preferredNoiseColor[0].toUpperCase() + journeyMemoryProfile.preferredNoiseColor.slice(1)
    : null;

  const keepDreamSeed = async () => {
    const saved = await saveDreamSeed(dreamSeedDraft);
    if (!saved) return;
    setDreamSeed(saved);
    setDreamSeedDraft(saved.text);
    setDreamSeedExpanded(false);
  };

  const releaseDreamSeed = async () => {
    await clearDreamSeed();
    setDreamSeed(null);
    setDreamSeedDraft('');
    setDreamSeedExpanded(false);
  };

  const beginDreamIncubation = () => {
    if (!dreamSeed) return;
    const journey = createDreamIncubationJourney(dreamSeed.text);
    setInnerReflectionsVisible(false);
    navigation.navigate('LucidJourneyPlayer', { journey });
  };

  return (
    <View style={styles.root}>
      <VideoView
        player={background}
        contentFit="cover"
        style={StyleSheet.absoluteFill}
        nativeControls={false}
        allowsFullscreen={false}
        allowsPictureInPicture={false}
      />
      <LinearGradient
        colors={['rgba(2,4,12,0.76)', 'rgba(2,5,14,0.12)', 'rgba(2,4,12,0.92)']}
        locations={[0, 0.42, 1]}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />

      <View
        pointerEvents="none"
        style={[
          styles.fixedIntro,
          { top: insets.top + 102 },
          Platform.OS === 'android' && styles.androidTitleOffset,
        ]}
      >
        <Text style={[Typography.display, styles.title]}>Lucid Journeys</Text>
        <Text style={[Typography.body, styles.subtitle]}>
          Practices for carrying awareness across the threshold of sleep.
        </Text>
      </View>

      <Pressable
        onPress={() => setInnerReflectionsVisible(true)}
        accessibilityRole="button"
        accessibilityLabel="Open Inner reflections and Dream Seed"
        style={[styles.reflectionsLauncher, { top: insets.top + 18 }]}
      >
        <Ionicons name="sparkles-outline" size={16} color="#D8CFF1" />
        {(learningSummary || dreamSeed) ? <View style={styles.reflectionsDot} /> : null}
      </Pressable>

      <ScrollView
        style={[styles.scrollViewport, { marginTop: insets.top + (Platform.OS === 'android' ? 218 : 188) }]}
        contentContainerStyle={[styles.content, { paddingTop: 18, paddingBottom: insets.bottom + 28 }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View style={[styles.cards, Platform.OS === 'android' && styles.androidCards]}>
          {[lucidReturn, lucidThreshold, lucidSignal].map(journey => {
            const expanded = expandedJourneyId === journey.id;
            return (
              <View key={journey.id} style={styles.journey}>
                <View style={styles.journeyHeading}>
                  <Pressable
                    onPress={() => begin(journey.id)}
                    accessibilityRole="button"
                    accessibilityLabel={`Begin ${journey.title}, ${journey.durationLabel}`}
                    style={styles.titleButton}
                  >
                    <Text style={[Typography.display, styles.cardTitle]}>{journey.title}</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => setExpandedJourneyId(expanded ? null : journey.id)}
                    accessibilityRole="button"
                    accessibilityLabel={`${expanded ? 'Hide' : 'Show'} details for ${journey.title}`}
                    accessibilityState={{ expanded }}
                    style={styles.detailsPill}
                  >
                    <Text style={styles.detailsPillText}>{journey.durationLabel.split(' · ')[0]}</Text>
                    <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={12} color="#CFC5F2" />
                  </Pressable>
                </View>
                {expanded ? (
                  <View style={styles.journeyDetails}>
                    <Text style={[Typography.body, styles.summary]}>{journey.summary}</Text>
                    {journey.id === 'lucid-signal' ? (
                      <View style={styles.signalCalibration}>
                        <Text style={styles.signalCalibrationCopy}>
                          Preview the exact recognition signal, then set your device and notification volume to a level you would be comfortable hearing during sleep.
                        </Text>
                        <Pressable
                          onPress={() => { void previewSignal(); }}
                          accessibilityRole="button"
                          accessibilityLabel="Preview the lucid signal"
                          style={styles.signalButton}
                        >
                          <Text style={styles.signalButtonText}>{previewingSignal ? 'PLAYING SIGNAL' : 'PREVIEW SIGNAL'}</Text>
                        </Pressable>
                      </View>
                    ) : null}
                  </View>
                ) : null}
              </View>
            );
          })}
          {cueScheduled ? (
            <View style={styles.tonightCueStatus}>
              <View>
                <Text style={styles.tonightCueLabel}>TONIGHT’S SIGNALS ARE SCHEDULED</Text>
                <Text style={styles.tonightCueHint}>Three later-night notification cues</Text>
              </View>
              <Pressable
                onPress={() => { void cancelTonight(); }}
                accessibilityRole="button"
                accessibilityLabel="Cancel tonight’s lucid signals"
                style={styles.cancelCueButton}
              >
                <Text style={styles.cancelCueText}>CANCEL TONIGHT</Text>
              </Pressable>
              {__DEV__ ? (
                <Pressable
                  onPress={() => { void previewMorningReflection(); }}
                  accessibilityRole="button"
                  accessibilityLabel="Preview tomorrow morning's reflection"
                  style={styles.testReflectionButton}
                >
                  <Text style={styles.testReflectionText}>TEST REFLECTION</Text>
                </Pressable>
              ) : null}
            </View>
          ) : null}
          {learningSummary ? (
            <View style={[styles.insightCard, styles.mainHiddenUtility]}>
              <Pressable
                onPress={() => setInsightExpanded(expanded => !expanded)}
                accessibilityRole="button"
                accessibilityLabel={`${insightExpanded ? 'Hide' : 'Show'} what Inner is noticing`}
                accessibilityState={{ expanded: insightExpanded }}
                style={styles.insightHeader}
              >
                <View style={styles.insightHeadingCopy}>
                  <Text style={styles.reflectionEyebrow}>{learningSummary.label}</Text>
                  <Text style={[Typography.display, styles.insightTitle]}>What Inner is noticing</Text>
                </View>
                <Ionicons name={insightExpanded ? 'chevron-up' : 'chevron-down'} size={14} color="#CFC5F2" />
              </Pressable>
              {insightExpanded ? (
                <View style={styles.insightDetails}>
                  <Text style={styles.insightCopy}>{learningSummary.text}</Text>
                  {recommendation ? (
                    <View style={styles.recommendationCard}>
                      <Text style={styles.recommendationEyebrow}>TONIGHT’S SIGNAL</Text>
                      <Text style={[Typography.display, styles.recommendationTitle]}>{recommendation.title}</Text>
                      <Text style={styles.recommendationCopy}>{recommendation.reason}</Text>
                      <Text style={styles.planCopy}>
                        {recommendation.plan === 'gentle' ? '2 later cues · 5.5 and 7 hours' : '3 cues · 4.5, 6, and 7.5 hours'}
                      </Text>
                      {recommendation.volumeGuidance ? <Text style={styles.volumeGuidance}>{recommendation.volumeGuidance}</Text> : null}
                      <Pressable
                        onPress={() => { void useRecommendedPlan(recommendation.plan); }}
                        accessibilityRole="button"
                        accessibilityLabel={`${cuePlan === recommendation.plan ? 'Selected' : 'Use'} recommended cue plan`}
                        style={[styles.usePlanButton, cuePlan === recommendation.plan && styles.usePlanButtonSelected]}
                      >
                        <Text style={styles.usePlanText}>
                          {cuePlan === recommendation.plan ? 'SELECTED' : cueScheduled ? 'USE NEXT NIGHT' : 'USE TONIGHT'}
                        </Text>
                      </Pressable>
                    </View>
                  ) : null}
                  <Pressable
                    onPress={() => setHistoryExpanded(expanded => !expanded)}
                    accessibilityRole="button"
                    accessibilityState={{ expanded: historyExpanded }}
                    style={styles.historyHeader}
                  >
                    <Text style={styles.historyHeaderText}>VIEW MY PATTERN</Text>
                    <Ionicons name={historyExpanded ? 'chevron-up' : 'chevron-down'} size={12} color="#AFA5C2" />
                  </Pressable>
                  {historyExpanded ? (
                    <View style={styles.historyList}>
                      {completedNights.slice(0, 7).map(night => (
                        <View key={night.id} style={styles.historyRow}>
                          <Text style={styles.historyDate}>{new Date(night.sleepOnsetAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</Text>
                          <Text style={styles.historyResult}>
                            {night.reflection?.noticed === 'yes' ? 'Signal noticed' : night.reflection?.noticed === 'unsure' ? 'Signal unclear' : 'Not noticed'}
                            {' · '}{night.reflection?.lucid ? 'Lucid' : 'Not lucid'}
                            {' · '}{night.reflection?.sleepImpact === 'woke' ? 'Woke me' : night.reflection?.sleepImpact === 'gentle' ? 'Gentle' : 'Undisturbed'}
                          </Text>
                        </View>
                      ))}
                      <Pressable onPress={resetLearning} accessibilityRole="button" style={styles.resetLearningButton}>
                        <Text style={styles.resetLearningText}>RESET LEARNING</Text>
                      </Pressable>
                    </View>
                  ) : null}
                </View>
              ) : null}
            </View>
          ) : null}
          <View style={[styles.dreamSeedCard, styles.mainHiddenUtility]}>
            <Pressable
              onPress={() => setDreamSeedExpanded(expanded => !expanded)}
              accessibilityRole="button"
              accessibilityState={{ expanded: dreamSeedExpanded }}
              accessibilityLabel={`${dreamSeedExpanded ? 'Hide' : 'Open'} Dream Seed`}
              style={styles.dreamSeedHeader}
            >
              <View style={styles.dreamSeedHeading}>
                <Text style={styles.dreamSeedEyebrow}>{dreamSeed ? 'SEED HELD FOR TONIGHT' : 'DREAM INCUBATION'}</Text>
                <Text style={[Typography.display, styles.dreamSeedTitle]}>Dream Seed</Text>
              </View>
              <Ionicons name={dreamSeedExpanded ? 'chevron-up' : 'chevron-down'} size={13} color="#CFC5F2" />
            </Pressable>
            {!dreamSeedExpanded && dreamSeed ? <Text numberOfLines={1} style={styles.dreamSeedPreview}>“{dreamSeed.text}”</Text> : null}
            {dreamSeedExpanded ? (
              <View style={styles.dreamSeedDetails}>
                <Text style={styles.dreamSeedPrompt}>What would you like to meet in a dream?</Text>
                <TextInput
                  value={dreamSeedDraft}
                  onChangeText={setDreamSeedDraft}
                  maxLength={120}
                  multiline
                  placeholder="A place, question, person, or feeling…"
                  placeholderTextColor="#746D80"
                  accessibilityLabel="Dream Seed"
                  style={styles.dreamSeedInput}
                />
                <View style={styles.dreamSeedActions}>
                  {dreamSeed ? (
                    <Pressable onPress={() => { void releaseDreamSeed(); }} accessibilityRole="button" style={styles.releaseSeedButton}>
                      <Text style={styles.releaseSeedText}>RELEASE</Text>
                    </Pressable>
                  ) : null}
                  <Pressable
                    onPress={() => { void keepDreamSeed(); }}
                    disabled={!dreamSeedDraft.trim()}
                    accessibilityRole="button"
                    style={[styles.keepSeedButton, !dreamSeedDraft.trim() && styles.disabledReflection]}
                  >
                    <Text style={styles.keepSeedText}>{dreamSeed ? 'UPDATE SEED' : 'HOLD THIS SEED'}</Text>
                  </Pressable>
                </View>
                <Text style={styles.privateCopy}>Private to this device.</Text>
              </View>
            ) : null}
          </View>
          <Pressable
            onPress={() => navigation.navigate('OvernightJourney')}
            accessibilityRole="button"
            accessibilityLabel="Create an overnight journey"
            style={styles.overnightJourney}
          >
            <Text style={[Typography.display, styles.cardTitle]}>Overnight Journey</Text>
            <Text style={styles.createJourneyHint}>INNER CONSTRUCTS THE NIGHT</Text>
          </Pressable>
          <Pressable
            onPress={() => navigation.navigate('CreateLucidJourney')}
            accessibilityRole="button"
            accessibilityLabel="Create a personalized lucid journey"
            style={styles.createJourney}
          >
            <Text style={[Typography.display, styles.cardTitle]}>Create a Journey</Text>
            <Text style={styles.createJourneyHint}>PERSONALIZED PRACTICE</Text>
          </Pressable>
          {savedJourneys.length ? (
            <View style={styles.savedSection}>
              <Pressable
                onPress={() => setSavedJourneysVisible(visible => !visible)}
                accessibilityRole="button"
                accessibilityLabel={`${savedJourneysVisible ? 'Hide' : 'Show'} ${savedJourneys.length} saved journeys`}
                accessibilityState={{ expanded: savedJourneysVisible }}
                style={styles.savedHeader}
              >
                <Text style={styles.savedLabel}>SAVED JOURNEYS</Text>
                <View style={styles.savedCountPill}>
                  <Text style={styles.savedCount}>{savedJourneys.length}</Text>
                  <Ionicons name={savedJourneysVisible ? 'chevron-up' : 'chevron-down'} size={12} color="#CFC5F2" />
                </View>
              </Pressable>
              {savedJourneysVisible ? savedJourneys.map(journey => {
                const expanded = expandedJourneyId === journey.id;
                return (
                  <View key={journey.id} style={styles.journey}>
                    <View style={styles.journeyHeading}>
                      <Pressable
                        onPress={() => beginSaved(journey)}
                        accessibilityRole="button"
                        accessibilityLabel={`Begin saved journey ${journey.title}`}
                        style={styles.titleButton}
                      >
                        <Text style={[Typography.display, styles.savedTitle]}>{journey.title}</Text>
                      </Pressable>
                      <Pressable
                        onPress={() => setExpandedJourneyId(expanded ? null : journey.id)}
                        accessibilityRole="button"
                        accessibilityLabel={`${expanded ? 'Hide' : 'Show'} details for ${journey.title}`}
                        accessibilityState={{ expanded }}
                        style={styles.detailsPill}
                      >
                        <Text style={styles.detailsPillText}>{journey.durationLabel.split(' · ')[0]}</Text>
                        <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={12} color="#CFC5F2" />
                      </Pressable>
                    </View>
                    {expanded ? (
                      <View style={styles.savedDetails}>
                        <Text style={[Typography.body, styles.summary]}>{journey.summary}</Text>
                        <Pressable onPress={() => removeSavedJourney(journey)} accessibilityRole="button" style={styles.removeButton}>
                          <Text style={styles.removeText}>REMOVE</Text>
                        </Pressable>
                      </View>
                    ) : null}
                  </View>
                );
              }) : null}
            </View>
          ) : null}
        </View>

        <Pressable
          onPress={() => navigation.navigate('LiveMix')}
          accessibilityRole="button"
          accessibilityLabel="Explore Live Mix"
          style={styles.liveMix}
        >
          <Text style={[Typography.display, styles.liveMixText]}>Explore Live Mix</Text>
        </Pressable>
        <Pressable
          onPress={() => navigation.goBack()}
          accessibilityRole="button"
          accessibilityLabel="Return home"
          style={styles.returnButton}
        >
          <Text style={styles.returnText}>RETURN</Text>
        </Pressable>
      </ScrollView>

      <Modal
        visible={Boolean(pendingReflection) && morningReflectionVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setMorningReflectionVisible(false)}
      >
        <View style={styles.morningModalRoot}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => setMorningReflectionVisible(false)}
            accessibilityRole="button"
            accessibilityLabel="Close morning reflection"
          />
          <View style={[styles.morningModalPanel, { paddingBottom: insets.bottom + 18 }]}>
            <Pressable
              onPress={() => setMorningReflectionVisible(false)}
              accessibilityRole="button"
              accessibilityLabel="Close morning reflection"
              style={styles.morningModalClose}
            >
              <Ionicons name="close" size={18} color="#CFC5DA" />
            </Pressable>
            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={styles.morningModalContent}>
              <Text style={styles.reflectionEyebrow}>MORNING RETURN</Text>
              <Text style={styles.reflectionPrompt}>
                {pendingReflection?.preview ? 'Preview · answers are not saved' : `${pendingReflection?.journeySessionId ? 'Overnight journey' : 'Scheduled signals'} · ${new Date(pendingReflection?.scheduledAt ?? 0).toLocaleString()}`}
              </Text>
              {morningStep === 'capture' ? (
                <>
                  <Text style={[Typography.display, styles.morningReturnTitle]}>You returned. What remains?</Text>
                  <Text style={styles.morningReturnCopy}>Capture the dream before details begin to fade.</Text>
                  <TextInput
                    value={morningCapture}
                    onChangeText={setMorningCapture}
                    multiline
                    autoFocus
                    maxLength={12_000}
                    placeholder="A scene, feeling, voice, color—anything that remains…"
                    placeholderTextColor="#746D80"
                    accessibilityLabel="Morning dream capture"
                    style={styles.morningCaptureInput}
                  />
                  <Pressable
                    onPress={() => { void captureMorningDream(); }}
                    disabled={!morningCapture.trim() || morningCaptureSaving}
                    accessibilityRole="button"
                    accessibilityLabel="Save dream and continue"
                    style={[styles.saveReflection, (!morningCapture.trim() || morningCaptureSaving) && styles.disabledReflection]}
                  >
                    <Text style={styles.saveReflectionText}>{morningCaptureSaving ? 'SAVING…' : 'SAVE DREAM & CONTINUE'}</Text>
                  </Pressable>
                  <Pressable onPress={continueWithoutRecall} accessibilityRole="button" style={styles.noRecallButton}>
                    <Text style={styles.noRecallText}>NOTHING RECALLED</Text>
                  </Pressable>
                </>
              ) : (
                <>
                  <Text style={[Typography.display, styles.reflectionTitle]}>A few quiet questions</Text>
                  <ReflectionQuestion
                    prompt="How much did you recall?"
                    options={[
                      { label: 'NONE', value: 'none' }, { label: 'A FRAGMENT', value: 'fragment' }, { label: 'A DREAM', value: 'dream' },
                    ]}
                    value={dreamRecall}
                    onChange={value => setDreamRecall(value as DreamRecall)}
                  />
                  <ReflectionQuestion
                    prompt="Did you notice the signal?"
                    options={[
                      { label: 'YES', value: 'yes' }, { label: 'UNSURE', value: 'unsure' }, { label: 'NO', value: 'no' },
                    ]}
                    value={noticed}
                    onChange={value => setNoticed(value as SignalNotice)}
                  />
                  <ReflectionQuestion
                    prompt="Did you become lucid?"
                    options={[{ label: 'YES', value: 'yes' }, { label: 'NO', value: 'no' }]}
                    value={lucid === null ? null : lucid ? 'yes' : 'no'}
                    onChange={value => setLucid(value === 'yes')}
                  />
                  <ReflectionQuestion
                    prompt="How did it affect your sleep?"
                    options={[
                      { label: 'NOT AT ALL', value: 'none' }, { label: 'GENTLY', value: 'gentle' }, { label: 'WOKE ME', value: 'woke' },
                    ]}
                    value={sleepImpact}
                    onChange={value => setSleepImpact(value as SleepImpact)}
                  />
                  <Pressable
                    onPress={() => { void submitReflection(); }}
                    disabled={!dreamRecall || !noticed || lucid === null || !sleepImpact}
                    accessibilityRole="button"
                    accessibilityLabel="Save morning reflection"
                    style={[styles.saveReflection, (!dreamRecall || !noticed || lucid === null || !sleepImpact) && styles.disabledReflection]}
                  >
                    <Text style={styles.saveReflectionText}>SAVE REFLECTION</Text>
                  </Pressable>
                </>
              )}
              <Text style={styles.privateCopy}>Stored privately on this device.</Text>
            </ScrollView>
          </View>
        </View>
      </Modal>

      <Modal
        visible={innerReflectionsVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setInnerReflectionsVisible(false)}
      >
        <View style={styles.reflectionsModalRoot}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => setInnerReflectionsVisible(false)}
            accessibilityRole="button"
            accessibilityLabel="Close Inner reflections"
          />
          <View style={[styles.reflectionsPanel, { paddingTop: 20, paddingBottom: insets.bottom + 18 }]}>
            <View style={styles.reflectionsPanelHeader}>
              <Text style={styles.reflectionsPanelEyebrow}>INNER REFLECTIONS</Text>
              <Pressable onPress={() => setInnerReflectionsVisible(false)} accessibilityRole="button" accessibilityLabel="Close">
                <Ionicons name="close" size={18} color="#CFC5DA" />
              </Pressable>
            </View>
            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={styles.reflectionsPanelContent}>
              <View style={styles.yourSignalCard}>
                <Text style={styles.dreamSeedEyebrow}>RECOGNITION</Text>
                <Text style={[Typography.display, styles.yourSignalTitle]}>Your Signal</Text>
                <Text style={styles.yourSignalCopy}>Choose the sound you want to recognize.</Text>
                <View style={styles.signalChoices}>
                  {RECOGNITION_SIGNALS.map(signal => {
                    const selected = recognitionSignalId === signal.id;
                    return (
                      <Pressable
                        key={signal.id}
                        onPress={() => { void chooseRecognitionSignal(signal.id); }}
                        accessibilityRole="button"
                        accessibilityState={{ selected }}
                        style={[styles.signalChoice, selected && styles.signalChoiceSelected]}
                      >
                        <Text style={[styles.signalChoiceName, selected && styles.signalChoiceNameSelected]}>{signal.name}</Text>
                        <Text style={styles.signalChoiceDescription}>{signal.description}</Text>
                      </Pressable>
                    );
                  })}
                </View>
                <Pressable
                  onPress={() => { void previewSignal(); }}
                  accessibilityRole="button"
                  accessibilityLabel={`Preview ${recognitionSignalById(recognitionSignalId).name}`}
                  style={styles.previewYourSignalButton}
                >
                  <Text style={styles.previewYourSignalText}>{previewingSignal ? 'PLAYING SIGNAL' : 'PREVIEW SIGNAL'}</Text>
                </Pressable>
                {__DEV__ ? (
                  <Pressable
                    onPress={() => { void testSignalNotification(); }}
                    accessibilityRole="button"
                    accessibilityLabel={`Test ${recognitionSignalById(recognitionSignalId).name} notification`}
                    style={styles.testSignalNotificationButton}
                  >
                    <Text style={styles.testSignalNotificationText}>TEST NOTIFICATION · 8 SEC</Text>
                  </Pressable>
                ) : null}
              </View>
              {learningSummary ? (
                <View style={styles.insightCard}>
                  <Pressable
                    onPress={() => setInsightExpanded(expanded => !expanded)}
                    accessibilityRole="button"
                    accessibilityLabel={`${insightExpanded ? 'Hide' : 'Show'} what Inner is noticing`}
                    accessibilityState={{ expanded: insightExpanded }}
                    style={styles.insightHeader}
                  >
                    <View style={styles.insightHeadingCopy}>
                      <Text style={styles.reflectionEyebrow}>{learningSummary.label}</Text>
                      <Text style={[Typography.display, styles.insightTitle]}>What Inner is noticing</Text>
                    </View>
                    <Ionicons name={insightExpanded ? 'chevron-up' : 'chevron-down'} size={14} color="#CFC5F2" />
                  </Pressable>
                  {insightExpanded ? (
                    <View style={styles.insightDetails}>
                      <Text style={styles.insightCopy}>{learningSummary.text}</Text>
                      {recommendation ? (
                        <View style={styles.recommendationCard}>
                          <Text style={styles.recommendationEyebrow}>TONIGHT’S SIGNAL</Text>
                          <Text style={[Typography.display, styles.recommendationTitle]}>{recommendation.title}</Text>
                          <Text style={styles.recommendationCopy}>{recommendation.reason}</Text>
                          <Text style={styles.planCopy}>
                            {recommendation.plan === 'gentle' ? '2 later cues · 5.5 and 7 hours' : '3 cues · 4.5, 6, and 7.5 hours'}
                          </Text>
                          {recommendation.volumeGuidance ? <Text style={styles.volumeGuidance}>{recommendation.volumeGuidance}</Text> : null}
                          <Pressable
                            onPress={() => { void useRecommendedPlan(recommendation.plan); }}
                            accessibilityRole="button"
                            style={[styles.usePlanButton, cuePlan === recommendation.plan && styles.usePlanButtonSelected]}
                          >
                            <Text style={styles.usePlanText}>{cuePlan === recommendation.plan ? 'SELECTED' : cueScheduled ? 'USE NEXT NIGHT' : 'USE TONIGHT'}</Text>
                          </Pressable>
                        </View>
                      ) : null}
                      <Pressable
                        onPress={() => setHistoryExpanded(expanded => !expanded)}
                        accessibilityRole="button"
                        accessibilityState={{ expanded: historyExpanded }}
                        style={styles.historyHeader}
                      >
                        <Text style={styles.historyHeaderText}>VIEW MY PATTERN</Text>
                        <Ionicons name={historyExpanded ? 'chevron-up' : 'chevron-down'} size={12} color="#AFA5C2" />
                      </Pressable>
                      {historyExpanded ? (
                        <View style={styles.historyList}>
                          {completedNights.slice(0, 7).map(night => (
                            <View key={night.id} style={styles.historyRow}>
                              <Text style={styles.historyDate}>{new Date(night.sleepOnsetAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</Text>
                              <Text style={styles.historyResult}>
                                {night.reflection?.noticed === 'yes' ? 'Signal noticed' : night.reflection?.noticed === 'unsure' ? 'Signal unclear' : 'Not noticed'}
                                {' · '}{night.reflection?.lucid ? 'Lucid' : 'Not lucid'}
                                {' · '}{night.reflection?.sleepImpact === 'woke' ? 'Woke me' : night.reflection?.sleepImpact === 'gentle' ? 'Gentle' : 'Undisturbed'}
                              </Text>
                            </View>
                          ))}
                          <Pressable onPress={resetLearning} accessibilityRole="button" style={styles.resetLearningButton}>
                            <Text style={styles.resetLearningText}>RESET LEARNING</Text>
                          </Pressable>
                        </View>
                      ) : null}
                    </View>
                  ) : null}
                </View>
              ) : (
                <Text style={styles.noPatternCopy}>Your Lucid Signal reflections will begin forming a pattern here.</Text>
              )}

              {journeyMemoryProfile ? (
                <View style={styles.listeningPatternCard}>
                  <Pressable
                    onPress={() => setJourneyPatternsExpanded(expanded => !expanded)}
                    accessibilityRole="button"
                    accessibilityLabel={`${journeyPatternsExpanded ? 'Hide' : 'Show'} listening patterns`}
                    accessibilityState={{ expanded: journeyPatternsExpanded }}
                    style={styles.insightHeader}
                  >
                    <View style={styles.insightHeadingCopy}>
                      <Text style={styles.reflectionEyebrow}>
                        {journeyMemoryProfile.sessionsObserved} {journeyMemoryProfile.sessionsObserved === 1 ? 'JOURNEY' : 'JOURNEYS'} OBSERVED
                      </Text>
                      <Text style={[Typography.display, styles.insightTitle]}>Listening Patterns</Text>
                    </View>
                    <Ionicons name={journeyPatternsExpanded ? 'chevron-up' : 'chevron-down'} size={14} color="#CFC5F2" />
                  </Pressable>
                  {journeyPatternsExpanded ? (
                    <View style={styles.listeningPatternDetails}>
                      <Text style={styles.insightCopy}>
                        {journeyMemoryProfile.confidence === 'forming'
                          ? 'Inner is beginning to learn how you move through a journey. More listening will make this pattern clearer.'
                          : journeyMemoryProfile.confidence === 'early'
                            ? 'An early listening pattern is taking shape. Inner will keep observing before suggesting a change.'
                            : 'Your listening pattern is becoming consistent enough to guide future suggestions.'}
                      </Text>
                      <View style={styles.listeningFacts}>
                        <Text style={styles.listeningFact}>
                          {journeyMemoryProfile.completedSessions} of {journeyMemoryProfile.sessionsObserved} recent journeys completed
                        </Text>
                        {typicalJourneyMinutes ? (
                          <Text style={styles.listeningFact}>Typical completed length · {typicalJourneyMinutes} min</Text>
                        ) : null}
                        {rememberedJourneyTitle ? (
                          <Text style={styles.listeningFact}>Returned to most · {rememberedJourneyTitle}</Text>
                        ) : null}
                        {environmentName ? (
                          <Text style={styles.listeningFact}>Most present environment · {environmentName}</Text>
                        ) : null}
                        {noiseName ? (
                          <Text style={styles.listeningFact}>Most present noise · {noiseName}</Text>
                        ) : null}
                      </View>
                      <Text style={styles.listeningPrivacy}>Private on this device · No automatic changes</Text>
                    </View>
                  ) : null}
                </View>
              ) : null}

              <View style={styles.dreamSeedCard}>
                <Pressable
                  onPress={() => setDreamSeedExpanded(expanded => !expanded)}
                  accessibilityRole="button"
                  accessibilityState={{ expanded: dreamSeedExpanded }}
                  style={styles.dreamSeedHeader}
                >
                  <View style={styles.dreamSeedHeading}>
                    <Text style={styles.dreamSeedEyebrow}>{dreamSeed ? 'SEED HELD FOR TONIGHT' : 'DREAM INCUBATION'}</Text>
                    <Text style={[Typography.display, styles.dreamSeedTitle]}>Dream Seed</Text>
                  </View>
                  <Ionicons name={dreamSeedExpanded ? 'chevron-up' : 'chevron-down'} size={13} color="#CFC5F2" />
                </Pressable>
                {!dreamSeedExpanded && dreamSeed ? (
                  <>
                    <Text numberOfLines={2} style={styles.dreamSeedPreview}>“{dreamSeed.text}”</Text>
                    <Pressable
                      onPress={beginDreamIncubation}
                      accessibilityRole="button"
                      accessibilityLabel="Begin Dream Incubation"
                      style={styles.beginIncubationButton}
                    >
                      <Text style={styles.beginIncubationText}>BEGIN INCUBATION · 10 MIN</Text>
                    </Pressable>
                  </>
                ) : null}
                {dreamSeedExpanded ? (
                  <View style={styles.dreamSeedDetails}>
                    <Text style={styles.dreamSeedPrompt}>What would you like to meet in a dream?</Text>
                    <TextInput
                      value={dreamSeedDraft}
                      onChangeText={setDreamSeedDraft}
                      maxLength={120}
                      multiline
                      placeholder="A place, question, person, or feeling…"
                      placeholderTextColor="#746D80"
                      accessibilityLabel="Dream Seed"
                      style={styles.dreamSeedInput}
                    />
                    <View style={styles.dreamSeedActions}>
                      {dreamSeed ? (
                        <Pressable onPress={() => { void releaseDreamSeed(); }} accessibilityRole="button" style={styles.releaseSeedButton}>
                          <Text style={styles.releaseSeedText}>RELEASE</Text>
                        </Pressable>
                      ) : null}
                      <Pressable
                        onPress={() => { void keepDreamSeed(); }}
                        disabled={!dreamSeedDraft.trim()}
                        accessibilityRole="button"
                        style={[styles.keepSeedButton, !dreamSeedDraft.trim() && styles.disabledReflection]}
                      >
                        <Text style={styles.keepSeedText}>{dreamSeed ? 'UPDATE SEED' : 'HOLD THIS SEED'}</Text>
                      </Pressable>
                    </View>
                    <Text style={styles.privateCopy}>Private to this device.</Text>
                  </View>
                ) : null}
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#03050D' },
  scrollViewport: { flex: 1, overflow: 'hidden' },
  content: { flexGrow: 1, paddingHorizontal: 22, justifyContent: 'space-between' },
  fixedIntro: { position: 'absolute', left: 22, right: 22, zIndex: 2, alignItems: 'center', paddingHorizontal: 18 },
  reflectionsLauncher: { position: 'absolute', right: 19, zIndex: 4, width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(205,194,255,0.24)', backgroundColor: 'rgba(5,7,16,0.62)' },
  reflectionsDot: { position: 'absolute', right: 6, top: 6, width: 5, height: 5, borderRadius: 3, backgroundColor: '#B8A7EE' },
  mainHiddenUtility: { display: 'none' },
  reflectionsModalRoot: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 22, backgroundColor: 'rgba(1,2,7,0.76)' },
  reflectionsPanel: { width: '100%', maxWidth: 340, maxHeight: '78%', paddingHorizontal: 18, borderRadius: 24, borderWidth: 1, borderColor: 'rgba(205,194,255,0.25)', backgroundColor: 'rgba(5,7,16,0.97)', shadowColor: '#000', shadowOpacity: 0.6, shadowRadius: 24, elevation: 18 },
  reflectionsPanelHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 2, paddingBottom: 13 },
  reflectionsPanelEyebrow: { color: '#B8A7EE', fontFamily: 'Inter-Medium', fontSize: 8, letterSpacing: 1.6 },
  reflectionsPanelContent: { alignItems: 'center', gap: 16, paddingBottom: 4 },
  noPatternCopy: { maxWidth: 240, color: '#AAA2B5', fontFamily: 'Inter-ExtraLight', fontSize: 10, lineHeight: 15, textAlign: 'center', paddingVertical: 8 },
  yourSignalCard: { width: '100%', maxWidth: 260, alignItems: 'center', paddingHorizontal: 15, paddingVertical: 14, borderRadius: 18, borderWidth: 1, borderColor: 'rgba(190,174,238,0.24)', backgroundColor: 'rgba(10,11,24,0.72)' },
  yourSignalTitle: { color: '#F0ECF7', fontSize: 17, marginTop: 4 },
  yourSignalCopy: { color: '#AAA2B5', fontFamily: 'Inter-ExtraLight', fontSize: 10, textAlign: 'center', marginTop: 5 },
  signalChoices: { width: '100%', flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 7, marginTop: 12 },
  signalChoice: { width: '47%', minHeight: 46, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 7, borderRadius: 14, borderWidth: 1, borderColor: 'rgba(205,194,255,0.18)', backgroundColor: 'rgba(3,5,13,0.46)' },
  signalChoiceSelected: { borderColor: 'rgba(205,194,255,0.62)', backgroundColor: 'rgba(105,83,171,0.34)' },
  signalChoiceName: { color: '#BDB5C8', fontFamily: 'Inter-Medium', fontSize: 9, textAlign: 'center' },
  signalChoiceNameSelected: { color: '#F0EAFB' },
  signalChoiceDescription: { color: '#80798B', fontFamily: 'Inter-ExtraLight', fontSize: 7, marginTop: 3 },
  previewYourSignalButton: { minHeight: 34, justifyContent: 'center', marginTop: 11, paddingHorizontal: 14, borderRadius: 17, borderWidth: 1, borderColor: 'rgba(205,194,255,0.34)' },
  previewYourSignalText: { color: '#DED5F3', fontFamily: 'Inter-Medium', fontSize: 7, letterSpacing: 1.15 },
  overnightJourney: { alignItems: 'center', alignSelf: 'center', minWidth: 230, paddingVertical: 8, marginTop: 8 },
  testSignalNotificationButton: { minHeight: 30, justifyContent: 'center', marginTop: 7, paddingHorizontal: 12, borderRadius: 15, backgroundColor: 'rgba(105,83,171,0.28)' },
  testSignalNotificationText: { color: '#C8BCE8', fontFamily: 'Inter-Medium', fontSize: 6.5, letterSpacing: 1.05 },
  androidTitleOffset: { transform: [{ translateY: 30 }] },
  title: { color: '#F5F2FC', fontSize: 24, textAlign: 'center', textShadowColor: 'rgba(0,0,0,0.9)', textShadowRadius: 12 },
  subtitle: { color: '#D6D0DF', fontFamily: 'Inter-ExtraLight', fontSize: 14, lineHeight: 20, textAlign: 'center', marginTop: 8, maxWidth: 220, textShadowColor: 'rgba(0,0,0,0.95)', textShadowRadius: 10 },
  cards: { flex: 1, justifyContent: 'center', gap: 30, transform: [{ translateY: -30 }] },
  androidCards: { transform: [{ translateY: 0 }] },
  journey: { alignItems: 'center', paddingHorizontal: 12 },
  journeyHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9 },
  titleButton: { paddingVertical: 8, paddingLeft: 10 },
  cardTitle: { color: '#F4F0FA', fontSize: 18, textAlign: 'center', textShadowColor: 'rgba(0,0,0,0.95)', textShadowRadius: 10 },
  detailsPill: { minHeight: 27, paddingHorizontal: 9, borderRadius: 14, flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(7,9,19,0.58)', borderWidth: 1, borderColor: 'rgba(205,194,255,0.2)' },
  detailsPillText: { color: '#CFC5F2', fontFamily: 'Inter-Medium', fontSize: 9, letterSpacing: 0.4 },
  summary: { color: '#D0CAD8', fontSize: 12, lineHeight: 18, textAlign: 'center', marginTop: 9, maxWidth: 315, textShadowColor: 'rgba(0,0,0,0.95)', textShadowRadius: 8 },
  journeyDetails: { alignItems: 'center' },
  signalCalibration: { alignItems: 'center', marginTop: 10, maxWidth: 300 },
  signalCalibrationCopy: { color: '#BDB6C9', fontFamily: 'Inter-ExtraLight', fontSize: 11, lineHeight: 16, textAlign: 'center' },
  signalButton: { marginTop: 9, minHeight: 36, justifyContent: 'center', paddingHorizontal: 16, borderRadius: 18, borderWidth: 1, borderColor: 'rgba(205,194,255,0.3)', backgroundColor: 'rgba(7,9,19,0.58)' },
  signalButtonText: { color: '#DCD3FA', fontFamily: 'Inter-Medium', fontSize: 8, letterSpacing: 1.35 },
  tonightCueStatus: { alignSelf: 'center', width: '92%', maxWidth: 340, paddingHorizontal: 13, paddingVertical: 11, borderRadius: 15, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 10, borderWidth: 1, borderColor: 'rgba(185,167,255,0.25)', backgroundColor: 'rgba(7,9,19,0.66)' },
  tonightCueLabel: { color: '#DCD3FA', fontFamily: 'Inter-Medium', fontSize: 8, letterSpacing: 1.05 },
  tonightCueHint: { color: '#A9A1B5', fontFamily: 'Inter-ExtraLight', fontSize: 9, marginTop: 3 },
  cancelCueButton: { minHeight: 34, justifyContent: 'center', paddingHorizontal: 10, borderRadius: 17, borderWidth: 1, borderColor: 'rgba(226,191,205,0.27)' },
  cancelCueText: { color: '#D8BBC7', fontFamily: 'Inter-Medium', fontSize: 7, letterSpacing: 0.9 },
  testReflectionButton: { width: '100%', alignItems: 'center', paddingTop: 3 },
  testReflectionText: { color: '#807892', fontFamily: 'Inter-Medium', fontSize: 7, letterSpacing: 1.05 },
  morningModalRoot: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 22, backgroundColor: 'rgba(1,2,7,0.78)' },
  morningModalPanel: { width: '100%', maxWidth: 350, maxHeight: '82%', paddingTop: 18, paddingHorizontal: 18, borderRadius: 24, borderWidth: 1, borderColor: 'rgba(185,167,255,0.34)', backgroundColor: 'rgba(5,7,17,0.97)', shadowColor: '#000', shadowOpacity: 0.62, shadowRadius: 24, elevation: 18 },
  morningModalClose: { position: 'absolute', right: 12, top: 10, zIndex: 2, width: 34, height: 34, alignItems: 'center', justifyContent: 'center' },
  morningModalContent: { alignItems: 'center', paddingTop: 12, paddingBottom: 2 },
  reflectionCard: { alignSelf: 'center', width: '96%', maxWidth: 350, paddingHorizontal: 18, paddingVertical: 17, borderRadius: 20, alignItems: 'center', borderWidth: 1, borderColor: 'rgba(185,167,255,0.3)', backgroundColor: 'rgba(5,7,17,0.84)' },
  reflectionEyebrow: { color: '#B8A7EE', fontFamily: 'Inter-Medium', fontSize: 8, letterSpacing: 1.55, textAlign: 'center' },
  reflectionTitle: { alignSelf: 'stretch', color: '#F1EDF8', fontSize: 17, textAlign: 'center', marginTop: 7, marginBottom: 5, paddingHorizontal: 4 },
  morningReturnTitle: { alignSelf: 'stretch', color: '#F1EDF8', fontSize: 21, lineHeight: 28, textAlign: 'center', marginTop: 8, paddingHorizontal: 4 },
  morningReturnCopy: { maxWidth: 260, color: '#B9B1C4', fontFamily: 'Inter-ExtraLight', fontSize: 11, lineHeight: 17, textAlign: 'center', marginTop: 7 },
  morningCaptureInput: { width: '100%', minHeight: 150, maxHeight: 260, marginTop: 15, paddingHorizontal: 14, paddingVertical: 13, borderRadius: 17, borderWidth: 1, borderColor: 'rgba(205,194,255,0.24)', backgroundColor: 'rgba(12,13,28,0.78)', color: '#EEEAF5', fontFamily: 'Inter-Light', fontSize: 13, lineHeight: 20, textAlignVertical: 'top' },
  noRecallButton: { minHeight: 34, justifyContent: 'center', marginTop: 8, paddingHorizontal: 14 },
  noRecallText: { color: '#91899D', fontFamily: 'Inter-Medium', fontSize: 7, letterSpacing: 1.15 },
  reflectionQuestion: { alignItems: 'center', marginTop: 12 },
  reflectionPrompt: { color: '#D7D0E0', fontFamily: 'Inter-Light', fontSize: 11, textAlign: 'center', marginBottom: 7 },
  reflectionOptions: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 6 },
  reflectionOption: { minHeight: 29, justifyContent: 'center', paddingHorizontal: 10, borderRadius: 15, borderWidth: 1, borderColor: 'rgba(205,194,255,0.2)', backgroundColor: 'rgba(15,16,31,0.55)' },
  reflectionOptionSelected: { borderColor: 'rgba(205,194,255,0.65)', backgroundColor: 'rgba(105,83,171,0.38)' },
  reflectionOptionText: { color: '#AFA7BB', fontFamily: 'Inter-Medium', fontSize: 7, letterSpacing: 0.9 },
  reflectionOptionTextSelected: { color: '#F0EAFB' },
  saveReflection: { minHeight: 36, justifyContent: 'center', marginTop: 16, paddingHorizontal: 17, borderRadius: 18, borderWidth: 1, borderColor: 'rgba(205,194,255,0.38)' },
  disabledReflection: { opacity: 0.35 },
  saveReflectionText: { color: '#E2D9F7', fontFamily: 'Inter-Medium', fontSize: 8, letterSpacing: 1.35 },
  privateCopy: { color: '#8F879B', fontFamily: 'Inter-ExtraLight', fontSize: 8, marginTop: 8 },
  insightCard: { alignSelf: 'center', width: '92%', maxWidth: 220, paddingHorizontal: 17, paddingVertical: 8, borderRadius: 17, borderWidth: 1, borderColor: 'rgba(185,167,255,0.24)', backgroundColor: 'rgba(7,9,19,0.7)' },
  insightHeader: { minHeight: 37, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  insightHeadingCopy: { flex: 1, alignItems: 'flex-start' },
  insightTitle: { color: '#EEE9F5', fontSize: 15, textAlign: 'left', marginTop: 4 },
  insightCopy: { color: '#D5CEDF', fontFamily: 'Inter-ExtraLight', fontSize: 11, lineHeight: 17, textAlign: 'center', marginTop: 7 },
  insightDetails: { alignItems: 'center' },
  listeningPatternCard: { alignSelf: 'center', width: '92%', maxWidth: 220, paddingHorizontal: 17, paddingVertical: 8, borderRadius: 17, borderWidth: 1, borderColor: 'rgba(185,167,255,0.24)', backgroundColor: 'rgba(7,9,19,0.7)' },
  listeningPatternDetails: { alignItems: 'center', width: '100%' },
  listeningFacts: { width: '100%', marginTop: 11, borderTopWidth: 1, borderTopColor: 'rgba(205,194,255,0.12)' },
  listeningFact: { color: '#BDB5C8', fontFamily: 'Inter-ExtraLight', fontSize: 9, lineHeight: 14, textAlign: 'center', paddingTop: 8 },
  listeningPrivacy: { color: '#80798B', fontFamily: 'Inter-ExtraLight', fontSize: 7, textAlign: 'center', marginTop: 11 },
  recommendationCard: { width: '100%', alignItems: 'center', marginTop: 13, paddingTop: 13, borderTopWidth: 1, borderTopColor: 'rgba(205,194,255,0.14)' },
  recommendationEyebrow: { color: '#A999DE', fontFamily: 'Inter-Medium', fontSize: 7, letterSpacing: 1.35 },
  recommendationTitle: { color: '#EEE9F5', fontSize: 14, textAlign: 'center', marginTop: 5 },
  recommendationCopy: { color: '#C9C1D2', fontFamily: 'Inter-ExtraLight', fontSize: 10, lineHeight: 15, textAlign: 'center', marginTop: 7 },
  planCopy: { color: '#BDB0E4', fontFamily: 'Inter-Medium', fontSize: 8, lineHeight: 13, textAlign: 'center', marginTop: 8 },
  volumeGuidance: { color: '#958CA3', fontFamily: 'Inter-ExtraLight', fontSize: 8, lineHeight: 12, textAlign: 'center', marginTop: 5 },
  usePlanButton: { minHeight: 32, justifyContent: 'center', marginTop: 10, paddingHorizontal: 13, borderRadius: 16, borderWidth: 1, borderColor: 'rgba(205,194,255,0.4)' },
  usePlanButtonSelected: { backgroundColor: 'rgba(105,83,171,0.3)' },
  usePlanText: { color: '#E1D8F5', fontFamily: 'Inter-Medium', fontSize: 7, letterSpacing: 1.15 },
  historyHeader: { width: '100%', minHeight: 36, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 6, marginTop: 8 },
  historyHeaderText: { color: '#AAA0BA', fontFamily: 'Inter-Medium', fontSize: 7, letterSpacing: 1.2 },
  historyList: { width: '100%', paddingBottom: 2 },
  historyRow: { paddingVertical: 8, borderTopWidth: 1, borderTopColor: 'rgba(205,194,255,0.1)' },
  historyDate: { color: '#B7AAD8', fontFamily: 'Inter-Medium', fontSize: 8, letterSpacing: 0.5 },
  historyResult: { color: '#A69EAF', fontFamily: 'Inter-ExtraLight', fontSize: 8, lineHeight: 12, marginTop: 3 },
  resetLearningButton: { alignSelf: 'center', paddingHorizontal: 10, paddingVertical: 9, marginTop: 2 },
  resetLearningText: { color: '#B993A2', fontFamily: 'Inter-Medium', fontSize: 7, letterSpacing: 1.05 },
  dreamSeedCard: { alignSelf: 'center', width: '92%', maxWidth: 220, paddingHorizontal: 15, paddingVertical: 11, borderRadius: 17, borderWidth: 1, borderColor: 'rgba(190,174,238,0.22)', backgroundColor: 'rgba(7,9,19,0.68)' },
  dreamSeedHeader: { minHeight: 38, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  dreamSeedHeading: { flex: 1 },
  dreamSeedEyebrow: { color: '#A999DE', fontFamily: 'Inter-Medium', fontSize: 7, letterSpacing: 1.25 },
  dreamSeedTitle: { color: '#EEE9F5', fontSize: 16, marginTop: 3 },
  dreamSeedPreview: { color: '#BEB5CA', fontFamily: 'Inter-ExtraLight', fontSize: 10, fontStyle: 'italic', marginTop: 4, marginBottom: 3 },
  dreamSeedDetails: { alignItems: 'center', paddingTop: 8 },
  dreamSeedPrompt: { color: '#D3CBDD', fontFamily: 'Inter-Light', fontSize: 11, textAlign: 'center', marginBottom: 9 },
  dreamSeedInput: { width: '100%', minHeight: 68, maxHeight: 100, color: '#F0ECF6', fontFamily: 'Inter-Light', fontSize: 12, lineHeight: 18, textAlignVertical: 'top', paddingHorizontal: 12, paddingVertical: 10, borderRadius: 13, borderWidth: 1, borderColor: 'rgba(205,194,255,0.24)', backgroundColor: 'rgba(3,5,13,0.58)' },
  dreamSeedActions: { flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 10 },
  releaseSeedButton: { minHeight: 32, justifyContent: 'center', paddingHorizontal: 11 },
  releaseSeedText: { color: '#B993A2', fontFamily: 'Inter-Medium', fontSize: 7, letterSpacing: 1.05 },
  keepSeedButton: { minHeight: 32, justifyContent: 'center', paddingHorizontal: 13, borderRadius: 16, borderWidth: 1, borderColor: 'rgba(205,194,255,0.38)' },
  keepSeedText: { color: '#E1D8F5', fontFamily: 'Inter-Medium', fontSize: 7, letterSpacing: 1.05 },
  beginIncubationButton: { alignSelf: 'center', minHeight: 34, justifyContent: 'center', marginTop: 9, paddingHorizontal: 14, borderRadius: 17, borderWidth: 1, borderColor: 'rgba(205,194,255,0.38)', backgroundColor: 'rgba(105,83,171,0.18)' },
  beginIncubationText: { color: '#E1D8F5', fontFamily: 'Inter-Medium', fontSize: 7, letterSpacing: 1.05 },
  createJourney: { alignItems: 'center', paddingVertical: 8 },
  createJourneyHint: { color: '#9E94BF', fontFamily: 'Inter-Medium', fontSize: 8, letterSpacing: 1.4, marginTop: 5 },
  savedSection: { alignItems: 'center', gap: 13, marginTop: -4 },
  savedHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingVertical: 9 },
  savedLabel: { color: '#B5AACF', fontFamily: 'Inter-Medium', fontSize: 9, letterSpacing: 1.5 },
  savedCountPill: { minHeight: 25, paddingHorizontal: 8, borderRadius: 13, flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(7,9,19,0.58)', borderWidth: 1, borderColor: 'rgba(205,194,255,0.2)' },
  savedCount: { color: '#CFC5F2', fontFamily: 'Inter-Medium', fontSize: 9 },
  savedTitle: { color: '#EEE9F5', fontSize: 16, textAlign: 'center', textShadowColor: 'rgba(0,0,0,0.95)', textShadowRadius: 10 },
  savedDetails: { alignItems: 'center' },
  removeButton: { paddingHorizontal: 14, paddingVertical: 8, marginTop: 2 },
  removeText: { color: '#A99EAF', fontFamily: 'Inter-Medium', fontSize: 8, letterSpacing: 1.4 },
  liveMix: { alignSelf: 'center', paddingHorizontal: 24, paddingVertical: 13, marginTop: 8, borderRadius: 22, borderWidth: 1, borderColor: 'rgba(205,194,255,0.3)', backgroundColor: 'rgba(7,9,19,0.48)' },
  liveMixText: { color: '#EEE9F5', fontSize: 18, textAlign: 'center', textShadowColor: 'rgba(0,0,0,0.95)', textShadowRadius: 10 },
  returnButton: { alignSelf: 'center', paddingHorizontal: 24, paddingVertical: 13, marginTop: 4 },
  returnText: { color: '#E8E2F2', fontFamily: 'Inter-Medium', fontSize: 10, letterSpacing: 2.1 },
});

type ReflectionQuestionProps = {
  prompt: string;
  options: Array<{ label: string; value: string }>;
  value: string | null;
  onChange: (value: string) => void;
};

function ReflectionQuestion({ prompt, options, value, onChange }: ReflectionQuestionProps) {
  return (
    <View style={styles.reflectionQuestion}>
      <Text style={styles.reflectionPrompt}>{prompt}</Text>
      <View style={styles.reflectionOptions}>
        {options.map(option => (
          <Pressable
            key={option.value}
            onPress={() => onChange(option.value)}
            accessibilityRole="button"
            accessibilityState={{ selected: value === option.value }}
            style={[styles.reflectionOption, value === option.value && styles.reflectionOptionSelected]}
          >
            <Text style={[styles.reflectionOptionText, value === option.value && styles.reflectionOptionTextSelected]}>{option.label}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}
