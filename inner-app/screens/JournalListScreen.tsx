// screens/JournalListScreen.tsx
import React, { useEffect, useRef, useState, useCallback, useLayoutEffect } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, Image, Pressable, TextInput, Animated, Easing } from 'react-native';
import { useVideoPlayer, VideoView } from '../core/memorySafeVideo';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useHeaderHeight } from '@react-navigation/elements';
import { JournalEntry, listEntries, createEntry } from '../core/journalRepo';
import { Typography, Body as _Body } from '../core/typography';
import { buildPracticeContext } from '../core/practiceLinking';
import { loadJourneyMemory, type JourneyMemorySession } from '../core/journeyMemory';
import { derivePracticeMemoryInsights } from '../core/practiceMemory';
import { loadNightRecords, type NightRecord } from '../core/nightRecords';
import {
  loadCurrentPracticeExperiment,
  practiceExperimentView,
  type PracticeExperiment,
} from '../core/practiceExperiments';
// Safe fallback to avoid hot-reload issues if Body is undefined momentarily
const Body = _Body ?? ({
  regular: { ...Typography.body },
  subtle:  { ...Typography.caption },
} as const);

type Props = { navigation: any };

function formatDay(ts: number) {
  const d = new Date(ts);
  const today = new Date(); today.setHours(0,0,0,0);
  const yday = new Date(today); yday.setDate(today.getDate() - 1);

  const start = new Date(ts); start.setHours(0,0,0,0);
  if (+start === +today) return 'Today';
  if (+start === +yday)  return 'Yesterday';
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatCaptureLabel(minutesFromWake?: number | null) {
  if (typeof minutesFromWake !== 'number') return null;
  const minutes = Math.abs(minutesFromWake);
  if (minutes <= 10) return 'Captured near waking';
  if (minutesFromWake >= 0) return `Captured ${minutes} min after waking`;
  return `Captured ${minutes} min before waking`;
}

export default function JournalListScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const [items, setItems] = useState<JournalEntry[]>([]);
  const [journeySessions, setJourneySessions] = useState<JourneyMemorySession[]>([]);
  const [nightRecords, setNightRecords] = useState<NightRecord[]>([]);
  const [practiceExperiment, setPracticeExperiment] = useState<PracticeExperiment | null>(null);
  const [query, setQuery] = useState('');

  useLayoutEffect(() => {
    navigation.setOptions({
      title: 'Dream Log',
      headerTitle: 'Dream Log',
      headerTitleAlign: 'center',
      headerTintColor: '#EDEAF6',
      headerBackTitleVisible: false,
      headerTitleStyle: { color: '#EDEAF6' },
      headerStyle: { backgroundColor: 'transparent' },
      headerTransparent: true,
      animationEnabled: true,
      animation: 'fade',
      headerRight: () => (
        <Pressable
          onPress={() => navigation.navigate('DreamArchive')}
          hitSlop={14}
          accessibilityRole="button"
          accessibilityLabel="Open Dream Archive"
          style={{ marginRight: 16, paddingVertical: 8, paddingLeft: 10 }}
        >
          <Text style={{ fontFamily: 'Inter-Medium', fontSize: 9, letterSpacing: 1.5, color: '#D8D1E8' }}>ARCHIVE</Text>
        </Pressable>
      ),
    });
  }, [navigation]);

  // RETURN label — own effect so animation fires once on mount
  const returnOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.sequence([
      Animated.timing(returnOpacity, { toValue: 0.85, duration: 700, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      Animated.delay(2000),
      Animated.timing(returnOpacity, { toValue: 1.0, duration: 1500, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      Animated.timing(returnOpacity, { toValue: 0.40, duration: 900, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
    ]).start();

    navigation.setOptions({
      headerLeft: () => (
        <Animated.View style={{ opacity: returnOpacity, marginLeft: 16 }}>
          <Pressable
            onPress={async () => {
              try { await Haptics.selectionAsync(); } catch {}
              navigation.goBack();
            }}
            hitSlop={20}
          >
            <Text style={{ fontFamily: 'CalSans-Regular', fontSize: 11, letterSpacing: 3.5, color: '#ffffff' }}>RETURN</Text>
          </Pressable>
        </Animated.View>
      ),
    });
  }, []);

  const load = useCallback(async () => {
    const [all, journeyMemory, recordedNights, experiment] = await Promise.all([
      listEntries(),
      loadJourneyMemory(),
      loadNightRecords(),
      loadCurrentPracticeExperiment(),
    ]);
    setItems(all);
    setJourneySessions(journeyMemory.sessions);
    setNightRecords(recordedNights);
    setPracticeExperiment(experiment);
  }, []);

  useEffect(() => { const unsub = navigation.addListener('focus', load); return unsub; }, [navigation, load]);
  useEffect(() => { load(); }, [load]);

  const normalizedQuery = query.trim().toLowerCase();
  const mostRecentEntry = items[0] || null;
  const practiceMemoryInsights = derivePracticeMemoryInsights(items, journeySessions, nightRecords);
  const experimentView = practiceExperiment ? practiceExperimentView(practiceExperiment) : null;
  const activeExperiment = practiceExperiment?.status === 'active' ? experimentView : null;
  const memorySummary = activeExperiment
    ? `Experiment ${activeExperiment.completedNights}/${activeExperiment.targetNights}`
    : practiceMemoryInsights.length
      ? `${practiceMemoryInsights.length} ${practiceMemoryInsights.length === 1 ? 'observation' : 'observations'}`
      : `${items.filter(item => !item.testSession).length} ${items.filter(item => !item.testSession).length === 1 ? 'dream' : 'dreams'} remembered`;

  const filteredItems = !normalizedQuery
    ? items
    : items.filter((entry) => {
        const title = (entry.title || '').toLowerCase();
        const body = (entry.body || '').toLowerCase();
        const signs = (((entry as any).dreamSigns || []) as string[]).join(' ').toLowerCase();
        return (
          title.includes(normalizedQuery) ||
          body.includes(normalizedQuery) ||
          signs.includes(normalizedQuery)
        );
      });

  // group by day label
  const groups = filteredItems.reduce<Record<string, JournalEntry[]>>((acc, e) => {
    const key = formatDay(e.createdAt);
    (acc[key] ||= []).push(e);
    return acc;
  }, {});

  const sections = Object.keys(groups).map(k => ({ title: k, data: groups[k] }));

  const bgPlayer = useVideoPlayer(require('../assets/videos/dream_journal_bg.mp4'), player => {
    player.loop = true;
    player.muted = true;
    // Muted decorative video must not claim exclusive AVAudioSession ownership —
    // the default 'doNotMix' mode fights TrackPlayer's session on background/lock.
    player.audioMixingMode = 'mixWithOthers';
    player.play();
  });

  return (
    <View style={[styles.container, { paddingTop: headerHeight + 12, paddingBottom: insets.bottom + 16 }]}>
      {/* Animated MP4 background */}
      <VideoView
        player={bgPlayer}
        contentFit="cover"
        style={StyleSheet.absoluteFill}
        nativeControls={false}
        allowsFullscreen={false}
        allowsPictureInPicture={false}
      />
      {/* Optional micro-grain overlay.
          To enable: add an image at `../assets/overlays/grain.png` (or update the require path),
          then uncomment the <Image /> below.
      */}
      {/*
      <Image
        pointerEvents="none"
        source={require('../assets/overlays/grain.png')}
        resizeMode="repeat"
        style={styles.grain}
      />
      */}
      
      <View style={styles.searchWrap}>
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search dreams, fragments, signs…"
          placeholderTextColor="rgba(207,201,232,0.45)"
          style={styles.searchInput}
          returnKeyType="search"
          clearButtonMode="while-editing"
        />
      </View>
      {!normalizedQuery && (!!items.length || practiceMemoryInsights.length > 0 || !!practiceExperiment) && (
        <Pressable
          onPress={() => navigation.navigate('PracticeMemory')}
          accessibilityRole="button"
          accessibilityLabel={`Open Practice Memory. ${memorySummary}`}
          style={({ pressed }) => [styles.memoryRow, pressed && styles.memoryRowPressed]}
        >
          <View>
            <Text style={styles.memoryTitle}>PRACTICE MEMORY</Text>
            <Text style={styles.memorySummary}>{memorySummary}</Text>
          </View>
          <Text style={styles.memoryChevron}>›</Text>
        </Pressable>
      )}
      {sections.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>
            {normalizedQuery ? 'Nothing surfaced for that search.' : 'Nothing has been carried back… yet.'}
          </Text>

          <Text style={styles.emptyLead}>
            {normalizedQuery ? 'Try another word, symbol, or dream sign.' : 'The first memory is still waiting to be recorded.'}
          </Text>

          <Text style={styles.emptySub}>
            {normalizedQuery ? 'Search matches title, body, and dream signs.' : 'Tap + when something from the night remains.'}
          </Text>
        </View>
      ) : (
        <FlatList
          data={sections}
          keyExtractor={(s) => s.title}
          renderItem={({ item: section }) => (
            <View style={{ marginBottom: 16 }}>
              <Text style={styles.sectionTitle}>{section.title}</Text>
              {section.data.map(entry => (
                <TouchableOpacity
                  key={entry.id}
                  style={[
                    styles.card,
                    entry.id === mostRecentEntry?.id && !normalizedQuery ? styles.cardRecent : null,
                  ]}
                  onPress={() => navigation.navigate('JournalEntry', { id: entry.id })}
                  activeOpacity={0.9}
                >
                  {entry.id === mostRecentEntry?.id && !normalizedQuery && (
                    <Text style={styles.recentLabel}>Most recent</Text>
                  )}
                  {!!entry.title ? (
                    <Text numberOfLines={1} style={styles.cardTitle}>{entry.title}</Text>
                  ) : (
                    <Text numberOfLines={1} style={styles.cardTitleMuted}>Untitled</Text>
                  )}
                  <Text numberOfLines={2} style={styles.cardBody}>{entry.body || ' '}</Text>

                  {!!formatCaptureLabel((entry as any).captureMinutesFromWake) && (
                    <Text style={styles.meta}>
                      {formatCaptureLabel((entry as any).captureMinutesFromWake)}
                    </Text>
                  )}

                  {!!(entry as any).dreamSigns?.length && (
                    <View style={styles.signRow}>
                      {(entry as any).dreamSigns.slice(0, 3).map((sign: string) => (
                        <View key={sign} style={styles.signChip}>
                          <Text style={styles.signText}>{sign}</Text>
                        </View>
                      ))}
                    </View>
                  )}
                </TouchableOpacity>
              ))}
            </View>
          )}
        />
      )}

      {/* FAB */}
      <TouchableOpacity
        style={[styles.fab, { bottom: insets.bottom + 24 }]}
        onPress={async () => {
          try { await Haptics.selectionAsync(); } catch {}
          const entry = await createEntry({
            kind: 'dream',
            practiceContext: await buildPracticeContext(),
          });
          navigation.navigate('JournalEntry', { id: entry.id, isNew: true });
        }}
        activeOpacity={0.9}
      >
        <Text style={styles.fabPlus}>＋</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  grain: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0.06,
  },
  container: { flex: 1, backgroundColor: 'transparent', paddingHorizontal: 16 },
  header: { ...Typography.title, color: '#EDEAF6', marginBottom: 12, textAlign: 'center' },
  sectionTitle: { ...Body.subtle, color: '#CFC9E8', marginTop: 8, marginBottom: 6, opacity: 0.9 },
  searchWrap: { marginBottom: 12 },
  searchInput: {
    ...Body.regular,
    color: '#EDEAF6',
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  memoryRow: { minHeight: 54, marginBottom: 10, paddingHorizontal: 4, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(255,255,255,0.10)' },
  memoryRowPressed: { opacity: 0.65 },
  memoryTitle: { ...Body.subtle, color: '#B9B2D6', fontSize: 9, letterSpacing: 1.3 },
  memorySummary: { ...Body.subtle, color: '#8F88A8', fontSize: 10, marginTop: 3 },
  memoryChevron: { color: '#A99BC8', fontFamily: 'Inter-Light', fontSize: 25, marginRight: 4, marginBottom: 2 },
  card: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)',
    borderRadius: 12, padding: 12, marginBottom: 8,
  },
  cardRecent: {
    borderColor: 'rgba(142,136,216,0.22)',
    backgroundColor: 'rgba(255,255,255,0.075)',
  },
  recentLabel: { ...Body.subtle, color: '#8E88D8', marginBottom: 4, opacity: 0.88 },
  cardTitle: { ...Typography.title, color: '#F0EEF8' },
  cardTitleMuted: { ...Typography.title, color: '#B8B5C8', fontStyle: 'italic' },
  cardBody: { ...Body.regular, color: '#DCD8EE', marginTop: 4, opacity: 0.9 },
  meta: { ...Body.subtle, color: '#B9B2D6', marginTop: 4, opacity: 0.74 },
  signRow: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 6 },
  signChip: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    marginRight: 6,
    marginBottom: 4,
  },
  signText: { ...Body.subtle, fontSize: 11, color: '#CFC9E8' },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyTitle: { ...Typography.body, color: '#EDEAF6', marginBottom: 4, opacity: 0.9, textAlign: 'center' },
  emptyLead: {
    ...Typography.body,
    fontSize: Typography.body.fontSize - 1,
    lineHeight: Typography.body.lineHeight + 2,
    color: '#E6E2F3',
    marginTop: 4,
    marginBottom: 6,
    opacity: 0.92,
    textAlign: 'center',
  },
  emptySub: { ...Body.subtle, color: '#B9B5C9', textAlign: 'center' },
  fab: {
    position: 'absolute', right: 16,
    width: 52, height: 52, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(207,195,224,0.16)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)',
  },
  fabPlus: { color: '#F3EDE7', fontSize: 26, lineHeight: 26, marginTop: -2, fontWeight: '700' },
});
