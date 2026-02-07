// components/SuggestionCard.tsx
import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withRepeat,
  withSequence,
  withDelay,
  Easing,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { useIntention } from '../core/IntentionProvider';
import { learn_tracks } from '../data/learn';
import { useNavigation } from '@react-navigation/native';
import { Typography, Body as _Body } from '../core/typography';
import { useLessonProgressMap } from '../learn/useProgress';
import type { TrackId } from '../learn/progress';

// Safe fallback to avoid hot-reload issues if Body is undefined momentarily
const Body = _Body ?? ({
  regular: { ...Typography.body },
  subtle:  { ...Typography.caption },
} as const);

type Props = {
  /** Optional explicit suggestion object passed from Home */
  suggestion?: any;
  title?: string;
  subtitle?: string;
  onStart?: () => void;
  onDismiss?: () => void; // optional: render a subtle dismiss control when provided
  variant?: 'default' | 'veil';
};

// Minimal, local selector for the card (avoids external deps)
const levelRank = (level?: string) => (
  level === 'intro' ? 0 : level === 'core' ? 1 : level === 'advanced' ? 2 : level === 'mastery' ? 3 : 1
);

type FlatLesson = {
  id: string;
  trackId: 'lucid' | 'obe';
  title: string;
  minutes?: number;
  level?: 'intro' | 'core' | 'advanced' | 'mastery';
  intentions?: string[];
  prerequisites?: string[];
  focus?: 'lucid' | 'obe' | 'guide';
  category?: string;
  vibe?: string;
  kind?: 'lesson';
  completed?: boolean;
};

function flattenLessons(completedIds: Set<string>): FlatLesson[] {
  const out: FlatLesson[] = [];
  (['lucid','obe'] as const).forEach(trackId => {
    const t = (learn_tracks as any)[trackId];
    (t?.lessons ?? []).forEach((l: any) => {
      const lessonKey = `${trackId}:${l.id}`;
      out.push({
        id: l.id,
        trackId,
        title: l.title,
        minutes: l.minutes ?? l.durationMin,
        level: l.level,
        intentions: l.intentions,
        prerequisites: l.prerequisites,
        focus: l.focus,
        category: l.category,
        vibe: l.vibe,
        kind: 'lesson',
        completed: completedIds.has(lessonKey),
      });
    });
  });
  return out;
}

const toTitle = (s?: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : '');

function computeUnlockedTier(lessons: FlatLesson[]): 'intro' | 'core' | 'advanced' | 'mastery' {
  const byLevel = (lvl: FlatLesson['level']) => lessons.filter(l => l.level === lvl);

  const intros = byLevel('intro');
  const cores = byLevel('core');
  const advs = byLevel('advanced');

  const introTotal = intros.length;
  const coreTotal = cores.length;
  const advTotal = advs.length;

  const introDone = intros.filter(l => l.completed).length;
  const coreDone = cores.filter(l => l.completed).length;
  const advDone = advs.filter(l => l.completed).length;

  const allIntroDone = introTotal > 0 && introDone === introTotal;
  const coreRatio = coreTotal > 0 ? coreDone / coreTotal : 0;
  const advRatio = advTotal > 0 ? advDone / advTotal : 0;

  // Default: only intro is unlocked
  let tier: 'intro' | 'core' | 'advanced' | 'mastery' = 'intro';

  if (allIntroDone) {
    tier = 'core';
  }

  // Once ~75% of core is complete, allow advanced to surface
  if (coreRatio >= 0.75) {
    tier = 'advanced';
  }

  // Once ~75% of advanced is complete, allow mastery to surface
  if (advRatio >= 0.75) {
    tier = 'mastery';
  }

  return tier;
}

