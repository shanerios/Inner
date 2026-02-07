import React, { useEffect, useMemo, useCallback, useState } from 'react';
import Purchases, { CustomerInfo } from 'react-native-purchases';
import RevenueCatUI from 'react-native-purchases-ui';
import { ImageBackground, StyleSheet, View, Text, Pressable, Animated, Easing, FlatList, Dimensions, Modal, Image } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import * as Haptics from 'expo-haptics';
import { setLastSession } from '../core/session';
import { useOfflineAsset } from '../core/useOfflineAsset';
import { Typography } from '../core/typography';


import { usePrecacheTracks } from '../hooks/usePrecacheTracks';

import { Body as _Body } from '../core/typography';
import { chamberEnvironments } from '../theme/chamberEnvironments';

import { Gesture, GestureDetector, Directions, GestureHandlerRootView } from 'react-native-gesture-handler';

const Body = _Body ?? ({
  regular: { fontFamily: 'Inter-ExtraLight', fontSize: 14 },
  subtle: { fontFamily: 'Inter-ExtraLight', fontSize: 10 },
} as const);

const CHAMBERS = [
  { id: 'chamber_one',   label: 'Chamber 1 • Outer Sanctum',         colors: ['#1b1017', '#5a3b2e'] },
  { id: 'chamber_two',   label: 'Chamber 2 • Inner Flame',           colors: ['#0f1c2d', '#3c4a6e'] },
  { id: 'chamber_three', label: 'Chamber 3 • Horizon Gate',          colors: ['#24171a', '#6a3a2c'] },
  { id: 'chamber_four',  label: 'Chamber 4 • Resonance Field',       colors: ['#0e1a1f', '#205055'] },
  { id: 'chamber_five',  label: 'Chamber 5 • Remembrance Code',      colors: ['#171314', '#5b4a26'] },
  { id: 'chamber_six',   label: 'Chamber 6 • Transcendence Veil',    colors: ['#171b2a', '#364a6a'] },
  { id: 'chamber_seven', label: 'Chamber 7 • Return to Light',       colors: ['#20161c', '#51352a'] },
  { id: 'chamber_eight', label: 'Chamber 8 • Free Flow Corridor',    colors: ['#1a1a24', '#3a3a6a'] },
  { id: 'chamber_nine',  label: 'Chamber 9 • Inquiry Gate (Mirror)', colors: ['#1f1b14', '#5a4d2e'] },
];

// --- Chambers Info ---
const CHAMBERS_INFO = {
  // Step 1
  howToTitle: 'What are Chambers?',
  howToBody: `Chambers are not sessions to complete.

They are places to return to.


Each Chamber is designed to be experienced more than once — often many times. The first listens help your body and mind learn the space. Over time, stillness becomes familiar, and the sounds begin to work on deeper layers of attention.


There’s no rush to move forward.

Nothing to unlock.


Most people stay with a single Chamber until they can remain present through it without effort — until the space feels known. When a Chamber no longer feels like it’s offering something new, that’s usually the signal to go deeper.


Some people return to the same Chamber for weeks. Others move sooner. Both are natural.


Listen in the way that feels right to you.

The Chambers will meet you where you are.`,

  // Step 2
  whatAreTitle: 'What are Chambers For?',
  whatAreBody: `Over time, the Chambers are designed to help you develop the ability to remain still, aware, and present — even as your inner experience deepens.


As familiarity grows, many people notice that their attention becomes steadier, their inner imagery clearer, and their sense of separation softens. For some, this leads to profound states of insight, expanded awareness, or experiences that feel beyond the physical body.


There’s no expectation to reach any particular state.

Stillness itself is the foundation.


When the body is calm and the mind is quiet, deeper experiences tend to arise naturally — without force.


The Chambers don’t create these experiences.

They create the conditions where they can occur.`,

  closeLabel: 'Not Now',
  okLabel: 'OK',
  nextLabel: 'Next',
  backLabel: 'Back',
} as const;


function toTrackId(tileId: string) {
  // accept dashes/underscores/numerals and normalize to our track ids
  const id = tileId.replace(/-/g, '_').toLowerCase();
  if (id === 'chamber1' || id === 'chamber_1') return 'chamber_one';
  if (id === 'chamber2' || id === 'chamber_2') return 'chamber_two';
  if (id === 'chamber3' || id === 'chamber_3') return 'chamber_three';
  if (id === 'chamber4' || id === 'chamber_4') return 'chamber_four';
  if (id === 'chamber5' || id === 'chamber_5') return 'chamber_five';
  if (id === 'chamber6' || id === 'chamber_6') return 'chamber_six';
  if (id === 'chamber7' || id === 'chamber_7') return 'chamber_seven';
  return id; // already normalized
}

