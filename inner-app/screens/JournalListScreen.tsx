// screens/JournalListScreen.tsx
import React, { useEffect, useState, useCallback, useLayoutEffect } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, Image, Pressable } from 'react-native';
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

export default function JournalListScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const [items, setItems] = useState<JournalEntry[]>([]);

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
      headerLeft: () => (
        <Pressable
          onPress={async () => {
            try { await Haptics.selectionAsync(); } catch {}
            navigation.goBack();
          }}
          style={{
            marginLeft: 12,
            paddingHorizontal: 14,
            paddingVertical: 6,
            borderRadius: 999,
            backgroundColor: 'rgba(255,255,255,0.08)',
            borderWidth: 1,
            borderColor: 'rgba(255,255,255,0.12)',
          }}
        >
          <Text style={{ color: '#EDEAF6', fontSize: 14 }}>Return</Text>
        </Pressable>
      ),
    });
  }, [navigation]);

  const load = useCallback(async () => {
    const all = await listEntries();
    setItems(all);
  }, []);

  useEffect(() => { const unsub = navigation.addListener('focus', load); return unsub; }, [navigation, load]);
  useEffect(() => { load(); }, [load]);

  // group by day label
  const groups = items.reduce<Record<string, JournalEntry[]>>((acc, e) => {
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
      
      {sections.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>
            Every insight begins with reflection.
          </Text>

          <Text style={styles.emptyLead}>
            Record dreams, symbols, and impressions.
          </Text>

          <Text style={styles.emptySub}>
            Tap + to record your first entry.
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
                  style={styles.card}
                  onPress={() => navigation.navigate('JournalEntry', { id: entry.id })}
                  activeOpacity={0.9}
                >
                  {!!entry.title ? (
                    <Text numberOfLines={1} style={styles.cardTitle}>{entry.title}</Text>
                  ) : (
                    <Text numberOfLines={1} style={styles.cardTitleMuted}>Untitled</Text>
                  )}
                  <Text numberOfLines={2} style={styles.cardBody}>{entry.body || ' '}</Text>
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
  card: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)',
    borderRadius: 12, padding: 12, marginBottom: 8,
  },
  cardTitle: { ...Typography.title, color: '#F0EEF8' },
  cardTitleMuted: { ...Typography.title, color: '#B8B5C8', fontStyle: 'italic' },
  cardBody: { ...Body.regular, color: '#DCD8EE', marginTop: 4, opacity: 0.9 },
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