function pickNextByIntent(intentions: string[], completedIds: Set<string>): FlatLesson | null {
  const lessons = flattenLessons(completedIds);

  // Determine which difficulty tiers are unlocked based on completion.
  const unlocked = computeUnlockedTier(lessons);

  const allowedLevels: FlatLesson['level'][] =
    unlocked === 'intro'
      ? ['intro']
      : unlocked === 'core'
      ? ['intro', 'core']
      : unlocked === 'advanced'
      ? ['intro', 'core', 'advanced']
      : ['intro', 'core', 'advanced', 'mastery'];

  // Only consider lessons in the allowed tiers AND not yet completed
  const pool = lessons.filter(
    l => l.level && allowedLevels.includes(l.level) && !l.completed
  );

  const score = (lsn: FlatLesson) =>
    (lsn.intentions || []).reduce(
      (acc, tag) => acc + (intentions.includes(tag) ? 1 : 0),
      0
    );

  // Prefer uncompleted lessons within the allowed tiers, then fall back
  const ranked = pool
    .map(l => ({
      l,
      w: score(l),
      completed: l.completed,
    }))
    .sort((a, b) => {
      // 1) Prefer higher intention match weight
      if (b.w !== a.w) return b.w - a.w;
      // 2) Prefer uncompleted over completed
      if (!!a.completed !== !!b.completed) return a.completed ? 1 : -1;
      // 3) Within that, use levelRank as secondary sort
      const levelDelta = levelRank(a.l.level) - levelRank(b.l.level);
      if (levelDelta !== 0) return levelDelta;
      // 4) Finally, shorter lessons first as a gentle nudge
      return (a.l.minutes ?? 999) - (b.l.minutes ?? 999);
    })
    .map(x => x.l);

  return ranked[0] || null;
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export default function SuggestionCard({
  suggestion: propSuggestion,
  title: propTitle,
  subtitle: propSubtitle,
  onStart: propOnStart,
  onDismiss,
  variant = 'default',
}: Props) {
  const { intentions } = useIntention();
  const progressMap = useLessonProgressMap();

  const isVeil = variant === 'veil';

  const completedIds = React.useMemo(() => {
    const set = new Set<string>();
    (Object.keys(progressMap) as TrackId[]).forEach(trackId => {
      const lessons = progressMap[trackId];
      if (!lessons) return;
      Object.entries(lessons).forEach(([lessonId, value]) => {
        if (value >= 0.9) {
          set.add(`${trackId}:${lessonId}`);
        }
      });
    });
    return set;
  }, [progressMap]);

  const internal = React.useMemo(
    () => pickNextByIntent(intentions || [], completedIds),
    [intentions, completedIds]
  );

  const suggestion = (propSuggestion as FlatLesson | any) ?? internal;

  const title = suggestion?.title ?? propTitle ?? '✨ Tonight’s Practice';
  const subtitle = undefined; // description removed for a leaner card

  const ctaText = suggestion ? 'Next Step' : 'Move Inward';

  // gentle breathe + glow
  const pulse = useSharedValue(0);
  const subOpacity = useSharedValue(0);
  React.useEffect(() => {
    pulse.value = withRepeat(
      withSequence(
        // Inhale 4s → Exhale 6s to mirror app breath
        withTiming(1, { duration: 4000, easing: Easing.inOut(Easing.quad) }),
        withTiming(0, { duration: 6000, easing: Easing.inOut(Easing.quad) })
      ),
      -1,
      false
    );
    subOpacity.value = withDelay(350, withTiming(1, { duration: 600 }));
  }, [pulse]);

  const cardA = useAnimatedStyle(() => ({
    transform: [{ scale: withTiming(1 + pulse.value * 0.008, { duration: 240 }) }],
    shadowOpacity: 0.22 + pulse.value * 0.1,
  }));

  const edgeGlowA = useAnimatedStyle(() => ({
    opacity: 0.10 + pulse.value * 0.18,
  }));

  const press = useSharedValue(0);
  const ctaA = useAnimatedStyle(() => ({
    transform: [{ scale: withTiming(1 + press.value * 0.02, { duration: 120 }) }],
    opacity: withTiming(1 - press.value * 0.04, { duration: 120 }),
  }));

  const subtitleA = useAnimatedStyle(() => ({ opacity: subOpacity.value }));

  const navigation = useNavigation<any>();

  const handleStart = () => {
    if (suggestion) {
      // Prefer explicit screen/params if provided by pickNextLessons()
      // (e.g., { screen: 'LessonReader', params: { trackId, lessonId } })
      const maybeScreen = (suggestion as any).screen;
      const maybeParams = (suggestion as any).params;
      if (maybeScreen && maybeParams) {
        navigation.navigate(maybeScreen as never, maybeParams as never);
        return;
      }
      // Otherwise, try to navigate to LessonReader using trackId/id from suggestion
      const trackId = (suggestion as any).trackId;
      const lessonId = (suggestion as any).id;
      if (trackId && lessonId) {
        navigation.navigate('LessonReader' as never, { trackId, lessonId } as never);
        return;
      }
    }
    // Fallbacks
    if (propOnStart) {
      propOnStart();
      return;
    }
    // Last resort: take them to the Learning Hub
    navigation.navigate('LearnHub' as never);
  };

  return (
    <Animated.View style={[styles.wrap, !isVeil && cardA, isVeil && styles.veilWrap]}>
      {isVeil ? (
        // In veil mode, HomeScreen provides the surface. We render only content.
        <>
          <View style={[styles.headerRow, styles.veilHeaderRow]}>
            <Text style={[Typography.caption, { color: 'rgba(191,199,255,0.88)', letterSpacing: 0.2 }]}>
              ✨ Tonight’s Practice
            </Text>
          </View>

          <View style={[styles.body, styles.veilBody]}>
            <Text
              numberOfLines={2}
              style={[Typography.title, { color: '#ffffff', textAlign: 'center' }]}
            >
              {title}
            </Text>

            {suggestion && (
              <Text
                style={[
                  Body.subtle,
                  {
                    fontFamily: 'Inter-ExtraLight',
                    fontSize: 12,
                    color: 'rgba(207,213,255,0.78)',
                    marginTop: 8,
                    marginBottom: 2,
                    textAlign: 'center',
                    letterSpacing: 0.2,
                  },
                ]}
                numberOfLines={1}
              >
                {[
                  suggestion?.kind ? toTitle(suggestion.kind) : 'Lesson',
                  suggestion?.focus ? toTitle(suggestion.focus) : undefined,
                  suggestion?.level ? toTitle(suggestion.level) : undefined,
                  suggestion?.category ? toTitle(String(suggestion.category)) : undefined,
                  suggestion?.minutes ? `${suggestion.minutes} min` : undefined,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </Text>
            )}

            <AnimatedPressable
              accessibilityRole="button"
              accessibilityLabel={`Start ${title}`}
              onPressIn={() => (press.value = 1)}
              onPressOut={() => (press.value = 0)}
              onPress={handleStart}
              style={styles.cta}
            >
              <Animated.View style={[styles.ctaInner, ctaA]}>
                <View style={{ ...StyleSheet.absoluteFillObject, backgroundColor: '#CFC3E0' }} />
                <Text style={[Typography.caption, { color: '#0f1130', letterSpacing: 0.3 }]}>
                  {ctaText}
                </Text>
              </Animated.View>
            </AnimatedPressable>

            {onDismiss && (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Dismiss tonight’s practice"
                onPress={onDismiss}
                hitSlop={8}
                style={{ marginTop: 12 }}
              >
                <Text
                  style={[
                    Body.subtle,
                    {
                      fontFamily: 'Inter-ExtraLight',
                      fontSize: 12,
                      color: 'rgba(207,195,224,0.85)',
                    },
                  ]}
                >
                  Later
                </Text>
              </Pressable>
            )}
          </View>
        </>
      ) : (
        // Default mode keeps the original glassy card surface
        <>
          {/* Glassy surface */}
          <BlurView intensity={36} tint="dark" style={styles.blur}>
            {/* Breathing edge glow */}
            <Animated.View pointerEvents="none" style={[styles.edgeGlow, edgeGlowA]}>
              <LinearGradient
                colors={[
                  'rgba(255,214,165,0.18)',
                  'rgba(203,179,240,0.10)',
                  'rgba(255,214,165,0.18)',
                ]}
                start={{ x: 0, y: 0.5 }}
                end={{ x: 1, y: 0.5 }}
                style={StyleSheet.absoluteFill}
              />
            </Animated.View>

            <LinearGradient
              colors={['rgba(255,255,255,0.06)', 'rgba(255,255,255,0.01)']}
              start={{ x: 0.5, y: 0 }}
              end={{ x: 0.5, y: 1 }}
              style={StyleSheet.absoluteFill}
            />

            {/* Header */}
            <View style={styles.headerRow}>
              <Text style={[Typography.caption, { color: '#bfc7ff', letterSpacing: 0.2 }]}>
                ✨ Tonight’s Practice
              </Text>
              <LinearGradient
                colors={['rgba(203,179,240,0.35)', 'rgba(107,111,255,0.30)', 'rgba(203,179,240,0)']}
                start={{ x: 0, y: 0.5 }}
                end={{ x: 1, y: 0.5 }}
                style={styles.headerGlow}
              />
            </View>

            {/* Body */}
            <View style={styles.body}>
              <Text numberOfLines={2} style={[Typography.title, { color: '#ffffff', textAlign: 'center' }]}>
                {title}
              </Text>
              {/* Meta row: kind · focus · level · category · minutes */}
              {suggestion && (
                <Text
                  style={[
                    Body.subtle,
                    {
                      fontFamily: 'Inter-ExtraLight',
                      fontSize: 12,
                      color: 'rgba(207,213,255,0.8)',
                      marginTop: 8,
                      marginBottom: 2,
                      textAlign: 'center',
                      letterSpacing: 0.2,
                    },
                  ]}
                  numberOfLines={1}
                >
                  {[
                    suggestion?.kind ? toTitle(suggestion.kind) : 'Lesson',
                    suggestion?.focus ? toTitle(suggestion.focus) : undefined,
                    suggestion?.level ? toTitle(suggestion.level) : undefined,
                    suggestion?.category ? toTitle(String(suggestion.category)) : undefined,
                    suggestion?.minutes ? `${suggestion.minutes} min` : undefined,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </Text>
              )}

              <AnimatedPressable
                accessibilityRole="button"
                accessibilityLabel={`Start ${title}`}
                onPressIn={() => (press.value = 1)}
                onPressOut={() => (press.value = 0)}
                onPress={handleStart}
                style={styles.cta}
              >
                <Animated.View style={[styles.ctaInner, ctaA]}>
                  <View style={{ ...StyleSheet.absoluteFillObject, backgroundColor: '#CFC3E0' }} />
                  <Text style={[Typography.caption, { color: '#0f1130', letterSpacing: 0.3 }]}>
                    {ctaText}
                  </Text>
                </Animated.View>
              </AnimatedPressable>
              {onDismiss && (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Dismiss tonight’s practice"
                  onPress={onDismiss}
                  hitSlop={8}
                  style={{ marginTop: 12 }}
                >
                  <Text
                    style={[
                      Body.subtle,
                      {
                        fontFamily: 'Inter-ExtraLight',
                        fontSize: 12,
                        color: 'rgba(207,195,224,0.85)',
                      },
                    ]}
                  >
                    Later
                  </Text>
                </Pressable>
              )}
            </View>

            {/* Bottom fade mask */}
            <LinearGradient
              pointerEvents="none"
              colors={['rgba(15,17,48,0)', 'rgba(15,17,48,0.22)']}
              start={{ x: 0.5, y: 0 }}
              end={{ x: 0.5, y: 1 }}
              style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 40 }}
            />
          </BlurView>

          {/* Outer aura */}
          <LinearGradient
            pointerEvents="none"
            colors={['rgba(203,179,240,0.26)', 'rgba(203,179,240,0.08)', 'rgba(203,179,240,0)']}
            start={{ x: 0.5, y: 0 }}
            end={{ x: 0.5, y: 1 }}
            style={styles.aura}
          />
        </>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginTop: 8,
    marginHorizontal: 16,
    borderRadius: 20,
    overflow: 'visible',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 18 },
    shadowRadius: 28,
  },
  veilWrap: {
    marginTop: 0,
    marginHorizontal: 0,
    borderRadius: 0,
    shadowOpacity: 0,
  },
  veilHeaderRow: {
    paddingTop: 0,
    paddingHorizontal: 0,
    paddingBottom: 4,
  },
  veilBody: {
    paddingHorizontal: 0,
    paddingBottom: 0,
  },
  blur: {
    borderRadius: 20,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  edgeGlow: {
    position: 'absolute',
    top: 1,
    left: 1,
    right: 1,
    bottom: 1,
    borderRadius: 20,
    overflow: 'hidden',
  },
  headerRow: {
    paddingTop: 14,
    paddingHorizontal: 16,
    paddingBottom: 4,
  },
  headerGlow: {
    position: 'absolute',
    right: 16,
    left: 16,
    top: 10,
    height: 2,
    opacity: 0.6,
    borderRadius: 2,
  },
  body: {
    paddingHorizontal: 16,
    paddingBottom: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cta: {
    alignSelf: 'center',
    marginTop: 10,
    borderRadius: 999,
    overflow: 'hidden',
  },
  ctaInner: {
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  aura: {
    position: 'absolute',
    left: -2,
    right: -2,
    bottom: -2,
    height: 14,
    borderBottomLeftRadius: 22,
    borderBottomRightRadius: 22,
  },
});