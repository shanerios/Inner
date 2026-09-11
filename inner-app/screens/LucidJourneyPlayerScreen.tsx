import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, PanResponder, Platform, StyleSheet, Text, TouchableOpacity, useWindowDimensions, View } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useVideoPlayer, VideoView } from '../core/memorySafeVideo';
import {
  compileAudioJourneyTimeline,
  DEFAULT_PROCEDURAL_AUDIO_CONFIG,
  FACTORY_AUDIO_JOURNEYS,
  proceduralAudioEngine,
  ProceduralPlaybackSession,
} from '../core/audio';
import type { FactoryAudioJourney } from '../core/audio';
import { Typography } from '../core/typography';
import { cancelLucidityCueNotifications, scheduleLucidityCueNotifications } from '../utils/notifications';
import { abandonPendingLucidSignalNight } from '../core/lucidSignalLearning';
import { createRecognitionSignalSound, getRecognitionSignalId, recognitionSignalById } from '../core/recognitionSignals';
import type { Audio } from 'expo-av';

const LUCIDITY_CUE_TRAINING_JOURNEY_ID = 'lucid-signal';

type Params = { journeyId?: string; journey?: FactoryAudioJourney };

export default function LucidJourneyPlayerScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute();
  const insets = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();
  const { journeyId, journey: suppliedJourney } = (route.params || {}) as Params;
  const journey = useMemo(
    () => suppliedJourney ?? FACTORY_AUDIO_JOURNEYS.find(item => item.id === journeyId),
    [journeyId, suppliedJourney],
  );
  const sessionRef = useRef(new ProceduralPlaybackSession(proceduralAudioEngine));
  const seekingRef = useRef(false);
  const scrubStartPositionRef = useRef(0);
  const scrubPreviewPositionRef = useRef(0);
  const currentPositionRef = useRef(0);
  const lastDragSeekAtRef = useRef(0);
  const cueScheduleStartedRef = useRef(false);
  const cueSchedulePromiseRef = useRef<Promise<boolean> | null>(null);
  const cueTrainingCompletedRef = useRef(false);
  const recognitionSoundRef = useRef<Audio.Sound | null>(null);
  const recognitionCueTimesRef = useRef<number[]>([]);
  const lastRecognitionPositionRef = useRef(0);
  const [positionMs, setPositionMs] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const background = useVideoPlayer(require('../assets/videos/lucidscreen.mp4'), player => {
    player.loop = true;
    player.muted = true;
    player.audioMixingMode = 'mixWithOthers';
    player.play();
  });

  const activeCue = journey?.timeline.guidance
    ?.filter(cue => cue.atMs <= positionMs)
    .at(-1);

  useEffect(() => {
    if (!journey) {
      setError('This journey is not available.');
      return;
    }
    let mounted = true;
    let timer: ReturnType<typeof setInterval> | null = null;
    const session = sessionRef.current;

    const start = async () => {
      try {
        if (!session.isAvailable()) throw new Error('Procedural audio is unavailable in this build.');
        const timeline = compileAudioJourneyTimeline(journey.timeline, DEFAULT_PROCEDURAL_AUDIO_CONFIG);
        let playbackTimeline = timeline;
        let signalName = 'the signal';
        if (journey.id === LUCIDITY_CUE_TRAINING_JOURNEY_ID) {
          const signalId = await getRecognitionSignalId();
          signalName = recognitionSignalById(signalId).name;
          const cueTimes: number[] = [];
          let stageStartMs = 0;
          for (const stage of timeline.stages) {
            for (const event of stage.spatialEvents) {
              if (event.type === 'cue') cueTimes.push(stageStartMs + event.atMs);
            }
            stageStartMs += stage.durationMs;
          }
          recognitionCueTimesRef.current = cueTimes;
          lastRecognitionPositionRef.current = 0;
          recognitionSoundRef.current = await createRecognitionSignalSound(signalId);
          // The selected sampled Signal replaces the native engine's original
          // hard-coded cue events during waking conditioning.
          playbackTimeline = {
            ...timeline,
            stages: timeline.stages.map(stage => ({
              ...stage,
              spatialEvents: stage.spatialEvents.filter(event => event.type !== 'cue'),
            })),
          };
        }
        await session.startTimeline(DEFAULT_PROCEDURAL_AUDIO_CONFIG, playbackTimeline);
        // The native timer keeps the ending dependable while the screen is
        // locked or JavaScript is suspended, and applies a short final fade.
        await session.setSleepTimer(Date.now() + timeline.totalDurationMs);
        if (journey.id === LUCIDITY_CUE_TRAINING_JOURNEY_ID) {
          const sleepOnsetDelayMs = journey.overnight?.sleepOnsetDelayMs ?? timeline.totalDurationMs;
          Alert.alert(
            'Schedule tonight’s cues?',
            `After this practice ends, Inner can return ${signalName} during later dream windows tonight. You can choose Not Tonight and still complete the training.`,
            [
              { text: 'Not Tonight', style: 'cancel' },
              {
                text: 'Schedule Cues',
                onPress: () => {
                  if (!mounted) return;
                  cueScheduleStartedRef.current = true;
                  // There is no on-device REM detection. The practice ending is
                  // used as the sleep-onset estimate for the later cue offsets.
                  cueSchedulePromiseRef.current = scheduleLucidityCueNotifications(Date.now() + sleepOnsetDelayMs);
                },
              },
            ],
          );
        }
        timer = setInterval(() => {
          if (!mounted || seekingRef.current) return;
          const nextPositionMs = Math.min(session.getPositionMs(), timeline.totalDurationMs);
          if (journey.id === LUCIDITY_CUE_TRAINING_JOURNEY_ID) {
            const previousPositionMs = lastRecognitionPositionRef.current;
            const crossedCue = recognitionCueTimesRef.current.find(cueAtMs => cueAtMs > previousPositionMs && cueAtMs <= nextPositionMs);
            if (crossedCue !== undefined) void recognitionSoundRef.current?.replayAsync().catch(() => {});
            lastRecognitionPositionRef.current = nextPositionMs;
          }
          const cueTrainingEndMs = journey.overnight?.sleepOnsetDelayMs ?? timeline.totalDurationMs;
          if (journey.id === LUCIDITY_CUE_TRAINING_JOURNEY_ID
            && nextPositionMs >= cueTrainingEndMs - 500) {
            cueTrainingCompletedRef.current = true;
          }
          setPositionMs(nextPositionMs);
        }, 200);
      } catch (startError) {
        if (mounted) setError(startError instanceof Error ? startError.message : String(startError));
      }
    };

    void start();
    return () => {
      mounted = false;
      if (timer) clearInterval(timer);
      if (cueScheduleStartedRef.current && !cueTrainingCompletedRef.current) {
        // Wait for scheduling to finish before cancelling so a quick RETURN
        // cannot race the notification IDs being written to storage.
        void (cueSchedulePromiseRef.current ?? Promise.resolve(true))
          .then(async () => {
            await cancelLucidityCueNotifications();
            await abandonPendingLucidSignalNight();
          });
      }
      const recognitionSound = recognitionSoundRef.current;
      recognitionSoundRef.current = null;
      if (recognitionSound) void recognitionSound.unloadAsync().catch(() => {});
      void session.stop();
    };
  }, [journey]);

  const returnToJourneys = async () => {
    await sessionRef.current.stop().catch(() => {});
    navigation.goBack();
  };

  const durationMs = journey?.timeline.stages.reduce((total, stage) => total + stage.durationMs, 0) ?? 0;
  currentPositionRef.current = positionMs;
  const mmss = (milliseconds: number) => {
    const totalSeconds = Math.max(0, Math.floor(milliseconds / 1_000));
    return `${Math.floor(totalSeconds / 60)}:${String(totalSeconds % 60).padStart(2, '0')}`;
  };

  const finishSeeking = async (nextPositionMs: number) => {
    const bounded = Math.max(0, Math.min(nextPositionMs, durationMs));
    try {
      await sessionRef.current.seekToMs(bounded);
      await sessionRef.current.setSleepTimer(Date.now() + Math.max(0, durationMs - bounded));
      lastRecognitionPositionRef.current = bounded;
      setPositionMs(bounded);
    } catch (seekError) {
      setError(seekError instanceof Error ? seekError.message : String(seekError));
    } finally {
      seekingRef.current = false;
    }
  };

  const scrubResponder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: (_, gesture) => Math.abs(gesture.dx) > 4,
    onPanResponderGrant: () => {
      seekingRef.current = true;
      scrubStartPositionRef.current = currentPositionRef.current;
      scrubPreviewPositionRef.current = currentPositionRef.current;
      lastDragSeekAtRef.current = 0;
    },
    onPanResponderMove: (_, gesture) => {
      // The visible control is intentionally compact, so a roughly half-screen
      // drag spans the journey instead of requiring an edge-to-edge gesture.
      const dragRange = Math.max(140, Math.min(240, windowWidth * 0.55));
      const delta = (gesture.dx / dragRange) * durationMs;
      const previewPosition = Math.max(0, Math.min(durationMs, scrubStartPositionRef.current + delta));
      scrubPreviewPositionRef.current = previewPosition;
      currentPositionRef.current = previewPosition;
      setPositionMs(previewPosition);

      // Android can terminate a responder before delivering release. Keep the
      // native timeline aligned during the drag so the seek cannot be lost.
      const now = Date.now();
      if (now - lastDragSeekAtRef.current >= 90) {
        lastDragSeekAtRef.current = now;
        void sessionRef.current.seekToMs(previewPosition).catch(seekError => {
          setError(seekError instanceof Error ? seekError.message : String(seekError));
        });
      }
    },
    onPanResponderRelease: () => {
      void finishSeeking(scrubPreviewPositionRef.current);
    },
    onPanResponderTerminationRequest: () => false,
    onPanResponderTerminate: () => {
      void finishSeeking(scrubPreviewPositionRef.current);
    },
  }), [durationMs, windowWidth]);

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
      <View pointerEvents="none" style={styles.veil} />

      <Text style={[Typography.display, styles.title, { top: insets.top + 102 + (Platform.OS === 'android' ? 30 : 0) }]}>
        {journey?.title ?? 'Lucid Journey'}
      </Text>

      <View
        {...scrubResponder.panHandlers}
        hitSlop={{ top: 14, bottom: 14, left: 40, right: 40 }}
        accessibilityRole="adjustable"
        accessibilityLabel="Scrub journey playback position"
        accessibilityHint="Drag left or right to seek"
        style={[styles.scrubArea, { top: insets.top + 134 + (Platform.OS === 'android' ? 30 : 0) }]}
      >
        <Text style={styles.elapsed}>
          {mmss(positionMs)} / −{mmss(Math.max(0, durationMs - positionMs))}
        </Text>
        <View style={styles.scrubAffordance}>
          <Text style={styles.scrubArrow}>‹</Text>
          <View style={styles.scrubLine} />
          <Text style={styles.scrubArrow}>›</Text>
        </View>
      </View>

      <View pointerEvents="none" style={styles.captionArea} accessibilityLiveRegion="polite">
        {error ? (
          <Text style={[Typography.body, styles.error]}>{error}</Text>
        ) : activeCue ? (
          <>
            <Text style={styles.captionHeading}>{activeCue.heading}</Text>
            <Text style={[Typography.body, styles.caption]}>{activeCue.prompt}</Text>
          </>
        ) : null}
      </View>

      <TouchableOpacity
        onPress={returnToJourneys}
        accessibilityRole="button"
        accessibilityLabel="Return to Lucid Journeys"
        style={[styles.returnButton, { bottom: insets.bottom + 24 }]}
      >
        <Text style={styles.returnText}>RETURN</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#02040B' },
  veil: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.5)' },
  title: { position: 'absolute', left: 24, right: 24, color: '#F4F1FA', fontSize: 22, textAlign: 'center', textShadowColor: 'rgba(0,0,0,0.9)', textShadowRadius: 10 },
  captionArea: { ...StyleSheet.absoluteFillObject, paddingHorizontal: 34, alignItems: 'center', justifyContent: 'center' },
  captionHeading: { color: '#BDAEFF', fontFamily: 'Inter-Medium', fontSize: 10, letterSpacing: 1.7, textTransform: 'uppercase', textAlign: 'center', marginBottom: 10 },
  caption: { color: '#F0ECF6', fontFamily: 'Inter-ExtraLight', fontSize: 18, lineHeight: 27, textAlign: 'center', width: 220, textShadowColor: 'rgba(0,0,0,0.95)', textShadowRadius: 10 },
  error: { color: '#E8DDE8', fontFamily: 'Inter-Light', fontSize: 14, lineHeight: 21, textAlign: 'center' },
  scrubArea: { position: 'absolute', left: 0, right: 0, alignItems: 'center', paddingVertical: 6 },
  elapsed: { color: '#B9B5C9', fontFamily: 'Inter-ExtraLight', fontSize: 11, letterSpacing: 0.8 },
  scrubAffordance: { flexDirection: 'row', alignItems: 'center', marginTop: 4, opacity: 0.42 },
  scrubArrow: { color: '#B9B5C9', fontSize: 10 },
  scrubLine: { width: 36, height: 1, backgroundColor: '#B9B5C9', marginHorizontal: 4 },
  returnButton: { position: 'absolute', alignSelf: 'center', paddingHorizontal: 24, paddingVertical: 13 },
  returnText: { color: '#E8E2F2', fontFamily: 'Inter-Medium', fontSize: 10, letterSpacing: 2.1 },
});
