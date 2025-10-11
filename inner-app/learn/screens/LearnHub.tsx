import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, ImageBackground, Pressable } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import Chip from '../../components/Chip';
import FeaturedCard from '../../components/FeaturedCard';
import * as Haptics from 'expo-haptics';
import { learn_tracks } from '../../data/learn';
import { useIntention } from '../../core/IntentionProvider';
import { loadProgress, getProgressMap, subscribe } from '../progress';

// Flatten real lessons from the registry (guard against undefined during startup)
const TRACKS_SAFE = (learn_tracks ?? {}) as Record<string, { lessons?: Array<{ id: string; title: string; summary?: string; minutes?: number }> }>;
const BASE_LESSONS = Object.entries(TRACKS_SAFE).flatMap(([trackKey, track]) =>
  (track?.lessons ?? []).map((lesson) => ({
    id: lesson.id,
    title: lesson.title,
    summary: lesson.summary ?? '',
    minutes: (lesson.minutes ?? (lesson.durationMin ?? 0)) as number,
    level: (lesson as any).level ?? 'core',
    intentions: ((lesson as any).intentions ?? []) as string[],
    prerequisites: ((lesson as any).prerequisites ?? []) as string[],
    trackId: (trackKey === 'lucid' || trackKey === 'obe' ? trackKey : 'lucid') as 'lucid' | 'obe',
  }))
);

console.log('BASE_LESSONS:', BASE_LESSONS);

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

