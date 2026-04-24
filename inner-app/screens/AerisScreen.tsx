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
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import * as Haptics from 'expo-haptics';

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

function renderInlineSegment(text: string): React.ReactNode[] {
  const stripped = stripMarkdown(text);
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  const re = new RegExp(CHAMBER_RE.source, 'gi');
  let match: RegExpExecArray | null;
  let key = 0;
  while ((match = re.exec(stripped)) !== null) {
    if (match.index > lastIndex) parts.push(stripped.slice(lastIndex, match.index));
    const name = match[0];
    parts.push(
      <Text
        key={key++}
        style={styles.chamberRef}
        onPress={() => console.log('[Aeris] Chamber tapped:', name)}
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

export default function AerisScreen() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();

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
  const historyLoaded = useRef(false);
  const segmentTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  // Fade-in on mount + load profile name + delayed keyboard focus
  useEffect(() => {
    Animated.stagger(180, [
      Animated.timing(headerFade, { toValue: 1, duration: 1000, useNativeDriver: true }),
      Animated.timing(fadeAnim, { toValue: 1, duration: 900, useNativeDriver: true }),
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

  // Load or reset daily conversation history
  useEffect(() => {
    const today = new Date().toISOString().split('T')[0];
    (async () => {
      try {
        const [storedHistory, storedDate] = await Promise.all([
          AsyncStorage.getItem('aerisHistory'),
          AsyncStorage.getItem('aerisHistoryDate'),
        ]);
        if (storedDate === today && storedHistory) {
          const parsed = JSON.parse(storedHistory) as Message[];
          if (parsed.length > 0) {
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
                  <Text style={styles.aerisText}>{renderInlineSegment(seg)}</Text>
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
  }, []);

  const sendMessage = useCallback(async () => {
    const text = input.trim();
    if (!text || loading) return;

    try { await Haptics.selectionAsync(); } catch {}

    const userMsg: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: text,
    };

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
    <View style={styles.root}>
      {/* Header */}
      <Animated.View
        style={[styles.header, { paddingTop: insets.top + 20, opacity: headerFade }]}
      >
        <Pressable
          onPress={() => navigation.goBack()}
          hitSlop={20}
          style={styles.closeButton}
        >
          <Text style={styles.closeText}>↓</Text>
        </Pressable>

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
  closeButton: {
    position: 'absolute',
    left: 24,
    paddingTop: 52,
  },
  closeText: {
    fontFamily: 'CalSans-Regular',
    fontSize: 20,
    color: 'rgba(255,255,255,0.35)',
    lineHeight: 24,
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
