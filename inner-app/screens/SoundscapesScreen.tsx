import React, { useEffect, useMemo, useState, useRef } from 'react';
import { usePostHog } from 'posthog-react-native';
import { StyleSheet, View, Text, Pressable, ScrollView, Animated, Easing, TextInput, Alert, Platform, Modal } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import SoundscapeCardList from '../components/SoundscapeCardList';
import { Image } from 'react-native';
import { Gesture, GestureDetector, Directions, GestureHandlerRootView } from 'react-native-gesture-handler';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { useVideoPlayer, VideoView } from 'expo-video';
import * as Haptics from 'expo-haptics';
import { TRACKS, Track } from '../data/tracks';
import { setLastSession } from '../core/session';
import { useOfflineAsset } from '../core/useOfflineAsset';
import { Typography, Body as _Body } from '../core/typography';
import { usePrecacheTracks } from '../hooks/usePrecacheTracks';
import { useScale } from '../utils/scale';
import Purchases from 'react-native-purchases';
import { isLockedTrack } from '../src/core/subscriptions/accessPolicy';
import { safePresentPaywall } from '../src/core/subscriptions/safePresentPaywall';
const Body = _Body ?? ({
  regular: { ...Typography.body },
  subtle:  { ...Typography.caption },
} as const);

// RevenueCat entitlement used to gate “deeper” content
const CONTINUING_ENTITLEMENT_ID = 'continuing_with_inner';

// --- Soundscapes Info ---
const SOUNDSCAPES_INFO = {
  // Step 1
  whatTitle: 'What you\'re listening to',
  whatBody: `The library is organized by state.

Stillness — quiet meditation, breath, and nervous-system settling. Designed to soften the mind without pulling attention, helping the body return to presence.

Clarity — soundscapes for focus, awareness, and creative flow. For work, study, writing, or mindful attention without becoming a distraction.

Renewal — a restorative space for release, emotional softening, and gentle return. These tracks help clear residue from the day and invite the system back into balance.

Deeper — for threshold states, descent, lucid dreaming, and deeper inner work. Slower, heavier environments for those ready to move beyond surface calm.

Tones — minimal frequency-based audio for intentional listening. Solfeggio, binaural, and high-frequency experiences gathered into a simple space for tuning and resonance.

Noise — simple noise fields for sleep, focus, and nervous-system steadiness. Neutral texture without emotional direction.


Binaural Beats

Every track carries binaural beats — two slightly different frequencies played separately in each ear. The brain perceives a third tone equal to their difference, and that tone gently guides brainwave activity toward specific states: theta for dreaming and deep relaxation, delta for slow-wave sleep, alpha for calm focus.

Headphones are required. Without them, the two tones play together and the effect is lost.


Looping

Every track is built to loop without seam or interruption. No hard edges. No noticeable return points. Play for as long as the session requires.`,

  // Step 2
  deeperTitle: 'Going deeper',
  deeperBody: `Solfeggio Frequencies

Every track is also tuned to specific solfeggio frequencies — ancient tonal frequencies believed to carry distinct qualities.

396 Hz releases fear and guilt. 528 Hz, sometimes called the love frequency, is associated with transformation and repair. 639 Hz carries connection and relationship. 741 Hz awakens intuition. 852 Hz returns the listener toward spiritual order.

These are not binaural beats — they are woven into the tuning of the instruments and tones themselves.


Noise

Noise textures serve as environmental anchors.

White noise masks distraction evenly across all frequencies — useful in busy or unpredictable spaces. Brown noise is deeper and more grounding, often preferred for sleep and extended rest. Pink noise sits between the two: gentle, natural-sounding, closer to rain or wind.

The right choice depends on where you are and what you're moving toward.


Searching by Frequency

You can search for tracks by frequency number. Type 528, 396, or 741 into the search bar and every track tuned to that frequency will appear. A precise way to choose with intention.


Track Descriptions

Long-press any track to read its full description — the specific qualities, frequencies, and intended states for that sound.`,

  closeLabel: 'Not Now',
  okLabel: 'OK',
  nextLabel: 'Next',
  backLabel: 'Back',
} as const;

// Assets
const LOCK_ICON = require('../assets/images/locked_gate.png');

// Lock pulse (slow “breath”)
const LOCK_PULSE_MS = 2800;

