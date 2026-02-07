import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, Modal, ActivityIndicator, Animated, TextInput, Easing } from 'react-native';
import { Asset } from 'expo-asset';
import * as FileSystem from 'expo-file-system';
import MarkdownDisplay from 'react-native-markdown-display';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import Chip from '../../components/Chip';
import FeaturedCard from '../../components/FeaturedCard';
import * as Haptics from 'expo-haptics';
import { learn_tracks } from '../../data/learn';
import { useIntention } from '../../core/IntentionProvider';
import { loadProgress, getProgressMap, subscribe } from '../progress';
import { Typography, Body as _Body } from '../../core/typography';
// Safe fallback to avoid hot-reload issues if Body is undefined momentarily
const Body = _Body ?? ({
  regular: { ...Typography.body },
  subtle:  { ...Typography.caption },
} as const);

// Safe fallback for Markdown renderer if the package is unavailable at runtime
const Markdown = (MarkdownDisplay as any) ?? (({ children }: any) => <Text>{children}</Text>);

// Flatten real lessons from the registry (guard against undefined during startup)
const TRACKS_SAFE = (learn_tracks ?? {}) as Record<string, { lessons?: Array<{ id: string; title: string; summary?: string; minutes?: number }> }>;
const BASE_LESSONS = (() => {
  const raw = Object.entries(TRACKS_SAFE).flatMap(([trackKey, track]) =>
    (track?.lessons ?? []).map((lesson) => {
      const trackId = (trackKey === 'lucid' || trackKey === 'obe' ? trackKey : 'lucid') as 'lucid' | 'obe';
      const id = lesson.id;
      return {
        key: `${trackId}:${id}`,
        id,
        title: lesson.title,
        summary: lesson.summary ?? '',
        minutes: (lesson.minutes ?? (lesson.durationMin ?? 0)) as number,
        level: (lesson as any).level ?? 'core',
        intentions: ((lesson as any).intentions ?? []) as string[],
        prerequisites: ((lesson as any).prerequisites ?? []) as string[],
        trackId,
      };
    })
  );

  // Dedupe accidental duplicates that map into the same trackId (same id used twice)
  const map = new Map<string, (typeof raw)[number]>();
  for (const item of raw) {
    if (!map.has(item.key)) map.set(item.key, item);
  }
  return Array.from(map.values());
})();


type TrackFilter = 'all' | 'lucid' | 'obe';

type Nav = {
  navigate: (screen: string, params?: any) => void;
};

function levelRank(level: string) {
  switch (level) {
    case 'intro': return 0;
    case 'core': return 1;
    case 'advanced': return 2;
    case 'mastery': return 3;
    default: return 1;
  }
}

const COMPLETED_THRESHOLD = 0.85;

type LessonLite = {
  key: string;
  id: string;
  title: string;
  minutes: number;
  level: string;
  intentions: string[];
  prerequisites: string[];
  trackId: 'lucid' | 'obe';
  progress?: number;
};

function pickNextLessons(
  lessons: LessonLite[],
  completedIds: Set<string>,
  recentIntentions: string[],
  lastStartedId?: string | null
) {
  const intentWeight = (m: LessonLite) => (m.intentions || []).reduce((acc, tag) => acc + (recentIntentions.includes(tag) ? 1 : 0), 0);

  const eligible = lessons.filter(m => !completedIds.has(m.id) && (m.prerequisites || []).every(req => completedIds.has(req)));

  const continueLesson = lastStartedId && !completedIds.has(lastStartedId)
    ? lessons.find(l => l.id === lastStartedId) || null
    : null;

  const ranked = eligible
    .map(m => ({ m, w: intentWeight(m) }))
    .sort((a, b) => (b.w - a.w) || (levelRank(a.m.level) - levelRank(b.m.level)) || ((a.m.minutes || 999) - (b.m.minutes || 999)))
    .map(x => x.m);

  return {
    continueLesson,
    nextStep: ranked[0] || null,
    deepen: ranked.find(m => m.level !== (ranked[0]?.level ?? 'core')) || ranked[1] || null,
  };
}

