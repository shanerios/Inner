import React, {
  useEffect,
  useMemo,
  useCallback,
  useState,
  useRef,
} from 'react';
import {
  View,
  Text,
  Pressable,
  Animated,
  Easing,
  FlatList,
  Dimensions,
  Modal,
  Platform,
  StyleSheet,
  ScrollView,
  ViewToken,
} from 'react-native';
import { useVideoPlayer, VideoView } from 'expo-video';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import * as Haptics from 'expo-haptics';
import { usePostHog } from 'posthog-react-native';
import Purchases, { CustomerInfo } from 'react-native-purchases';

import { setLastSession } from '../core/session';
import { useOfflineAsset } from '../core/useOfflineAsset';
import { Typography } from '../core/typography';
import { Body as _Body } from '../core/typography';
import { usePrecacheTracks } from '../hooks/usePrecacheTracks';
import { CHAMBER_ENVIRONMENTS, ChamberEnvId } from '../theme/chamberEnvironments';
import { isLockedTrack } from '../src/core/subscriptions/accessPolicy';
import { chamberReleaseManifest } from '../src/content/chamberReleaseManifest';
import { getReleaseCountdownLabel } from '../src/content/releaseUtils';
import { safePresentPaywall } from '../src/core/subscriptions/safePresentPaywall';
import { TRACKS, TrackMeta } from '../data/tracks';

const Body = _Body ?? ({
  regular: { fontFamily: 'Inter-ExtraLight', fontSize: 14 },
  subtle: { fontFamily: 'Inter-ExtraLight', fontSize: 10 },
} as const);

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');

const ENTITLEMENT_ID = 'continuing_with_inner';

// Chambers info modal content (restored for ? button on entry page)
const CHAMBERS_INFO = {
  howToTitle: 'What are Chambers?',
  howToBody: `Chambers are not sessions to complete.\n\nThey are places to return to.\n\n\nEach Chamber is designed to be experienced more than once — often many times. The first listens help your body and mind learn the space. Over time, stillness becomes familiar, and the sounds begin to work on deeper layers of attention.\n\n\nThere's no rush to move forward.\n\nNothing to unlock.\n\n\nMost people stay with a single Chamber until they can remain present through it without effort — until the space feels known. When a Chamber no longer feels like it's offering something new, that's usually the signal to go deeper.\n\n\nSome people return to the same Chamber for weeks. Others move sooner. Both are natural.\n\n\nListen in the way that feels right to you.\n\nThe Chambers will meet you where you are.`,
  whatAreTitle: 'What are Chambers For?',
  whatAreBody: `Over time, the Chambers are designed to help you develop the ability to remain still, aware, and present — even as your inner experience deepens.\n\n\nAs familiarity grows, many people notice that their attention becomes steadier, their inner imagery clearer, and their sense of separation softens. For some, this leads to profound states of insight, expanded awareness, or experiences that feel beyond the physical body.\n\n\nThere's no expectation to reach any particular state.\n\nStillness itself is the foundation.\n\n\nWhen the body is calm and the mind is quiet, deeper experiences tend to arise naturally — without force.\n\n\nThe Chambers don't create these experiences.\n\nThey create the conditions where they can occur.`,
  closeLabel: 'Not Now',
  okLabel: 'OK',
  nextLabel: 'Next',
  backLabel: 'Back',
} as const;

// Ordinal labels for header display
const ORDINALS = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX'];

// One-line descriptors pulled from old CHAMBERS array
const CHAMBER_DESCRIPTORS: Record<ChamberEnvId, string> = {
  chamber_one:   'Begin the descent. Your first threshold.',
  chamber_two:   'Feed the inner fire. Ignite awareness.',
  chamber_three: 'The boundary dissolves. Step through.',
  chamber_four:  'Feel everything resonate. Let go.',
  chamber_five:  'What you already know.',
  chamber_six:   'Reveals more over time.',
  chamber_seven: 'The light after the veil.',
  chamber_eight: 'No path, only presence.',
  chamber_nine:  'What remains is you.',
};

