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

type Props = {
  /** Optional explicit suggestion object passed from Home */
  suggestion?: any;
  title?: string;
  subtitle?: string;
  onStart?: () => void;
  onDismiss?: () => void; // optional: render a subtle dismiss control when provided
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
};

function flattenLessons(): FlatLesson[] {
  const out: FlatLesson[] = [];
  (['lucid','obe'] as const).forEach(trackId => {
    const t = (learn_tracks as any)[trackId];
    (t?.lessons ?? []).forEach((l: any) => {
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
      });
    });
  });
  return out;
}

const toTitle = (s?: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : '');

function pickNextByIntent(intentions: string[]): FlatLesson | null {
  const lessons = flattenLessons();
  const score = (lsn: FlatLesson) => (lsn.intentions || []).reduce((acc, tag) => acc + (intentions.includes(tag) ? 1 : 0), 0);
  const ranked = lessons
    .map(l => ({ l, w: score(l) }))
    .sort((a,b) => (b.w - a.w) || (levelRank(a.l.level) - levelRank(b.l.level)) || ((a.l.minutes ?? 999) - (b.l.minutes ?? 999)))
    .map(x => x.l);
  return ranked[0] || null;
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export default function SuggestionCard({ suggestion: propSuggestion, title: propTitle, subtitle: propSubtitle, onStart: propOnStart, onDismiss }: Props) {
  const { intentions } = useIntention();
  const internal = React.useMemo(() => pickNextByIntent(intentions || []), [intentions]);
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
    <Animated.View style={[styles.wrap, cardA]}>
      {/* Glassy surface */}
      <BlurView intensity={36} tint="dark" style={styles.blur}>
        {/* Breathing edge glow */}
        <Animated.View pointerEvents="none" style={[styles.edgeGlow, edgeGlowA]}>
          <LinearGradient
            colors={[
              'rgba(255,214,165,0.18)',
              'rgba(203,179,240,0.10)',
              'rgba(255,214,165,0.18)'
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
          <Text style={styles.headerText}>✨ Tonight’s Practice</Text>
          <LinearGradient
            colors={['rgba(203,179,240,0.35)', 'rgba(107,111,255,0.30)', 'rgba(203,179,240,0)']}
            start={{ x: 0, y: 0.5 }}
            end={{ x: 1, y: 0.5 }}
            style={styles.headerGlow}
          />
        </View>

        {/* Body */}
        <View style={styles.body}>
          <Text numberOfLines={2} style={styles.title}>{title}</Text>
          {/* Meta row: kind · focus · level · category · minutes */}
          {suggestion && (
            <Text style={styles.meta} numberOfLines={1}>
              {[
                (suggestion?.kind ? toTitle(suggestion.kind) : 'Lesson'),
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
              <Text style={styles.ctaText}>{ctaText}</Text>
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
              <Text style={styles.dismissText}>Later</Text>
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
  headerText: {
    color: '#bfc7ff',
    fontSize: 13,
    letterSpacing: 0.2,
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
  title: {
    color: '#ffffff',
    fontSize: 17,
    fontWeight: '600',
    textAlign: 'center',
    lineHeight: 22,
  },
  meta: {
    color: 'rgba(207,213,255,0.8)',
    fontSize: 12,
    marginTop: 8,
    marginBottom: 2,
    textAlign: 'center',
    letterSpacing: 0.2,
  },
  subtitle: {
    color: '#cfd5ff',
    fontSize: 14,
    marginTop: 6,
    textAlign: 'center',
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
  ctaText: {
    color: '#0f1130',
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  dismissText: {
    color: 'rgba(207,195,224,0.85)',
    fontSize: 13,
    letterSpacing: 0.2,
    textAlign: 'center',
    opacity: 0.9,
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