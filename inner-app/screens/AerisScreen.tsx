import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  FlatList,
  Pressable,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Animated,
  Easing,
  PanResponder,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import * as Haptics from 'expo-haptics';
import { usePostHog } from 'posthog-react-native';
import Purchases from 'react-native-purchases';
import { safePresentPaywall } from '../src/core/subscriptions/safePresentPaywall';

// ── Types ─────────────────────────────────────────────────────────────────────

type Message = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
};

// Rendering-only — not persisted to storage or sent to the API
type DisplayMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  segments?: string[];     // assistant only: split content for sequential reveal
  visibleSegments: number; // how many segments are currently shown
  animated: boolean;       // false for history-rehydrated messages
};

// ── Constants ─────────────────────────────────────────────────────────────────

const AERIS_API = 'https://aeris.getinner.app/api/aeris';

const INITIAL_MESSAGE: Message = {
  id: 'aeris-init',
  role: 'assistant',
  content:
    "You've been feeling something lately — something you can't quite explain. I can meet you there. Would you like to go deeper?",
};

const CHAMBER_RE = /Chamber\s+(?:One|Two|Three|Four|Five|Six|Seven|Eight|Nine|[1-9])/gi;

const CHAMBER_NAME_TO_NUMBER: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5,
  six: 6, seven: 7, eight: 8, nine: 9,
};

const CHAMBER_NUMBER_TO_ID: Record<number, string> = {
  1: 'chamber_one', 2: 'chamber_two', 3: 'chamber_three', 4: 'chamber_four',
  5: 'chamber_five', 6: 'chamber_six', 7: 'chamber_seven', 8: 'chamber_eight',
  9: 'chamber_nine',
};

const PREMIUM_CHAMBERS = new Set([5, 6, 7, 8, 9]);

function chamberNumberFromMatch(matchedText: string): number {
  const word = matchedText.replace(/chamber\s+/i, '').toLowerCase();
  return CHAMBER_NAME_TO_NUMBER[word] ?? (parseInt(word, 10) || 0);
}

// ── Module-level helpers ──────────────────────────────────────────────────────

function stripMarkdown(text: string): string {
  return text
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/\*(.*?)\*/g, '$1')
    .replace(/^#{1,6}\s/gm, '')
    .replace(/^[-•]\s/gm, '')
    .trim();
}

function parseSegments(text: string): string[] {
  // Strip bullet/list chars before splitting so they don't produce standalone segments
  const cleaned = text.replace(/^[-•]\s/gm, '');
  const byDouble = cleaned.split(/\n\n+/).map((s) => s.trim()).filter(Boolean);
  if (byDouble.length >= 2) return byDouble;
  const bySentence = cleaned.match(/[^.!?]*[.!?]+(?:\s|$)/g);
  if (bySentence && bySentence.length >= 2) {
    return bySentence.map((s) => s.trim()).filter(Boolean);
  }
  return [cleaned];
}

function renderInlineSegment(
  text: string,
  onChamberTap?: (name: string, num: number) => void
): React.ReactNode[] {
  const stripped = stripMarkdown(text);
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  const re = new RegExp(CHAMBER_RE.source, 'gi');
  let match: RegExpExecArray | null;
  let key = 0;
  while ((match = re.exec(stripped)) !== null) {
    if (match.index > lastIndex) parts.push(stripped.slice(lastIndex, match.index));
    const name = match[0];
    const num = chamberNumberFromMatch(name);
    parts.push(
      <Text
        key={key++}
        style={styles.chamberRef}
        onPress={() => {
          console.log('[Aeris] Chamber tapped:', name);
          onChamberTap?.(name, num);
        }}
      >
        {name}
      </Text>
    );
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < stripped.length) parts.push(stripped.slice(lastIndex));
  return parts;
}

function toDisplayMessage(m: Message, animated: boolean): DisplayMessage {
  if (m.role === 'assistant') {
    const segs = parseSegments(m.content);
    return { ...m, segments: segs, visibleSegments: animated ? 1 : segs.length, animated };
  }
  return { ...m, visibleSegments: 1, animated };
}

// ── Sub-components ────────────────────────────────────────────────────────────

