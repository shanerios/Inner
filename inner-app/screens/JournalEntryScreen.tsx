// screens/JournalEntryScreen.tsx
import React, { useEffect, useRef, useState, useCallback } from 'react';
import { View, Text, TextInput, StyleSheet, TouchableOpacity, Pressable, Alert, KeyboardAvoidingView, Platform, ScrollView, Animated } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useHeaderHeight } from '@react-navigation/elements';
import * as Haptics from 'expo-haptics';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getEntry, saveEntry, deleteEntry, JournalEntry } from '../core/journalRepo';
import { requestNotificationPermission, scheduleDailyWakeNotification } from '../utils/notifications';
import { useBreath } from '../core/BreathProvider';
import { Typography, Body as _Body } from '../core/typography';
const Body = _Body ?? ({ regular: { ...Typography.body }, subtle: { ...Typography.caption } } as const);

function fmtDate(ts: number) {
  const d = new Date(ts);
  return d.toLocaleString(undefined, {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}



const DREAM_SIGNS = [
  'Flying',
  'Falling',
  'Water',
  'Chased',
  'Lost',
  'Mirror',
  'Teeth',
  'Familiar Person',
  'Unknown Place',
  'Shadow Presence',
];

const WAKE_TIME_STORAGE_KEY = 'preferredWakeTime';

function formatCaptureLabel(minutesFromWake?: number | null) {
  if (typeof minutesFromWake !== 'number') return null;
  const minutes = Math.abs(minutesFromWake);
  if (minutes <= 10) return 'Captured near waking';
  if (minutesFromWake >= 0) return `Captured ${minutes} min after waking`;
  return `Captured ${minutes} min before waking`;
}

function computeMinutesFromWake(entryTimestamp: number, wakeTime: string): number | null {
  if (!wakeTime || typeof wakeTime !== 'string' || !wakeTime.includes(':')) return null;

  const [hoursRaw, minutesRaw] = wakeTime.split(':');
  const hours = Number(hoursRaw);
  const minutes = Number(minutesRaw);

  if (Number.isNaN(hours) || Number.isNaN(minutes)) return null;

  const recorded = new Date(entryTimestamp);
  const wake = new Date(entryTimestamp);
  wake.setHours(hours, minutes, 0, 0);

  const diffMinutes = Math.round((recorded.getTime() - wake.getTime()) / 60000);

  if (diffMinutes < -120 || diffMinutes > 240) return null;
  return diffMinutes;
}

const TITLE_FILLER_WORDS = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'been', 'but', 'by', 'for', 'from',
  'had', 'has', 'have', 'he', 'her', 'hers', 'him', 'his', 'i', 'if', 'in', 'into',
  'is', 'it', 'its', 'me', 'my', 'of', 'on', 'or', 'our', 'so', 'that', 'the',
  'their', 'them', 'there', 'they', 'this', 'to', 'was', 'we', 'were', 'with',
  'you', 'your', 'just', 'then', 'than', 'very', 'really', 'maybe', 'almost'
]);

function buildSuggestedTitle(bodyText: string) {
  const cleaned = bodyText
    .replace(/\s+/g, ' ')
    .trim();

  if (!cleaned) return '';

  const sentences = cleaned.split(/[.!?]/).map(s => s.trim()).filter(Boolean);
  const first = sentences[0] || cleaned;

  const words = first
    .split(' ')
    .map((word) => word.replace(/^[^a-zA-Z0-9']+|[^a-zA-Z0-9']+$/g, ''))
    .filter(Boolean);

  if (words.length === 0) return '';

  const strongWords = words.filter((word) => !TITLE_FILLER_WORDS.has(word.toLowerCase()));

  const source = strongWords.length >= 3 ? strongWords : words;

  let phrase = source.slice(0, 5).join(' ').trim();

  if (!phrase) return '';

  return phrase.charAt(0).toUpperCase() + phrase.slice(1);
}