// Video sources — keyed by ChamberEnvId
const CHAMBER_VIDEOS: Record<ChamberEnvId, any> = {
  chamber_one:   require('../assets/videos/chamber_one_bg.mp4'),
  chamber_two:   require('../assets/videos/chamber_two_bg.mp4'),
  chamber_three: require('../assets/videos/chamber_three_bg.mp4'),
  chamber_four:  require('../assets/videos/chamber_four_bg.mp4'),
  chamber_five:  require('../assets/videos/chamber_five_bg.mp4'),
  chamber_six:   require('../assets/videos/chamber_six_bg.mp4'),
  chamber_seven: require('../assets/videos/chamber_seven_bg.mp4'),
  chamber_eight: require('../assets/videos/chamber_eight_bg.mp4'),
  chamber_nine:  require('../assets/videos/chamber_nine_bg.mp4'),
};

// Chamber IDs in descent order
const CHAMBER_IDS: ChamberEnvId[] = [
  'chamber_one',
  'chamber_two',
  'chamber_three',
  'chamber_four',
  'chamber_five',
  'chamber_six',
  'chamber_seven',
  'chamber_eight',
  'chamber_nine',
];

// Build chamber page data once
type ChamberPageData = {
  id: ChamberEnvId;
  index: number;       // 0-based
  ordinal: string;     // 'I' … 'IX'
  title: string;
  descriptor: string;
  track: TrackMeta | undefined;
  isPremium: boolean;
  comingSoon: boolean;
  countdownLabel?: string;
};

function buildChamberData(): ChamberPageData[] {
  const now = new Date();
  return CHAMBER_IDS.map((id, i) => {
    const env = CHAMBER_ENVIRONMENTS[id];
    const track = TRACKS.find(t => t.id === id);
    const meta = chamberReleaseManifest?.[id as any];
    let comingSoon = false;
    let countdownLabel: string | undefined;

    if (meta) {
      const released =
        meta.isPublished &&
        (!meta.releaseDate || new Date(meta.releaseDate).getTime() <= now.getTime());
      if (!released) {
        comingSoon = true;
        if (meta.releaseDate) {
          countdownLabel = getReleaseCountdownLabel(meta.releaseDate, now) ?? undefined;
        }
      }
    }

    return {
      id,
      index: i,
      ordinal: ORDINALS[i],
      title: env.title,
      descriptor: CHAMBER_DESCRIPTORS[id],
      track,
      isPremium: i >= 4, // chambers 5–9 (index 4–8)
      comingSoon,
      countdownLabel,
    };
  });
}

const CHAMBER_DATA = buildChamberData();

// Discriminated union for FlatList — entry page + 9 chamber pages
type PagerItem =
  | { kind: 'entry'; id: '__entry__' }
  | { kind: 'chamber'; id: ChamberEnvId; data: ChamberPageData };

const PAGER_DATA: PagerItem[] = [
  { kind: 'entry', id: '__entry__' },
  ...CHAMBER_DATA.map((d): PagerItem => ({ kind: 'chamber', id: d.id, data: d })),
];

// ---------------------------------------------------------------------------
// EntryPage — atmospheric intro, index 0 in pager
// ---------------------------------------------------------------------------

type EntryPageProps = {
  isActive: boolean;
  screenFocused: boolean;
  onInfo: () => void;
  onGoHome: () => void;
  insets: { top: number; bottom: number; left: number; right: number };
};

