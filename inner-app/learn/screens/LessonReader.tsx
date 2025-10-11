import React, { useEffect, useMemo, useRef, useState } from 'react';
import { SafeAreaView, View, Text, StyleSheet, ScrollView, ActivityIndicator, Pressable, NativeSyntheticEvent, NativeScrollEvent } from 'react-native';
import { useRoute, RouteProp, useNavigation } from '@react-navigation/native';
import Markdown from 'react-native-markdown-display';
import * as FileSystem from 'expo-file-system';
import { Asset } from 'expo-asset';
import * as Speech from 'expo-speech';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { setLessonProgress, loadProgress } from '../progress';
import { learn_tracks } from '../../data/learn';

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
    loadProgress().catch(() => {});
  }, []);

  // --- TTS state ---
  const [speaking, setSpeaking] = useState(false);
  const ttsQueueRef = useRef<string[]>([]);
  const ttsIndexRef = useRef(0);
  const lastSentRef = useRef(0);

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

  const debouncedSave = useMemo(() => debounce((p: number) => {
    const pRounded = Math.round(p * 100) / 100; // 2 decimals
    if (Math.abs(pRounded - lastSentRef.current) < 0.01) return; // skip tiny no-ops
    lastSentRef.current = pRounded;
    try { setLessonProgress(trackId, lessonId, pRounded); } catch {}
    // console.log('[LessonReader] progress', trackId, lessonId, pRounded);
  }, 300), [trackId, lessonId]);

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

  useEffect(() => {
    return () => {
      const latest = Math.max(progressRef.current, lastSentRef.current);
      const final = latest > 0.97 ? 1 : latest > 0 ? latest : 0.02;
      try { setLessonProgress(trackId, lessonId, clamp01(final)); } catch {}
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
        {/* Back to Learning Hub */}
        <Pressable
          onPress={() => {
            const latest = Math.max(progress, lastSentRef.current);
            const final = latest > 0.97 ? 1 : latest > 0 ? latest : 0.02;
            try { setLessonProgress(trackId, lessonId, clamp01(final)); } catch {}
            (navigation as any).goBack();
          }}
          accessibilityRole="button"
          accessibilityLabel="Go back to Learning Hub"
          accessibilityHint="Returns you to the previous screen"
          style={styles.backButton}
        >
          <Text style={styles.backText}>← Back</Text>
        </Pressable>
        <View style={styles.headerRow}>
          <Text style={styles.kicker}>
            {trackId === 'lucid'
              ? 'Lucid Dreaming'
              : trackId === 'obe'
              ? 'OBE Foundations'
              : 'Guides & How‑Tos'}
          </Text>

          {/* Simple TTS controls */}
          {content && !loading ? (
            <View style={styles.ttsRow}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={speaking ? 'Stop reading lesson' : 'Read lesson aloud'}
                onPress={speaking ? pauseTTS : startTTS}
                style={[styles.ttsBtn, speaking ? styles.ttsBtnActive : null]}
              >
                <Text style={styles.ttsBtnText}>{speaking ? '■ Stop' : '▶ Read'}</Text>
              </Pressable>
            </View>
          ) : null}
        </View>

        <Text accessibilityRole="header" style={styles.title}>
          {headerTitle}
        </Text>

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
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: 'transparent' },
  inner: { paddingHorizontal: 24, paddingBottom: 16 },
  backButton: {
    alignSelf: 'flex-start',
    paddingVertical: 6,
    paddingHorizontal: 12,
    marginBottom: 12,
    borderRadius: 10,
    backgroundColor: 'rgba(185,176,235,0.14)',
    borderWidth: 1,
    borderColor: 'rgba(185,176,235,0.35)',
  },
  backText: {
    color: '#EDE8FA',
    fontSize: 14,
    fontWeight: '600',
    letterSpacing: 0.3,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  kicker: {
    color: '#B9B0EB',
    letterSpacing: 1,
    textTransform: 'uppercase',
    fontSize: 12,
  },
  title: {
    color: '#EDE8FA',
    fontSize: 28,
    fontWeight: '700',
    marginTop: 10,
  },
  ttsRow: { flexDirection: 'row', gap: 8 },
  ttsBtn: {
    borderWidth: 1,
    borderColor: 'rgba(185,176,235,0.5)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    backgroundColor: 'rgba(185,176,235,0.12)',
  },
  ttsBtnActive: {
    backgroundColor: 'rgba(185,176,235,0.22)',
    borderColor: 'rgba(185,176,235,0.85)',
  },
  ttsBtnText: { color: '#EDE8FA', fontSize: 12, fontWeight: '600' },
});

// Readability tuning for markdown
const markdownStyles = {
  body: { color: '#DCD6F5', fontSize: 17, lineHeight: 28 },
  heading1: { color: '#EDE8FA', fontSize: 24, lineHeight: 32, marginTop: 14, marginBottom: 6 },
  heading2: { color: '#EDE8FA', fontSize: 21, lineHeight: 30, marginTop: 12, marginBottom: 6 },
  paragraph: { marginTop: 6, marginBottom: 10 },
  list_item: { marginTop: 0, marginBottom: 6 },
  strong: { color: '#EDE8FA' },
  link: { color: '#B9B0EB' },
};