function ChamberRow({
  item,
  onEnter,
  isLocked,
}: {
  item: { id: string; label: string; colors: string[] };
  onEnter: (trackId: string, title?: string) => void;
  isLocked: boolean;
}) {
  const navigation = useNavigation();
  const chamberId = toTrackId(item.id);
  const env = chamberEnvironments[chamberId];
  const { isCached, isWorking, progress, download, remove } = useOfflineAsset(chamberId, 'chamber');

  return (
    <View style={{ marginBottom: 10 }}>
      <Tile
        label={item.label}
        onPress={async () => {
          Haptics.selectionAsync();
          const trackId = chamberId;
          try {
            await setLastSession({ type: 'journey', id: trackId });
          } catch {}
          onEnter(trackId, item.label);
        }}
        colors={item.colors}
        backgroundSource={(env as any)?.backgroundImage ?? (env as any)?.background}
        locked={isLocked}
        offline={
          isLocked
            ? undefined
            : {
                isCached,
                isWorking,
                progress,
                onDownload: download,
                onRemove: remove,
                label: item.label,
              }
        }
      />
    </View>
  );
}

export default function ChambersScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();

  // --- Paywall / gating ---
  // NOTE: Ensure this matches your RevenueCat entitlement identifier.
  // Common examples: "pro", "premium", "continuing_with_inner".
  const ENTITLEMENT_ID = 'continuing_with_inner';

  const [hasContinuing, setHasContinuing] = useState(false);
  const [checkingEntitlement, setCheckingEntitlement] = useState(true);
  const [presentingPaywall, setPresentingPaywall] = useState(false);

  const refreshEntitlement = useCallback(async () => {
    try {
      setCheckingEntitlement(true);
      const info: CustomerInfo = await Purchases.getCustomerInfo();
      const active = Boolean(info?.entitlements?.active?.[ENTITLEMENT_ID]);
      setHasContinuing(active);
    } catch (e) {
      // If anything fails, default to locked (safe).
      setHasContinuing(false);
    } finally {
      setCheckingEntitlement(false);
    }
  }, []);

  useEffect(() => {
    refreshEntitlement();
  }, [refreshEntitlement]);

  const [showGate, setShowGate] = useState(false);
  const [gateLabel, setGateLabel] = useState<string>('');

  const openGate = useCallback((label: string) => {
    setGateLabel(label);
    setShowGate(true);
    Haptics.selectionAsync().catch(() => {});
  }, []);

  const closeGate = useCallback(() => {
    setShowGate(false);
    Haptics.selectionAsync().catch(() => {});
  }, []);

  const openPaywall = useCallback(async () => {
    if (presentingPaywall) return;
    try {
      setPresentingPaywall(true);
      // Present RevenueCat paywall (same approach used in Settings)
      const result = await RevenueCatUI.presentPaywall();
      console.log('[PAYWALL] presentPaywall result:', result);
    } catch (e) {
      console.log('[PAYWALL] Failed to present paywall:', e);
    } finally {
      // Refresh entitlement regardless; if user purchased, this will unlock.
      await refreshEntitlement();
      setPresentingPaywall(false);
      setShowGate(false);
    }
  }, [presentingPaywall, refreshEntitlement]);

  const DEBUG_GESTURES = __DEV__;
  const debugLog = React.useCallback((...args: any[]) => {
    if (DEBUG_GESTURES) console.log(...args);
  }, [DEBUG_GESTURES]);

  // One-time gesture hint (right-swipe on title)
  const HINT_KEY = 'inner.hint.chambersSwipeRightSeen';
  const [showHint, setShowHint] = React.useState(false);
  const hintOpacity = React.useRef(new Animated.Value(0)).current;
  const hintShift = React.useRef(new Animated.Value(0)).current; // positive = right
  const [titleAnchorTop, setTitleAnchorTop] = React.useState<number | null>(null);

  // Chambers Info modal state
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

  React.useEffect(() => {
    let mounted = true;
    let interval: any;

    setShowHint(true);

    const runPulse = () => {
      Animated.sequence([
        Animated.timing(hintOpacity, { toValue: 1, duration: 280, easing: Easing.out(Easing.quad), useNativeDriver: true }),
        Animated.loop(
          Animated.sequence([
            Animated.timing(hintShift, { toValue: 8, duration: 400, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
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

  const { width: SCREEN_W } = Dimensions.get('window');
  const SWIPE_THRESHOLD = Math.max(36, SCREEN_W * 0.08); // ~8% width
  const EDGE_GUARD = 10; // slightly smaller edge guard
  const startXRef = React.useRef(0);
  const listRef = React.useRef<FlatList<any>>(null);
  const native = React.useMemo(() => Gesture.Native(), []);

  // Pre-cache a few chambers for faster first play
  usePrecacheTracks({ kind: ['chamber'], limit: 3 });

  // Portal veil for premium transition into JourneyPlayer
  const portalFade = React.useRef(new Animated.Value(0)).current;
  // Ambient fog drift (very subtle)
  const fogA = React.useRef(new Animated.Value(0)).current;
  const fogB = React.useRef(new Animated.Value(0)).current;
  const fogATranslateX = fogA.interpolate({ inputRange: [0, 1], outputRange: [-18, 18] });
  const fogATranslateY = fogA.interpolate({ inputRange: [0, 1], outputRange: [-6, 6] });
  const fogAOpacity = fogA.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0.06, 0.15, 0.06] });
  const fogBTranslateX = fogB.interpolate({ inputRange: [0, 1], outputRange: [22, -22] });
  const fogBTranslateY = fogB.interpolate({ inputRange: [0, 1], outputRange: [8, -8] });
  const fogBOpacity = fogB.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0.04, 0.12, 0.04] });
  // Ensure veil gently unveils whenever this screen regains focus (e.g., after closing JourneyPlayer)
  useFocusEffect(React.useCallback(() => {
    // start slightly dim, then fade to clear for a soft return
    portalFade.setValue(0.52);
    Animated.timing(portalFade, {
      toValue: 0,
      duration: 1150,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start();
    return () => {};
  }, [portalFade]));

  React.useEffect(() => {
    const a = Animated.loop(
      Animated.sequence([
        Animated.timing(fogA, { toValue: 1, duration: 14000, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(fogA, { toValue: 0, duration: 14000, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ])
    );
    const b = Animated.loop(
      Animated.sequence([
        Animated.timing(fogB, { toValue: 1, duration: 18000, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(fogB, { toValue: 0, duration: 18000, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ])
    );

    a.start();
    b.start();

    return () => {
      a.stop();
      b.stop();
    };
  }, [fogA, fogB]);

  useEffect(() => {
    if (listRef.current) {
      debugLog('[CHAMBERS] listRef attached');
    }
  }, [debugLog]);

  const isPremiumChamber = useCallback((trackId: string) => {
    // Chambers 1–4 free; 5–9 gated
    return (
      trackId === 'chamber_five' ||
      trackId === 'chamber_six' ||
      trackId === 'chamber_seven' ||
      trackId === 'chamber_eight' ||
      trackId === 'chamber_nine'
    );
  }, []);

  const enterChamber = (trackId: string, title?: string) => {
    // Gate Chambers 5–9 if user is not entitled
    if (isPremiumChamber(trackId) && !hasContinuing) {
      openGate(title ?? 'This Chamber');
      return;
    }

    // gentle haptic
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    // fade up veil, then navigate
    portalFade.setValue(0);
    Animated.timing(portalFade, {
      toValue: 1,
      duration: 200,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start(() => {
      // @ts-ignore
      navigation.navigate('JourneyPlayer', { trackId, chamber: title });
      // JourneyPlayer handles its own unveil as audio primes
    });
  };

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
          debugLog('[CHAMBERS PAN] startX =', startXRef.current);
        })
        .onBegin(() => { debugLog('[CHAMBERS PAN] begin'); })
        .onUpdate(async (e) => {
          // @ts-ignore
          const dx = (e as any).translationX ?? 0; // + right, - left
          debugLog('[CHAMBERS PAN] dx =', dx);
          const startX = startXRef.current;
          if (startX < EDGE_GUARD || startX > SCREEN_W - EDGE_GUARD) return;
          if (dx >= SWIPE_THRESHOLD) {
            debugLog('[CHAMBERS PAN] navigating → Home (update)');
            try { await Haptics.selectionAsync(); } catch {}
            navigation.navigate('Home' as never);
          }
        })
        .onEnd(async (e) => {
          // @ts-ignore
          const dx = (e as any).translationX ?? 0;
          debugLog('[CHAMBERS PAN] end dx =', dx);
          const startX = startXRef.current;
          if (startX < EDGE_GUARD || startX > SCREEN_W - EDGE_GUARD) return;
          if (dx >= SWIPE_THRESHOLD) {
            debugLog('[CHAMBERS PAN] navigating → Home (end)');
            try { await Haptics.selectionAsync(); } catch {}
            navigation.navigate('Home' as never);
          }
        }),
    [SCREEN_W, navigation, debugLog]
  );

  // Fallback quick fling right → Home
  const flingRight = useMemo(
    () =>
      Gesture.Fling()
        .runOnJS(true)
        .simultaneousWithExternalGesture(native)
        .direction(Directions.RIGHT)
        .numberOfPointers(1)
        .onStart(async (e) => {
          // @ts-ignore
          const absX = (e as any).absoluteX ?? 0;
          if (absX < EDGE_GUARD || absX > SCREEN_W - EDGE_GUARD) return;
          debugLog('[CHAMBERS FLING RIGHT] navigating → Home');
          try { await Haptics.selectionAsync(); } catch {}
          navigation.navigate('Home' as never);
        }),
    [SCREEN_W, navigation, debugLog]
  );

  // Diagnostic tap: should always fire on touch (for debugging recognition)
  const tapDiag = useMemo(
    () =>
      Gesture.Tap()
        .runOnJS(true)
        .maxDuration(9999)
        .onStart(() => {
          debugLog('[CHAMBERS TAP] touch detected');
        }),
    [debugLog]
  );

  const gesture = useMemo(
    () => (DEBUG_GESTURES ? Gesture.Race(tapDiag, panToHome, flingRight) : Gesture.Race(panToHome, flingRight)),
    [DEBUG_GESTURES, tapDiag, panToHome, flingRight]
  );

  // --- Header-only gesture strip (guaranteed capture in top area) ---
  const headerPan = useMemo(
    () =>
      Gesture.Pan()
        .runOnJS(true)
        .activeOffsetX([-6, 6])
        .minDistance(8)
        .onStart((e) => {
          // @ts-ignore
          startXRef.current = (e as any).absoluteX ?? 0;
          debugLog('[CHAMBERS HEADER PAN] startX =', startXRef.current);
        })
        .onUpdate(async (e) => {
          // @ts-ignore
          const dx = (e as any).translationX ?? 0;
          debugLog('[CHAMBERS HEADER PAN] dx =', dx);
          const startX = startXRef.current;
          if (startX < EDGE_GUARD || startX > SCREEN_W - EDGE_GUARD) return;
          if (dx >= SWIPE_THRESHOLD) {
            debugLog('[CHAMBERS HEADER PAN] navigating → Home (update)');
            try { await Haptics.selectionAsync(); } catch {}
            navigation.navigate('Home' as never);
          }
        })
        .onEnd(async (e) => {
          // @ts-ignore
          const dx = (e as any).translationX ?? 0;
          debugLog('[CHAMBERS HEADER PAN] end dx =', dx);
          const startX = startXRef.current;
          if (startX < EDGE_GUARD || startX > SCREEN_W - EDGE_GUARD) return;
          if (dx >= SWIPE_THRESHOLD) {
            debugLog('[CHAMBERS HEADER PAN] navigating → Home (end)');
            try { await Haptics.selectionAsync(); } catch {}
            navigation.navigate('Home' as never);
          }
        }),
    [SCREEN_W, navigation, debugLog]
  );

  const headerFling = useMemo(
    () =>
      Gesture.Fling()
        .runOnJS(true)
        .direction(Directions.RIGHT)
        .numberOfPointers(1)
        .onStart(async (e) => {
          // @ts-ignore
          const absX = (e as any).absoluteX ?? 0;
          if (absX < EDGE_GUARD || absX > SCREEN_W - EDGE_GUARD) return;
          debugLog('[CHAMBERS HEADER FLING] navigating → Home');
          try { await Haptics.selectionAsync(); } catch {}
          navigation.navigate('Home' as never);
        }),
    [SCREEN_W, navigation, debugLog]
  );

  const headerGesture = useMemo(() => Gesture.Race(headerPan, headerFling), [headerPan, headerFling]);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <GestureDetector gesture={headerGesture}>
        <View
        accessible={false}
        importantForAccessibility="no"
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 72,
            height: Math.max(insets.top + 120, 140),
            zIndex: 100,
            // transparent touch-capture strip
            backgroundColor: 'transparent',
          }}
        />
      </GestureDetector>
      <GestureDetector gesture={gesture}>
        <ImageBackground
        accessible={false}
        importantForAccessibility={showInfo ? 'no-hide-descendants' : 'auto'}
        accessibilityElementsHidden={showInfo}
        source={require('../assets/images/chambers-bg-expanded.png')}
        style={styles.container}
        fadeDuration={0}
        resizeMode="cover"
      >
        <LinearGradient
        accessible={false}
        importantForAccessibility="no"
          colors={['rgba(0,0,0,0.42)', 'rgba(0,0,0,0.0)', 'rgba(0,0,0,0.55)']}
          style={StyleSheet.absoluteFill}
          locations={[0, 0.5, 1]}
        />

        {/* Ambient fog drift (subtle, environment-only) */}
        <Animated.View
          pointerEvents="none"
          accessible={false}
          importantForAccessibility="no"
          style={[
            StyleSheet.absoluteFill,
            {
              opacity: fogAOpacity,
              transform: [{ translateX: fogATranslateX }, { translateY: fogATranslateY }],
            },
          ]}
        >
          <LinearGradient
            colors={['rgba(255,255,255,0.00)', 'rgba(255,255,255,0.20)', 'rgba(255,255,255,0.00)']}
            locations={[0, 0.5, 1]}
            start={{ x: 0, y: 0.35 }}
            end={{ x: 1, y: 0.65 }}
            style={StyleSheet.absoluteFill}
          />
        </Animated.View>

        <Animated.View
          pointerEvents="none"
          accessible={false}
          importantForAccessibility="no"
          style={[
            StyleSheet.absoluteFill,
            {
              opacity: fogBOpacity,
              transform: [{ translateX: fogBTranslateX }, { translateY: fogBTranslateY }],
            },
          ]}
        >
          <LinearGradient
            colors={['rgba(255,255,255,0.00)', 'rgba(255,255,255,0.16)', 'rgba(255,255,255,0.00)']}
            locations={[0, 0.5, 1]}
            start={{ x: 1, y: 0.25 }}
            end={{ x: 0, y: 0.75 }}
            style={StyleSheet.absoluteFill}
          />
        </Animated.View>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back to Home"
          accessibilityHint="Returns to the Home screen"
          onPress={() => { Haptics.selectionAsync(); /* @ts-ignore */ navigation.navigate('Home'); }}
                  style={{ position: 'absolute', left: 16, top: '45%', width: 48, height: 48, justifyContent: 'center', alignItems: 'center' }}
                  hitSlop={12}
        >
          <Text style={{ color: '#EDE8FA', fontSize: 32, opacity: 0.6 }}>‹</Text>
        </Pressable>

        <View style={[styles.header, { paddingTop: Math.max(insets.top + 8, 20) }] }>
          <Text
            accessibilityRole="header"
            accessibilityLabel="Chambers"
            accessibilityHint="Swipe right on the title area to go back to Home"
            style={[Typography.display, { color: '#F3EDE7', letterSpacing: 0.2 }]}
            onLayout={(e) => {
              const { y, height } = e.nativeEvent.layout;
              // place chevron ~25% down from the title’s top
              setTitleAnchorTop(y + height * 0.25);
            }}
          >
            Chambers
          </Text>
          <View style={{ alignItems: 'center', marginTop: 4 }}>
            <Text style={[Body.regular, { color: 'rgba(217,207,198,0.72)', fontSize: 12, letterSpacing: 0.25 }]}>
              Guided journeys • Deeper states
            </Text>
            <Text style={[Body.regular, { color: 'rgba(217,207,198,0.45)', fontSize: 12, letterSpacing: 0.35, marginTop: 2 }]}>
              Return
            </Text>
          </View>

          {/* Info button */}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="About Chambers"
            accessibilityHint="Opens information on what Chambers are and how to use them"
            onPress={openInfo}
            hitSlop={12}
            style={{
              position: 'absolute',
              right: 12,
              top: insets.top + 8,
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

          {/* One-time gesture hint: subtle right chevron pulse */}
          {showHint && (
            <Animated.View
              pointerEvents="none"
              style={{
                position: 'absolute',
                left: 24,
                top: titleAnchorTop ?? 60,
                opacity: hintOpacity,
                transform: [{ translateX: hintShift }],
              }}
            >
              <Text
                style={{
                  color: '#CFC3E0',
                  fontSize: 20,
                  opacity: 0.6,
                  textShadowColor: 'rgba(0,0,0,0.35)',
                  textShadowOffset: { width: 0, height: 1 },
                  textShadowRadius: 3,
                }}
              >
                »
              </Text>
            </Animated.View>
          )}
        </View>

        <FlatList
          ref={listRef}
          simultaneousHandlers={[]}
          data={CHAMBERS}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => {
            const chamberId = toTrackId(item.id);
            const locked = isPremiumChamber(chamberId) && !hasContinuing;
            return <ChamberRow item={item} onEnter={enterChamber} isLocked={locked} />;
          }}
          showsVerticalScrollIndicator={false}
          accessibilityRole="list"
          accessibilityLabel="Chambers list"
          accessibilityHint="Swipe to browse Chambers. Double tap a Chamber to open it."
          // Viewport shows ~3 tiles; user can scroll for more
          style={styles.list}
          contentContainerStyle={{ paddingBottom: Math.max(insets.bottom + 12, 20), gap: 12 }}
        />

        {/* Portal crossfade veil (pre-navigation) */}
        <Animated.View
        accessible={false}
        importantForAccessibility="no"
          pointerEvents="none"
          style={[
            StyleSheet.absoluteFill,
            {
              opacity: portalFade,
              backgroundColor: 'rgba(10,8,14,0.88)',
            },
          ]}
        />

        {/* Premium Gate Modal (Chambers 5–9) */}
        <Modal
          visible={showGate}
          transparent
          animationType="fade"
          onRequestClose={closeGate}
          presentationStyle="overFullScreen"
          statusBarTranslucent
          accessibilityViewIsModal
        >
          <Pressable
            style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.70)', justifyContent: 'flex-end' }}
            onPress={closeGate}
          >
            <Pressable
              onPress={() => {}}
              style={{
                paddingBottom: Math.max(insets.bottom + 18, 24),
                paddingTop: 18,
                paddingHorizontal: 18,
                borderTopLeftRadius: 22,
                borderTopRightRadius: 22,
                backgroundColor: 'rgba(12,10,18,0.96)',
                borderTopWidth: 1,
                borderColor: 'rgba(255,255,255,0.10)',
              }}
            >
              <Text style={[Typography.title, { color: '#F3EDE7', letterSpacing: 0.2 }]}>Continue with Inner</Text>

              <Text
                style={{
                  fontFamily: 'Inter-ExtraLight',
                  fontSize: 14,
                  lineHeight: 20,
                  color: 'rgba(237,232,250,0.88)',
                  marginTop: 12,
                }}
              >
                {gateLabel ? `${gateLabel} is part of the deeper Chambers.` : 'This Chamber is part of the deeper Chambers.'}
                {'\n\n'}
                Continue with Inner to enter.
              </Text>

              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 16 }}>
                <Pressable
                  onPress={closeGate}
                  hitSlop={10}
                  style={{
                    paddingVertical: 10,
                    paddingHorizontal: 12,
                    borderRadius: 12,
                    borderWidth: 1,
                    borderColor: 'rgba(255,255,255,0.10)',
                    backgroundColor: 'rgba(207,195,224,0.06)',
                  }}
                >
                  <Text style={{ fontFamily: 'Inter-ExtraLight', color: 'rgba(237,232,250,0.92)', letterSpacing: 0.2 }}>Not now</Text>
                </Pressable>

                <Pressable
                  onPress={openPaywall}
                  disabled={presentingPaywall}
                  hitSlop={10}
                  style={{
                    paddingVertical: 10,
                    paddingHorizontal: 14,
                    borderRadius: 12,
                    backgroundColor: 'rgba(207,195,224,0.16)',
                    borderWidth: 1,
                    borderColor: 'rgba(255,255,255,0.12)',
                    minWidth: 160,
                    alignItems: 'center',
                  }}
                >
                  <Text style={{ fontFamily: 'CalSans-SemiBold', color: '#F3EDE7', letterSpacing: 0.2 }}>
                    {presentingPaywall ? 'Opening…' : 'Continue with Inner'}
                  </Text>
                </Pressable>
              </View>

              {checkingEntitlement ? (
                <Text
                  style={{
                    marginTop: 12,
                    fontFamily: 'Inter-ExtraLight',
                    fontSize: 12,
                    color: 'rgba(237,232,250,0.55)',
                  }}
                >
                  Checking access…
                </Text>
              ) : null}
            </Pressable>
          </Pressable>
        </Modal>

        {/* Chambers Info Modal */}
        <Modal
        visible={showInfo}
        transparent
        animationType="fade"
        onRequestClose={closeInfo}
        presentationStyle="overFullScreen"
        statusBarTranslucent
        accessibilityViewIsModal
        >
          <Pressable
            style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.62)', justifyContent: 'flex-end' }}
            onPress={closeInfo}
          >
            <Pressable
            onPress={() => {}}
            accessible={true}
            accessibilityRole="summary"
            accessibilityLabel={infoStep === 0 ? 'Chambers information. Step 1 of 2.' : 'Chambers information. Step 2 of 2.'}
            style={{
                paddingBottom: Math.max(insets.bottom + 18, 24),
                paddingTop: 18,
                paddingHorizontal: 18,
                borderTopLeftRadius: 22,
                borderTopRightRadius: 22,
                backgroundColor: 'rgba(12,10,18,0.96)',
                borderTopWidth: 1,
                borderColor: 'rgba(255,255,255,0.10)',
              }}
            >
              <Text style={[Typography.title, { color: '#F3EDE7', letterSpacing: 0.2, textAlign: 'left' }]}
              >
                {infoStep === 0 ? CHAMBERS_INFO.howToTitle : CHAMBERS_INFO.whatAreTitle}
              </Text>

              <Text
                style={{
                  fontFamily: 'Inter-ExtraLight',
                  fontSize: 11,
                  lineHeight: 14,
                  color: 'rgba(237,232,250,0.5)',
                  letterSpacing: 0.6,
                  textTransform: 'uppercase',
                  marginTop: 6,
                }}
              >
                {infoStep === 0 ? 'Step 1 of 2' : 'Step 2 of 2'}
              </Text>

              <Text
                style={{
                  fontFamily: 'Inter-ExtraLight',
                  fontSize: 14,
                  lineHeight: 20,
                  color: 'rgba(237,232,250,0.88)',
                  marginTop: 12,
                }}
              >
                {infoStep === 0 ? CHAMBERS_INFO.howToBody : CHAMBERS_INFO.whatAreBody}
              </Text>

              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: infoStep === 0 ? 'space-between' : 'flex-end',
                  marginTop: 16,
                }}
              >
                {infoStep === 0 && (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={CHAMBERS_INFO.closeLabel}
                    accessibilityHint="Closes this information sheet"
                    onPress={closeInfo}
                    hitSlop={10}
                    style={{
                      paddingVertical: 10,
                      paddingHorizontal: 12,
                      borderRadius: 12,
                      borderWidth: 1,
                      borderColor: 'rgba(255,255,255,0.10)',
                      backgroundColor: 'rgba(207,195,224,0.06)',
                    }}
                  >
                    <Text style={{ fontFamily: 'Inter-ExtraLight', color: 'rgba(237,232,250,0.92)', letterSpacing: 0.2 }}>
                      {CHAMBERS_INFO.closeLabel}
                    </Text>
                  </Pressable>
                )}

                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  {infoStep === 1 && (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={CHAMBERS_INFO.backLabel}
                      accessibilityHint="Returns to the previous step"
                      onPress={() => setInfoStep(0)}
                      hitSlop={10}
                      style={{
                        paddingVertical: 10,
                        paddingHorizontal: 12,
                        borderRadius: 12,
                        borderWidth: 1,
                        borderColor: 'rgba(255,255,255,0.10)',
                        backgroundColor: 'rgba(207,195,224,0.06)',
                      }}
                    >
                      <Text style={{ fontFamily: 'Inter-ExtraLight', color: 'rgba(237,232,250,0.92)', letterSpacing: 0.2 }}>
                        {CHAMBERS_INFO.backLabel}
                      </Text>
                    </Pressable>
                  )}

                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={infoStep === 0 ? CHAMBERS_INFO.nextLabel : CHAMBERS_INFO.okLabel}
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
                      paddingHorizontal: 14,
                      borderRadius: 12,
                      backgroundColor: 'rgba(207,195,224,0.16)',
                      borderWidth: 1,
                      borderColor: 'rgba(255,255,255,0.12)',
                      minWidth: 92,
                      alignItems: 'center',
                    }}
                  >
                    <Text style={{ fontFamily: 'CalSans-SemiBold', color: '#F3EDE7', letterSpacing: 0.2 }}>
                      {infoStep === 0 ? CHAMBERS_INFO.nextLabel : CHAMBERS_INFO.okLabel}
                    </Text>
                  </Pressable>
                </View>
              </View>
            </Pressable>
          </Pressable>
        </Modal>
        </ImageBackground>
      </GestureDetector>
    </GestureHandlerRootView>
  );
}

function Tile({
  label,
  onPress,
  colors,
  backgroundSource,
  offline,
  locked,
}: {
  label: string;
  onPress: () => void;
  colors: string[];
  backgroundSource?: any;
  offline?: {
    isCached: boolean;
    isWorking: boolean;
    progress: number;
    onDownload: () => void;
    onRemove: () => void;
    label: string;
  };
  locked?: boolean;
}) {
  // Locked gate icon (PNG) + subtle pulse
  // NOTE: Create this file: `assets/images/locked_gate.png` (transparent background).
  const lockPng = React.useMemo(() => {
    try {
      return require('../assets/images/locked_gate.png');
    } catch {
      return null;
    }
  }, []);

  const lockPulse = React.useRef(new Animated.Value(0)).current;
  const lockOpacity = lockPulse.interpolate({ inputRange: [0, 1], outputRange: [0.55, 0.82] });
  const lockScale = lockPulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.07] });

  React.useEffect(() => {
    if (!locked) {
      lockPulse.stopAnimation();
      lockPulse.setValue(0);
      return;
    }

    // Very subtle, slow pulse (barely noticeable)
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(lockPulse, {
          toValue: 1,
          duration: 3000,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(lockPulse, {
          toValue: 0,
          duration: 3000,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ])
    );

    // Small desync so multiple locks don't breathe in unison
    const jitter = 150 + Math.floor(Math.random() * 500);
    const t = setTimeout(() => loop.start(), jitter);

    return () => {
      clearTimeout(t);
      loop.stop();
    };
  }, [locked, lockPulse]);

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.tile,
        {
          opacity: pressed ? 0.96 : 1,
          transform: [{ scale: pressed ? 0.992 : 1 }],
          borderColor: pressed ? 'rgba(255,255,255,0.14)' : 'rgba(255,255,255,0.08)',
        },
      ]}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint="Opens this Chamber"
      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
    >
      {backgroundSource ? (
        <ImageBackground
          source={backgroundSource}
          style={styles.tileFill}
          imageStyle={{ borderRadius: 14 }}
          resizeMode="cover"
          fadeDuration={0}
          accessible={false}
          importantForAccessibility="no"
        >
          {/* soft veil for legibility */}
          <View
            pointerEvents="none"
            accessible={false}
            importantForAccessibility="no"
            style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.30)' }]}
          />
          {/* inner vignette (edges darker → center clearer) */}
          <LinearGradient
            pointerEvents="none"
            colors={['rgba(0,0,0,0.34)', 'rgba(0,0,0,0.00)', 'rgba(0,0,0,0.34)']}
            locations={[0, 0.5, 1]}
            start={{ x: 0, y: 0.5 }}
            end={{ x: 1, y: 0.5 }}
            style={StyleSheet.absoluteFill}
          />
          {/* bottom lift for title */}
          <LinearGradient
            pointerEvents="none"
            colors={['rgba(0,0,0,0.00)', 'rgba(0,0,0,0.40)']}
            start={{ x: 0.5, y: 0 }}
            end={{ x: 0.5, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
        </ImageBackground>
      ) : (
        <>
          <LinearGradient
            colors={[colors[0], colors[1], 'transparent']}
            locations={[0, 0.82, 1]}
            start={{ x: 0, y: 0.5 }}
            end={{ x: 1, y: 0.5 }}
            style={styles.tileFill}
            accessible={false}
            importantForAccessibility="no"
          />
          <LinearGradient
            pointerEvents="none"
            colors={['rgba(0,0,0,0.28)', 'rgba(0,0,0,0.00)', 'rgba(0,0,0,0.28)']}
            locations={[0, 0.5, 1]}
            start={{ x: 0, y: 0.5 }}
            end={{ x: 1, y: 0.5 }}
            style={StyleSheet.absoluteFill}
          />
          <LinearGradient
            pointerEvents="none"
            colors={['rgba(0,0,0,0.00)', 'rgba(0,0,0,0.36)']}
            start={{ x: 0.5, y: 0 }}
            end={{ x: 0.5, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
        </>
      )}
      {/* Locked overlay and lock icon */}
      {locked ? (
        <View
          pointerEvents="none"
          accessible={false}
          importantForAccessibility="no"
          style={[
            StyleSheet.absoluteFill,
            {
              backgroundColor: 'rgba(10, 8, 14, 0.40)',
              justifyContent: 'center',
              alignItems: 'center',
            },
          ]}
        >
          <View
            style={{
              width: 34,
              height: 34,
              borderRadius: 17,
              backgroundColor: 'rgba(0,0,0,0.30)',
              borderWidth: 1,
              borderColor: 'rgba(245,242,255,0.14)',
              justifyContent: 'center',
              alignItems: 'center',
            }}
          >
            <Animated.View style={{ opacity: lockOpacity, transform: [{ scale: lockScale }] }}>
              {lockPng ? (
                <Image
                  source={lockPng}
                  style={{
                    width: 16,
                    height: 16,
                    opacity: 0.92,
                    tintColor: 'rgba(245,242,255,0.92)',
                  }}
                  resizeMode="contain"
                />
              ) : (
                <Text style={{ fontSize: 16, opacity: 0.82 }}>🔒</Text>
              )}
            </Animated.View>
          </View>
        </View>
      ) : null}
      {offline ? (
        <Pressable
          disabled={offline.isWorking}
          onPress={(e) => {
            // prevent tile open when tapping offline control
            // @ts-ignore
            e?.stopPropagation?.();
            if (offline.isCached) offline.onRemove();
            else offline.onDownload();
            Haptics.selectionAsync().catch(() => {});
          }}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel={
            offline.isCached
              ? `Remove offline cache for ${offline.label}`
              : `Download ${offline.label} for offline use`
          }
          accessibilityHint={
            offline.isCached
              ? 'Removes the offline file for this Chamber'
              : 'Downloads this Chamber for offline use'
          }
          accessibilityState={{ disabled: offline.isWorking }}
          style={({ pressed }) => ({
            position: 'absolute',
            right: 12,
            top: 12,
            paddingVertical: 6,
            paddingHorizontal: 10,
            borderRadius: 12,
            borderWidth: 1,
            borderColor: pressed ? 'rgba(255,255,255,0.10)' : 'rgba(255,255,255,0.06)',
            backgroundColor: offline.isCached
              ? 'rgba(207,195,224,0.14)'
              : 'rgba(207,195,224,0.10)',
            opacity: offline.isWorking ? 0.72 : pressed ? 0.95 : 0.92,
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
            {offline.isWorking
              ? `Caching… ${Math.round(offline.progress * 100)}%`
              : offline.isCached
              ? 'Offline'
              : 'Save'}
          </Text>
        </Pressable>
      ) : null}
      <Text
        style={[
          Typography.title,
          {
            color: '#F7F0E9',
            position: 'absolute',
            left: 14,
            bottom: 12,
            right: 84,
            letterSpacing: 0.2,
            opacity: locked ? 0.78 : 1,
          },
        ]}
        numberOfLines={1}
      >
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  backButton: {
    position: 'absolute',
    left: 18,
    top: '50%',
    transform: [{ translateY: -14 }],
    zIndex: 10,
  },
  header: {
    position: 'absolute',
    top: 28,
    left: 18,
    right: 18,
    alignItems: 'center',
    zIndex: 200,
    elevation: 20,
  },
  list: {
    position: 'absolute',
    left: 18,
    right: 18,
    bottom: 32,
    height: 300, // ~3 tiles (3*86 + gaps)
  },
  tile: {
    flex: 1,
    height: 86,
    borderRadius: 14,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    marginBottom: 0,
  },
  tileFill: { ...StyleSheet.absoluteFillObject },
});