export default function LearnHub() {
  const navigation = useNavigation<Nav>();
  const insets = useSafeAreaInsets();
  const [filter, setFilter] = useState<TrackFilter>('all');
  const [pinnedHeight, setPinnedHeight] = useState(0);
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');

  React.useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query.trim()), 200);
    return () => clearTimeout(t);
  }, [query]);
  const scrollY = React.useRef(new Animated.Value(0)).current;

  // Idle background drift (runs even when not scrolling) — keeps the “room” alive.
  const bgIdlePhase = React.useRef(new Animated.Value(0)).current; // 0..1 repeating
  const bgIdleLoopRef = React.useRef<Animated.CompositeAnimation | null>(null);
  const bgIdleY = bgIdlePhase.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [0, -6, 0], // tune later; this is intentionally noticeable for first pass
    extrapolate: 'clamp',
  });

  React.useEffect(() => {
    bgIdlePhase.setValue(0);
    try { bgIdleLoopRef.current?.stop?.(); } catch {}
    bgIdleLoopRef.current = Animated.loop(
      Animated.timing(bgIdlePhase, {
        toValue: 1,
        duration: 12000, // mid-pace, almost subconscious
        easing: Easing.inOut(Easing.quad),
        useNativeDriver: true,
      })
    );
    bgIdleLoopRef.current.start();

    return () => {
      try { bgIdleLoopRef.current?.stop(); } catch {}
      bgIdleLoopRef.current = null;
      bgIdlePhase.stopAnimation(() => {});
    };
  }, [bgIdlePhase]);

  // Subtle background parallax: drift is now more noticeable for tuning. (TEMP: can dial back after.)
  const bgTranslateY = scrollY.interpolate({
    inputRange: [-120, 0, 240],
    // TEMP: make the drift more noticeable for tuning; we can dial it back after.
    outputRange: [-18, 0, 18],
    extrapolate: 'clamp',
  });

  const bgTranslateYCombined = Animated.add(bgTranslateY, bgIdleY);

  const shadowOpacity = scrollY.interpolate({
    inputRange: [0, 24, 80],
    outputRange: [0, 0.35, 0.6],
    extrapolate: 'clamp',
  });
  // Broader shadow band that scales with the pinned header height
  const shadowHeight = React.useMemo(() => {
    // Aim to cover most of the header/categories area below; clamp to sensible bounds
    const h = Math.max(96, (pinnedHeight || 120) * 0.9);
    return Math.min(240, h);
  }, [pinnedHeight]);

  const [showHelp, setShowHelp] = useState(false);
  const [helpMd, setHelpMd] = useState<string | null>(null);
  const [helpLoading, setHelpLoading] = useState(false);
  const [showGlossaryMenu, setShowGlossaryMenu] = useState(false);

  const [progressMap, setProgressMap] = useState<Record<string, any>>({});

  // Pull current intentions from the provider so guidance adapts to the user
