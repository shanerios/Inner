import React, { useEffect, useMemo, useState, useRef } from 'react';
import { ImageBackground, StyleSheet, View, Text, Pressable, ScrollView, Dimensions, Animated, Easing, TextInput, Alert, Platform } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import SoundscapeCardList from '../components/SoundscapeCardList';
import { Image } from 'react-native';
import { Gesture, GestureDetector, Directions, GestureHandlerRootView } from 'react-native-gesture-handler';
import { useNavigation } from '@react-navigation/native';
import * as Haptics from 'expo-haptics';
import { TRACKS, Track } from '../data/tracks';
import { setLastSession } from '../core/session';
import { useOfflineAsset } from '../core/useOfflineAsset';
import { Typography, Body as _Body } from '../core/typography';
import { usePrecacheTracks } from '../hooks/usePrecacheTracks';
import Purchases from 'react-native-purchases';
import { isLockedTrack } from '../src/core/subscriptions/accessPolicy';
import { safePresentPaywall } from '../src/core/subscriptions/safePresentPaywall';
const Body = _Body ?? ({
  regular: { ...Typography.body },
  subtle:  { ...Typography.caption },
} as const);

// Tunables for "stack of 3 then scroll" behavior on the category cards
const CARD_HEIGHT = 96;        // match your SoundscapeCard minHeight
const CARD_GAP = 18;           // vertical space between cards
const VISIBLE_COUNT = 3;       // show 3, scroll for the rest
const LIST_HEIGHT = CARD_HEIGHT * VISIBLE_COUNT + CARD_GAP * (VISIBLE_COUNT - 1);

// RevenueCat entitlement used to gate “deeper” content
const CONTINUING_ENTITLEMENT_ID = 'continuing_with_inner';

// Assets
const LOCK_ICON = require('../assets/images/locked_gate.png');

// Lock pulse (slow “breath”)
const LOCK_PULSE_MS = 2800;

