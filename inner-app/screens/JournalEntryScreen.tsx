// screens/JournalEntryScreen.tsx
import React, { useEffect, useRef, useState, useCallback } from 'react';
import { View, Text, TextInput, StyleSheet, TouchableOpacity, Pressable, Alert, KeyboardAvoidingView, Platform, ScrollView, Animated } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useHeaderHeight } from '@react-navigation/elements';
import * as Haptics from 'expo-haptics';
import { getEntry, saveEntry, deleteEntry, JournalEntry } from '../core/journalRepo';
import { useIntention } from '../core/IntentionProvider';
import { INTENTION_THEME } from '../core/session';
import type { IntentionKey } from '../core/session';
import { useBreath } from '../core/BreathProvider';
import { Typography, Body as _Body } from '../core/typography';
const Body = _Body ?? ({ regular: { ...Typography.body }, subtle: { ...Typography.caption } } as const);

function fmtDate(ts: number) {
  const d = new Date(ts);
  return d.toLocaleString(undefined, {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}


const ALL_INTENTIONS = Object.keys(INTENTION_THEME) as IntentionKey[];

// Helpers to generate soft gradients from intention theme tints
function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const m = hex?.replace('#','').match(/^([0-9a-f]{6}|[0-9a-f]{3})$/i);
  if (!m) return { r: 150, g: 140, b: 200 };
  let h = m[1].toLowerCase();
  if (h.length === 3) h = h.split('').map(c => c + c).join('');
  const num = parseInt(h, 16);
  return { r: (num >> 16) & 255, g: (num >> 8) & 255, b: num & 255 };
}
function rgbaFromTint(tint?: string, a = 0.15): string {
  const { r, g, b } = hexToRgb(tint || '#8E88D8');
  return `rgba(${r},${g},${b},${a})`;
}
function computeGradientColors(intentions: string[] | undefined, fallbackFrom?: string[]): string[] {
  const keys = intentions && intentions.length ? intentions.slice(0, 2) as string[] : [];
  if (keys.length === 1) {
    const c = INTENTION_THEME[keys[0]]?.tint;
    return [rgbaFromTint(c, 0.18), rgbaFromTint(c, 0.04)];
  } else if (keys.length >= 2) {
    const c1 = INTENTION_THEME[keys[0]]?.tint;
    const c2 = INTENTION_THEME[keys[1]]?.tint;
    return [rgbaFromTint(c1, 0.18), rgbaFromTint(c2, 0.10), 'rgba(0,0,0,0)'];
  }
  return fallbackFrom || [rgbaFromTint('#8E88D8', 0.14), 'rgba(0,0,0,0)'];
}

export default function JournalEntryScreen({ route, navigation }: Props) {
  const { id } = route.params || {};
  const { intentions: globalIntentions } = useIntention();
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();

  const [entry, setEntry] = useState<JournalEntry | null>(null);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [tags, setTags] = useState<string[]>([]);

  // Intention-driven background gradient (crossfades on change)
  const [gradCur, setGradCur] = useState<string[]>(computeGradientColors(tags));
  const [gradPrev, setGradPrev] = useState<string[]>(gradCur);
  const gradFade = useRef(new Animated.Value(1)).current;

  const saveTimer = useRef<any>(null);

  const breath = useBreath();
  const veilOpacity = breath.interpolate({ inputRange: [0, 1], outputRange: [0.00, 0.06] });

  // Screen-enter micro-haze (mirrors LearnHub → LessonReader feel)
  const enterVeil = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    enterVeil.setValue(1);
    Animated.timing(enterVeil, {
      toValue: 0,
      duration: 720,
      easing: undefined,
      useNativeDriver: true,
    }).start();
  }, [enterVeil]);

  const load = useCallback(async () => {
    const e = await getEntry(id);
    if (e) {
      setEntry(e);
      setTitle(e.title || '');
      setBody(e.body || '');
      const initial = (e.intentionTags && e.intentionTags.length > 0)
        ? e.intentionTags
        : (globalIntentions?.slice(0, 2) as string[]) || [];
      setTags(initial);
    }
  }, [id, globalIntentions]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const next = computeGradientColors(tags, gradCur);
    setGradPrev(gradCur);
    setGradCur(next);
    gradFade.setValue(0);
    Animated.timing(gradFade, {
      toValue: 1,
      duration: 600,
      useNativeDriver: true,
    }).start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tags?.join('|')]);

  useEffect(() => {
    if (!entry) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      const updated: JournalEntry = { ...entry, title, body, intentionTags: tags };
      await saveEntry(updated);
      setEntry(updated);
    }, 1000);
  }, [tags]);

  // Autosave after idle 1s
  const scheduleSave = useCallback(() => {
    if (!entry) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      const updated: JournalEntry = { ...entry, title, body, intentionTags: tags };
      await saveEntry(updated);
      setEntry(updated);
    }, 1000);
  }, [entry, title, body, tags]);

  useEffect(() => () => saveTimer.current && clearTimeout(saveTimer.current), []);

  // Header actions
  useEffect(() => {
    navigation.setOptions({
      // NativeStack title prefers a string; keeps layout stable and avoids yellow iOS back styling.
      headerTitle: entry ? fmtDate(entry.updatedAt) : 'Dream Log',
      headerTransparent: true,
      headerShadowVisible: false,
      headerStyle: { backgroundColor: 'transparent' },

      // Soft veil-like transition on push/pop (in addition to our micro-haze overlay)
      animation: 'fade',

      headerLeft: () => (
        <Pressable
          onPress={() => {
            try { Haptics.selectionAsync(); } catch {}
            navigation.goBack();
          }}
          style={({ pressed }) => [
            styles.returnPill,
            pressed && { opacity: 0.85 },
          ]}
          hitSlop={10}
        >
          <Text style={styles.returnPillText}>Return</Text>
        </Pressable>
      ),

      headerRight: () => (
        <TouchableOpacity
          onPress={() => {
            Alert.alert('Delete entry?', 'This cannot be undone.', [
              { text: 'Cancel', style: 'cancel' },
              {
                text: 'Delete', style: 'destructive', onPress: async () => {
                  try { await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); } catch {}
                  await deleteEntry(id);
                  navigation.goBack();
                }
              },
            ]);
          }}
          style={{ paddingHorizontal: 12, paddingVertical: 8 }}
        >
          <Text style={[Typography.caption, { color: '#EAA' }]}>Delete</Text>
        </TouchableOpacity>
      ),
    });
  }, [navigation, entry, id]);

  function toggleTag(tag: string) {
    setTags(prev => {
      const exists = prev.includes(tag);
      if (exists) return prev.filter(t => t !== tag);
      // limit to 2 selections
      return prev.length >= 2 ? [prev[0], tag] : [...prev, tag];
    });
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: 'rgba(18,18,32,1)' }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      {/* Intention-reactive background gradients (crossfade) */}
      <Animated.View style={[StyleSheet.absoluteFill, { opacity: Animated.subtract(1, gradFade) }]} pointerEvents="none">
        <LinearGradient
          colors={gradPrev}
          locations={gradPrev.length === 3 ? [0, 0.7, 1] : [0, 1]}
          style={StyleSheet.absoluteFill}
          start={{ x: 0.2, y: 0 }}
          end={{ x: 0.8, y: 1 }}
        />
      </Animated.View>
      <Animated.View style={[StyleSheet.absoluteFill, { opacity: gradFade }]} pointerEvents="none">
        <LinearGradient
          colors={gradCur}
          locations={gradCur.length === 3 ? [0, 0.7, 1] : [0, 1]}
          style={StyleSheet.absoluteFill}
          start={{ x: 0.2, y: 0 }}
          end={{ x: 0.8, y: 1 }}
        />
      </Animated.View>

      {/* Screen-enter micro-haze (fades away) */}
      <Animated.View
        pointerEvents="none"
        style={[
          StyleSheet.absoluteFill,
          {
            backgroundColor: 'rgba(126, 98, 170, 0.22)',
            opacity: enterVeil,
          },
        ]}
      />

      {/* Breathing veil overlay */}
      <Animated.View
        pointerEvents="none"
        style={[
          StyleSheet.absoluteFill,
          { backgroundColor: 'rgba(255,255,255,0.10)', opacity: veilOpacity },
        ]}
      />

      <ScrollView
        contentContainerStyle={{ paddingTop: headerHeight + 12, paddingBottom: insets.bottom + 24, paddingHorizontal: 16 }}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={[Typography.caption, { color: '#CFC9E8', marginTop: 6, marginBottom: 10, opacity: 0.85 }]}>
          {entry ? fmtDate(entry.createdAt) : ''}
        </Text>
        <TextInput
          value={title}
          onChangeText={(t) => { setTitle(t); scheduleSave(); }}
          placeholder="Title (optional)"
          placeholderTextColor="rgba(237,234,246,0.35)"
          style={styles.title}
        />

        {/* Intention chips */}
        <View style={styles.chipsRow}>
          {ALL_INTENTIONS.map((key) => {
            const selected = tags.includes(key);
            const tint = INTENTION_THEME[key]?.tint || '#CFC9E8';
            return (
              <TouchableOpacity
                key={key}
                onPress={() => { try { Haptics.selectionAsync(); } catch {}; toggleTag(key); }}
                activeOpacity={0.9}
                style={[styles.chip, selected ? { borderColor: tint, backgroundColor: 'rgba(255,255,255,0.10)' } : { borderColor: 'rgba(255,255,255,0.14)', backgroundColor: 'rgba(255,255,255,0.05)' }]}
              >
                <Text style={[Typography.caption, { letterSpacing: 0.2, color: selected ? tint : '#D8D3EA' }]}>
                  {String(key).charAt(0).toUpperCase() + String(key).slice(1)}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <TextInput
          value={body}
          onChangeText={(t) => { setBody(t); scheduleSave(); }}
          placeholder="Begin where the feeling lingers…"
          placeholderTextColor="rgba(237,234,246,0.35)"
          style={styles.body}
          multiline
          textAlignVertical="top"
        />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  returnPill: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  returnPillText: {
    ...Typography.caption,
    color: '#EDEAF6',
    letterSpacing: 0.2,
  },
  label: { ...Typography.caption, color: '#CFC9E8', marginBottom: 8, opacity: 0.85 },
  title: {
    ...Typography.title,
    color: '#F0EEF8',
    marginBottom: 12,
    borderBottomWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    paddingBottom: 6,
  },
  body: {
    ...Typography.body,
    minHeight: 320,
    color: '#EDEAF6',
  },
  chipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 12,
  },
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 14,
    borderWidth: 1,
  },
  chipLabel: { ...Typography.caption, letterSpacing: 0.2 },
});