function SoundscapeRow({
  item,
  navigation,
  isLocked,
  onLockedPress,
  onStart,
  onLongPress,
}: {
  item: any;
  navigation: any;
  isLocked?: boolean;
  onLockedPress?: (item: any) => void;
  onStart?: (item: any) => void;
  onLongPress?: (item: any) => void;
}) {
  const { scale, verticalScale, matchesCompactLayout } = useScale();
  const trackCardMinHeight = matchesCompactLayout ? verticalScale(76) : verticalScale(92);
  const { isCached, isWorking, progress, download, remove, canDownload } = useOfflineAsset(item?.id, 'soundscape');

  // Slow “breath” pulse for the lock
  const lockPulse = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!isLocked) return;
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(lockPulse, {
          toValue: 1,
          duration: LOCK_PULSE_MS,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(lockPulse, {
          toValue: 0,
          duration: LOCK_PULSE_MS,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ])
    );
    anim.start();
    return () => anim.stop();
  }, [isLocked, lockPulse]);

  const pulseScale = lockPulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.06] });
  const pulseOpacity = lockPulse.interpolate({ inputRange: [0, 1], outputRange: [0.78, 0.95] });

  const allowOffline = canDownload && !isLocked;

  return (
    <View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={isLocked ? `${item.title} is locked` : `Play ${item.title}`}
        accessibilityHint={
          isLocked
            ? 'Requires Continuing with Inner'
            : `Plays ${item.title}`
        }
        style={({ pressed }) => [
          styles.trackRow,
          {
            minHeight: trackCardMinHeight,
            padding: matchesCompactLayout ? scale(10) : scale(12),
            opacity: pressed ? 0.96 : 1,
            transform: [{ scale: pressed ? 0.994 : 1 }],
            borderColor: pressed ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.08)',
          },
        ]}
        onPress={async () => {
          Haptics.selectionAsync();

          if (isLocked) {
            onLockedPress?.(item);
            return;
          }

          onStart?.(item);

          try {
            await setLastSession({ type: 'soundscape', id: item.id });
          } catch {}
          navigation.navigate('JourneyPlayer', { trackId: item.id });
        }}
        onLongPress={() => {
          Haptics.selectionAsync().catch(() => {});
          onLongPress?.(item);
        }}
        delayLongPress={360}
      >
        {allowOffline ? (
          <Pressable
            disabled={isWorking}
            onPress={(e) => {
              // prevent opening the row when tapping offline
              // @ts-ignore
              e?.stopPropagation?.();
              if (isCached) remove();
              else download();
              Haptics.selectionAsync().catch(() => {});
            }}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel={isCached ? `Remove offline cache for ${item.title}` : `Download ${item.title} for offline use`}
            accessibilityHint={isCached ? 'Removes the offline file for this soundscape' : 'Downloads this soundscape for offline use'}
            accessibilityState={{ disabled: isWorking }}
            style={({ pressed }) => ({
              position: 'absolute',
              right: scale(10),
              top: verticalScale(10),
              paddingVertical: verticalScale(6),
              paddingHorizontal: scale(10),
              borderRadius: scale(12),
              borderWidth: 1,
              borderColor: pressed ? 'rgba(255,255,255,0.10)' : 'rgba(255,255,255,0.06)',
              backgroundColor: isCached ? 'rgba(207,195,224,0.14)' : 'rgba(207,195,224,0.10)',
              opacity: isWorking ? 0.74 : pressed ? 0.95 : 0.92,
            })}
          >
            <Text
              style={{
                fontFamily: 'Inter-ExtraLight',
                fontSize: scale(10),
                letterSpacing: scale(0.65),
                textTransform: 'uppercase',
                color: 'rgba(245,242,255,0.92)',
                textShadowColor: 'rgba(0,0,0,0.35)',
                textShadowOffset: { width: 0, height: verticalScale(1) },
                textShadowRadius: scale(3),
              }}
            >
              {isWorking ? `Caching… ${Math.round(progress * 100)}%` : isCached ? 'Offline' : 'Save'}
            </Text>
          </Pressable>
        ) : null}

        {/* inner vignette (edges darker → center clearer) */}
        <LinearGradient
          pointerEvents="none"
          colors={['rgba(0,0,0,0.22)', 'rgba(0,0,0,0.00)', 'rgba(0,0,0,0.22)']}
          locations={[0, 0.5, 1]}
          start={{ x: 0, y: 0.5 }}
          end={{ x: 1, y: 0.5 }}
          style={StyleSheet.absoluteFill}
        />

        {/* bottom lift for text */}
        <LinearGradient
          pointerEvents="none"
          colors={['rgba(0,0,0,0.00)', 'rgba(0,0,0,0.28)']}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
          style={StyleSheet.absoluteFill}
        />

        <Text
          style={[
            Typography.title,
            { color: '#EDE8FA' },
            matchesCompactLayout && {
              fontSize: scale(16),
              lineHeight: Math.round(scale(23)),
            },
          ]}
        >
          {item.title}
        </Text>
        {'description' in item && !!item.description && (
          <Text
            style={[
              Body.regular,
              {
                fontFamily: 'Inter-ExtraLight',
                color: 'rgba(237,232,250,0.85)',
                marginTop: verticalScale(4),
                lineHeight: verticalScale(20),
                letterSpacing: scale(0.2),
              },
              matchesCompactLayout && {
                fontSize: scale(13),
                lineHeight: Math.round(scale(18)),
              },
            ]}
            numberOfLines={2}
          >
            {(item as any).description}
          </Text>
        )}

        {/* Lock overlay */}
        {isLocked ? (
          <View
            pointerEvents="none"
            style={{
              ...StyleSheet.absoluteFillObject,
              justifyContent: 'center',
              alignItems: 'center',
            }}
          >
            <View
              style={{
                ...StyleSheet.absoluteFillObject,
                backgroundColor: 'rgba(0,0,0,0.22)',
              }}
            />
            <Animated.View
              style={{
                width: scale(46),
                height: scale(46),
                borderRadius: scale(23),
                justifyContent: 'center',
                alignItems: 'center',
                backgroundColor: 'rgba(0,0,0,0.28)',
                borderWidth: 1,
                borderColor: 'rgba(255,255,255,0.10)',
                transform: [{ scale: pulseScale }],
                opacity: pulseOpacity,
              }}
            >
              <Image
                source={LOCK_ICON}
                style={{ width: scale(22), height: scale(22), opacity: 0.92 }}
                resizeMode="contain"
              />
            </Animated.View>
          </View>
        ) : null}
      </Pressable>
    </View>
  );
}