export default function JournalEntryScreen({ route, navigation }: Props) {
  const { id, isNew } = route.params || {};
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();

  const [entry, setEntry] = useState<JournalEntry | null>(null);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [dreamSigns, setDreamSigns] = useState<string[]>([]);
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved'>('idle');
  const saveStateOpacity = useRef(new Animated.Value(0)).current;
  const bodyInputRef = useRef<TextInput | null>(null);

  const [gradCur, setGradCur] = useState<string[]>(['rgba(142,136,216,0.14)', 'rgba(0,0,0,0)']);
  const [gradPrev, setGradPrev] = useState<string[]>(gradCur);
  const gradFade = useRef(new Animated.Value(1)).current;

  const saveTimer = useRef<any>(null);
  const notifAttemptedRef = useRef(false);
  const entryCountedRef = useRef(false);

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
      let hydrated = e as JournalEntry & { dreamSigns?: string[]; captureMinutesFromWake?: number | null };

      if (hydrated.captureMinutesFromWake == null) {
        try {
          const storedWakeTime = await AsyncStorage.getItem(WAKE_TIME_STORAGE_KEY);
          const computed = computeMinutesFromWake(hydrated.createdAt, storedWakeTime || '');

          if (computed != null) {
            hydrated = { ...hydrated, captureMinutesFromWake: computed };
            await saveEntry(hydrated);
          }
        } catch {
          // ignore metadata backfill errors
        }
      }

      setEntry(hydrated);
      setTitle(hydrated.title || '');
      setBody(hydrated.body || '');
      setDreamSigns((hydrated as any).dreamSigns || []);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const timeout = setTimeout(() => {
      bodyInputRef.current?.focus();
    }, 120);

    return () => clearTimeout(timeout);
  }, []);

  useEffect(() => {
    const next = dreamSigns.length > 0
      ? ['rgba(142,136,216,0.18)', 'rgba(0,0,0,0)']
      : ['rgba(142,136,216,0.14)', 'rgba(0,0,0,0)'];
    setGradPrev(gradCur);
    setGradCur(next);
    gradFade.setValue(0);
    Animated.timing(gradFade, {
      toValue: 1,
      duration: 600,
      useNativeDriver: true,
    }).start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dreamSigns.join('|')]);

  useEffect(() => {
    if (!entry) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    setSaveState('saving');
    saveTimer.current = setTimeout(async () => {
      const updated: JournalEntry = { ...entry, title, body, dreamSigns };
      await saveEntry(updated);
      setEntry(updated);
      setSaveState('saved');
      setTimeout(() => setSaveState('idle'), 1200);
    }, 1000);
  }, [dreamSigns]);

  // Autosave after idle 1s
  const scheduleSave = useCallback(() => {
    if (!entry) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    setSaveState('saving');
    saveTimer.current = setTimeout(async () => {
      const updated: JournalEntry = { ...entry, title, body, dreamSigns };
      await saveEntry(updated);
      setEntry(updated);
      setSaveState('saved');
      setTimeout(() => setSaveState('idle'), 1200);
      if (!notifAttemptedRef.current) {
        try {
          if (!entryCountedRef.current) {
            entryCountedRef.current = true;
            const raw = await AsyncStorage.getItem('journalSaveCount');
            const count = (parseInt(raw ?? '0', 10) || 0) + 1;
            await AsyncStorage.setItem('journalSaveCount', String(count));
            if (count >= 2) {
              notifAttemptedRef.current = true;
              const existingNotifId = await AsyncStorage.getItem('wakeNotificationId');
              if (!existingNotifId) {
                const wakeTime = await AsyncStorage.getItem('wakeTime');
                if (wakeTime) {
                  const granted = await requestNotificationPermission();
                  if (granted) await scheduleDailyWakeNotification(wakeTime);
                }
              }
            }
          }
        } catch {}
      }
    }, 1000);
  }, [entry, title, body, dreamSigns]);

  useEffect(() => () => saveTimer.current && clearTimeout(saveTimer.current), []);

  useEffect(() => {
    if (saveState === 'idle') {
      Animated.timing(saveStateOpacity, {
        toValue: 0,
        duration: 220,
        useNativeDriver: true,
      }).start();
      return;
    }

    Animated.timing(saveStateOpacity, {
      toValue: 1,
      duration: 180,
      useNativeDriver: true,
    }).start();
  }, [saveState, saveStateOpacity]);

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

  function toggleDreamSign(sign: string) {
    setDreamSigns(prev => {
      const exists = prev.includes(sign);
      if (exists) return prev.filter(s => s !== sign);
      return [...prev, sign];
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
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 6 }}>
          <Text style={[Typography.caption, { color: '#CFC9E8', opacity: 0.85 }]}>
            {entry ? `Recorded ${fmtDate(entry.createdAt)}` : ''}
          </Text>

          <Animated.Text
            style={[
              Typography.caption,
              {
                color: '#8E88D8',
                opacity: saveStateOpacity,
              },
            ]}
          >
            {saveState === 'saving' ? 'Saving…' : saveState === 'saved' ? 'Saved' : ' '}
          </Animated.Text>
        </View>
        {!!entry && formatCaptureLabel((entry as any).captureMinutesFromWake) && (
          <Text style={[Typography.caption, { color: '#B9B2D6', marginTop: 4, marginBottom: 10, opacity: 0.74 }]}>
            {formatCaptureLabel((entry as any).captureMinutesFromWake)}
          </Text>
        )}
        <TextInput
          value={title}
          onChangeText={(t) => { setTitle(t); scheduleSave(); }}
          placeholder="Title (optional)"
          placeholderTextColor="rgba(237,234,246,0.35)"
          style={styles.title}
        />
        <TouchableOpacity
          onPress={async () => {
            if (!body || !entry) return;
            const suggestion = buildSuggestedTitle(body);
            if (!suggestion) return;

            if (saveTimer.current) clearTimeout(saveTimer.current);
            setTitle(suggestion);
            setSaveState('saving');

            const updated: JournalEntry = { ...entry, title: suggestion, body, dreamSigns };
            await saveEntry(updated);
            setEntry(updated);
            setSaveState('saved');
            setTimeout(() => setSaveState('idle'), 1200);
          }}
          style={{ marginBottom: 10 }}
        >
          <Text style={[Typography.caption, { color: '#8E88D8' }]}>Suggest title</Text>
        </TouchableOpacity>

        <TextInput
          ref={bodyInputRef}
          value={body}
          onChangeText={(t) => { setBody(t); scheduleSave(); }}
          placeholder="Begin where the feeling lingers…"
          placeholderTextColor="rgba(237,234,246,0.35)"
          style={styles.body}
          multiline
          textAlignVertical="top"
        />

        {/* Dream Signs */}
        <Text style={[Typography.caption, { color: '#CFC9E8', marginBottom: 6, opacity: 0.8 }]}>
          Dream Signs
        </Text>
        <View style={styles.chipsRow}>
          {DREAM_SIGNS.map((sign) => {
            const selected = dreamSigns.includes(sign);
            return (
              <TouchableOpacity
                key={sign}
                onPress={() => toggleDreamSign(sign)}
                activeOpacity={0.9}
                style={[
                  styles.chip,
                  selected
                    ? { borderColor: '#8E88D8', backgroundColor: 'rgba(255,255,255,0.12)' }
                    : { borderColor: 'rgba(255,255,255,0.14)', backgroundColor: 'rgba(255,255,255,0.05)' },
                ]}
              >
                <Text style={[Typography.caption, { color: selected ? '#8E88D8' : '#D8D3EA' }]}>
                  {sign}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
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