const EntryPage = React.memo(function EntryPage({ isActive, screenFocused, onInfo, onGoHome, insets }: EntryPageProps) {
  const videoPlayer = useVideoPlayer(
    require('../assets/images/chamber_revamp.mp4'),
    player => {
      player.loop = true;
      player.muted = true;
      // Muted decorative video must not claim exclusive AVAudioSession ownership —
      // the default 'doNotMix' mode fights TrackPlayer's session on background/lock.
      player.audioMixingMode = 'mixWithOthers';
    }
  );

  const returnOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (isActive && screenFocused) {
      videoPlayer.play();
    } else {
      videoPlayer.pause();
    }
  }, [isActive, screenFocused]);

  useEffect(() => {
    Animated.sequence([
      Animated.timing(returnOpacity, { toValue: 1.0, duration: 400, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      Animated.delay(1200),
      Animated.timing(returnOpacity, { toValue: 0.85, duration: 700, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      Animated.timing(returnOpacity, { toValue: 1.0, duration: 700, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      Animated.timing(returnOpacity, { toValue: 0.45, duration: 1000, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
    ]).start();
  }, []);

  return (
    <View style={{ width: SCREEN_W, height: SCREEN_H }}>
      {/* Video background */}
      <VideoView
        player={videoPlayer}
        contentFit="cover"
        style={StyleSheet.absoluteFill}
        nativeControls={false}
        allowsFullscreen={false}
        allowsPictureInPicture={false}
      />

      {/* Gradient overlay */}
      <LinearGradient
        colors={['rgba(0,0,0,0.45)', 'rgba(0,0,0,0.0)', 'rgba(0,0,0,0.55)']}
        locations={[0, 0.45, 1]}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />

      {/* RETURN — centered, matches ChamberPage style */}
      <Animated.View
        style={{ position: 'absolute', top: insets.top + 14, left: 0, right: 0, alignItems: 'center', zIndex: 10, opacity: returnOpacity }}
        pointerEvents="box-none"
      >
        <Pressable onPress={onGoHome} hitSlop={14} accessibilityRole="button" accessibilityLabel="Return home">
          <Text style={{ fontFamily: 'Inter-ExtraLight', fontSize: 12, letterSpacing: 2, color: 'rgba(237,232,250,0.7)', textTransform: 'uppercase' }}>Return</Text>
        </Pressable>
      </Animated.View>

      {/* ? button — top right */}
      <Pressable
        onPress={onInfo}
        hitSlop={12}
        accessibilityRole="button"
        accessibilityLabel="About Chambers"
        accessibilityHint="Opens information on what Chambers are and how to use them"
        style={{
          position: 'absolute',
          top: insets.top + 12,
          right: 16,
          width: 36,
          height: 36,
          borderRadius: 18,
          backgroundColor: 'rgba(0,0,0,0.30)',
          borderWidth: 1,
          borderColor: 'rgba(255,255,255,0.12)',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 10,
        }}
      >
        <Text style={{ fontFamily: 'Inter-ExtraLight', color: '#EDEAF6', fontSize: 18, lineHeight: 18 }}>?</Text>
      </Pressable>

      {/* Title + subtitle — anchored to bottom negative space */}
      <View
        style={{
          position: 'absolute',
          bottom: insets.bottom + 52,
          left: 0,
          right: 0,
          alignItems: 'center',
        }}
        pointerEvents="none"
      >
        <Text
          style={{
            fontFamily: 'CalSans-SemiBold',
            fontSize: 36,
            color: '#F3EDE7',
            letterSpacing: 0.4,
            textShadowColor: 'rgba(0,0,0,0.55)',
            textShadowOffset: { width: 0, height: 1 },
            textShadowRadius: 8,
          }}
        >
          The Chambers
        </Text>
        <Text
          style={{
            fontFamily: 'Inter-ExtraLight',
            fontSize: 13,
            letterSpacing: 1.5,
            color: 'rgba(237,232,250,0.45)',
            marginTop: 10,
            textTransform: 'uppercase',
            textShadowColor: 'rgba(0,0,0,0.4)',
            textShadowOffset: { width: 0, height: 1 },
            textShadowRadius: 4,
          }}
        >
          Swipe up to descend
        </Text>
      </View>
    </View>
  );
});

// ---------------------------------------------------------------------------
// ChamberPage — owns its own video player
// ---------------------------------------------------------------------------

type ChamberPageProps = {
  item: ChamberPageData;
  isActive: boolean;
  screenFocused: boolean;
  isLocked: boolean;
  onEnter: (id: ChamberEnvId, title: string) => void;
  onPaywall: (label: string) => void;
  onGoHome: () => void;
  insets: { top: number; bottom: number; left: number; right: number };
};

const ChamberPage = React.memo(function ChamberPage({ item, isActive, screenFocused, isLocked, onEnter, onPaywall, onGoHome, insets }: ChamberPageProps) {
  const env = CHAMBER_ENVIRONMENTS[item.id];
  const { isCached, isWorking, progress, download, remove } = useOfflineAsset(item.id, 'chamber');

  const videoPlayer = useVideoPlayer(CHAMBER_VIDEOS[item.id], player => {
    player.loop = true;
    player.muted = true;
    // Muted decorative video must not claim exclusive AVAudioSession ownership —
    // the default 'doNotMix' mode fights TrackPlayer's session on background/lock.
    player.audioMixingMode = 'mixWithOthers';
  });

  // Play only when this page is the active visible one AND the screen is focused
  useEffect(() => {
    if (isActive && screenFocused) {
      videoPlayer.play();
    } else {
      videoPlayer.pause();
    }
  }, [isActive, screenFocused]);

  const handleEnter = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    onEnter(item.id, item.title);
  };

  const handlePaywall = () => {
    Haptics.selectionAsync().catch(() => {});
    onPaywall(item.title);
  };

  const locked = isLocked || item.comingSoon;

  return (
    <View style={{ width: SCREEN_W, height: SCREEN_H }}>
      {/* Video background */}
      <VideoView
        player={videoPlayer}
        contentFit="cover"
        style={StyleSheet.absoluteFill}
        nativeControls={false}
        allowsFullscreen={false}
        allowsPictureInPicture={false}
      />

      {/* Gradient overlay for readability */}
      <LinearGradient
        colors={['rgba(0,0,0,0.55)', 'rgba(0,0,0,0.0)', 'rgba(0,0,0,0.65)']}
        locations={[0, 0.45, 1]}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />

      {/* Return home */}
      <Pressable
        onPress={() => {
          Haptics.selectionAsync().catch(() => {});
          onGoHome();
        }}
        hitSlop={14}
        accessibilityRole="button"
        accessibilityLabel="Return home"
        style={{
          position: 'absolute',
          top: insets.top + 14,
          left: 0,
          right: 0,
          alignItems: 'center',
          zIndex: 10,
        }}
      >
        <Text
          style={{
            fontFamily: 'Inter-ExtraLight',
            fontSize: 12,
            letterSpacing: 2,
            color: 'rgba(237,232,250,0.5)',
            textTransform: 'uppercase',
          }}
        >
          Return
        </Text>
      </Pressable>

      {/* Top area — chamber number, title, descriptor */}
      <View
        style={{
          position: 'absolute',
          top: insets.top + 52,
          left: 28,
          right: 56, // leave room for download icon
        }}
      >
        <Text
          style={{
            fontFamily: 'Inter-ExtraLight',
            fontSize: 11,
            letterSpacing: 3,
            color: env.accent,
            textTransform: 'uppercase',
            marginBottom: 10,
            textShadowColor: 'rgba(0,0,0,0.6)',
            textShadowOffset: { width: 0, height: 1 },
            textShadowRadius: 4,
          }}
        >
          Chamber {item.ordinal}
        </Text>
        <Text
          style={{
            fontFamily: 'CalSans-SemiBold',
            fontSize: 30,
            color: '#F3EDE7',
            letterSpacing: 0.3,
            lineHeight: 36,
            textShadowColor: 'rgba(0,0,0,0.55)',
            textShadowOffset: { width: 0, height: 1 },
            textShadowRadius: 6,
          }}
        >
          {item.title}
        </Text>
        <Text
          style={{
            fontFamily: 'Inter-ExtraLight',
            fontSize: 13,
            color: 'rgba(237,232,250,0.70)',
            marginTop: 8,
            lineHeight: 19,
            textShadowColor: 'rgba(0,0,0,0.5)',
            textShadowOffset: { width: 0, height: 1 },
            textShadowRadius: 4,
          }}
          numberOfLines={2}
        >
          {item.countdownLabel ?? item.descriptor}
        </Text>
      </View>

      {/* Download icon — top right, unlocked only */}
      {!locked && (
        <Pressable
          onPress={isCached ? remove : download}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel={isCached ? 'Remove offline audio' : 'Download for offline'}
          style={{
            position: 'absolute',
            top: insets.top + 52,
            right: 20,
            width: 34,
            height: 34,
            borderRadius: 17,
            backgroundColor: 'rgba(0,0,0,0.35)',
            borderWidth: 1,
            borderColor: 'rgba(255,255,255,0.12)',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {isWorking ? (
            <Text style={{ color: env.accent, fontSize: 11, fontFamily: 'Inter-ExtraLight' }}>
              {Math.round(progress * 100)}%
            </Text>
          ) : (
            <Text style={{ color: isCached ? env.accent : 'rgba(255,255,255,0.55)', fontSize: 16 }}>
              {isCached ? '✓' : '↓'}
            </Text>
          )}
        </Pressable>
      )}

      {/* Bottom area — Enter or locked treatment */}
      <View
        style={{
          position: 'absolute',
          bottom: insets.bottom + 40,
          left: 28,
          right: 28,
        }}
      >
        {locked ? (
          <View style={{ alignItems: 'center' }}>
            <Text
              style={{
                fontFamily: 'Inter-ExtraLight',
                fontSize: 12,
                letterSpacing: 2,
                color: 'rgba(237,232,250,0.35)',
                textTransform: 'uppercase',
                marginBottom: 16,
                textShadowColor: 'rgba(0,0,0,0.4)',
                textShadowOffset: { width: 0, height: 1 },
                textShadowRadius: 4,
              }}
            >
              {item.comingSoon ? (item.countdownLabel ?? 'Coming soon') : 'The descent continues'}
            </Text>
            {!item.comingSoon && (
              <Pressable
                onPress={handlePaywall}
                accessibilityRole="button"
                accessibilityLabel="Continue with Inner"
                style={({ pressed }) => ({
                  paddingVertical: 14,
                  paddingHorizontal: 32,
                  borderRadius: 999,
                  backgroundColor: pressed
                    ? 'rgba(207,195,224,0.22)'
                    : 'rgba(207,195,224,0.12)',
                  borderWidth: 1,
                  borderColor: 'rgba(207,195,224,0.28)',
                  alignItems: 'center',
                  minWidth: 200,
                })}
              >
                <Text
                  style={{
                    fontFamily: 'CalSans-SemiBold',
                    fontSize: 15,
                    color: 'rgba(237,232,250,0.80)',
                    letterSpacing: 0.3,
                  }}
                >
                  Continue with Inner
                </Text>
              </Pressable>
            )}
          </View>
        ) : (
          <Pressable
            onPress={handleEnter}
            accessibilityRole="button"
            accessibilityLabel={`Enter ${item.title}`}
            style={({ pressed }) => ({
              paddingVertical: 16,
              borderRadius: 999,
              backgroundColor: pressed
                ? 'rgba(255,255,255,0.18)'
                : 'rgba(255,255,255,0.10)',
              borderWidth: 1,
              borderColor: 'rgba(255,255,255,0.22)',
              alignItems: 'center',
            })}
          >
            <Text
              style={{
                fontFamily: 'CalSans-SemiBold',
                fontSize: 16,
                color: '#F3EDE7',
                letterSpacing: 0.4,
              }}
            >
              Enter
            </Text>
          </Pressable>
        )}
      </View>
    </View>
  );
});

// ---------------------------------------------------------------------------
// PageIndicator — 9 dots, right edge, vertically centered
// ---------------------------------------------------------------------------

// chamberIndex is 0-based chamber index (0 = Chamber 1, …, 8 = Chamber 9).
// Pass -1 when the entry page is visible — no dot will be highlighted.
function PageIndicator({
  chamberIndex,
  insets,
}: {
  chamberIndex: number;
  insets: { right: number };
}) {
  return (
    <View
      pointerEvents="none"
      style={{
        position: 'absolute',
        right: Math.max(insets.right + 8, 12),
        top: 0,
        bottom: 0,
        justifyContent: 'center',
        alignItems: 'center',
        gap: 7,
      }}
    >
      {CHAMBER_IDS.map((id, i) => {
        const env = CHAMBER_ENVIRONMENTS[id];
        const active = i === chamberIndex;
        return (
          <View
            key={id}
            style={{
              width: active ? 6 : 4,
              height: active ? 6 : 4,
              borderRadius: 4,
              backgroundColor: active ? env.accent : 'rgba(255,255,255,0.28)',
              opacity: active ? 1 : 0.7,
            }}
          />
        );
      })}
    </View>
  );
}

// ---------------------------------------------------------------------------
// ChambersScreen
// ---------------------------------------------------------------------------

export default function ChambersScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const posthog = usePostHog();

  // Pre-cache a few chambers for faster first play
  usePrecacheTracks({ kind: ['chamber'], limit: 3 });

  // --- Entitlement ---
  const [hasContinuing, setHasContinuing] = useState(false);
  const [checkingEntitlement, setCheckingEntitlement] = useState(true);
  const [presentingPaywall, setPresentingPaywall] = useState(false);

  const refreshEntitlement = useCallback(async () => {
    try {
      setCheckingEntitlement(true);
      const info: CustomerInfo = await Purchases.getCustomerInfo();
      const active = Boolean(info?.entitlements?.active?.[ENTITLEMENT_ID]);
      setHasContinuing(active);
    } catch {
      setHasContinuing(false);
    } finally {
      setCheckingEntitlement(false);
    }
  }, []);

  useEffect(() => {
    refreshEntitlement();
  }, [refreshEntitlement]);

  // --- Info modal (? button on entry page) ---
  const [showInfo, setShowInfo] = useState(false);
  const [infoStep, setInfoStep] = useState<0 | 1>(0);

  const openInfo = useCallback(() => {
    setInfoStep(0);
    setShowInfo(true);
    Haptics.selectionAsync().catch(() => {});
  }, []);

  const closeInfo = useCallback(() => {
    setShowInfo(false);
    Haptics.selectionAsync().catch(() => {});
  }, []);

  const openPaywall = useCallback((_label?: string) => {
    if (presentingPaywall) return;
    setPresentingPaywall(true);
    setTimeout(() => {
      safePresentPaywall(() => {
        refreshEntitlement();
      }, 'chamber').finally(() => setPresentingPaywall(false));
    }, Platform.OS === 'ios' ? 400 : 200);
  }, [presentingPaywall, refreshEntitlement]);

  // --- Portal fade veil ---
  const portalFade = useRef(new Animated.Value(0)).current;

  // Track screen focus so child video players pause when we navigate away
  const [screenFocused, setScreenFocused] = useState(true);

  useFocusEffect(useCallback(() => {
    setScreenFocused(true);
    portalFade.setValue(0.52);
    Animated.timing(portalFade, {
      toValue: 0,
      duration: 1150,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start();
    return () => { setScreenFocused(false); };
  }, [portalFade]));

  // --- Current visible index ---
  const [currentIndex, setCurrentIndex] = useState(0);
  const currentIndexRef = useRef(0);

  const viewabilityConfig = useRef({
    itemVisiblePercentThreshold: 50,
  });

  const onViewableItemsChanged = useRef(
    ({ viewableItems }: { viewableItems: ViewToken[] }) => {
      if (viewableItems.length > 0 && viewableItems[0].index != null) {
        const idx = viewableItems[0].index;
        setCurrentIndex(idx);
        currentIndexRef.current = idx;
      }
    }
  );

  const goHome = useCallback(() => {
    // @ts-ignore
    navigation.navigate('Home');
  }, [navigation]);

  const listRef = useRef<FlatList<PagerItem>>(null);

  // --- Enter chamber ---
  const isPremiumChamber = useCallback((id: ChamberEnvId) => {
    return id === 'chamber_five' ||
      id === 'chamber_six' ||
      id === 'chamber_seven' ||
      id === 'chamber_eight' ||
      id === 'chamber_nine';
  }, []);

  const enterChamber = useCallback((id: ChamberEnvId, title: string) => {
    const pseudoTrack = { id, isPremium: isPremiumChamber(id) };
    if (isLockedTrack(pseudoTrack as any, hasContinuing)) {
      openPaywall(title);
      return;
    }

    posthog.capture('chamber_opened', {
      chamber_id: id,
      chamber_title: title,
      is_premium: isPremiumChamber(id),
      has_subscription: hasContinuing,
    });

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});

    try { setLastSession({ type: 'journey', id }); } catch {}

    portalFade.setValue(0);
    Animated.timing(portalFade, {
      toValue: 1,
      duration: 200,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start(() => {
      // @ts-ignore
      navigation.navigate('JourneyPlayer', { trackId: id, chamber: title });
    });
  }, [hasContinuing, isPremiumChamber, openPaywall, posthog, portalFade, navigation]);

  // Resolve locked state per chamber
  const isLockedForIndex = useCallback((item: ChamberPageData): boolean => {
    const pseudoTrack = { id: item.id, isPremium: item.isPremium };
    return isLockedTrack(pseudoTrack as any, hasContinuing) || item.comingSoon;
  }, [hasContinuing]);

  const renderItem = useCallback(({ item, index }: { item: PagerItem; index: number }) => {
    if (item.kind === 'entry') {
      return (
        <EntryPage
          isActive={index === currentIndex}
          screenFocused={screenFocused}
          onInfo={openInfo}
          onGoHome={goHome}
          insets={insets}
        />
      );
    }
    return (
      <ChamberPage
        item={item.data}
        isActive={index === currentIndex}
        screenFocused={screenFocused}
        isLocked={isLockedForIndex(item.data)}
        onEnter={enterChamber}
        onPaywall={openPaywall}
        onGoHome={goHome}
        insets={insets}
      />
    );
  }, [currentIndex, screenFocused, isLockedForIndex, enterChamber, openPaywall, goHome, openInfo, insets]);

  const keyExtractor = useCallback((item: PagerItem) => item.id, []);

  return (
    <View style={styles.container}>
      <FlatList
        ref={listRef}
        data={PAGER_DATA}
        keyExtractor={keyExtractor}
        renderItem={renderItem}
        horizontal={false}
        pagingEnabled
        showsVerticalScrollIndicator={false}
        bounces={true}
        decelerationRate="fast"
        viewabilityConfig={viewabilityConfig.current}
        onViewableItemsChanged={onViewableItemsChanged.current}
        initialNumToRender={2}
        maxToRenderPerBatch={2}
        windowSize={3}
        getItemLayout={(_data, index) => ({
          length: SCREEN_H,
          offset: SCREEN_H * index,
          index,
        })}
      />


      {/* Page indicator — right edge (entry page = index 0, so chamberIndex = currentIndex - 1) */}
      <PageIndicator chamberIndex={currentIndex - 1} insets={insets} />

      {/* Portal crossfade veil */}
      <Animated.View
        pointerEvents="none"
        style={[
          StyleSheet.absoluteFill,
          { opacity: portalFade, backgroundColor: 'rgba(10,8,14,0.88)' },
        ]}
      />

      {/* Chambers Info Modal — triggered by ? button on entry page */}
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
              style={{
                paddingBottom: Math.max(insets.bottom + 18, 24),
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
                style={{ maxHeight: SCREEN_H * 0.58 }}
                contentContainerStyle={{ paddingBottom: 6, flexGrow: 1 }}
                showsVerticalScrollIndicator={false}
              >
                <Text style={{ color: 'rgba(220,185,100,0.95)', fontSize: 18, fontWeight: '600', fontFamily: 'CalSans-SemiBold', marginBottom: 16 }}>
                  {infoStep === 0 ? CHAMBERS_INFO.howToTitle : CHAMBERS_INFO.whatAreTitle}
                </Text>
                <Text
                  style={{
                    fontFamily: 'Inter-ExtraLight',
                    fontSize: 13,
                    lineHeight: 20,
                    color: 'rgba(255,255,255,0.65)',
                    marginBottom: 12,
                  }}
                >
                  {infoStep === 0 ? CHAMBERS_INFO.howToBody : CHAMBERS_INFO.whatAreBody}
                </Text>
              </ScrollView>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 18 }}>
                {infoStep === 1 ? (
                  <Pressable
                    onPress={() => setInfoStep(0)}
                    hitSlop={10}
                    style={{
                      paddingVertical: 10,
                      paddingHorizontal: 20,
                      borderRadius: 6,
                      borderWidth: 1,
                      borderColor: 'rgba(255,255,255,0.1)',
                      alignItems: 'center',
                    }}
                  >
                    <Text style={{ fontFamily: 'Inter-ExtraLight', color: 'rgba(255,255,255,0.6)', fontSize: 13 }}>
                      {CHAMBERS_INFO.backLabel}
                    </Text>
                  </Pressable>
                ) : (
                  <Pressable
                    onPress={closeInfo}
                    hitSlop={10}
                    style={{
                      paddingVertical: 10,
                      paddingHorizontal: 20,
                      borderRadius: 6,
                      borderWidth: 1,
                      borderColor: 'rgba(255,255,255,0.1)',
                      alignItems: 'center',
                    }}
                  >
                    <Text style={{ fontFamily: 'Inter-ExtraLight', color: 'rgba(255,255,255,0.6)', fontSize: 13 }}>
                      {CHAMBERS_INFO.closeLabel}
                    </Text>
                  </Pressable>
                )}
                {infoStep === 0 ? (
                  <Pressable
                    onPress={() => setInfoStep(1)}
                    hitSlop={10}
                    style={{
                      paddingVertical: 10,
                      paddingHorizontal: 20,
                      borderRadius: 6,
                      borderWidth: 1,
                      borderColor: 'rgba(200,160,80,0.6)',
                      backgroundColor: 'rgba(180,140,80,0.15)',
                      minWidth: 80,
                      alignItems: 'center',
                    }}
                  >
                    <Text style={{ fontFamily: 'CalSans-SemiBold', color: 'rgba(220,185,100,1)', fontSize: 13 }}>
                      {CHAMBERS_INFO.nextLabel}
                    </Text>
                  </Pressable>
                ) : (
                  <Pressable
                    onPress={closeInfo}
                    hitSlop={10}
                    style={{
                      paddingVertical: 10,
                      paddingHorizontal: 20,
                      borderRadius: 6,
                      borderWidth: 1,
                      borderColor: 'rgba(200,160,80,0.6)',
                      backgroundColor: 'rgba(180,140,80,0.15)',
                      minWidth: 80,
                      alignItems: 'center',
                    }}
                  >
                    <Text style={{ fontFamily: 'CalSans-SemiBold', color: 'rgba(220,185,100,1)', fontSize: 13 }}>
                      {CHAMBERS_INFO.okLabel}
                    </Text>
                  </Pressable>
                )}
              </View>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a080e',
  },
});
