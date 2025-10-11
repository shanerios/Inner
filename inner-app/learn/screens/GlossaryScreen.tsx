// learn/screens/GlossaryScreen.tsx
import React, { useMemo, useState } from 'react';
import { SafeAreaView, View, Text, StyleSheet, TextInput, SectionList, Pressable, LayoutAnimation, Platform, UIManager } from 'react-native';
import { useRoute, RouteProp, useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type RootStackParamList = {
  Glossary: { trackId: 'lucid' | 'obe' };
};

type GlossaryRoute = RouteProp<RootStackParamList, 'Glossary'>;

// Static requires so Metro bundles the JSON
const LUCID = require('../glossary/lucid.json');
const OBE   = require('../glossary/obe.json');

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

type GlossaryEntry = { key: string; term: string; definition: string; related?: string[] };
type Section = { title: string; data: GlossaryEntry[] };

export default function GlossaryScreen() {
  const { params } = useRoute<GlossaryRoute>();
  const nav = useNavigation();
  const insets = useSafeAreaInsets();
  const trackId = params?.trackId ?? 'lucid';

  // Normalize JSON → array
  const SOURCE: Record<string, any> = trackId === 'lucid' ? LUCID : OBE;
  const entries: GlossaryEntry[] = useMemo(() => {
    return Object.keys(SOURCE).map((k) => ({
      key: k,
      term: SOURCE[k].term,
      definition: SOURCE[k].definition,
      related: SOURCE[k].related || [],
    }));
  }, [trackId]);

  // Search
  const [query, setQuery] = useState('');
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return entries;
    return entries.filter(e =>
      e.term.toLowerCase().includes(q) ||
      e.definition.toLowerCase().includes(q) ||
      (e.related || []).some(r => r.toLowerCase().includes(q))
    );
  }, [entries, query]);

  // Group A→Z
  const sections: Section[] = useMemo(() => {
    const byLetter: Record<string, GlossaryEntry[]> = {};
    for (const e of filtered) {
      const letter = (e.term[0] || '#').toUpperCase();
      byLetter[letter] = byLetter[letter] || [];
      byLetter[letter].push(e);
    }
    return Object.keys(byLetter)
      .sort()
      .map((L) => ({ title: L, data: byLetter[L].sort((a,b) => a.term.localeCompare(b.term)) }));
  }, [filtered]);

  // Expand/collapse state
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const toggle = (k: string) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setOpen((s) => ({ ...s, [k]: !s[k] }));
  };

  const topPad = Math.max(16, insets.top);

  return (
    <SafeAreaView style={styles.container}>
      <View style={[styles.header, { paddingTop: topPad }]}>
        <Pressable
          onPress={() => nav.goBack()}
          accessibilityRole="button"
          accessibilityLabel="Go back"
          style={styles.backBtn}
        >
          <Text style={styles.backIcon}>‹</Text>
        </Pressable>

        <View style={{ flex: 1 }}>
          <Text style={styles.kicker}>{trackId === 'lucid' ? 'Lucid Glossary' : 'OBE Glossary'}</Text>
          <Text style={styles.title}>Glossary of Terms</Text>
        </View>
      </View>

      <View style={styles.searchRow}>
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search terms…"
          placeholderTextColor="rgba(237,232,250,0.55)"
          style={styles.search}
          accessibilityLabel="Search glossary"
          returnKeyType="search"
        />
      </View>

      <SectionList
        sections={sections}
        keyExtractor={(item) => item.key}
        contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
        stickySectionHeadersEnabled
        renderSectionHeader={({ section }) => (
          <View style={styles.sectionHdr}>
            <Text style={styles.sectionHdrText}>{section.title}</Text>
          </View>
        )}
        renderItem={({ item }) => {
          const isOpen = !!open[item.key];
          return (
            <View style={styles.card}>
              <Pressable
                onPress={() => toggle(item.key)}
                accessibilityRole="button"
                accessibilityLabel={`Toggle definition for ${item.term}`}
                style={styles.cardHeader}
              >
                <Text style={styles.term}>{item.term}</Text>
                <Text style={[styles.chev, isOpen && styles.chevOpen]}>›</Text>
              </Pressable>

              {isOpen && (
                <View style={styles.cardBody}>
                  <Text style={styles.def}>{item.definition}</Text>
                  {!!item.related?.length && (
                    <Text style={styles.related}>
                      Related: {item.related.join(' • ')}
                    </Text>
                  )}
                </View>
              )}
            </View>
          );
        }}
        ListEmptyComponent={
          <View style={{ padding: 24 }}>
            <Text style={{ color: '#DCD6F5' }}>No terms found.</Text>
          </View>
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: 'transparent' },
  header: { flexDirection: 'row', gap: 12, paddingHorizontal: 20, paddingBottom: 8, alignItems: 'center' },
  backBtn: { width: 36, height: 36, borderRadius: 18, borderWidth: 1, borderColor: 'rgba(185,176,235,0.45)', alignItems: 'center', justifyContent: 'center' },
  backIcon: { color: '#EDE8FA', fontSize: 22, lineHeight: 22, marginTop: -2 },
  kicker: { color: '#B9B0EB', textTransform: 'uppercase', letterSpacing: 1, fontSize: 12 },
  title: { color: '#EDE8FA', fontSize: 22, fontWeight: '700' },

  searchRow: { paddingHorizontal: 20, paddingVertical: 8 },
  search: {
    borderWidth: 1, borderColor: 'rgba(185,176,235,0.35)',
    backgroundColor: 'rgba(185,176,235,0.10)',
    borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, color: '#EDE8FA'
  },

  sectionHdr: { backgroundColor: 'rgba(185,176,235,0.12)', paddingHorizontal: 16, paddingVertical: 6 },
  sectionHdrText: { color: '#B9B0EB', fontWeight: '700', letterSpacing: 1 },

  card: {
    marginHorizontal: 16, marginVertical: 8, borderRadius: 14,
    borderWidth: 1, borderColor: 'rgba(185,176,235,0.25)',
    backgroundColor: 'rgba(185,176,235,0.08)', overflow: 'hidden'
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingVertical: 12 },
  term: { color: '#EDE8FA', fontSize: 16, fontWeight: '700' },
  chev: { color: '#EDE8FA', fontSize: 22, transform: [{ rotate: '90deg' }], opacity: 0.8 },
  chevOpen: { transform: [{ rotate: '270deg' }] },
  cardBody: { paddingHorizontal: 14, paddingBottom: 12, gap: 8 },
  def: { color: '#DCD6F5', lineHeight: 22, fontSize: 15 },
  related: { color: '#B9B0EB', fontSize: 12 }
});