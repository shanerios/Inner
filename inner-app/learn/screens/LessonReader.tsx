import React, { useEffect, useMemo, useRef, useState } from 'react';
import { SafeAreaView, View, Text, StyleSheet, ScrollView, ActivityIndicator, Pressable, NativeSyntheticEvent, NativeScrollEvent, Animated } from 'react-native';
import { useRoute, RouteProp, useNavigation } from '@react-navigation/native';
import Markdown from 'react-native-markdown-display';
import * as FileSystem from 'expo-file-system';
import { Asset } from 'expo-asset';
import * as Haptics from 'expo-haptics';
import * as Speech from 'expo-speech';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { setLessonProgress, loadProgress, getProgressMap } from '../progress';
import { learn_tracks } from '../../data/learn';
import { Typography } from '../../core/typography';
import { registerPracticeActivity } from '../../core/DailyRitual';
import { saveThreadSignature } from '../../src/core/threading/ThreadEngine';
import { ThreadTier } from '../../src/core/threading/threadTypes';

function clamp01(n: number) { return Math.max(0, Math.min(1, n)); }
function debounce<T extends (...args: any[]) => void>(fn: T, ms = 300) {
  let t: any;
  return (...args: Parameters<T>) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

type RootStackParamList = {
  LessonReader: { trackId: 'lucid' | 'obe' | 'guide'; lessonId: string };
};
type ReaderRoute = RouteProp<RootStackParamList, 'LessonReader'>;

const toTitle = (slug: string) =>
  slug
    .replace(/^[0-9]+[_-]?/, '')
    .replace(/[_-]+/g, ' ')
    .replace(/\b([a-z])/g, (m) => m.toUpperCase());


const TITLE_MAP: Record<string, string> = {
  'guide/howto': 'Guides & How‑Tos',
};

const getLessonTier = (trackId: string, lessonId: string): ThreadTier => {
  try {
    const lessons = (learn_tracks as any)[trackId]?.lessons ?? [];
    const lesson =
      lessons.find((l: any) => l.id === lessonId) ||
      lessons.find((l: any) => (l.id || '').replace(/[_\s]/g, '-').toLowerCase() === lessonId.toLowerCase());
    const rawTier = (lesson as any)?.tier;
    if (rawTier === 'intro' || rawTier === 'core' || rawTier === 'advanced' || rawTier === 'mastery') {
      return rawTier;
    }
  } catch {
    // fall through
  }
  return 'intro';
};

export default function LessonReader() {
  const insets = useSafeAreaInsets();
  const route = useRoute<ReaderRoute>();
  const navigation = useNavigation();
  const { trackId, lessonId } = route.params ?? { trackId: 'lucid', lessonId: 'unknown' };

  const [content, setContent] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [headerTitle, setHeaderTitle] = useState<string>(toTitle(lessonId));

  useEffect(() => {
    // Ensure progress map is hydrated (e.g., if user deep-links into Reader first)
    (async () => {
      try {
        await loadProgress();
        const map = getProgressMap();
        const trackMap = map[trackId as 'lucid' | 'obe'];
        const existing = trackMap?.[lessonId] ?? 0;
        if (existing > 0) {
          lastSentRef.current = existing;
          if (existing >= 0.85) {
            hasCelebratedRef.current = true;
          }
        }
      } catch {
        // ignore hydration errors and fall back to fresh progress
      }
    })();
  }, [trackId, lessonId]);

  // --- TTS state ---
  const [speaking, setSpeaking] = useState(false);
  const ttsQueueRef = useRef<string[]>([]);
  const ttsIndexRef = useRef(0);
  const lastSentRef = useRef(0);
  const hasCelebratedRef = useRef(false);
  const hasLoggedPracticeRef = useRef(false);

  useEffect(() => {
    async function loadMarkdown() {
      try {
        // Find lesson in registry and load its markdown asset
        const lessons = (learn_tracks as any)[trackId]?.lessons ?? [];
        const lesson =
          lessons.find((l: any) => l.id === lessonId) ||
          lessons.find((l: any) => (l.id || '').replace(/[_\s]/g, '-').toLowerCase() === lessonId.toLowerCase());

        if (!lesson) throw new Error(`No lesson registered for ${trackId}/${lessonId}`);
        if (typeof lesson.mdPath !== 'number') throw new Error('mdPath missing or not a require() asset');

        // Prefer explicit title from registry; fall back to TITLE_MAP or slug
        const preferredTitle = lesson.title || TITLE_MAP[`${trackId}/${lessonId}`] || toTitle(lessonId);
        setHeaderTitle(preferredTitle);

        const asset = Asset.fromModule(lesson.mdPath);
        await asset.downloadAsync();
        const fileUri = asset.localUri || asset.uri;
        let mdContent = await FileSystem.readAsStringAsync(fileUri, { encoding: FileSystem.EncodingType.UTF8 });

        // Strip the first top-level H1 from the markdown to avoid duplicate titles in the UI
        mdContent = mdContent.replace(/^[\uFEFF\s]*#\s+.*\n+/, '');

        setContent(mdContent);
      } catch (e) {
        setContent(`Failed to load lesson content for ${trackId}/${lessonId}.`);
      } finally {
        setLoading(false);
      }
    }
    loadMarkdown();

    // Stop speech when leaving screen
    return () => {
      Speech.stop();
      setSpeaking(false);
      ttsQueueRef.current = [];
      ttsIndexRef.current = 0;
    };
  }, [trackId, lessonId]);

  // --- Reading progress tracking ---
  const [scrollH, setScrollH] = useState(1);
  const [offsetY, setOffsetY] = useState(0);

  const debouncedSave = useMemo(
    () =>
      debounce((p: number) => {
        const pRounded = Math.round(p * 100) / 100; // 2 decimals
        // Never allow progress to move backwards; keep the max we've seen
        if (pRounded <= lastSentRef.current + 0.001) {
          return;
        }
        lastSentRef.current = pRounded;
        try {
          setLessonProgress(trackId, lessonId, pRounded);
        } catch {}
        // console.log('[LessonReader] progress', trackId, lessonId, pRounded);
      }, 300),
    [trackId, lessonId]
  );

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentSize, layoutMeasurement, contentOffset } = e.nativeEvent;
    const maxScrollable = Math.max(1, contentSize.height - layoutMeasurement.height);
    setScrollH(maxScrollable);
    setOffsetY(contentOffset.y);

    const ratio = clamp01(contentOffset.y / maxScrollable);
    const p = clamp01(ratio * 0.95); // keep below 1 until bottom
    debouncedSave(p);
  };

  const progress = Math.max(0, Math.min(1, scrollH ? offsetY / scrollH : 0));
  const progressRef = useRef(0);
  useEffect(() => { progressRef.current = progress; }, [progress]);
  const finalizeAndMaybeRecordPractice = () => {
    const latest = Math.max(progressRef.current, lastSentRef.current);
    const final = latest > 0.85 ? 1 : latest > 0 ? latest : 0.02;
    try {
      setLessonProgress(trackId, lessonId, clamp01(final));
    } catch {
      // ignore persistence errors
    }
    if (!hasLoggedPracticeRef.current && final >= 0.85) {
      hasLoggedPracticeRef.current = true;
      try {
        registerPracticeActivity('lesson');
      } catch {
        // streak logging is best-effort only
      }
      // Journey Threading v1: record this lesson as the last completed step
      try {
        const tier = getLessonTier(trackId, lessonId);
        saveThreadSignature({
          type: 'lesson',
          id: lessonId,
          tier,
          mood: 'reflective',
          timestamp: Date.now(),
        });
      } catch {
        // threading is best-effort
      }
    }
  };

  const [celebrate, setCelebrate] = useState(false);

  const triggerCompletionMoment = () => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch {
      // haptics are a nice-to-have; ignore failures
    }
  };

  useEffect(() => {
    const p = Math.max(progress, lastSentRef.current);
    if (!celebrate && !hasCelebratedRef.current && p >= 0.85) {
      hasCelebratedRef.current = true;
      setCelebrate(true);
      triggerCompletionMoment();
    }
  }, [progress, celebrate]);

  useEffect(() => {
    if (!celebrate) return;
    const timeout = setTimeout(() => {
      setCelebrate(false);
    }, 4800); // a bit longer than the ~4.5s toast animation
    return () => clearTimeout(timeout);
  }, [celebrate]);

  useEffect(() => {
    return () => {
      finalizeAndMaybeRecordPractice();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Chunk markdown for TTS (keeps iOS under ~2000 chars per utterance)
  const ttsChunks = useMemo(() => {
    if (!content) return [];
    const plain = content
      .replace(/`{3}[\s\S]*?`{3}/g, ' ')      // code blocks → skip
      .replace(/`[^`]*`/g, ' ')               // inline code
      .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')  // images
      .replace(/\[[^\]]*\]\([^)]*\)/g, (m) => m.replace(/\[[^\]]*\]\([^)]*\)/, '')) // links → text
      .replace(/[#>*\-]+/g, ' ')              // md tokens
      .replace(/\s{2,}/g, ' ')
      .trim();

    const max = 1600; // safety margin
    const chunks: string[] = [];
    let i = 0;
    while (i < plain.length) {
      let end = Math.min(i + max, plain.length);
      // try to break at sentence boundary
      const slice = plain.slice(i, end);
      const lastStop = Math.max(slice.lastIndexOf('. '), slice.lastIndexOf('\n'));
      const chunk = slice.slice(0, lastStop > 200 ? lastStop + 1 : slice.length);
      chunks.push(chunk.trim());
      i += chunk.length;
    }
    return chunks.filter(Boolean);
  }, [content]);

  const startTTS = async () => {
    if (!ttsChunks.length) return;
    // reset queue
    ttsQueueRef.current = ttsChunks;
    ttsIndexRef.current = 0;
    setSpeaking(true);
    speakNext();
  };

  const speakNext = () => {
    const i = ttsIndexRef.current;
    const chunk = ttsQueueRef.current[i];
    if (!chunk) {
      setSpeaking(false);
      return;
    }
    Speech.speak(chunk, {
      language: 'en-US',
      pitch: 0.95,
      rate: 0.94,
      onDone: () => {
        ttsIndexRef.current += 1;
        speakNext();
      },
      onStopped: () => setSpeaking(false),
      onError: () => setSpeaking(false),
    });
  };

  const pauseTTS = () => {
    Speech.stop(); // expo-speech has stop but no true "pause"
    setSpeaking(false);
  };

  const topPad = Math.max(insets.top, 16); // ensures the header clears status bars/notches

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        contentContainerStyle={[styles.inner, { paddingTop: topPad + 8 }]}
        contentInsetAdjustmentBehavior="automatic"
        onScroll={onScroll}
        scrollEventThrottle={16}
      >
        {/* Top controls */}
        <View style={styles.topControlsRow}>
          <Pressable
            onPress={() => {
              finalizeAndMaybeRecordPractice();
              (navigation as any).goBack();
            }}
            accessibilityRole="button"
            accessibilityLabel="Go back to Learning Hub"
            accessibilityHint="Returns you to the previous screen"
            style={styles.controlPill}
          >
            <Text style={[Typography.caption, { color: '#EDE8FA', letterSpacing: 0.3 }]}>← Back</Text>
          </Pressable>

          {content && !loading ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={speaking ? 'Stop reading lesson' : 'Read lesson aloud'}
              onPress={speaking ? pauseTTS : startTTS}
              style={[styles.controlPill, speaking ? styles.controlPillActive : null]}
            >
              <Text style={[Typography.caption, { color: '#EDE8FA' }]}>{speaking ? '■ Stop' : '▶ Read'}</Text>
            </Pressable>
          ) : (
            <View style={{ width: 86 }} />
          )}
        </View>

        <Text style={[Typography.caption, { color: '#B9B0EB', letterSpacing: 1, textTransform: 'uppercase', marginTop: 14 }]}
        >
          {trackId === 'lucid'
            ? 'Lucid Dreaming'
            : trackId === 'obe'
            ? 'OBE Foundations'
            : 'Guides & How‑Tos'}
        </Text>

        <Text accessibilityRole="header" style={[Typography.display, { color: '#EDE8FA', marginTop: 10 }]}>
          {headerTitle}
        </Text>

        {Math.max(progress, lastSentRef.current) >= 0.85 && (
          <View style={styles.completedBadge}>
            <Text style={styles.completedBadgeText}>Completed</Text>
          </View>
        )}

        <View style={{ height: 14 }} />

        {loading ? (
          <ActivityIndicator size="large" color="#B9B0EB" />
        ) : (
          <Markdown style={markdownStyles}>
            {content || ''}
          </Markdown>
        )}

        <View style={{ height: insets.bottom + 24 }} />
      </ScrollView>

            {celebrate && (
        <CompletionToast
          bottomInset={insets.bottom}
          onReturn={() => {
            finalizeAndMaybeRecordPractice();
            (navigation as any).goBack();
          }}
        />
      )}
    </SafeAreaView>
  );
}

type CompletionToastProps = {
  bottomInset: number;
  onReturn?: () => void;
};

function CompletionToast({ bottomInset, onReturn }: CompletionToastProps) {
  const opacity = React.useRef(new Animated.Value(0)).current;
  const translateY = React.useRef(new Animated.Value(12)).current;
  const glowScale = React.useRef(new Animated.Value(0.92)).current;
  const glowOpacity = React.useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.sequence([
        Animated.timing(opacity, {
          toValue: 1,
          duration: 220,
          useNativeDriver: true,
        }),
        Animated.delay(3700),
        Animated.timing(opacity, {
          toValue: 0,
          duration: 260,
          useNativeDriver: true,
        }),
      ]),
      Animated.sequence([
        Animated.parallel([
          Animated.timing(translateY, {
            toValue: 0,
            duration: 220,
            useNativeDriver: true,
          }),
          Animated.sequence([
            Animated.timing(glowOpacity, {
              toValue: 0.22,
              duration: 280,
              useNativeDriver: true,
            }),
            Animated.timing(glowOpacity, {
              toValue: 0,
              duration: 620,
              useNativeDriver: true,
            }),
          ]),
          Animated.sequence([
            Animated.timing(glowScale, {
              toValue: 1.05,
              duration: 450,
              useNativeDriver: true,
            }),
            Animated.timing(glowScale, {
              toValue: 1.0,
              duration: 450,
              useNativeDriver: true,
            }),
          ]),
        ]),
      ]),
    ]).start();
  }, [opacity, translateY, glowScale, glowOpacity]);

  const toastBottom = bottomInset + 40;
  const glowBottom = -110; // half of 220px height so the circle sits half offscreen

  return (
    <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
      {/* Glow pulse behind the toast */}
      <Animated.View
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: glowBottom,
          alignItems: 'center',
          opacity: glowOpacity,
          transform: [{ scale: glowScale }],
        }}
      >
        <View
          style={{
            width: 220,
            height: 220,
            borderRadius: 110,
            backgroundColor: 'rgba(143, 227, 179, 0.24)',
          }}
        />
      </Animated.View>

      {/* Toast content */}
      <Animated.View
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: toastBottom,
          alignItems: 'center',
          opacity,
          transform: [{ translateY }],
        }}
      >
        <View
          style={{
            paddingHorizontal: 16,
            paddingVertical: 10,
            borderRadius: 999,
            backgroundColor: 'rgba(6, 10, 24, 0.96)',
            borderWidth: 1,
            borderColor: 'rgba(143, 227, 179, 0.55)',
          }}
        >
          <Text
            style={[
              Typography.caption,
              {
                color: '#EDE8FA',
                textAlign: 'center',
              },
            ]}
          >
            Lesson Complete
          </Text>
          <Text
            style={{
              fontFamily: 'Inter-ExtraLight',
              fontSize: 12,
              color: 'rgba(237,232,250,0.78)',
              textAlign: 'center',
              marginTop: 2,
            }}
          >
            Now part of your Completed shelf
          </Text>
          {onReturn && (
            <Pressable
              onPress={onReturn}
              accessibilityRole="button"
              accessibilityLabel="Return to Learning Hub"
              accessibilityHint="Closes this lesson and returns you to the Learning Hub"
              style={{
                marginTop: 8,
                alignSelf: 'center',
                paddingHorizontal: 14,
                paddingVertical: 6,
                borderRadius: 999,
                backgroundColor: 'rgba(143, 227, 179, 0.16)',
              }}
            >
              <Text
                style={{
                  fontFamily: 'Inter-ExtraLight',
                  fontSize: 12,
                  color: '#8FE3B3',
                  textAlign: 'center',
                }}
              >
                Return to Library
              </Text>
            </Pressable>
          )}
        </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: 'transparent' },
  inner: { paddingHorizontal: 24, paddingBottom: 16 },
  topControlsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  controlPill: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: 'rgba(185,176,235,0.14)',
    borderWidth: 1,
    borderColor: 'rgba(185,176,235,0.35)',
  },
  controlPillActive: {
    backgroundColor: 'rgba(185,176,235,0.22)',
    borderColor: 'rgba(185,176,235,0.85)',
  },
  completedBadge: {
    alignSelf: 'flex-start',
    marginTop: 10,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: 'rgba(151, 220, 174, 0.18)',
  },
  completedBadgeText: {
    ...Typography.caption,
    fontSize: 11,
    color: '#8FE3B3',
  },
});

// Readability tuning for markdown
const markdownStyles = {
  body: {
    color: '#E0DAF7',
    fontFamily: 'Inter-ExtraLight',
    fontSize: 16,
    lineHeight: 26,
    letterSpacing: 0.2,
  },
  heading1: { color: '#EDE8FA', fontFamily: 'CalSans-SemiBold', fontSize: 18, lineHeight: 26, marginTop: 14, marginBottom: 6 },
  heading2: { color: '#EDE8FA', fontFamily: 'CalSans-SemiBold', fontSize: 16, lineHeight: 24, marginTop: 12, marginBottom: 6 },
  paragraph: { marginTop: 8, marginBottom: 14 },
  list_item: { marginTop: 2, marginBottom: 8 },
  bullet_list: { marginTop: 6, marginBottom: 8 },
  ordered_list: { marginTop: 6, marginBottom: 8 },
  bullet_list_icon: {
    color: '#EDE8FA',
    fontSize: 16,
    lineHeight: 24,
    marginRight: 12,
  },
  bullet_list_content: { flex: 1 },
  ordered_list_icon: {
    color: '#EDE8FA',
    fontSize: 14,
    lineHeight: 24,
    marginRight: 12,
  },
  ordered_list_content: { flex: 1 },
  strong: { color: '#EDE8FA', fontFamily: 'CalSans-SemiBold' },
  link: { color: '#B9B0EB' },
  hr: {
    borderColor: 'rgba(237,232,250,0.10)',
    borderBottomWidth: 1,
    marginTop: 18,
    marginBottom: 18
  }
};