type LessonLite = {
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

  // Pick featured dynamically: prefer "in progress", else first 3
  const inProgress = ALL_LESSONS.filter(l => (l.progress || 0) > 0).sort((a,b) => (b.progress || 0) - (a.progress || 0));
  const featured = (inProgress.length ? inProgress : ALL_LESSONS).slice(0, 3);
  const featuredIds = new Set(featured.map(f => f.id));

  const completedIds = new Set(
    ALL_LESSONS.filter(l => (l.progress || 0) >= 0.99).map(l => l.id)
  );
  const lastStarted = inProgress[0]?.id || null;
  const guidance = pickNextLessons(ALL_LESSONS, completedIds, recentIntentions, lastStarted);

  const filtered = ALL_LESSONS
    .filter(l => (filter === 'all' ? true : l.trackId === filter))
    .filter(l => !featuredIds.has(l.id)); // avoid duplicates below the carousel

  const goToLesson = (trackId: 'lucid' | 'obe', lessonId: string) => {
    console.log('Navigating to lesson:', trackId, lessonId);
    // A gentle confirm tap
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    navigation.navigate('LessonReader', { trackId, lessonId });
  };

  return (
    <ImageBackground source={require('../../assets/images/learning_hub.png')} style={{ flex: 1 }}>
      <SafeAreaView style={styles.container} edges={['top','left','right']}>
        <Pressable
          onPress={() => {
            Haptics.selectionAsync();
            navigation.navigate('LessonReader', { trackId: 'guide', lessonId: 'howto' });
          }}
          accessibilityRole="button"
          accessibilityLabel="Introductory guide to Learning Hub"
          accessibilityHint="Tap this button learn more about the Learning Hub and how to use it"
          style={[styles.floatingHelp, { top: insets.top + 16, right: 24 }]}
        >
          <Text style={styles.floatingHelpText}>?</Text>
        </Pressable>
        <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
          {/* Header */}
          <View style={{ paddingHorizontal: 24, paddingTop: Math.max(insets.top - 16, 8) }}>
            <Text style={styles.kicker}>Learning Hub</Text>
            <Text style={styles.title}>Guides & Practices</Text>

            <View style={styles.glossaryBlock}>
  <Pressable
    onPress={async () => {
      await Haptics.selectionAsync();
      navigation.navigate('Glossary', { trackId: 'lucid' });
    }}
    accessibilityRole="button"
    accessibilityLabel="Open Lucid glossary"
    style={styles.glossaryBtn}
  >
    <Text style={styles.glossaryText}>Lucid Glossary</Text>
  </Pressable>

  <Pressable
    onPress={async () => {
      await Haptics.selectionAsync();
      navigation.navigate('Glossary', { trackId: 'obe' });
    }}
    accessibilityRole="button"
    accessibilityLabel="Open OBE glossary"
    style={[styles.glossaryBtn, { marginLeft: 8 }]}
  >
    <Text style={styles.glossaryText}>OBE Glossary</Text>
  </Pressable>
</View>

            {/* Filter chips */}
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
              <Chip label="All" active={filter === 'all'} onPress={() => selectFilter('all')} />
              <Chip label="Lucid" active={filter === 'lucid'} onPress={() => selectFilter('lucid')} />
              <Chip label="OBE" active={filter === 'obe'} onPress={() => selectFilter('obe')} />
            </View>

            {/* Your Path */}
            <View style={{ marginTop: 28 }}>
              <Text style={{ color: '#9C94E6', fontSize: 12, marginBottom: 8 }}>Your Path</Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={{ marginTop: 4 }}
                contentContainerStyle={{ paddingLeft: 0, paddingRight: 24, gap: 12 }}
              >
                {guidance.continueLesson && (
                  <FeaturedCard
                    key={`cont-${guidance.continueLesson.id}`}
                    title={guidance.continueLesson.title}
                    subtitle={'Continue'}
                    onPress={() => goToLesson(guidance.continueLesson!.trackId, guidance.continueLesson!.id)}
                    progress={ALL_LESSONS.find(l => l.id === guidance.continueLesson!.id)?.progress ?? 0}
                  />
                )}
                {guidance.nextStep && (
                  <FeaturedCard
                    key={`next-${guidance.nextStep.id}`}
                    title={guidance.nextStep.title}
                    subtitle={`${guidance.nextStep.level} · ${guidance.nextStep.minutes || 0} min`}
                    onPress={() => goToLesson(guidance.nextStep!.trackId, guidance.nextStep!.id)}
                    progress={ALL_LESSONS.find(l => l.id === guidance.nextStep!.id)?.progress ?? 0}
                  />
                )}
                {guidance.deepen && (
                  <FeaturedCard
                    key={`deep-${guidance.deepen.id}`}
                    title={guidance.deepen.title}
                    subtitle={`deepen · ${guidance.deepen.minutes || 0} min`}
                    onPress={() => goToLesson(guidance.deepen!.trackId, guidance.deepen!.id)}
                    progress={ALL_LESSONS.find(l => l.id === guidance.deepen!.id)?.progress ?? 0}
                  />
                )}
              </ScrollView>
            </View>

            {/* Featured row */}
            <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 40 }}>
              {inProgress.length > 0 && (
                <Text style={{ color: '#9C94E6', fontSize: 12, marginLeft: 0, marginRight: 8 }}>Continue learning</Text>
              )}
            </View>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={{ marginTop: 8 }}
              contentContainerStyle={{ paddingLeft: 0, paddingRight: 24, gap: 12 }}
            >
              {featured.map(item => (
                <FeaturedCard
                  key={item.id}
                  title={item.title}
                  subtitle={item.trackId === 'lucid' ? 'Lucid' : 'OBE'}
                  onPress={() => goToLesson(item.trackId, item.id)}
                  progress={item.progress}
                />
              ))}
            </ScrollView>
          </View>

          {/* Lesson list */}
          <View style={{ paddingHorizontal: 24, paddingTop: 8 }}>
            <Text style={{ color: '#9C94E6', fontSize: 12, marginBottom: 8 }}>{filter === 'all' ? 'All lessons' : (filter === 'lucid' ? 'Lucid lessons' : 'OBE lessons')}</Text>
            {filtered.map(item => (
              <Pressable
                key={item.id}
                onPress={() => goToLesson(item.trackId, item.id)}
                style={styles.listItem}
              >
                <Text style={styles.listTitle}>{item.title}</Text>
                <Text style={styles.listSub} numberOfLines={2}>{item.summary}</Text>
                <Text style={styles.listMeta}>{item.minutes} min · {item.trackId.toUpperCase()}</Text>
                {/* Progress bar */}
                <View style={styles.progressTrack}>
                  <View style={[styles.progressFill, { width: `${Math.round(Math.max(0, Math.min(1, (item.progress || 0))) * 100)}%` }]} />
                </View>
              </Pressable>
            ))}
          </View>
        </ScrollView>
       <Pressable
        onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            navigation.navigate('Home');
        }}
        accessibilityRole="button"
        accessibilityLabel="Return to Home"
        style={[styles.floatingHome, { bottom: 16 + insets.bottom }]}
      >
        <Text style={styles.floatingHomeText}>Return Home</Text>
    </Pressable>
      </SafeAreaView>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: 'transparent', position: 'relative' },
  kicker: { color: '#B9B0EB', letterSpacing: 1, textTransform: 'uppercase', fontSize: 12 },
  title: { color: '#EDE8FA', fontSize: 26, fontWeight: '700', marginTop: 6 },
  listItem: {
    padding: 16,
    borderRadius: 12,
    backgroundColor: 'rgba(10,8,20,0.35)',
    borderWidth: 1,
    borderColor: 'rgba(237,232,250,0.08)',
    marginBottom: 12,
  },
  listTitle: { color: '#EDE8FA', fontWeight: '700', fontSize: 16 },
  listSub: { color: '#B9B0EB', marginTop: 4, fontSize: 13, lineHeight: 18 },
  listMeta: { color: '#9C94E6', marginTop: 8, fontSize: 12 },
  progressTrack: { height: 3, backgroundColor: 'rgba(237,232,250,0.12)', borderRadius: 2, marginTop: 12 },
  progressFill: { height: 3, backgroundColor: '#6E63D9', borderRadius: 2 },


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
  floatingHomeText: {
    color: '#EDE8FA',
    fontWeight: '600',
    letterSpacing: 0.5,
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
  floatingHelpText: {
    color: '#EDE8FA',
    fontWeight: '700',
    fontSize: 16,
    lineHeight: 24,
  },
  glossaryBlock: {
    alignSelf: 'stretch',
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingHorizontal: 0, // match header padding
    marginTop: 8,
  },
  glossaryBtn: {
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(185,176,235,0.35)',
    backgroundColor: 'rgba(185,176,235,0.12)',
  },
  glossaryText: {
    color: '#EDE8FA',
    fontSize: 14,
    fontWeight: '600',
  },
});
