// screens/JournalListScreen.tsx
import React, { useEffect, useRef, useState, useCallback, useLayoutEffect } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, Image, Pressable, TextInput, Animated, Easing } from 'react-native';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useHeaderHeight } from '@react-navigation/elements';
import { JournalEntry, listEntries, createEntry } from '../core/journalRepo';
import { Typography, Body as _Body } from '../core/typography';
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

function getRecurringSigns(entries: JournalEntry[]) {
  const counts = new Map<string, number>();

  entries.forEach((entry) => {
    const signs = (((entry as any).dreamSigns || []) as string[]);
    signs.forEach((sign) => {
      counts.set(sign, (counts.get(sign) || 0) + 1);
    });
  });

  return Array.from(counts.entries())
    .filter(([, count]) => count >= 2)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3);
}

function formatNightsRemembered(count: number) {
  if (count <= 0) return null;
  if (count === 1) return '1 night remembered';
  return `${count} nights remembered`;
}

export default function JournalListScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const [items, setItems] = useState<JournalEntry[]>([]);
  const [query, setQuery] = useState('');

  useLayoutEffect(() => {
    navigation.setOptions({
      title: 'Dream Log',
      headerTitle: 'Dream Log',
      headerTitleAlign: 'center',
      headerTintColor: '#EDEAF6',
      headerBackTitleVisible: false,
      headerTitleStyle: { color: '#EDEAF6' },
      headerStyle: { backgroundColor: 'rgba(18,18,32,1)' },
      animationEnabled: true,
      animation: 'fade',
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
    const all = await listEntries();
    setItems(all);
  }, []);

  useEffect(() => { const unsub = navigation.addListener('focus', load); return unsub; }, [navigation, load]);
  useEffect(() => { load(); }, [load]);

  const normalizedQuery = query.trim().toLowerCase();
  const mostRecentEntry = items[0] || null;
  const recurringSigns = getRecurringSigns(items);
  const nightsRemembered = formatNightsRemembered(items.length);

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

  return (
    <View style={[styles.container, { paddingTop: headerHeight + 12, paddingBottom: insets.bottom + 16 }]}>
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
      
      {!normalizedQuery && !!items.length && (
        <View style={styles.summaryCard}>
          {!!nightsRemembered && (
            <Text style={styles.summaryOverline}>{nightsRemembered}</Text>
          )}

          <Text style={styles.summaryTitle}>
            {mostRecentEntry ? 'Something has been carried back.' : 'Patterns are beginning to form.'}
          </Text>

          {!!recurringSigns.length && (
            <>
              <Text style={styles.summarySub}>Recurring signals</Text>
              <View style={styles.summarySignRow}>
                {recurringSigns.map(([sign, count]) => (
                  <View key={sign} style={styles.summarySignChip}>
                    <Text style={styles.summarySignText}>{sign} · {count}</Text>
                  </View>
                ))}
              </View>
            </>
          )}
        </View>
      )}
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
          const entry = await createEntry({});
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
  container: { flex: 1, backgroundColor: 'rgba(18,18,32,1)', paddingHorizontal: 16 },
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
  summaryCard: {
    marginBottom: 14,
    paddingHorizontal: 14,
    paddingVertical: 14,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  summaryOverline: { ...Body.subtle, color: '#B9B2D6', marginBottom: 4, opacity: 0.76 },
  summaryTitle: { ...Typography.body, color: '#EDEAF6', opacity: 0.96 },
  summarySub: { ...Body.subtle, color: '#CFC9E8', marginTop: 10, marginBottom: 6, opacity: 0.84 },
  summarySignRow: { flexDirection: 'row', flexWrap: 'wrap' },
  summarySignChip: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    marginRight: 6,
    marginBottom: 4,
  },
  summarySignText: { ...Body.subtle, fontSize: 11, color: '#D8D3EA' },
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
    width: 52, height: 52, borderRadius: 26,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#CFC3E0', borderWidth: 1, borderColor: 'rgba(255,255,255,0.20)',
    shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 8, shadowOffset: { width: 0, height: 4 },
  },
  fabPlus: { color: '#1F233A', fontSize: 26, lineHeight: 26, marginTop: -2, fontWeight: '700' },
});