function FadeInView({ children }: { children: React.ReactNode }) {
  const opacity = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(0.98)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration: 1400,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(scale, {
        toValue: 1,
        duration: 1400,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  return (
    <Animated.View style={{ opacity, transform: [{ scale }] }}>
      {children}
    </Animated.View>
  );
}

function AerisOrb({ size = 36 }: { size?: number }) {
  const pulse = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1.08, duration: 2800, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0.94, duration: 2800, useNativeDriver: true }),
      ])
    ).start();
  }, []);

  return (
    <Animated.View
      style={{
        width: size,
        height: size,
        transform: [{ scale: pulse }],
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <View
        style={{
          width: size,
          height: size,
          borderRadius: size / 2,
          borderWidth: 1,
          borderColor: 'rgba(180, 160, 255, 0.35)',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <View
          style={{
            width: size * 0.38,
            height: size * 0.38,
            borderRadius: (size * 0.38) / 2,
            backgroundColor: 'rgba(180, 160, 255, 0.55)',
          }}
        />
      </View>
      {/* Orbit ring */}
      <View
        style={{
          position: 'absolute',
          width: size * 0.72,
          height: size * 0.28,
          borderRadius: size * 0.14,
          borderWidth: 0.8,
          borderColor: 'rgba(180, 160, 255, 0.22)',
          transform: [{ rotateX: '70deg' }],
        }}
      />
    </Animated.View>
  );
}

function LoadingDots() {
  const dot1 = useRef(new Animated.Value(0.2)).current;
  const dot2 = useRef(new Animated.Value(0.2)).current;
  const dot3 = useRef(new Animated.Value(0.2)).current;

  useEffect(() => {
    const anim = Animated.loop(
      Animated.stagger(180, [
        Animated.sequence([
          Animated.timing(dot1, { toValue: 0.9, duration: 380, useNativeDriver: true }),
          Animated.timing(dot1, { toValue: 0.2, duration: 380, useNativeDriver: true }),
        ]),
        Animated.sequence([
          Animated.timing(dot2, { toValue: 0.9, duration: 380, useNativeDriver: true }),
          Animated.timing(dot2, { toValue: 0.2, duration: 380, useNativeDriver: true }),
        ]),
        Animated.sequence([
          Animated.timing(dot3, { toValue: 0.9, duration: 380, useNativeDriver: true }),
          Animated.timing(dot3, { toValue: 0.2, duration: 380, useNativeDriver: true }),
        ]),
      ])
    );
    anim.start();
    return () => anim.stop();
  }, []);

  return (
    <View style={{ flexDirection: 'row', gap: 5, paddingVertical: 6 }}>
      {[dot1, dot2, dot3].map((d, i) => (
        <Animated.View
          key={i}
          style={{
            width: 4,
            height: 4,
            borderRadius: 2,
            backgroundColor: '#B5A9FF',
            opacity: d,
          }}
        />
      ))}
    </View>
  );
}

// ── Screen ────────────────────────────────────────────────────────────────────

export default function AerisScreen({ route }: { route: any }) {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const posthog = usePostHog();
  const dreamContext: string | undefined = route?.params?.dreamContext;

  // API + storage state
  const [messages, setMessages] = useState<Message[]>([INITIAL_MESSAGE]);
  // Rendering state — mirrors messages but with segment/animation data
  const [displayMessages, setDisplayMessages] = useState<DisplayMessage[]>(() => [
    toDisplayMessage(INITIAL_MESSAGE, false),
  ]);

  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [userName, setUserName] = useState<string | null>(null);

  const listRef = useRef<FlatList>(null);
  const inputRef = useRef<TextInput>(null);
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const headerFade = useRef(new Animated.Value(0)).current;
  const returnOpacity = useRef(new Animated.Value(0)).current;
  const historyLoaded = useRef(false);
  const segmentTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const navigationRef = useRef(navigation);
  useEffect(() => { navigationRef.current = navigation; }, [navigation]);

  const goBack = useCallback(() => {
    try {
      (globalThis as any).__fog?.show?.();
      (globalThis as any).__fog?.boost?.(0.08, 1200);
      setTimeout(() => (globalThis as any).__fog?.hide?.(), 1200);
    } catch {}
    navigationRef.current.goBack();
  }, []);

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, { dx, dy }) =>
        // Claim rightward swipes; also downward swipes when clearly vertical
        (dx > 8 && dx > Math.abs(dy) * 0.5) || (dy > 12 && dy > Math.abs(dx) * 1.5),
      onPanResponderRelease: (_, { dx, dy }) => {
        if (dx > 90 || dy > 90) goBack();
      },
    })
  ).current;

  // Fade-in on mount + load profile name + delayed keyboard focus
  useEffect(() => {
    Animated.stagger(180, [
      Animated.timing(headerFade, { toValue: 1, duration: 1000, useNativeDriver: true }),
      Animated.timing(fadeAnim, { toValue: 1, duration: 900, useNativeDriver: true }),
    ]).start();

    // RETURN label: appear at 100%, delay 1200ms, pulse 100→85→100 over 1400ms, settle at 45%
    Animated.sequence([
      Animated.timing(returnOpacity, { toValue: 1.0, duration: 400, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      Animated.delay(1200),
      Animated.timing(returnOpacity, { toValue: 0.85, duration: 700, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      Animated.timing(returnOpacity, { toValue: 1.0, duration: 700, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      Animated.timing(returnOpacity, { toValue: 0.45, duration: 1000, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
    ]).start();

    AsyncStorage.getItem('profileName')
      .then((v) => { if (v) setUserName(v); })
      .catch(() => {});

    const focusTimer = setTimeout(() => { inputRef.current?.focus(); }, 120);
    return () => clearTimeout(focusTimer);
  }, []);

  // Write aerisJustClosed flag and clean up timers on unmount
  useEffect(() => {
    return () => {
      segmentTimersRef.current.forEach(clearTimeout);
      segmentTimersRef.current = [];
      AsyncStorage.setItem('aerisJustClosed', 'true').catch(() => {});
    };
  }, []);

  // Analytics: screen open
  useEffect(() => {
    posthog.capture('aeris_opened', { source: dreamContext ? 'journal' : 'sigil' });
  }, []);

  // Analytics stub: journal entry analyzed — no UI trigger yet, ready for journal integration
  const captureJournalEntryAnalyzed = useCallback((entryId: string) => {
    posthog.capture('aeris_journal_entry_analyzed', { entry_id: entryId });
  }, [posthog]);

  // Load or reset daily conversation history, then auto-send dream context if present
  useEffect(() => {
    const today = new Date().toISOString().split('T')[0];
    (async () => {
      let currentMessages: Message[] = [INITIAL_MESSAGE];
      try {
        const [storedHistory, storedDate] = await Promise.all([
          AsyncStorage.getItem('aerisHistory'),
          AsyncStorage.getItem('aerisHistoryDate'),
        ]);
        if (storedDate === today && storedHistory) {
          const parsed = JSON.parse(storedHistory) as Message[];
          if (parsed.length > 0) {
            currentMessages = parsed;
            setMessages(parsed);
            // Rehydrated messages show fully without per-segment animation
            setDisplayMessages(parsed.map((m) => toDisplayMessage(m, false)));
          }
        } else {
          await Promise.all([
            AsyncStorage.removeItem('aerisHistory'),
            AsyncStorage.setItem('aerisHistoryDate', today),
          ]);
        }
      } catch {
        // proceed with initial message on any storage error
      } finally {
        historyLoaded.current = true;
      }

      // Auto-send dream context injected from JournalEntryScreen
      if (!dreamContext) return;

      const storedName = await AsyncStorage.getItem('profileName').catch(() => null);
      const namePrefix = storedName
        ? `[The person I am speaking with is named ${storedName}.]\n\n`
        : '';

      const dreamUserMsg: Message = {
        id: Date.now().toString(),
        role: 'user',
        content: dreamContext,
      };

      const nextHistory = [...currentMessages, dreamUserMsg];
      setMessages(nextHistory);
      setDisplayMessages((prev) => [...prev, toDisplayMessage(dreamUserMsg, true)]);
      setLoading(true);

      try {
        const apiMessages = nextHistory.map((m, i) => {
          const isFirstUser =
            m.role === 'user' && !nextHistory.slice(0, i).some((x) => x.role === 'user');
          return {
            role: m.role,
            content: isFirstUser ? namePrefix + m.content : m.content,
          };
        });

        const res = await fetch(AERIS_API, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ messages: apiMessages }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();

        const aerisId = (Date.now() + 1).toString();
        const aerisMsg: Message = { id: aerisId, role: 'assistant', content: data.content };
        const segments = parseSegments(data.content);

        setMessages((prev) => [...prev, aerisMsg]);
        setDisplayMessages((prev) => [
          ...prev,
          { ...aerisMsg, segments, visibleSegments: 1, animated: true },
        ]);

        segments.slice(1).forEach((_, i) => {
          const timer = setTimeout(() => {
            setDisplayMessages((prev) =>
              prev.map((m) => (m.id === aerisId ? { ...m, visibleSegments: i + 2 } : m))
            );
          }, (i + 1) * 600);
          segmentTimersRef.current.push(timer);
        });
      } catch {
        const errId = (Date.now() + 1).toString();
        const errMsg: Message = {
          id: errId,
          role: 'assistant',
          content: 'Something shifted in the signal. Try again in a moment.',
        };
        setMessages((prev) => [...prev, errMsg]);
        setDisplayMessages((prev) => [...prev, toDisplayMessage(errMsg, true)]);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // Persist full message history after every update, once initial load is done
  useEffect(() => {
    if (!historyLoaded.current) return;
    AsyncStorage.setItem('aerisHistory', JSON.stringify(messages)).catch(() => {});
  }, [messages]);

  const buildApiMessages = useCallback(
    (history: Message[]) => {
      const contextPrefix = userName
        ? `[The person I am speaking with is named ${userName}.]\n\n`
        : '';
      return history.map((m, i) => {
        if (i === 0 && m.role === 'assistant') {
          return { role: m.role, content: m.content };
        }
        const isFirstUser =
          m.role === 'user' && !history.slice(0, i).some((x) => x.role === 'user');
        return {
          role: m.role,
          content: isFirstUser ? contextPrefix + m.content : m.content,
        };
      });
    },
    [userName]
  );

  const scrollToEnd = useCallback(() => {
    listRef.current?.scrollToEnd({ animated: true });
  }, []);

  const handleChamberTap = useCallback(async (name: string, num: number) => {
    try { await Haptics.selectionAsync(); } catch {}

    let isSubscribed = false;
    try {
      const info = await Purchases.getCustomerInfo();
      isSubscribed = !!info?.entitlements?.active?.['continuing_with_inner'];
    } catch {}

    posthog.capture('aeris_chamber_tapped', {
      chamber_name: name,
      chamber_number: num,
      user_subscribed: isSubscribed,
    });

    const trackId = CHAMBER_NUMBER_TO_ID[num];
    if (!trackId) return;

    const navigateToChamber = () => {
      navigation.navigate('JourneyPlayer', { trackId, chamber: name });
    };

    if (PREMIUM_CHAMBERS.has(num) && !isSubscribed) {
      safePresentPaywall(() => navigateToChamber());
    } else {
      navigateToChamber();
    }
  }, [posthog, navigation]);

  const renderItem = useCallback(({ item }: { item: DisplayMessage }) => {
    if (item.role === 'assistant') {
      const segments = item.segments ?? [item.content];
      const visible = segments.slice(0, item.visibleSegments);
      return (
        <View style={styles.aerisRow}>
          <View style={styles.segmentsColumn}>
            {visible.map((seg, i) => {
              const textNode = (
                <View style={i > 0 ? styles.segmentSpacing : undefined}>
                  <Text style={styles.aerisText}>{renderInlineSegment(seg, handleChamberTap)}</Text>
                </View>
              );
              return item.animated ? (
                <FadeInView key={i}>{textNode}</FadeInView>
              ) : (
                <React.Fragment key={i}>{textNode}</React.Fragment>
              );
            })}
          </View>
        </View>
      );
    }

    const userContent = (
      <View style={styles.userRow}>
        <Text style={styles.userText}>{item.content}</Text>
      </View>
    );
    return item.animated ? <FadeInView>{userContent}</FadeInView> : userContent;
  }, [handleChamberTap]);

  const sendMessage = useCallback(async () => {
    const text = input.trim();
    if (!text || loading) return;

    try { await Haptics.selectionAsync(); } catch {}

    const userMsg: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: text,
    };

    posthog.capture('aeris_message_sent', {
      message_length: text.length,
      conversation_turn: messages.length,
    });

    setInput('');
    const nextHistory = [...messages, userMsg];
    setMessages(nextHistory);
    setDisplayMessages((prev) => [...prev, toDisplayMessage(userMsg, true)]);
    setLoading(true);

    try {
      const res = await fetch(AERIS_API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: buildApiMessages(nextHistory) }),
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();

      const aerisId = (Date.now() + 1).toString();
      const aerisMsg: Message = { id: aerisId, role: 'assistant', content: data.content };
      const segments = parseSegments(data.content);

      // Fire aeris_chamber_suggested for each chamber reference in the response
      const chamberRe = new RegExp(CHAMBER_RE.source, 'gi');
      let chamberMatch: RegExpExecArray | null;
      while ((chamberMatch = chamberRe.exec(data.content)) !== null) {
        const chamberName = chamberMatch[0];
        posthog.capture('aeris_chamber_suggested', {
          chamber_name: chamberName,
          chamber_number: chamberNumberFromMatch(chamberName),
        });
      }

      setMessages((prev) => [...prev, aerisMsg]);
      setDisplayMessages((prev) => [
        ...prev,
        { ...aerisMsg, segments, visibleSegments: 1, animated: true },
      ]);

      // Reveal subsequent segments with 600ms stagger
      segments.slice(1).forEach((_, i) => {
        const timer = setTimeout(() => {
          setDisplayMessages((prev) =>
            prev.map((m) =>
              m.id === aerisId ? { ...m, visibleSegments: i + 2 } : m
            )
          );
        }, (i + 1) * 600);
        segmentTimersRef.current.push(timer);
      });
    } catch {
      const errId = (Date.now() + 1).toString();
      const errMsg: Message = {
        id: errId,
        role: 'assistant',
        content: 'Something shifted in the signal. Try again in a moment.',
      };
      setMessages((prev) => [...prev, errMsg]);
      setDisplayMessages((prev) => [...prev, toDisplayMessage(errMsg, true)]);
    } finally {
      setLoading(false);
    }
  }, [input, loading, messages, buildApiMessages]);

  return (
    <View style={styles.root} {...panResponder.panHandlers}>
      {/* RETURN label — positioned absolutely, own opacity sequence */}
      <Animated.View
        style={[styles.returnWrapper, { top: insets.top + 14 }, { opacity: returnOpacity }]}
        pointerEvents="box-none"
      >
        <Pressable onPress={goBack} hitSlop={20}>
          <Text style={styles.returnText}>RETURN</Text>
        </Pressable>
      </Animated.View>

      {/* Header */}
      <Animated.View
        style={[styles.header, { paddingTop: insets.top + 20, opacity: headerFade }]}
      >
        <AerisOrb size={40} />

        <Text style={styles.aerisName}>A E R I S</Text>
        <Text style={styles.aerisRole}>GUIDE · WITNESS · ARCHIVIST</Text>

        <View style={styles.headerDivider} />
      </Animated.View>

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={0}
      >
        <Animated.View style={[styles.flex, { opacity: fadeAnim }]}>
          <FlatList
            ref={listRef}
            data={displayMessages}
            keyExtractor={(m) => m.id}
            contentContainerStyle={[styles.messageList, { paddingBottom: 24 }]}
            onContentSizeChange={scrollToEnd}
            showsVerticalScrollIndicator={false}
            renderItem={renderItem}
            ListFooterComponent={
              loading ? (
                <View style={styles.aerisRow}>
                  <LoadingDots />
                </View>
              ) : null
            }
          />
        </Animated.View>

        {/* Input bar */}
        <View style={[styles.inputBar, { paddingBottom: Math.max(insets.bottom, 16) }]}>
          <View style={styles.inputWrap}>
            <TextInput
              ref={inputRef}
              style={styles.textInput}
              value={input}
              onChangeText={setInput}
              placeholder="Speak freely..."
              placeholderTextColor="rgba(255,255,255,0.22)"
              multiline
              autoFocus
              maxLength={1200}
              returnKeyType="send"
              blurOnSubmit
              onSubmitEditing={sendMessage}
            />
            <Pressable
              onPress={sendMessage}
              disabled={!input.trim() || loading}
              hitSlop={12}
              style={({ pressed }) => [
                styles.sendButton,
                (!input.trim() || loading) && styles.sendButtonDim,
                pressed && { opacity: 0.6 },
              ]}
            >
              <Text style={styles.sendIcon}>↑</Text>
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#0d0d1a',
  },
  flex: {
    flex: 1,
  },

  // ── Header ────────────────────────────────────────────────────────────────
  header: {
    alignItems: 'center',
    paddingBottom: 20,
    paddingHorizontal: 24,
  },
  returnWrapper: {
    position: 'absolute',
    left: 24,
    zIndex: 10,
  },
  returnText: {
    fontFamily: 'CalSans-Regular',
    fontSize: 11,
    letterSpacing: 3.5,
    color: '#ffffff',
  },
  aerisName: {
    fontFamily: 'CalSans-SemiBold',
    fontSize: 13,
    letterSpacing: 6,
    color: 'rgba(255,255,255,0.88)',
    marginTop: 14,
  },
  aerisRole: {
    fontFamily: 'Inter-ExtraLight',
    fontSize: 10,
    letterSpacing: 3,
    color: 'rgba(181,169,255,0.55)',
    marginTop: 6,
  },
  headerDivider: {
    width: 40,
    height: 0.5,
    backgroundColor: 'rgba(255,255,255,0.10)',
    marginTop: 20,
  },

  // ── Messages ──────────────────────────────────────────────────────────────
  messageList: {
    paddingHorizontal: 24,
    paddingTop: 8,
  },
  aerisRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 28,
    gap: 12,
  },
  aerisIndicator: {
    width: 8,
    height: 8,
    marginTop: 7,
    flexShrink: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  aerisIndicatorDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(181,169,255,0.6)',
  },
  segmentsColumn: {
    flex: 1,
  },
  segmentSpacing: {
    marginTop: 18,
  },
  aerisText: {
    fontFamily: 'CalSans-Regular',
    fontSize: 15,
    lineHeight: 28,
    color: 'rgba(237,234,246,0.90)',
    fontStyle: 'italic',
  },
  chamberRef: {
    color: '#7B5EA7',
  },
  userRow: {
    alignSelf: 'flex-end',
    maxWidth: '78%',
    marginBottom: 28,
    backgroundColor: 'rgba(240,238,248,0.07)',
    borderRadius: 14,
    borderWidth: 0.5,
    borderColor: 'rgba(255,255,255,0.09)',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  userText: {
    fontFamily: 'CalSans-Regular',
    fontSize: 15,
    lineHeight: 23,
    color: 'rgba(255,255,255,0.72)',
  },

  // ── Input ─────────────────────────────────────────────────────────────────
  inputBar: {
    paddingHorizontal: 20,
    paddingTop: 12,
    borderTopWidth: 0.5,
    borderTopColor: 'rgba(255,255,255,0.07)',
    backgroundColor: '#0d0d1a',
  },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 18,
    borderWidth: 0.5,
    borderColor: 'rgba(255,255,255,0.10)',
    paddingLeft: 16,
    paddingRight: 6,
    paddingVertical: 8,
    gap: 8,
  },
  textInput: {
    flex: 1,
    fontFamily: 'CalSans-Regular',
    fontSize: 15,
    color: 'rgba(255,255,255,0.85)',
    lineHeight: 22,
    maxHeight: 120,
    paddingTop: 0,
    paddingBottom: 0,
  },
  sendButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(181,169,255,0.20)',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  sendButtonDim: {
    backgroundColor: 'rgba(181,169,255,0.06)',
  },
  sendIcon: {
    fontFamily: 'CalSans-SemiBold',
    fontSize: 16,
    color: 'rgba(181,169,255,0.85)',
    lineHeight: 20,
  },
});
