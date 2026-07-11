import React, { useEffect, useMemo, useState, useRef } from 'react';
import { usePostHog } from 'posthog-react-native';
import { StyleSheet, View, Text, Pressable, ScrollView, Animated, Easing, TextInput, Alert, Platform, Modal, Dimensions, KeyboardAvoidingView } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
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

// RevenueCat entitlement used to gate "deeper" content
const CONTINUING_ENTITLEMENT_ID = 'continuing_with_inner';

// --- Soundscapes Info ---
const SOUNDSCAPES_INFO = {
  // Step 1
  whatTitle: 'What you\'re listening to',
  whatBody: `The library is organized by state.

Still Water — quiet meditation, breath, and nervous-system settling. Designed to soften the mind without pulling attention, helping the body return to presence.

Clear Air — soundscapes for focus, awareness, and creative flow. For work, study, writing, or mindful attention without becoming a distraction.

New Growth — a restorative space for release, emotional softening, and gentle return. These tracks help clear residue from the day and invite the system back into balance.

Root Deep — for threshold states, descent, lucid dreaming, and deeper inner work. Slower, heavier environments for those ready to move beyond surface calm.

Resonance — minimal frequency-based audio for intentional listening. Solfeggio, binaural, and high-frequency experiences gathered into a simple space for tuning and resonance.

Natural — simple noise fields for sleep, focus, and nervous-system steadiness. Neutral texture without emotional direction.


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

// Lock pulse (slow "breath")
const LOCK_PULSE_MS = 2800;

// Category definitions with new Garden names mapping to existing data keys
const GARDEN_CATEGORIES = [
  { key: 'stillness' as const, label: 'Still Water' },
  { key: 'clarity'   as const, label: 'Clear Air'  },
  { key: 'renewal'   as const, label: 'New Growth'  },
  { key: 'deeper'    as const, label: 'Root Deep'  },
  { key: 'tones'     as const, label: 'Resonance'   },
  { key: 'noise'     as const, label: 'Natural'     },
  { key: 'sanctuary' as const, label: 'Sanctuary'   },
] as const;

type CategoryKey = typeof GARDEN_CATEGORIES[number]['key'];

// Map internal category key → Garden display label
const CATEGORY_LABELS: Record<CategoryKey, string> = {
  stillness: 'Still Water',
  clarity:   'Clear Air',
  renewal:   'New Growth',
  deeper:    'Root Deep',
  tones:     'Resonance',
  noise:     'Natural',
  sanctuary: 'Sanctuary',
};

// Dimensions used for track list max height
const { height: SCREEN_H } = Dimensions.get('window');

// ---------------------------------------------------------------------------
// GardenTrackRow — simple row: title left, download icon right
// ---------------------------------------------------------------------------

const GardenTrackRow = React.memo(function GardenTrackRow({
  item,
  navigation,
  isLocked,
  onLockedPress,
  onStart,
  onLongPress,
  isLast,
}: {
  item: any;
  navigation: any;
  isLocked?: boolean;
  onLockedPress?: (item: any) => void;
  onStart?: (item: any) => void;
  onLongPress?: (item: any) => void;
  isLast?: boolean;
}) {
  const { scale, verticalScale } = useScale();
  const { isCached, isWorking, progress, download, remove, canDownload } = useOfflineAsset(item?.id, 'soundscape');
  const allowOffline = canDownload && !isLocked;

  return (
    <View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={isLocked ? `${item.title} is locked` : `Play ${item.title}`}
        accessibilityHint={isLocked ? 'Requires Continuing with Inner' : `Plays ${item.title}`}
        style={({ pressed }) => ({
          flexDirection: 'row',
          alignItems: 'center',
          paddingVertical: verticalScale(13),
          paddingHorizontal: scale(4),
          opacity: pressed ? 0.75 : 1,
        })}
        onPress={async () => {
          Haptics.selectionAsync();
          if (isLocked) { onLockedPress?.(item); return; }
          onStart?.(item);
          try { await setLastSession({ type: 'soundscape', id: item.id }); } catch {}
          navigation.navigate('JourneyPlayer', { trackId: item.id });
        }}
        onLongPress={() => {
          Haptics.selectionAsync().catch(() => {});
          onLongPress?.(item);
        }}
        delayLongPress={360}
      >
        {/* Small lock indicator */}
        {isLocked && (
          <Image
            source={LOCK_ICON}
            style={{ width: scale(13), height: scale(13), opacity: 0.5, marginRight: scale(8) }}
            resizeMode="contain"
          />
        )}

        {/* Title */}
        <Text
          style={{
            flex: 1,
            fontFamily: 'CalSans-SemiBold',
            fontSize: scale(15),
            color: isLocked ? 'rgba(237,232,250,0.42)' : '#EDE8FA',
            letterSpacing: 0.2,
          }}
          numberOfLines={1}
        >
          {item.title}
        </Text>

        {/* Download icon (unlocked only) */}
        {allowOffline && (
          <Pressable
            disabled={isWorking}
            onPress={(e) => {
              // @ts-ignore
              e?.stopPropagation?.();
              if (isCached) remove(); else download();
              Haptics.selectionAsync().catch(() => {});
            }}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel={isCached ? `Remove offline cache for ${item.title}` : `Download ${item.title} for offline`}
            style={{ paddingLeft: scale(12) }}
          >
            <Text
              style={{
                fontSize: scale(16),
                color: isWorking
                  ? 'rgba(207,195,224,0.5)'
                  : isCached
                  ? 'rgba(207,195,224,0.9)'
                  : 'rgba(255,255,255,0.28)',
              }}
            >
              {isWorking ? `${Math.round(progress * 100)}%` : isCached ? '✓' : '↓'}
            </Text>
          </Pressable>
        )}
      </Pressable>

      {/* Divider — omit on last item */}
      {!isLast && (
        <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: 'rgba(255,255,255,0.10)' }} />
      )}
    </View>
  );
});

// ---------------------------------------------------------------------------
// SoundscapesScreen (The Garden)
// ---------------------------------------------------------------------------

export default function SoundscapesScreen() {
  const insets = useSafeAreaInsets();
  const { scale, verticalScale, height: windowHeight, width: SCREEN_W, matchesCompactLayout } = useScale();
  const navigation = useNavigation();
  const posthog = usePostHog();

  const bgPlayer = useVideoPlayer(require('../assets/videos/garden_bg.mp4'), player => {
    player.loop = true;
    player.muted = true;
    // Muted decorative video must not claim exclusive AVAudioSession ownership —
    // the default 'doNotMix' mode fights TrackPlayer's session on background/lock.
    player.audioMixingMode = 'mixWithOthers';
    try { player.play(); } catch {}
  });

  useFocusEffect(React.useCallback(() => {
    try { bgPlayer.play(); } catch {}
    return () => { try { bgPlayer.pause(); } catch {} };
  }, [bgPlayer]));

  const [hasContinuing, setHasContinuing] = useState(false);

  useEffect(() => {
    let unsub: any;
    const sync = async () => {
      try {
        const info = await Purchases.getCustomerInfo();
        const active = (info?.entitlements?.active ?? {}) as Record<string, any>;
        setHasContinuing(!!active[CONTINUING_ENTITLEMENT_ID]);
      } catch { setHasContinuing(false); }
    };
    sync();
    // @ts-ignore
    unsub = Purchases.addCustomerInfoUpdateListener?.((info: any) => {
      const active = (info?.entitlements?.active ?? {}) as Record<string, any>;
      setHasContinuing(!!active[CONTINUING_ENTITLEMENT_ID]);
    });
    return () => { try { if (typeof unsub === 'function') unsub(); } catch {} };
  }, []);

  const openPaywall = React.useCallback(async () => {
    try { await Haptics.selectionAsync(); } catch {}
    try { await safePresentPaywall(undefined, 'garden'); return; } catch (e) {
      console.log('[PAYWALL] Failed to present paywall', e);
    }
    Alert.alert(
      'Continuing with Inner',
      'Membership is not available to display right now. Please try again in a moment.',
      [{ text: 'OK' }]
    );
  }, []);

  const handleLockedPress = React.useCallback((_item: any) => { openPaywall(); }, [openPaywall]);

  const handleSoundscapeStart = React.useCallback((item: any) => {
    posthog.capture('soundscape_started', {
      soundscape_id: item.id,
      soundscape_title: item.title ?? item.id,
      category: item.category ?? 'unknown',
      is_premium: !!item.isPremium || item.category === 'deeper',
      has_subscription: hasContinuing,
    });
  }, [posthog, hasContinuing]);

  // Pre-cache first few soundscapes quietly for instant start
  usePrecacheTracks({ kind: ['soundscape'], limit: 6 });

  const [activeCategory, setActiveCategory] = React.useState<CategoryKey | null>('stillness');

  const tracks = React.useMemo<Track[]>(() => {
    if (!activeCategory) return [];
    return TRACKS.filter(t => t.category === activeCategory);
  }, [activeCategory]);

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
  const openInfo = React.useCallback(() => { setInfoStep(0); setShowInfo(true); Haptics.selectionAsync().catch(() => {}); }, []);
  const closeInfo = React.useCallback(() => { setShowInfo(false); Haptics.selectionAsync().catch(() => {}); }, []);

  // Search — collapsed by default
  const [searchExpanded, setSearchExpanded] = React.useState(false);
  const [searchQuery, setSearchQuery] = React.useState('');
  const [searchFocused, setSearchFocused] = React.useState(false);
  const normalizedQuery = searchQuery.trim().toLowerCase();

  const baseTracks = React.useMemo(() => {
    if (activeCategory) return specialItems.length ? specialItems : tracks;
    return TRACKS.filter((t) => (t as any).kind === 'soundscape');
  }, [activeCategory, specialItems, tracks]);

  const filteredTracks = React.useMemo(() => {
    if (!normalizedQuery) return baseTracks;
    return baseTracks.filter((item: any) => {
      const title = (item.title ?? '').toLowerCase();
      const desc = ((item as any).description ?? '').toLowerCase();
      const freqLabel = ((item as any).frequencyLabel ?? '').toLowerCase();
      if (title.includes(normalizedQuery) || desc.includes(normalizedQuery) || freqLabel.includes(normalizedQuery)) return true;
      const freqs = (item as any).frequencies as number[] | undefined;
      if (Array.isArray(freqs)) {
        const freqStrings = freqs.map((f) => String(f));
        if (freqStrings.some((f) => normalizedQuery.includes(f) || f.includes(normalizedQuery))) return true;
      }
      return false;
    });
  }, [normalizedQuery, baseTracks]);

  const [selectedTrack, setSelectedTrack] = React.useState<any | null>(null);

  // Gesture: swipe LEFT → Home
  const SWIPE_THRESHOLD = Math.max(36, SCREEN_W * 0.08);
  const EDGE_GUARD = 10;
  const startXRef = React.useRef(0);
  const native = React.useMemo(() => Gesture.Native(), []);

  const panToHome = useMemo(
    () => Gesture.Pan().runOnJS(true).simultaneousWithExternalGesture(native)
      .activeOffsetX([-10, 10]).minDistance(10)
      .onStart((e) => { startXRef.current = (e as any).absoluteX ?? 0; })
      .onUpdate(async (e) => {
        const dx = (e as any).translationX ?? 0;
        const startX = startXRef.current;
        if (startX < EDGE_GUARD || startX > SCREEN_W - EDGE_GUARD) return;
        if (dx <= -SWIPE_THRESHOLD) { try { await Haptics.selectionAsync(); } catch {} navigation.navigate('Home' as never); }
      })
      .onEnd(async (e) => {
        const dx = (e as any).translationX ?? 0;
        const startX = startXRef.current;
        if (startX < EDGE_GUARD || startX > SCREEN_W - EDGE_GUARD) return;
        if (dx <= -SWIPE_THRESHOLD) { try { await Haptics.selectionAsync(); } catch {} navigation.navigate('Home' as never); }
      }),
    [SCREEN_W, navigation]
  );

  const flingLeft = useMemo(
    () => Gesture.Fling().runOnJS(true).simultaneousWithExternalGesture(native)
      .direction(Directions.LEFT).numberOfPointers(1)
      .onStart(async (e) => {
        const absX = (e as any).absoluteX ?? 0;
        if (absX < EDGE_GUARD || absX > SCREEN_W - EDGE_GUARD) return;
        try { await Haptics.selectionAsync(); } catch {}
        navigation.navigate('Home' as never);
      }),
    [SCREEN_W, navigation]
  );

  const headerGesture = useMemo(() => Gesture.Race(panToHome, flingLeft), [panToHome, flingLeft]);

  // Track list max height — fills available space below pills + search
  const showTrackList = activeCategory !== null || normalizedQuery.length > 0;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      {/* Header gesture strip: swipe LEFT to return Home */}
      <GestureDetector gesture={headerGesture}>
        <View
          style={{
            position: 'absolute',
            top: 0,
            left: 110,
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
        {/* Full-screen video background */}
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

        {/* Gradient: dark from 45% down so UI elements are readable */}
        <LinearGradient
          colors={['transparent', 'rgba(5,4,12,0.82)', 'rgba(5,4,12,0.96)']}
          locations={[0, 0.45, 1]}
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
        />

        {/* Search + info icons — top of screen, clear of the nav arrow */}
        <View
          style={{
            position: 'absolute',
            top: insets.top + scale(12),
            left: scale(16),
            flexDirection: 'row',
            alignItems: 'center',
            gap: scale(8),
            zIndex: 110,
          }}
        >
          {/* Search icon */}
          <Pressable
            onPress={() => {
              setSearchExpanded(v => !v);
              if (searchExpanded) { setSearchQuery(''); setSearchFocused(false); }
              Haptics.selectionAsync().catch(() => {});
            }}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel={searchExpanded ? 'Close search' : 'Search soundscapes'}
            style={styles.iconBtn}
          >
            <Text style={{ color: '#EDEAF6', fontSize: scale(15) }}>
              {searchExpanded ? '✕' : '⌕'}
            </Text>
          </Pressable>

          {/* Info button */}
          <Pressable
            onPress={openInfo}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel="About The Garden"
            style={styles.iconBtn}
          >
            <Text style={{ fontFamily: 'Inter-ExtraLight', color: '#EDEAF6', fontSize: scale(16), lineHeight: scale(16) }}>?</Text>
          </Pressable>
        </View>

        {/* UI area — sits at the bottom, content stacks upward from safe area */}
        <KeyboardAvoidingView
          style={{ flex: 1, justifyContent: 'flex-end' }}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
        <View
          style={{
            paddingHorizontal: scale(20),
            paddingBottom: Math.max(insets.bottom + verticalScale(12), verticalScale(24)),
          }}
        >
          {/* Title */}
          <View style={{ marginBottom: verticalScale(6) }}>
              <Text
                accessibilityRole="header"
                style={[
                  Typography.display,
                  { color: '#EFEAF9', letterSpacing: 0.3 },
                  matchesCompactLayout && { fontSize: scale(20), lineHeight: Math.round(scale(27)) },
                ]}
              >
                The Garden
              </Text>
              <Text
                style={[
                  Body.subtle,
                  {
                    fontFamily: 'Inter-ExtraLight',
                    color: '#CBC6D9',
                    marginTop: verticalScale(3),
                    fontSize: scale(13),
                    opacity: 0.75,
                  },
                ]}
              >
                A place to breathe. A place to return to.
              </Text>
          </View>

          {/* Category pills — horizontal scroll */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: scale(8), paddingVertical: verticalScale(6) }}
            style={{ marginHorizontal: -scale(4), paddingHorizontal: scale(4) }}
          >
            {GARDEN_CATEGORIES.map(({ key, label }) => {
              const isActive = activeCategory === key;
              const isLockedCat = key === 'deeper' && !hasContinuing;
              return (
                <Pressable
                  key={key}
                  onPress={() => {
                    Haptics.selectionAsync();
                    if (isLockedCat) { openPaywall(); return; }
                    setActiveCategory(isActive ? null : key);
                    if (searchExpanded && !isActive) { setSearchExpanded(false); setSearchQuery(''); }
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={`${label} category${isLockedCat ? ', locked' : ''}`}
                  accessibilityState={{ selected: isActive }}
                  style={[
                    styles.pill,
                    isActive && styles.pillActive,
                  ]}
                >
                  {isLockedCat && (
                    <Image
                      source={LOCK_ICON}
                      style={{ width: scale(11), height: scale(11), opacity: 0.6, marginRight: scale(5) }}
                      resizeMode="contain"
                    />
                  )}
                  <Text
                    style={[
                      styles.pillText,
                      isActive && styles.pillTextActive,
                    ]}
                  >
                    {label}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>

          {/* Search bar — expands when search icon tapped */}
          {searchExpanded && (
            <View style={{ marginBottom: verticalScale(10) }}>
              <View
                style={{
                  borderRadius: 999,
                  borderWidth: 1,
                  borderColor: searchFocused ? 'rgba(207,195,224,0.22)' : 'rgba(255,255,255,0.08)',
                  backgroundColor: searchFocused ? 'rgba(0,0,0,0.30)' : 'rgba(0,0,0,0.26)',
                  overflow: 'hidden',
                }}
              >
                <TextInput
                  value={searchQuery}
                  onChangeText={setSearchQuery}
                  placeholder="Search by title or frequency..."
                  placeholderTextColor="rgba(237,232,250,0.5)"
                  autoFocus
                  style={{
                    paddingVertical: verticalScale(8),
                    paddingHorizontal: scale(14),
                    color: '#FFFFFF',
                    fontSize: scale(13),
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
            </View>
          )}

          {/* Clear link — only when a search query has been typed */}
          {searchQuery.length > 0 && (
            <Pressable
              onPress={() => { Haptics.selectionAsync(); setActiveCategory(null); setSearchQuery(''); }}
              hitSlop={scale(10)}
              style={{ alignSelf: 'flex-start', marginBottom: verticalScale(6) }}
              accessibilityRole="button"
              accessibilityLabel="Clear category and search"
            >
              <Text style={[Body.subtle, { color: '#B7B0CA', textDecorationLine: 'underline', opacity: 0.9, fontSize: scale(11) }]}>
                Clear
              </Text>
            </Pressable>
          )}

          {/* Track list */}
          {showTrackList && (
            <View style={{ marginTop: verticalScale(8) }}>
              {/* Section label */}
              <Text
                style={{
                  fontFamily: 'Inter-ExtraLight',
                  fontSize: scale(11),
                  letterSpacing: scale(1.8),
                  textTransform: 'uppercase',
                  color: 'rgba(237,232,250,0.45)',
                  marginBottom: verticalScale(4),
                }}
              >
                {!activeCategory
                  ? 'Search results'
                  : CATEGORY_LABELS[activeCategory]}
              </Text>

              <ScrollView
                style={{ maxHeight: windowHeight * 0.45 }}
                contentContainerStyle={{ paddingBottom: verticalScale(16) }}
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
              >
                {filteredTracks.length === 0 ? (
                  <Text
                    style={[Body.subtle, {
                      color: 'rgba(237,232,250,0.7)',
                      fontFamily: 'Inter-ExtraLight',
                      fontSize: scale(12),
                      paddingTop: verticalScale(4),
                    }]}
                  >
                    {searchQuery ? 'No soundscapes found for your search.' : 'No soundscapes available yet.'}
                  </Text>
                ) : (
                  filteredTracks.map((item: any, idx: number) => {
                    const policyTrack: any = {
                      id: item.id,
                      category: (item as any).category,
                      isPremium: !!(item as any).isPremium,
                      kind: (item as any).kind,
                    };
                    const isLocked = isLockedTrack(policyTrack, hasContinuing);
                    return (
                      <GardenTrackRow
                        key={item.id}
                        item={item}
                        navigation={navigation}
                        isLocked={isLocked}
                        onLockedPress={handleLockedPress}
                        onStart={handleSoundscapeStart}
                        onLongPress={setSelectedTrack}
                        isLast={idx === filteredTracks.length - 1}
                      />
                    );
                  })
                )}
              </ScrollView>
            </View>
          )}
        </View>
        </KeyboardAvoidingView>

        {/* Right arrow to return Home */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back to Home"
          onPress={() => { Haptics.selectionAsync(); navigation.navigate('Home' as never); }}
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
          <Pressable style={StyleSheet.absoluteFill} onPress={closeInfo}>
            <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.75)' }} />
          </Pressable>
          <View style={{ flex: 1, justifyContent: 'flex-end' }}>
            <View
              accessible
              accessibilityRole="summary"
              accessibilityLabel={infoStep === 0 ? 'Soundscapes information. Step 1 of 2.' : 'Soundscapes information. Step 2 of 2.'}
              style={{
                paddingBottom: Math.max(insets.bottom + (matchesCompactLayout ? verticalScale(10) : 18), matchesCompactLayout ? verticalScale(16) : 24),
                paddingTop: 28,
                paddingHorizontal: 28,
                borderTopLeftRadius: 12,
                borderTopRightRadius: 12,
                backgroundColor: 'rgba(8,5,3,0.97)',
                borderTopWidth: 1,
                borderColor: 'rgba(180,140,80,0.2)',
              }}
            >
              <ScrollView
                style={{ maxHeight: matchesCompactLayout ? windowHeight * 0.55 : windowHeight * 0.58 }}
                contentContainerStyle={{ paddingBottom: verticalScale(6), flexGrow: 1 }}
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
              >
                <Text style={{ color: 'rgba(220,185,100,0.95)', fontSize: 18, fontWeight: '600', fontFamily: 'CalSans-SemiBold', marginBottom: 16 }}>
                  {infoStep === 0 ? SOUNDSCAPES_INFO.whatTitle : SOUNDSCAPES_INFO.deeperTitle}
                </Text>
                <Text style={{ fontFamily: 'Inter-ExtraLight', fontSize: 13, lineHeight: 20, color: 'rgba(255,255,255,0.65)', marginBottom: 12 }}>
                  {infoStep === 0 ? SOUNDSCAPES_INFO.whatBody : SOUNDSCAPES_INFO.deeperBody}
                </Text>
              </ScrollView>
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: infoStep === 0 ? 'space-between' : 'flex-end',
                  marginTop: 18,
                }}
              >
                {infoStep === 0 && (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={SOUNDSCAPES_INFO.closeLabel}
                    onPress={closeInfo}
                    hitSlop={10}
                    style={{ paddingVertical: 10, paddingHorizontal: 20, borderRadius: 6, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', alignItems: 'center' }}
                  >
                    <Text style={{ fontFamily: 'Inter-ExtraLight', fontSize: 13, color: 'rgba(255,255,255,0.3)' }}>
                      {SOUNDSCAPES_INFO.closeLabel}
                    </Text>
                  </Pressable>
                )}
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  {infoStep === 1 && (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={SOUNDSCAPES_INFO.backLabel}
                      onPress={() => setInfoStep(0)}
                      hitSlop={10}
                      style={{ paddingVertical: 10, paddingHorizontal: 20, borderRadius: 6, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', alignItems: 'center' }}
                    >
                      <Text style={{ fontFamily: 'Inter-ExtraLight', fontSize: 13, color: 'rgba(255,255,255,0.3)' }}>
                        {SOUNDSCAPES_INFO.backLabel}
                      </Text>
                    </Pressable>
                  )}
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={infoStep === 0 ? SOUNDSCAPES_INFO.nextLabel : SOUNDSCAPES_INFO.okLabel}
                    onPress={() => {
                      if (infoStep === 0) { setInfoStep(1); Haptics.selectionAsync().catch(() => {}); }
                      else { closeInfo(); }
                    }}
                    hitSlop={10}
                    style={{ paddingVertical: 10, paddingHorizontal: 20, borderRadius: 6, borderWidth: 1, borderColor: 'rgba(200,160,80,0.6)', backgroundColor: 'rgba(180,140,80,0.15)', minWidth: 80, alignItems: 'center' }}
                  >
                    <Text style={{ fontFamily: 'CalSans-SemiBold', fontSize: 13, color: 'rgba(220,185,100,1)' }}>
                      {infoStep === 0 ? SOUNDSCAPES_INFO.nextLabel : SOUNDSCAPES_INFO.okLabel}
                    </Text>
                  </Pressable>
                </View>
              </View>
            </View>
          </View>
        </View>
      </Modal>

      {/* Track description modal (long-press) */}
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
  iconBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(0,0,0,0.30)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    width: 108,
    height: 36,
    borderRadius: 999,
    backgroundColor: 'rgba(0,0,0,0.20)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)',
  },
  pillActive: {
    backgroundColor: 'rgba(20,16,36,0.35)',
    borderColor: 'rgba(255,255,255,1.0)',
  },
  pillText: {
    fontFamily: 'Inter-ExtraLight',
    fontSize: 13,
    color: 'rgba(255,255,255,0.85)',
    letterSpacing: 0.3,
  },
  pillTextActive: {
    color: '#FFFFFF',
    fontFamily: 'CalSans-SemiBold',
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