const { intentions: selectedIntentions } = useIntention();
const recentIntentions: string[] = Array.isArray(selectedIntentions) ? selectedIntentions : [];

  // Load and subscribe to lesson progress (defensive: works even if progress module changes)
  React.useEffect(() => {
    let unsub: undefined | (() => void);
    let mounted = true;

    (async () => {
      try {
        const loaded = await loadProgress();
        if (mounted && loaded && typeof loaded === 'object') {
          setProgressMap(loaded as Record<string, any>);
        } else {
          const snap = getProgressMap();
          if (mounted && snap && typeof snap === 'object') setProgressMap(snap as Record<string, any>);
        }
        unsub = subscribe((next: Record<string, any>) => setProgressMap(next || {}));
      } catch (e) {
        console.warn('Progress integration not available yet:', e);
      }
    })();

    return () => {
      mounted = false;
      if (typeof unsub === 'function') unsub();
    };
  }, []);

  const ALL_LESSONS: LessonLite[] = React.useMemo(() =>
    BASE_LESSONS.map(l => {
      const nested = (progressMap?.[l.trackId] && typeof progressMap[l.trackId] === 'object')
        ? (progressMap as any)[l.trackId]?.[l.id]
        : undefined;
      const candidates = [
        nested,
        (progressMap as any)?.[`${l.trackId}:${l.id}`],
        (progressMap as any)?.[`${l.trackId}/${l.id}`],
        (progressMap as any)?.[`${l.trackId}_${l.id}`],
        (progressMap as any)?.[l.id],
      ];
      const raw = candidates.find((v: any) => typeof v === 'number') ?? 0;
      const clamped = Math.max(0, Math.min(1, raw as number));
      return { ...l, progress: clamped } as LessonLite;
    }),
  [progressMap]);

  useFocusEffect(
    React.useCallback(() => {
      (async () => {
        try {
          const loaded = await loadProgress();
          if (loaded && typeof loaded === 'object') setProgressMap(loaded as Record<string, any>);
          else setProgressMap(getProgressMap());
        } catch {}
      })();
    }, [])
  );

  const selectFilter = (next: TrackFilter) => {
    if (filter !== next) {
      // Subtle, platform-consistent tick
      Haptics.selectionAsync();
      setFilter(next);
    }
  };

  // Pick featured dynamically:
  // - "in progress" = started but not yet completed
  // - never surface fully completed lessons in the Continue learning row
  const inProgress = ALL_LESSONS
    .filter(l => {
      const p = l.progress || 0;
      return p > 0 && p < COMPLETED_THRESHOLD;
    })
    .sort((a, b) => (b.progress || 0) - (a.progress || 0));

  const completedIds = new Set(
    ALL_LESSONS.filter(l => (l.progress || 0) >= COMPLETED_THRESHOLD).map(l => l.id)
  );
  const completedLessons = ALL_LESSONS.filter(
    l =>
      (l.progress || 0) >= COMPLETED_THRESHOLD &&
      (filter === 'all' ? true : l.trackId === filter)
  );
  const lastStarted = inProgress[0]?.id || null;
  const guidance = pickNextLessons(ALL_LESSONS, completedIds, recentIntentions, lastStarted);

  // Avoid showing the same lesson in "Your Path" and again in the main list
  const guidanceKeys = new Set(
    [guidance.continueLesson?.key, guidance.nextStep?.key, guidance.deepen?.key].filter(Boolean) as string[]
  );

  // Fallback pool for featured cards should also prefer not-yet-completed lessons.
  // IMPORTANT: exclude anything already shown in "Your Path" to prevent duplicates.
  const nonCompleted = ALL_LESSONS.filter(l => (l.progress || 0) < COMPLETED_THRESHOLD);
  const featuredPool = (inProgress.length ? inProgress : (nonCompleted.length ? nonCompleted : ALL_LESSONS))
    .filter(l => !guidanceKeys.has(l.key));
  const featured = featuredPool.slice(0, 3);
  const featuredKeys = new Set(featured.map(f => f.key));

  const filtered = ALL_LESSONS
    .filter(l => (filter === 'all' ? true : l.trackId === filter))
    .filter(l => (l.progress || 0) < COMPLETED_THRESHOLD)
    .filter(l => !featuredKeys.has(l.key) && !guidanceKeys.has(l.key)) // avoid duplicates below the carousels
    .filter(l => {
      if (!debouncedQuery) return true;
      const q = debouncedQuery.toLowerCase();
      const base = BASE_LESSONS.find(b => b.id === l.id);
      const title = (l.title || '').toLowerCase();
      const summary = (base?.summary || '').toLowerCase();
      return title.includes(q) || summary.includes(q);
    });

  // Order the main list so the user scrolls from easiest → hardest.
  // When searching, keep the natural filtered order (search relevance) to avoid surprising jumps.
  const orderedFiltered = React.useMemo(() => {
    if (debouncedQuery) return filtered;
    return [...filtered].sort((a, b) => {
      const byLevel = levelRank(a.level) - levelRank(b.level);
      if (byLevel !== 0) return byLevel;
      const byMinutes = (a.minutes || 999) - (b.minutes || 999);
      if (byMinutes !== 0) return byMinutes;
      return (a.title || '').localeCompare(b.title || '');
    });
  }, [filtered, debouncedQuery]);

  const goToLesson = (trackId: 'lucid' | 'obe', lessonId: string) => {
    console.log('Navigating to lesson:', trackId, lessonId);
    // A gentle confirm tap
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    navigation.navigate('LessonReader', { trackId, lessonId });
  };

  const openInlineHelp = React.useCallback(async () => {
    try {
      setHelpLoading(true);
      setShowHelp(true);
      // Reuse the same asset path the Lesson system used previously
      const mod = require('../../learn/howto.md');
      const asset = Asset.fromModule(mod);
      if (!asset.downloaded) {
        await asset.downloadAsync();
      }
      const uri = asset.localUri || asset.uri;
      if (uri) {
        const text = await FileSystem.readAsStringAsync(uri);
        setHelpMd(text);
      } else {
        setHelpMd('# Learning Hub\n\nBrowse categories, tap a lesson, and use the back arrow to return.');
      }
    } catch (e) {
      console.warn('Failed to load inline help markdown:', e);
      setHelpMd('# Learning Hub\n\nBrowse categories, tap a lesson, and use the back arrow to return.');
    } finally {
      setHelpLoading(false);
    }
  }, []);

  return (
    <View style={{ flex: 1, backgroundColor: 'transparent' }}>
      <Animated.Image
        source={require('../../assets/images/learning_hub.png')}
        resizeMode="cover"
        pointerEvents="none"
        // IMPORTANT: use array style (not object spread) so RN keeps layout correct with transforms
        // Also force full sizing so cover doesn't appear pinned to top-left when animated.
        style={[
          StyleSheet.absoluteFillObject,
          {
            width: '100%',
            height: '100%',
            transform: [{ translateY: bgTranslateYCombined }],
          },
        ]}
      />
      <SafeAreaView style={styles.container} edges={['top','left','right']}>
        {/* Pinned mini-header: caption, title, and filter chips */}
        <View
          onLayout={(e) => setPinnedHeight(e.nativeEvent.layout.height)}
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            zIndex: 20,
            paddingTop: Math.max(insets.top - 8, 8),
            paddingBottom: 12,
            paddingHorizontal: 24,
            backgroundColor: 'rgba(5,5,15,0.35)',
            borderBottomWidth: 1,
            borderColor: 'rgba(237,232,250,0.08)'
          }}
        >
          {/* Top row: Home on left, Help on right */}
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <Pressable
              onPress={() => { Haptics.selectionAsync(); navigation.navigate('Home'); }}
              accessibilityRole="button"
              accessibilityLabel="Return"
              style={{
                paddingHorizontal: 12,
                paddingVertical: 8,
                borderRadius: 999,
                backgroundColor: 'rgba(0,0,0,0.75)',
                borderWidth: 1,
                borderColor: 'rgba(237,232,250,0.12)'
              }}
            >
              <Text style={[Typography.body, { color: '#EDE8FA', letterSpacing: 0.5 }]}>Return</Text>
            </Pressable>

            <Pressable
              onPress={async () => { await Haptics.selectionAsync(); openInlineHelp(); }}
              accessibilityRole="button"
              accessibilityLabel="Introductory guide to Learning Hub"
              accessibilityHint="Tap to learn how to use the Learning Hub"
              style={{
                width: 36,
                height: 36,
                borderRadius: 24,
                backgroundColor: 'rgba(0,0,0,0.75)',
                borderWidth: 1,
                borderColor: 'rgba(237,232,250,0.12)',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Text style={[Typography.body, { color: '#EDE8FA', lineHeight: 24 }]}>?</Text>
            </Pressable>
          </View>
          <Text style={[Typography.caption, { color: '#B9B0EB', letterSpacing: 1, textTransform: 'uppercase' }]}>Learning Hub</Text>
          <Text style={[Typography.display, { color: '#EDE8FA', marginTop: 6 }]}>Guides & Practices</Text>
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
            <Chip
              label="All"
              active={filter === 'all'}
              onPress={() => selectFilter('all')}
              containerStyle={{
                backgroundColor: 'rgba(0,0,0,0.75)',
                borderWidth: filter === 'all' ? 2 : 1,
                borderColor: filter === 'all' ? '#CFC3E0' : 'rgba(237,232,250,0.20)',
              }}
              labelStyle={{ color: '#EDE8FA' }}
            />
            <Chip
              label="Lucid"
              active={filter === 'lucid'}
              onPress={() => selectFilter('lucid')}
              containerStyle={{
                backgroundColor: 'rgba(0,0,0,0.75)',
                borderWidth: filter === 'lucid' ? 2 : 1,
                borderColor: filter === 'lucid' ? '#CFC3E0' : 'rgba(237,232,250,0.20)',
              }}
              labelStyle={{ color: '#EDE8FA' }}
            />
            <Chip
              label="OBE"
              active={filter === 'obe'}
              onPress={() => selectFilter('obe')}
              containerStyle={{
                backgroundColor: 'rgba(0,0,0,0.75)',
                borderWidth: filter === 'obe' ? 2 : 1,
                borderColor: filter === 'obe' ? '#CFC3E0' : 'rgba(237,232,250,0.20)',
              }}
              labelStyle={{ color: '#EDE8FA' }}
            />
            <Chip
              label="Glossary"
              active={false}
              onPress={async () => {
                await Haptics.selectionAsync();
                setShowGlossaryMenu(true);
              }}
              containerStyle={{
                backgroundColor: 'rgba(0,0,0,0.75)',
                borderWidth: 1,
                borderColor: 'rgba(237,232,250,0.20)',
              }}
              labelStyle={{ color: '#EDE8FA' }}
            />
          </View>
          {/* Search (pinned) */}
          <View style={{ marginTop: 12 }}>
            <View style={styles.searchRow}>
              <TextInput
                value={query}
                onChangeText={setQuery}
                placeholder="Search lessons…"
                placeholderTextColor="rgba(237,232,250,0.55)"
                accessibilityLabel="Search lessons"
                accessibilityHint="Type a title or keywords to filter lessons"
                style={styles.searchInput}
                returnKeyType="search"
              />
              {query.length > 0 && (
                <Pressable
                  onPress={() => setQuery('')}
                  accessibilityRole="button"
                  accessibilityLabel="Clear search"
                  style={styles.searchClear}
                >
                  <Text style={{ color: '#EDE8FA', fontWeight: '600' }}>✕</Text>
                </Pressable>
              )}
            </View>
          </View>
          {/* (shadow band moved below pinned header) */}
        </View>

        {/* Main scroll content moves under the pinned header */}
        <Animated.ScrollView
          onScroll={Animated.event(
            [{ nativeEvent: { contentOffset: { y: scrollY } } }],
            { useNativeDriver: true }
          )}
          scrollEventThrottle={16}
          contentContainerStyle={{ paddingTop: Math.max(0, pinnedHeight - 28), paddingBottom: 40 }}
        >
          {/* Completed lessons section (respects filter) - now appears first */}
          {completedLessons.length > 0 && (
            <View style={{ paddingHorizontal: 24, paddingTop: 0 }}>
              <Text style={[Typography.caption, { color: '#9C94E6', marginBottom: 6 }]}>
                {filter === 'all'
                  ? `Completed Lessons (${completedLessons.length})`
                  : `${filter === 'lucid' ? 'Lucid Lessons' : 'OBE Lessons'} (${completedLessons.length})`}
              </Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={{ marginTop: 2 }}
                contentContainerStyle={{ paddingRight: 24, gap: 12 }}
              >
                {completedLessons.map(item => (
                  <Pressable
                    key={`completed-${item.key}`}
                    onPress={() => goToLesson(item.trackId, item.id)}
                    style={[styles.completedItem]}
                  >
                    <Text style={[Typography.body, { color: '#EDE8FA', opacity: 0.66 }]}>{item.title}</Text>
                    <Text
                      style={[Body.regular, { color: 'rgba(237,232,250,0.55)', marginTop: 4, lineHeight: 20 }]}
                      numberOfLines={2}
                    >
                      {BASE_LESSONS.find(b => b.id === item.id)?.summary ?? ''}
                    </Text>
                    <View style={styles.completedBadge}>
                      <Text style={styles.completedBadgeText}>Completed</Text>
                    </View>
                    <View style={[styles.progressTrack, { height: 2, marginTop: 10, opacity: 0.55 }]}>
  <View style={[styles.progressFill, { width: '100%', height: 2, opacity: 0.9 }]} />
</View>
                  </Pressable>
                ))}
              </ScrollView>
            </View>
          )}

          {/* "Your Path" and Featured row, in a wrapper below completed lessons */}
          <View style={{ paddingHorizontal: 24, paddingTop: completedLessons.length > 0 ? 8 : 0 }}>
            {/* Your Path (hidden while searching) */}
            {!debouncedQuery && (
              <View style={{ marginTop: 2 }}>
                <Text style={[Typography.caption, { color: '#9C94E6', marginBottom: 6 }]}>Your Path</Text>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  style={{ marginTop: 2 }}
                  contentContainerStyle={{ paddingLeft: 0, paddingRight: 24, gap: 12 }}
                >
                  {(() => {
                    const guidanceItems: LessonLite[] = [];
                    if (guidance.continueLesson) guidanceItems.push(guidance.continueLesson);
                    if (guidance.nextStep && !guidanceItems.find(i => i.key === guidance.nextStep.key)) {
                      guidanceItems.push(guidance.nextStep);
                    }
                    if (guidance.deepen && !guidanceItems.find(i => i.key === guidance.deepen.key)) {
                      guidanceItems.push(guidance.deepen);
                    }

                    // Append “Continue learning” items into the same row, without duplicates.
                    const combined = [...guidanceItems];
                    for (const f of featured) {
                      if (!combined.find(i => i.key === f.key)) combined.push(f);
                    }

                    // Title-case helper for levels
                    const titleCase = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

                    return combined.map(item => {
                      const isGuidance = guidanceItems.some(g => g.key === item.key);

                      const subtitle = isGuidance
                        ? (item.id === guidance.continueLesson?.id
                            ? 'Continue'
                            : item.id === guidance.nextStep?.id
                            ? `${titleCase(item.level)} · ${item.minutes || 0} min`
                            : `Deepen · ${item.minutes || 0} min`)
                        : (item.trackId === 'lucid' ? 'Lucid' : 'OBE');

                      return (
                        <FeaturedCard
                          key={item.key}
                          title={item.title}
                          subtitle={subtitle}
                          onPress={() => goToLesson(item.trackId, item.id)}
                          progress={ALL_LESSONS.find(l => l.key === item.key)?.progress ?? 0}
                        />
                      );
                    });
                  })()}
                </ScrollView>
              </View>
            )}
          </View>

          {/* Lesson list (always last) */}
          <View style={{ paddingHorizontal: 24, paddingTop: 8 }}>
            <Text style={[Typography.caption, { color: '#9C94E6', marginBottom: 8 }]}>
              {debouncedQuery
                ? `Search results (${orderedFiltered.length})`
                : (filter === 'all'
                    ? `All Lessons (${orderedFiltered.length})`
                    : (filter === 'lucid'
                        ? `Lucid Lessons (${orderedFiltered.length})`
                        : `OBE Lessons (${orderedFiltered.length})`))}
            </Text>
            {orderedFiltered.map(item => (
              <Pressable
                key={item.key}
                onPress={() => goToLesson(item.trackId, item.id)}
                style={styles.listItem}
              >
                <Text style={[Typography.body, { color: '#EDE8FA' }]}>{item.title}</Text>
                <Text
                  style={[Body.regular, { color: 'rgba(237,232,250,0.85)', marginTop: 4, lineHeight: 20 }]}
                  numberOfLines={2}
                >
                  {item.summary}
                </Text>
                <Text style={[Typography.caption, { color: '#9C94E6', marginTop: 8 }]}>
                  {item.minutes} min · {item.trackId.toUpperCase()}
                </Text>

                {/* Completed badge when lesson is effectively done */}
                {(item.progress || 0) >= COMPLETED_THRESHOLD && (
                  <View style={styles.completedBadge}>
                    <Text style={styles.completedBadgeText}>Completed</Text>
                  </View>
                )}

                {/* Progress bar */}
                <View style={styles.progressTrack}>
                  <View
                    style={[
                      styles.progressFill,
                      { width: `${Math.round(Math.max(0, Math.min(1, (item.progress || 0))) * 100)}%` },
                    ]}
                  />
                </View>
              </Pressable>
            ))}
          </View>
        </Animated.ScrollView>

      {/* Glossary Menu */}
      <Modal
        visible={showGlossaryMenu}
        transparent
        animationType="fade"
        onRequestClose={() => setShowGlossaryMenu(false)}
      >
        <Pressable
          style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center' }}
          onPress={() => setShowGlossaryMenu(false)}
        >
          <Pressable
            onPress={() => {}}
            style={{
              width: '86%',
              maxWidth: 360,
              backgroundColor: 'rgba(18,18,32,0.96)',
              borderRadius: 16,
              padding: 14,
              borderWidth: 1,
              borderColor: 'rgba(255,255,255,0.08)',
            }}
          >
            <Text style={[Typography.body, { color: '#EDE8FA', fontSize: 16, textAlign: 'center', marginBottom: 10 }]}>
              Glossary
            </Text>

            <Pressable
              onPress={async () => {
                await Haptics.selectionAsync();
                setShowGlossaryMenu(false);
                navigation.navigate('Glossary', { trackId: 'lucid' });
              }}
              style={{
                paddingVertical: 12,
                paddingHorizontal: 14,
                borderRadius: 12,
                backgroundColor: 'rgba(0,0,0,0.55)',
                borderWidth: 1,
                borderColor: 'rgba(237,232,250,0.12)',
                marginBottom: 10,
              }}
              accessibilityRole="button"
              accessibilityLabel="Open Lucid glossary"
            >
              <Text style={[Typography.body, { color: '#EDE8FA' }]}>Lucid Glossary</Text>
            </Pressable>

            <Pressable
              onPress={async () => {
                await Haptics.selectionAsync();
                setShowGlossaryMenu(false);
                navigation.navigate('Glossary', { trackId: 'obe' });
              }}
              style={{
                paddingVertical: 12,
                paddingHorizontal: 14,
                borderRadius: 12,
                backgroundColor: 'rgba(0,0,0,0.55)',
                borderWidth: 1,
                borderColor: 'rgba(237,232,250,0.12)',
              }}
              accessibilityRole="button"
              accessibilityLabel="Open OBE glossary"
            >
              <Text style={[Typography.body, { color: '#EDE8FA' }]}>OBE Glossary</Text>
            </Pressable>

            <View style={{ alignItems: 'center', marginTop: 12 }}>
              <Pressable
                onPress={() => setShowGlossaryMenu(false)}
                accessibilityRole="button"
                accessibilityLabel="Close glossary menu"
                style={{
                  paddingVertical: 8,
                  paddingHorizontal: 18,
                  borderRadius: 999,
                  backgroundColor: 'rgba(0,0,0,0.35)',
                  borderWidth: 1,
                  borderColor: 'rgba(237,232,250,0.12)',
                }}
              >
                <Text style={[Typography.caption, { color: 'rgba(237,232,250,0.75)', letterSpacing: 0.5 }]}>Close</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
      {/* Help Modal */}
      <Modal visible={showHelp} transparent animationType="fade" onRequestClose={() => setShowHelp(false)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center' }}>
          <View style={{ width: '90%', maxHeight: '80%', backgroundColor: 'rgba(18,18,32,0.96)', borderRadius: 16, padding: 16, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' }}>
            <Text style={[Typography.body, { color: '#EDE8FA', fontSize: 18, textAlign: 'center', marginBottom: 8 }]}>How to use the Learning Hub</Text>
            {helpLoading ? (
              <View style={{ paddingVertical: 24, alignItems: 'center' }}>
                <ActivityIndicator />
                <Text style={[Body.subtle, { color: '#B9B0EB', marginTop: 8 }]}>Loading…</Text>
              </View>
            ) : (
              <ScrollView contentContainerStyle={{ paddingBottom: 8 }}>
                {/* Render markdown; fallback shows plain text if renderer is unavailable */}
                <Markdown
                  style={markdownStyles}
                >
                  {helpMd || 'Browse categories, tap a lesson to open it, and use the back arrow to return.'}
                </Markdown>
              </ScrollView>
            )}
            <View style={{ alignItems: 'center', marginTop: 12 }}>
              <Pressable
                onPress={() => setShowHelp(false)}
                accessibilityRole="button"
                accessibilityLabel="Close help"
                style={{ backgroundColor: '#CFC3E0', paddingVertical: 8, paddingHorizontal: 20, borderRadius: 14, borderWidth: 1, borderColor: 'rgba(255,255,255,0.20)' }}
              >
                <Text style={{ color: '#1F233A', fontWeight: '600' }}>Got it</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: 'transparent', position: 'relative' },
  listItem: {
    padding: 16,
    borderRadius: 12,
    backgroundColor: 'rgba(10,8,20,0.35)',
    borderWidth: 1,
    borderColor: 'rgba(237,232,250,0.08)',
    marginBottom: 12,
  },
  progressTrack: { height: 3, backgroundColor: 'rgba(237,232,250,0.12)', borderRadius: 2, marginTop: 12 },
  progressFill: { height: 3, backgroundColor: 'rgba(237,232,250,0.35)', borderRadius: 2 },

 completedBadge: {
    alignSelf: 'flex-start',
    marginTop: 6,
    paddingHorizontal: 9,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: 'rgba(237,232,250,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(237,232,250,0.10)',
  },
completedBadgeText: {
    ...Typography.caption,
    fontSize: 10,
    color: 'rgba(237,232,250,0.62)',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },

  floatingHome: {
    position: 'absolute',
    left: 24,
    right: 24,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 999,
    backgroundColor: 'rgba(237,232,250,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(237,232,250,0.12)',
  },
  floatingHelp: {
    position: 'absolute',
    width: 36,
    height: 36,
    borderRadius: 24,
    backgroundColor: 'rgba(237,232,250,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(237,232,250,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  glossaryBlock: {
    alignSelf: 'stretch',
    width: '100%',
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingHorizontal: 0, // match header padding
    marginTop: 8,
  },
  glossaryBtn: {
    alignSelf: 'flex-start',
    flexShrink: 0, // keep intrinsic width so text doesn't truncate to just "OBE"
    minWidth: 140, // ensure room for "OBE Glossary"
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(185,176,235,0.35)',
    backgroundColor: 'rgba(0,0,0,0.75)',
  },
  searchRow: {
    position: 'relative',
  },
  searchInput: {
    height: 40,
    borderRadius: 12,
    paddingLeft: 14,
    paddingRight: 44, // leave space for clear button
    backgroundColor: 'rgba(0,0,0,0.75)',
    borderWidth: 1,
    borderColor: 'rgba(237,232,250,0.20)',
    color: '#EDE8FA',
    fontFamily: 'Inter_ExtraLight',
  },
  searchClear: {
    position: 'absolute',
    right: 6,
    top: 6,
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.75)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.20)',
  },
  completedItem: {
    padding: 12,
    borderRadius: 14,
    backgroundColor: 'rgba(27, 27, 49, 0.76)',
    borderWidth: 1,
    borderColor: 'rgba(237,232,250,0.10)',
    width: 190,
    marginBottom: 0,
  },
});

const markdownStyles = {
  body: {
    fontFamily: 'Inter_ExtraLight',
    color: '#EDE8FA',
    lineHeight: 22,
    fontSize: 15,
  },
  heading1: {
    fontFamily: 'CalSans-SemiBold',
    fontSize: 24,
    color: '#EDE8FA',
    marginBottom: 8,
  },
  heading2: {
    fontFamily: 'CalSans-SemiBold',
    fontSize: 20,
    color: '#EDE8FA',
    marginTop: 12,
    marginBottom: 6,
  },
  paragraph: {
    fontFamily: 'Inter_ExtraLight',
    color: '#EDE8FA',
    lineHeight: 22,
  },
  list_item: {
    fontFamily: 'Inter_ExtraLight',
    color: '#B9B0EB',
    lineHeight: 22,
  },
  strong: {
    fontFamily: 'CalSans-SemiBold',
    color: '#CFC3E0',
  },
  em: {
    fontStyle: 'italic',
    color: '#CFC3E0',
  },
  link: {
    color: '#9C94E6',
    textDecorationLine: 'underline',
  },
};