function SoundscapeRow({
  item,
  navigation,
  isLocked,
  onLockedPress,
}: {
  item: any;
  navigation: any;
  isLocked?: boolean;
  onLockedPress?: (item: any) => void;
}) {
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

          try {
            await setLastSession({ type: 'soundscape', id: item.id });
          } catch {}
          navigation.navigate('JourneyPlayer', { trackId: item.id });
        }}
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
              right: 10,
              top: 10,
              paddingVertical: 6,
              paddingHorizontal: 10,
              borderRadius: 12,
              borderWidth: 1,
              borderColor: pressed ? 'rgba(255,255,255,0.10)' : 'rgba(255,255,255,0.06)',
              backgroundColor: isCached ? 'rgba(207,195,224,0.14)' : 'rgba(207,195,224,0.10)',
              opacity: isWorking ? 0.74 : pressed ? 0.95 : 0.92,
            })}
          >
            <Text
              style={{
                fontFamily: 'Inter-ExtraLight',
                fontSize: 10,
                letterSpacing: 0.65,
                textTransform: 'uppercase',
                color: 'rgba(245,242,255,0.92)',
                textShadowColor: 'rgba(0,0,0,0.35)',
                textShadowOffset: { width: 0, height: 1 },
                textShadowRadius: 3,
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

        <Text style={[Typography.title, { color: '#EDE8FA' }]}>{item.title}</Text>
        {'description' in item && !!item.description && (
          <Text
            style={[
              Body.regular,
              {
                fontFamily: 'Inter-ExtraLight',
                color: 'rgba(237,232,250,0.85)',
                marginTop: 4,
                lineHeight: 20,
                letterSpacing: 0.2,
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
                width: 46,
                height: 46,
                borderRadius: 23,
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
                style={{ width: 22, height: 22, opacity: 0.92 }}
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
  const navigation = useNavigation();

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

  const winH = Dimensions.get('window').height;
  // Reserve space for header + category stack + margins; ensure reasonable min height
  const listMaxHeight = Math.max(180, winH - (Math.max(insets.top + 8, 24) + LIST_HEIGHT + 220));
  // --- Swipe LEFT on header to go Home (race pan + fling) ---
  const { width: SCREEN_W } = Dimensions.get('window');
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

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      {/* Header gesture strip: swipe LEFT to return Home */}
      <GestureDetector gesture={headerGesture}>
        <View
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            height: Math.max(insets.top + 120, 140),
            zIndex: 100,
            backgroundColor: 'transparent',
          }}
        />
      </GestureDetector>
    <ImageBackground
      source={require('../assets/images/soundscapes-bg-expanded.png')}
      style={styles.container}
      fadeDuration={0}
      resizeMode="cover"
    >
      {/* subtle top/bottom vignette so cards and text read */}
      <LinearGradient
        colors={['rgba(0,0,0,0.35)', 'rgba(0,0,0,0.0)', 'rgba(0,0,0,0.55)']}
        style={StyleSheet.absoluteFill}
        locations={[0, 0.5, 1]}
        pointerEvents="none"
      />


      <View style={[styles.topDock, { paddingTop: Math.max(insets.top + 8, 24) }]}> 
        {/* Header */}
        <View style={styles.header}>
          <Text
            accessibilityRole="header"
            accessibilityLabel="Soundscapes"
            accessibilityHint="Swipe left on the title area to go back to Home"
            style={[Typography.display, { color: '#EFEAF9', letterSpacing: 0.3 }]}
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
                marginTop: 4,
                letterSpacing: 0.00,
                fontSize: 14,
                opacity: 0.8,
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
                right: 24,
                top: titleAnchorTop ?? 0,
                opacity: hintOpacity,
                transform: [{ translateX: hintShift }],
              }}
            >
              <Text style={{ color: '#CFC3E0', fontSize: 20, opacity: 0.95 }}>«</Text>
            </Animated.View>
          )}
        </View>

        {/* Category cards (stack of 3, then scroll) */}
        <View style={[styles.catListContainer, { height: LIST_HEIGHT }]}> 
          <SoundscapeCardList
            hasMembership={hasContinuing}
            onDeeperLockedPress={openPaywall} // legacy fallback; safePresentPaywall is used when hasMembership is provided
            onSelectCategory={(key) => {
              Haptics.selectionAsync();
              setActiveCategory(key as any);
            }}
          />
          {/* bottom fade to hint the list continues */}
          <LinearGradient
            colors={['transparent', 'rgba(0,0,0,0.35)']}
            style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 28 }}
            pointerEvents="none"
          />
        </View>

        {/* Search row (always visible) */}
        <View
          style={{
            marginTop: 24,
            marginBottom: 4,
            paddingHorizontal: 2,
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
        </View>
        {(activeCategory || searchQuery.length > 0) && (
          <View style={[styles.listWrap, { marginTop: 52 }]}>
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
              contentContainerStyle={{ gap: 10, paddingBottom: Math.max(insets.bottom, 16) }}
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
                        fontSize: 12,
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
                      />
                    </View>
                  );
                })
              )}
            </ScrollView>
            <Pressable
              onPress={() => {
                Haptics.selectionAsync();
                setActiveCategory(null);
                setSearchQuery('');
              }}
              hitSlop={10}
              style={{ alignSelf: 'flex-end', marginTop: 6 }}
            >
              <Text style={[Body.subtle, { color: '#B7B0CA', textDecorationLine: 'underline', opacity: 0.9 }]}>
                Clear
              </Text>
            </Pressable>
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
          right: 16,
          top: '47%',
          width: 48,
          height: 48,
          justifyContent: 'center',
          alignItems: 'center',
        }}
        hitSlop={12}
      >
        {/* If you later swap to an icon asset, replace this Text with an Image like in Chambers */}
        <Text
          style={{
            color: '#EDE8FA',
            fontSize: 32,
            opacity: 0.6,
            textShadowColor: 'rgba(0,0,0,0.35)',
            textShadowOffset: { width: 0, height: 1 },
            textShadowRadius: 3,
          }}
        >
          ›
        </Text>
      </Pressable>
    </ImageBackground>
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
    paddingHorizontal: 18,
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
    marginTop: 10,
    overflow: 'hidden',
  },
});