export default function SoundscapesScreen() {
  const insets = useSafeAreaInsets();
  const { scale, verticalScale, height: windowHeight, width: SCREEN_W, matchesCompactLayout } = useScale();
  const navigation = useNavigation();
  const posthog = usePostHog();
  const categoryCardHeight = matchesCompactLayout ? verticalScale(82) : verticalScale(96);
  const categoryCardGap = matchesCompactLayout ? verticalScale(12) : verticalScale(18);
  const VISIBLE_COUNT = 3;
  const listHeight = categoryCardHeight * VISIBLE_COUNT + categoryCardGap * (VISIBLE_COUNT - 1);

  const bgPlayer = useVideoPlayer(require('../assets/images/soundscapes_screen.mp4'), player => {
    player.loop = true;
    player.muted = true;
    try {
      player.play();
    } catch (e) {
      console.log('[SoundscapesScreen] background video play failed', e);
    }
  });

  useFocusEffect(React.useCallback(() => {
    try {
      bgPlayer.play();
    } catch (e) {
      console.log('[SoundscapesScreen] background video play failed on focus', e);
    }

    return () => {
      try {
        bgPlayer.pause();
      } catch (e) {
        console.log('[SoundscapesScreen] background video pause ignored', e);
      }
    };
  }, [bgPlayer]));

  // Background should always fill the screen (prevents iPad letterboxing)

  const [hasContinuing, setHasContinuing] = useState(false);

  useEffect(() => {
    let unsub: any;

    const sync = async () => {
      try {
        const info = await Purchases.getCustomerInfo();
        const active = (info?.entitlements?.active ?? {}) as Record<string, any>;
        setHasContinuing(!!active[CONTINUING_ENTITLEMENT_ID]);
      } catch {
        // If RC isn't ready yet, just treat as not entitled
        setHasContinuing(false);
      }
    };

    sync();

    // Keep in sync after purchases / restores
    // @ts-ignore
    unsub = Purchases.addCustomerInfoUpdateListener?.((info: any) => {
      const active = (info?.entitlements?.active ?? {}) as Record<string, any>;
      setHasContinuing(!!active[CONTINUING_ENTITLEMENT_ID]);
    });

    return () => {
      try {
        // @ts-ignore
        if (typeof unsub === 'function') unsub();
      } catch {}
    };
  }, []);

  const openPaywall = React.useCallback(async () => {
    try {
      await Haptics.selectionAsync();
    } catch {}

    try {
      await safePresentPaywall();
      return;
    } catch (e) {
      console.log('[PAYWALL] Failed to present paywall', e);
    }

    Alert.alert(
      'Continuing with Inner',
      'Membership is not available to display right now. Please try again in a moment.',
      [{ text: 'OK' }]
    );
  }, []);

  const handleLockedPress = React.useCallback(
    (_item: any) => {
      // For locked items/categories: go straight to the paywall
      openPaywall();
    },
    [openPaywall]
  );

  const handleSoundscapeStart = React.useCallback(
    (item: any) => {
      posthog.capture('soundscape_started', {
        soundscape_id: item.id,
        soundscape_title: item.title ?? item.id,
        category: item.category ?? 'unknown',
        is_premium: !!item.isPremium || item.category === 'deeper',
        has_subscription: hasContinuing,
      });
    },
    [posthog, hasContinuing]
  );

  // Persistent gesture hint (left-swipe on title)
  const [showHint, setShowHint] = React.useState(false);
  const hintOpacity = React.useRef(new Animated.Value(0)).current;
  const hintShift = React.useRef(new Animated.Value(0)).current; // negative = left
  const [titleAnchorTop, setTitleAnchorTop] = React.useState<number | null>(null);

  React.useEffect(() => {
    let mounted = true;
    let interval: any;

    setShowHint(true);

    const runPulse = () => {
      Animated.sequence([
        Animated.timing(hintOpacity, { toValue: 1, duration: 280, easing: Easing.out(Easing.quad), useNativeDriver: true }),
        Animated.loop(
          Animated.sequence([
            Animated.timing(hintShift, { toValue: -8, duration: 400, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
            Animated.timing(hintShift, { toValue: 0, duration: 400, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
          ]),
          { iterations: 3 }
        ),
        Animated.timing(hintOpacity, { toValue: 0, duration: 340, easing: Easing.in(Easing.quad), useNativeDriver: true }),
      ]).start();
    };

    // First pulse immediately, then every ~12s while on screen
    runPulse();
    interval = setInterval(() => { if (mounted) runPulse(); }, 12000);

    return () => { mounted = false; if (interval) clearInterval(interval); };
  }, [hintOpacity, hintShift]);

  // Pre-cache first few soundscapes quietly for instant start
  usePrecacheTracks({ kind: ['soundscape'], limit: 6 });

  const [activeCategory, setActiveCategory] = React.useState<
    null | 'stillness' | 'clarity' | 'renewal' | 'deeper' | 'tones' | 'noise'
  >(null);

  const tracks = React.useMemo<Track[]>(() => {
    if (!activeCategory) return [];
    return TRACKS.filter(t => t.category === activeCategory);
  }, [activeCategory]);

  // Predefined quick picks for Noise (wire these ids in data/tracks.ts when ready)
  const specialItems = React.useMemo(() => {
    if (activeCategory === 'noise' && tracks.length === 0) {
      return [
        { id: 'noise_white', title: 'White Noise' },
        { id: 'noise_pink',  title: 'Pink Noise'  },
        { id: 'noise_brown', title: 'Brown Noise' },
        { id: 'noise_grey',  title: 'Grey Noise'  },
      ];
    }
    return [];
  }, [activeCategory, tracks.length]);

  // Soundscapes Info modal state
  const [showInfo, setShowInfo] = React.useState(false);
  const [infoStep, setInfoStep] = React.useState<0 | 1>(0);

  const openInfo = React.useCallback(() => {
    setInfoStep(0);
    setShowInfo(true);
    Haptics.selectionAsync().catch(() => {});
  }, []);

  const closeInfo = React.useCallback(() => {
    setShowInfo(false);
    Haptics.selectionAsync().catch(() => {});
  }, []);

  const [searchQuery, setSearchQuery] = React.useState('');
  const normalizedQuery = searchQuery.trim().toLowerCase();

  const baseTracks = React.useMemo(() => {
    // If a category is active, use that category's tracks (or Noise quick picks)
    if (activeCategory) {
      return specialItems.length ? specialItems : tracks;
    }

    // No active category: allow global search across all soundscapes
    // (but don't auto-render a full list until user starts typing)
    return TRACKS.filter((t) => (t as any).kind === 'soundscape');
  }, [activeCategory, specialItems, tracks]);

  const filteredTracks = React.useMemo(() => {
    if (!normalizedQuery) return baseTracks;

    return baseTracks.filter((item: any) => {
      const title = (item.title ?? '').toLowerCase();
      const desc = ((item as any).description ?? '').toLowerCase();
      const freqLabel = ((item as any).frequencyLabel ?? '').toLowerCase();

      if (title.includes(normalizedQuery) || desc.includes(normalizedQuery) || freqLabel.includes(normalizedQuery)) {
        return true;
      }

      const freqs = (item as any).frequencies as number[] | undefined;
      if (Array.isArray(freqs)) {
        const freqStrings = freqs.map((f) => String(f));
        if (freqStrings.some((f) => normalizedQuery.includes(f) || f.includes(normalizedQuery))) {
          return true;
        }
      }

      return false;
    });
  }, [normalizedQuery, baseTracks]);

  // Reserve space for header + category stack + margins; keep at least one full card visible.
  const minTrackListHeight = categoryCardHeight + verticalScale(18);
  const listMaxHeight = Math.max(
    minTrackListHeight,
    windowHeight - (Math.max(insets.top + verticalScale(8), verticalScale(24)) + listHeight + verticalScale(220)),
  );
  // --- Swipe LEFT on header to go Home (race pan + fling) ---
  const SWIPE_THRESHOLD = Math.max(36, SCREEN_W * 0.08); // ~8% width
  const EDGE_GUARD = 10; // avoid OS back edge
  const startXRef = React.useRef(0);
  const native = React.useMemo(() => Gesture.Native(), []);

  const panToHome = useMemo(
    () =>
      Gesture.Pan()
        .runOnJS(true)
        .simultaneousWithExternalGesture(native)
        .activeOffsetX([-10, 10])
        .minDistance(10)
        .onStart((e) => {
          // @ts-ignore
          startXRef.current = (e as any).absoluteX ?? 0;
        })
        .onUpdate(async (e) => {
          // @ts-ignore
          const dx = (e as any).translationX ?? 0; // + right, - left
          const startX = startXRef.current;
          if (startX < EDGE_GUARD || startX > SCREEN_W - EDGE_GUARD) return;
          if (dx <= -SWIPE_THRESHOLD) {
            try { await Haptics.selectionAsync(); } catch {}
            navigation.navigate('Home' as never);
          }
        })
        .onEnd(async (e) => {
          // @ts-ignore
          const dx = (e as any).translationX ?? 0;
          const startX = startXRef.current;
          if (startX < EDGE_GUARD || startX > SCREEN_W - EDGE_GUARD) return;
          if (dx <= -SWIPE_THRESHOLD) {
            try { await Haptics.selectionAsync(); } catch {}
            navigation.navigate('Home' as never);
          }
        }),
    [SCREEN_W, navigation]
  );

  const flingLeft = useMemo(
    () =>
      Gesture.Fling()
        .runOnJS(true)
        .simultaneousWithExternalGesture(native)
        .direction(Directions.LEFT)
        .numberOfPointers(1)
        .onStart(async (e) => {
          // @ts-ignore
          const absX = (e as any).absoluteX ?? 0;
          if (absX < EDGE_GUARD || absX > SCREEN_W - EDGE_GUARD) return;
          try { await Haptics.selectionAsync(); } catch {}
          navigation.navigate('Home' as never);
        }),
    [SCREEN_W, navigation]
  );

  const headerGesture = useMemo(() => Gesture.Race(panToHome, flingLeft), [panToHome, flingLeft]);

  const [searchFocused, setSearchFocused] = React.useState(false);
  const [selectedTrack, setSelectedTrack] = React.useState<any | null>(null);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      {/* Header gesture strip: swipe LEFT to return Home */}
      <GestureDetector gesture={headerGesture}>
        <View
          style={{
            position: 'absolute',
            top: 0,
            left: 72,
            right: 0,
            height: Math.max(insets.top + verticalScale(120), verticalScale(140)),
            zIndex: 100,
            backgroundColor: 'transparent',
          }}
        />
      </GestureDetector>
    <View
      accessible={false}
      importantForAccessibility={showInfo ? 'no-hide-descendants' : 'auto'}
      accessibilityElementsHidden={showInfo}
      style={styles.container}
    >
      <View
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
        accessible={false}
        importantForAccessibility="no"
      >
        <VideoView
          player={bgPlayer}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          nativeControls={false}
          allowsPictureInPicture={false}
        />
      </View>
      {/* subtle top/bottom vignette so cards and text read */}
      <LinearGradient
        colors={['rgba(0,0,0,0.35)', 'rgba(0,0,0,0.0)', 'rgba(0,0,0,0.55)']}
        style={StyleSheet.absoluteFill}
        locations={[0, 0.5, 1]}
        pointerEvents="none"
      />


      <View style={[styles.topDock, { paddingTop: Math.max(insets.top + verticalScale(8), verticalScale(24)), paddingHorizontal: scale(18) }]}> 
        {/* Header */}
        <View style={styles.header}>
          <Text
            accessibilityRole="header"
            accessibilityLabel="Soundscapes"
            accessibilityHint="Swipe left on the title area to go back to Home"
            style={[
              Typography.display,
              { color: '#EFEAF9', letterSpacing: 0.3 },
              matchesCompactLayout && {
                fontSize: scale(20),
                lineHeight: Math.round(scale(27)),
              },
            ]}
            onLayout={(e) => {
              const { y, height } = e.nativeEvent.layout;
              // Place chevron ~25% down from the title’s top
              setTitleAnchorTop(y + height * 0.25);
            }}
          >
            Soundscapes
          </Text>
          <Text
            style={[
              Body.subtle,
              {
                fontFamily: 'Inter-ExtraLight', // unify subtitle weight
                color: '#CBC6D9',
                marginTop: verticalScale(4),
                letterSpacing: 0.00,
                fontSize: scale(14),
                opacity: 0.8,
              },
              matchesCompactLayout && {
                fontSize: scale(12),
                lineHeight: Math.round(scale(17)),
              },
            ]}
          >
            Peaceful tones • Noise • Frequencies
          </Text>

          {/* One-time gesture hint: subtle left chevron pulse */}
          {showHint && (
            <Animated.View
              // Position slightly under/right of the title, non-interactive
              pointerEvents="none"
              style={{
                position: 'absolute',
                right: scale(24),
                top: titleAnchorTop ?? 0,
                opacity: hintOpacity,
                transform: [{ translateX: hintShift }],
              }}
            >
              <Text style={{ color: '#CFC3E0', fontSize: scale(20), opacity: 0.95 }}>«</Text>
            </Animated.View>
          )}

          {/* Info button */}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="About Soundscapes"
            accessibilityHint="Opens information about soundscape categories, binaural beats, and frequencies"
            onPress={openInfo}
            hitSlop={12}
            style={{
              position: 'absolute',
              left: -scale(6),
              top: 0,
              width: 36,
              height: 36,
              justifyContent: 'center',
              alignItems: 'center',
              borderRadius: 18,
              backgroundColor: 'rgba(0,0,0,0.30)',
              borderWidth: 1,
              borderColor: 'rgba(255,255,255,0.12)',
              zIndex: 300,
              elevation: 300,
            }}
          >
            <Text style={{ fontFamily: 'Inter-ExtraLight', color: '#EDEAF6', fontSize: 18, lineHeight: 18 }}>?</Text>
          </Pressable>
        </View>

        {/* Category cards (stack of 3, then scroll) */}
        <View style={[styles.catListContainer, { height: listHeight, marginTop: verticalScale(10) }]}> 
          <SoundscapeCardList
            hasMembership={hasContinuing}
            cardHeight={categoryCardHeight}
            spacing={categoryCardGap}
            onDeeperLockedPress={openPaywall} // legacy fallback; safePresentPaywall is used when hasMembership is provided
            onSelectCategory={(key) => {
              Haptics.selectionAsync();
              setActiveCategory(key as any);
            }}
          />
          {/* bottom fade to hint the list continues */}
          <LinearGradient
            colors={['transparent', 'rgba(0,0,0,0.35)']}
            style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: verticalScale(28) }}
            pointerEvents="none"
          />
        </View>

        {/* Search row (always visible) */}
        <View
          style={{
            marginTop: verticalScale(24),
            marginBottom: verticalScale(4),
            paddingHorizontal: scale(2),
          }}
        >
          <View
            style={{
              borderRadius: 999,
              overflow: 'hidden',
              borderWidth: 1,
              borderColor: searchFocused
                ? 'rgba(207,195,224,0.22)'
                : 'rgba(255,255,255,0.08)',
              backgroundColor: searchFocused
                ? 'rgba(0,0,0,0.30)'
                : 'rgba(0,0,0,0.26)',
            }}
          >
            {/* inner vignette */}
            <LinearGradient
              pointerEvents="none"
              colors={['rgba(0,0,0,0.25)', 'rgba(0,0,0,0.00)', 'rgba(0,0,0,0.25)']}
              locations={[0, 0.5, 1]}
              start={{ x: 0, y: 0.5 }}
              end={{ x: 1, y: 0.5 }}
              style={StyleSheet.absoluteFill}
            />

            <TextInput
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholder="Search by title or frequency..."
              placeholderTextColor="rgba(237,232,250,0.5)"
              style={{
                borderRadius: 999,
                paddingVertical: 8,
                paddingHorizontal: 14,
                backgroundColor: 'transparent',
                color: '#FFFFFF',
                fontSize: 13,
                fontFamily: 'Inter-ExtraLight',
                letterSpacing: 0.2,
              }}
              returnKeyType="search"
              clearButtonMode="while-editing"
              accessibilityLabel="Search soundscapes by name or frequency"
              onFocus={() => setSearchFocused(true)}
              onBlur={() => setSearchFocused(false)}
            />
          </View>
          {(activeCategory || searchQuery.length > 0) && (
            <Pressable
              onPress={() => {
                Haptics.selectionAsync();
                setActiveCategory(null);
                setSearchQuery('');
              }}
              hitSlop={scale(10)}
              style={{
                alignSelf: 'flex-start',
                marginTop: verticalScale(8),
                marginLeft: scale(18),
              }}
              accessibilityRole="button"
              accessibilityLabel="Clear category and search"
            >
              <Text
                style={[
                  Body.subtle,
                  {
                    color: '#B7B0CA',
                    textDecorationLine: 'underline',
                    opacity: 0.9,
                    ...(matchesCompactLayout
                      ? {
                          fontSize: scale(11),
                          lineHeight: Math.round(scale(15)),
                          letterSpacing: 0.2,
                        }
                      : {}),
                  },
                ]}
              >
                Clear
              </Text>
            </Pressable>
          )}
        </View>
        {(activeCategory || searchQuery.length > 0) && (
          <View style={[styles.listWrap, { marginTop: verticalScale(12) }]}>
            <View style={styles.listHeaderRow}>
              <Text style={[Typography.title, { color: '#EDE8FA', fontSize: 15, letterSpacing: 0.3, opacity: 0.9 }]}>
                {!activeCategory
                  ? 'Search results'
                  : activeCategory === 'stillness'
                  ? 'Stillness'
                  : activeCategory === 'clarity'
                  ? 'Clarity'
                  : activeCategory === 'renewal'
                  ? 'Renewal'
                  : activeCategory === 'deeper'
                  ? 'Deeper'
                  : activeCategory === 'tones'
                  ? 'Tones'
                  : 'Noise'}
              </Text>
            </View>

            <ScrollView
              style={{ maxHeight: listMaxHeight }}
              contentContainerStyle={{ gap: verticalScale(10), paddingBottom: Math.max(insets.bottom, verticalScale(16)) }}
              showsVerticalScrollIndicator={false}
            >
              {filteredTracks.length === 0 ? (
                <View style={{ paddingHorizontal: 2, paddingTop: 4 }}>
                  <Text
                    style={[
                      Body.subtle,
                      {
                        color: 'rgba(237,232,250,0.7)',
                        fontFamily: 'Inter-ExtraLight',
                        fontSize: scale(12),
                      },
                    ]}
                  >
                    {searchQuery
                      ? 'No soundscapes found for your search.'
                      : 'No soundscapes available yet.'}
                  </Text>
                </View>
              ) : (
                filteredTracks.map((item: any) => {
                  // Centralized gating: Deeper soundscapes + premium tracks are locked without membership.
                  const policyTrack: any = {
                    id: item.id,
                    category: (item as any).category,
                    isPremium: !!(item as any).isPremium,
                    kind: (item as any).kind,
                  };
                  const isLocked = isLockedTrack(policyTrack, hasContinuing);

                  return (
                    <View key={item.id}>
                      <SoundscapeRow
                        item={item}
                        navigation={navigation}
                        isLocked={isLocked}
                        onLockedPress={handleLockedPress}
                        onStart={handleSoundscapeStart}
                        onLongPress={setSelectedTrack}
                      />
                    </View>
                  );
                })
              )}
            </ScrollView>
          </View>
        )}
      </View>

      {/* Right arrow to return Home (matches Chambers) */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Back to Home"
        onPress={() => {
          Haptics.selectionAsync();
          // @ts-ignore
          navigation.navigate('Home');
        }}
        style={{
          position: 'absolute',
          right: scale(16),
          top: '47%',
          width: scale(48),
          height: scale(48),
          justifyContent: 'center',
          alignItems: 'center',
        }}
        hitSlop={scale(12)}
      >
        {/* If you later swap to an icon asset, replace this Text with an Image like in Chambers */}
        <Text
          style={{
            color: '#EDE8FA',
            fontSize: scale(32),
            opacity: 0.6,
            textShadowColor: 'rgba(0,0,0,0.35)',
            textShadowOffset: { width: 0, height: verticalScale(1) },
            textShadowRadius: scale(3),
          }}
        >
          ›
        </Text>
      </Pressable>
    </View>
      {/* Soundscapes Info Modal */}
      <Modal
        visible={showInfo}
        transparent
        animationType="fade"
        onRequestClose={closeInfo}
        presentationStyle="overFullScreen"
        statusBarTranslucent
        accessibilityViewIsModal
      >
        <View style={{ flex: 1 }}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={closeInfo}
          >
            <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.55)' }} />
          </Pressable>

          <View style={{ flex: 1, justifyContent: 'flex-end' }}>
            <View
              accessible={true}
              accessibilityRole="summary"
              accessibilityLabel={infoStep === 0 ? 'Soundscapes information. Step 1 of 2.' : 'Soundscapes information. Step 2 of 2.'}
              style={{
                paddingBottom: Math.max(insets.bottom + (matchesCompactLayout ? verticalScale(10) : 18), matchesCompactLayout ? verticalScale(16) : 24),
                paddingTop: matchesCompactLayout ? 12 : 18,
                paddingHorizontal: matchesCompactLayout ? 12 : 18,
                borderTopLeftRadius: 16,
                borderTopRightRadius: 16,
                backgroundColor: 'rgba(18,18,32,0.96)',
                borderTopWidth: 1,
                borderColor: 'rgba(255,255,255,0.06)',
                overflow: 'hidden',
              }}
            >
              <LinearGradient
                colors={['rgba(207,195,224,0.20)', 'rgba(31,35,58,0.0)']}
                start={{ x: 0.5, y: 0 }}
                end={{ x: 0.5, y: 1 }}
                style={StyleSheet.absoluteFill}
                pointerEvents="none"
              />
              <ScrollView
                style={{ maxHeight: matchesCompactLayout ? windowHeight * 0.55 : windowHeight * 0.58 }}
                contentContainerStyle={{ paddingBottom: verticalScale(6), flexGrow: 1 }}
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
              >
                <Text
                  style={[
                    Typography.title,
                    {
                      color: '#F0EEF8',
                      letterSpacing: 0.2,
                      textAlign: 'left',
                    },
                    matchesCompactLayout && {
                      fontSize: scale(16),
                      lineHeight: Math.round(scale(23)),
                    },
                  ]}
                >
                  {infoStep === 0 ? SOUNDSCAPES_INFO.whatTitle : SOUNDSCAPES_INFO.deeperTitle}
                </Text>

                <Text
                  style={{
                    fontFamily: 'Inter-ExtraLight',
                    fontSize: matchesCompactLayout ? scale(10) : 11,
                    lineHeight: matchesCompactLayout ? verticalScale(13) : 14,
                    color: 'rgba(237,232,250,0.5)',
                    letterSpacing: matchesCompactLayout ? scale(0.55) : 0.6,
                    textTransform: 'uppercase',
                    marginTop: matchesCompactLayout ? verticalScale(4) : 6,
                  }}
                >
                  {infoStep === 0 ? 'Step 1 of 2' : 'Step 2 of 2'}
                </Text>

                <Text
                  style={{
                    fontFamily: 'Inter-ExtraLight',
                    fontSize: matchesCompactLayout ? scale(13) : 14,
                    lineHeight: matchesCompactLayout ? Math.round(scale(18)) : 20,
                    color: '#EDEAF6',
                    marginTop: matchesCompactLayout ? verticalScale(10) : 12,
                  }}
                >
                  {infoStep === 0 ? SOUNDSCAPES_INFO.whatBody : SOUNDSCAPES_INFO.deeperBody}
                </Text>
              </ScrollView>

              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: infoStep === 0 ? 'space-between' : 'flex-end',
                  marginTop: matchesCompactLayout ? verticalScale(8) : 16,
                }}
              >
                {infoStep === 0 && (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={SOUNDSCAPES_INFO.closeLabel}
                    accessibilityHint="Closes this information sheet"
                    onPress={closeInfo}
                    hitSlop={10}
                    style={{
                      paddingVertical: 4,
                      paddingHorizontal: 8,
                    }}
                  >
                    <Text style={{ fontFamily: 'Inter-ExtraLight', fontSize: 13, color: 'rgba(237,234,246,0.6)' }}>
                      {SOUNDSCAPES_INFO.closeLabel}
                    </Text>
                  </Pressable>
                )}

                <View style={{ flexDirection: 'row', alignItems: 'center', gap: matchesCompactLayout ? scale(8) : 10 }}>
                  {infoStep === 1 && (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={SOUNDSCAPES_INFO.backLabel}
                      accessibilityHint="Returns to the previous step"
                      onPress={() => setInfoStep(0)}
                      hitSlop={10}
                      style={{
                        paddingVertical: 4,
                        paddingHorizontal: 8,
                      }}
                    >
                      <Text style={{ fontFamily: 'Inter-ExtraLight', fontSize: 13, color: 'rgba(237,234,246,0.6)' }}>
                        {SOUNDSCAPES_INFO.backLabel}
                      </Text>
                    </Pressable>
                  )}

                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={infoStep === 0 ? SOUNDSCAPES_INFO.nextLabel : SOUNDSCAPES_INFO.okLabel}
                    accessibilityHint={infoStep === 0 ? 'Moves to step 2 of 2' : 'Closes this information sheet'}
                    onPress={() => {
                      if (infoStep === 0) {
                        setInfoStep(1);
                        Haptics.selectionAsync().catch(() => {});
                      } else {
                        closeInfo();
                      }
                    }}
                    hitSlop={10}
                    style={{
                      paddingVertical: 10,
                      paddingHorizontal: 20,
                      borderRadius: 16,
                      borderWidth: 1,
                      borderColor: 'rgba(207,195,224,0.35)',
                      borderTopColor: 'rgba(207,195,224,0.7)',
                      alignItems: 'center',
                      overflow: 'hidden',
                    }}
                  >
                    <Text style={{ fontFamily: 'CalSans-SemiBold', fontSize: 16, color: '#F0EEF8' }}>
                      {infoStep === 0 ? SOUNDSCAPES_INFO.nextLabel : SOUNDSCAPES_INFO.okLabel}
                    </Text>
                  </Pressable>
                </View>
              </View>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        visible={!!selectedTrack}
        transparent
        animationType="fade"
        onRequestClose={() => setSelectedTrack(null)}
      >
        <Pressable style={styles.trackModalBackdrop} onPress={() => setSelectedTrack(null)}>
          <Pressable style={styles.trackModalCard} onPress={() => {}}>
            <LinearGradient
              colors={['rgba(207,195,224,0.20)', 'rgba(31,35,58,0.0)']}
              start={{ x: 0.5, y: 0 }}
              end={{ x: 0.5, y: 1 }}
              style={StyleSheet.absoluteFill}
              pointerEvents="none"
            />
            <Text style={styles.trackModalEyebrow}>Soundscape</Text>
            <Text style={styles.trackModalTitle}>{selectedTrack?.title}</Text>
            {!!selectedTrack?.frequencyLabel && (
              <Text style={styles.trackModalFrequency}>{selectedTrack.frequencyLabel}</Text>
            )}
            <Text style={styles.trackModalDescription}>
              {selectedTrack?.description ?? 'No description available yet.'}
            </Text>
            <Pressable style={styles.trackModalCloseButton} onPress={() => setSelectedTrack(null)}>
              <Text style={styles.trackModalCloseText}>Return</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  topDock: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    paddingTop: 0,
    paddingHorizontal: 0,
  },
  header: { 
    alignItems: 'center',
    paddingBottom: 10 },
  listWrap: {
    marginTop: 12,
    paddingBottom: 24,
  },
  listHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 2,
    marginBottom: 2,
  },
  trackRow: {
    padding: 12,
    borderRadius: 14,
    backgroundColor: 'rgba(0,0,0,0.32)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    overflow: 'hidden',
  },
  catListContainer: {
    position: 'relative',
    marginTop: 0,
    overflow: 'hidden',
  },
  trackModalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  trackModalCard: {
    width: '100%',
    maxWidth: 420,
    borderRadius: 16,
    paddingHorizontal: 24,
    paddingTop: 24,
    paddingBottom: 20,
    backgroundColor: 'rgba(18,18,32,0.95)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    overflow: 'hidden',
  },
  trackModalEyebrow: {
    fontFamily: 'Inter-ExtraLight',
    fontSize: 12,
    letterSpacing: 1.8,
    textTransform: 'uppercase',
    color: 'rgba(237,232,250,0.52)',
    marginBottom: 8,
  },
  trackModalTitle: {
    fontFamily: 'CalSans-SemiBold',
    fontSize: 28,
    color: 'rgba(255,255,255,0.96)',
    marginBottom: 6,
  },
  trackModalFrequency: {
    fontFamily: 'Inter-ExtraLight',
    fontSize: 13,
    letterSpacing: 0.6,
    color: 'rgba(207,195,224,0.78)',
    marginBottom: 14,
    textTransform: 'uppercase',
  },
  trackModalDescription: {
    fontFamily: 'Inter-ExtraLight',
    fontSize: 15,
    lineHeight: 23,
    color: 'rgba(237,232,250,0.9)',
    marginBottom: 22,
  },
  trackModalCloseButton: {
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(207,195,224,0.35)',
    borderTopColor: 'rgba(207,195,224,0.7)',
    alignSelf: 'center',
    overflow: 'hidden',
  },
  trackModalCloseText: {
    fontFamily: 'CalSans-SemiBold',
    fontSize: 16,
    color: '#F0EEF8',
  },
});