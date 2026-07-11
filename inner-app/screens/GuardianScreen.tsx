import React, { useCallback, useRef, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  Image,
  StyleSheet,
  Animated,
  Easing,
  BackHandler,
  useWindowDimensions,
} from 'react-native';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useFocusEffect } from '@react-navigation/native';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const GUARDIAN_SIGIL = require('../assets/images/guardian_active.png');

const GUARDIANS = [
  { num: 1, roman: 'I',   name: 'RECOGNITION', sigilPct: 0.50 },
  { num: 2, roman: 'II',  name: 'STABILITY',   sigilPct: 0.23 },
  { num: 3, roman: 'III', name: 'DEPTH',        sigilPct: 0.76 },
  { num: 4, roman: 'IV',  name: 'PROTECTOR',   sigilPct: 0.01 },
  { num: 5, roman: 'V',   name: 'RETROACTIVE', sigilPct: 0.99 },
] as const;

type GuardianNum = typeof GUARDIANS[number]['num'];

function getTracksForGuardian(num: GuardianNum) {
  return [
    { id: `guardian_${num}_cultivation`, title: 'Cultivation', locked: num !== 1 },
    { id: `guardian_${num}_calibration`, title: 'Calibration', locked: true },
    { id: `guardian_${num}_field`,       title: 'Field',        locked: true },
  ];
}

const FADE = 400;
const SWITCH_OUT = 150;
const SWITCH_IN  = 250;

export default function GuardianScreen({ navigation }: any) {
  const insets = useSafeAreaInsets();
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const screenWidthRef = useRef(screenWidth);
  screenWidthRef.current = screenWidth;

  const [activeGuardian, setActiveGuardian] = useState<GuardianNum | null>(null);
  const isDetailRef = useRef(false);
  const [lockedFlash, setLockedFlash] = useState<string | null>(null);

  // Animated values
  const chambersLabelOpacity = useRef(new Animated.Value(1)).current;
  const detailHeaderOpacity  = useRef(new Animated.Value(0)).current;
  const sigilOpacity         = useRef(new Animated.Value(0)).current;
  const sigilTranslateX      = useRef(new Animated.Value(0)).current;
  const trackListOpacity     = useRef(new Animated.Value(0)).current;
  const trackListTranslateY  = useRef(new Animated.Value(24)).current;

  // Header text — updated immediately on switch so it's correct after fade-in
  const [headerGuardian, setHeaderGuardian] = useState<typeof GUARDIANS[number] | null>(null);
  const [displayTracks, setDisplayTracks] = useState(getTracksForGuardian(1));

  // --- Video ---
  const bgPlayer = useVideoPlayer(require('../assets/videos/guardian_screen.mp4'), player => {
    player.loop = true;
    player.muted = true;
    // Muted decorative video must not claim exclusive AVAudioSession ownership —
    // the default 'doNotMix' mode fights TrackPlayer's session on background/lock.
    player.audioMixingMode = 'mixWithOthers';
    player.play();
  });

  useFocusEffect(
    useCallback(() => {
      bgPlayer.play();
      return () => { bgPlayer.pause(); };
    }, [bgPlayer])
  );

  // --- Hardware back ---
  useFocusEffect(
    useCallback(() => {
      const sub = BackHandler.addEventListener('hardwareBackPress', () => {
        if (isDetailRef.current) { transitionToChamber(); return true; }
        return false;
      });
      return () => sub.remove();
    }, [])
  );

  // --- Transitions ---
  const sigilTargetX = (pct: number) => (pct - 0.5) * screenWidthRef.current;

  const transitionToGuardian = (num: GuardianNum) => {
    const guardian = GUARDIANS.find(g => g.num === num)!;
    const targetX  = sigilTargetX(guardian.sigilPct);
    Haptics.selectionAsync().catch(() => {});

    if (!isDetailRef.current) {
      // Entering detail from chamber view
      isDetailRef.current = true;
      setActiveGuardian(num);
      setHeaderGuardian(guardian);
      setDisplayTracks(getTracksForGuardian(num));

      Animated.parallel([
        Animated.timing(chambersLabelOpacity, { toValue: 0, duration: FADE, useNativeDriver: true }),
        Animated.timing(detailHeaderOpacity,  { toValue: 1, duration: FADE, useNativeDriver: true }),
        Animated.timing(sigilOpacity,         { toValue: 1, duration: FADE, useNativeDriver: true }),
        Animated.timing(sigilTranslateX,      { toValue: targetX, duration: FADE, easing: Easing.inOut(Easing.cubic), useNativeDriver: true }),
        Animated.timing(trackListOpacity,     { toValue: 1, duration: FADE, useNativeDriver: true }),
        Animated.timing(trackListTranslateY,  { toValue: 0, duration: FADE, useNativeDriver: true }),
      ]).start();
    } else {
      // Switching between guardians — update state immediately, then cross-fade
      setActiveGuardian(num);
      setHeaderGuardian(guardian);
      setDisplayTracks(getTracksForGuardian(num));

      Animated.parallel([
        Animated.timing(sigilTranslateX,     { toValue: targetX, duration: FADE, easing: Easing.inOut(Easing.cubic), useNativeDriver: true }),
        Animated.timing(detailHeaderOpacity, { toValue: 0, duration: SWITCH_OUT, useNativeDriver: true }),
        Animated.timing(trackListOpacity,    { toValue: 0, duration: SWITCH_OUT, useNativeDriver: true }),
      ]).start(({ finished }) => {
        if (!finished) return;
        Animated.parallel([
          Animated.timing(detailHeaderOpacity, { toValue: 1, duration: SWITCH_IN, useNativeDriver: true }),
          Animated.timing(trackListOpacity,    { toValue: 1, duration: SWITCH_IN, useNativeDriver: true }),
        ]).start();
      });
    }
  };

  const transitionToChamber = () => {
    if (!isDetailRef.current) return;
    isDetailRef.current = false;
    Haptics.selectionAsync().catch(() => {});

    Animated.parallel([
      Animated.timing(chambersLabelOpacity, { toValue: 1, duration: FADE, useNativeDriver: true }),
      Animated.timing(detailHeaderOpacity,  { toValue: 0, duration: FADE, useNativeDriver: true }),
      Animated.timing(sigilOpacity,         { toValue: 0, duration: FADE, useNativeDriver: true }),
      Animated.timing(trackListOpacity,     { toValue: 0, duration: FADE, useNativeDriver: true }),
      Animated.timing(trackListTranslateY,  { toValue: 24, duration: FADE, useNativeDriver: true }),
    ]).start(() => {
      setActiveGuardian(null);
    });
  };

  const handleReturn = () => {
    if (isDetailRef.current) transitionToChamber();
    else navigation.navigate('Home');
  };

  const handleTrackPress = async (track: ReturnType<typeof getTracksForGuardian>[number]) => {
    if (track.locked) {
      try { await Haptics.selectionAsync(); } catch {}
      setLockedFlash(track.id);
      setTimeout(() => setLockedFlash(null), 1200);
      return;
    }
    try { await Haptics.selectionAsync(); } catch {}
    navigation.navigate('GuardianPlayer', { trackId: track.id });
  };

  return (
    <View style={styles.container}>
      <VideoView
        player={bgPlayer}
        contentFit="cover"
        style={StyleSheet.absoluteFill}
        nativeControls={false}
        allowsFullscreen={false}
        allowsPictureInPicture={false}
      />

      {/* GUARDIANS label — chamber state */}
      <Animated.Text style={[styles.chambersLabel, { opacity: chambersLabelOpacity }]}>
        GUARDIANS
      </Animated.Text>

      {/* Detail header */}
      <Animated.View
        style={[styles.detailHeader, { paddingTop: insets.top + 16, opacity: detailHeaderOpacity }]}
        pointerEvents="none"
      >
        <Text style={styles.eyebrow}>
          {headerGuardian ? `GUARDIAN ${headerGuardian.roman}` : ''}
        </Text>
        <Text style={styles.title}>
          {headerGuardian?.name ?? ''}
        </Text>
      </Animated.View>

      {/* Sigil — translates horizontally to active archway */}
      <Animated.View
        style={[
          styles.sigilWrap,
          { opacity: sigilOpacity, transform: [{ translateX: sigilTranslateX }] },
        ]}
        pointerEvents="none"
      >
        <Image
          source={GUARDIAN_SIGIL}
          style={[styles.sigil, { width: screenWidth * 0.23, height: screenWidth * 0.23 }]}
          resizeMode="contain"
        />
      </Animated.View>

      {/* Archway tap zones — sized proportionally to screen */}
      <Pressable
        onPress={() => transitionToGuardian(1)}
        accessibilityRole="button"
        accessibilityLabel="Guardian I — Recognition"
        style={[styles.archwayCenter, { width: 120, height: screenHeight * 0.26 }]}
      />
      <Pressable
        onPress={() => transitionToGuardian(2)}
        accessibilityRole="button"
        accessibilityLabel="Guardian II — Stability"
        style={[styles.archwayLeft2, { width: 100, height: screenHeight * 0.22 }]}
      />
      <Pressable
        onPress={() => transitionToGuardian(3)}
        accessibilityRole="button"
        accessibilityLabel="Guardian III — Depth"
        style={[styles.archwayRight2, { width: 100, height: screenHeight * 0.22 }]}
      />
      <Pressable
        onPress={() => transitionToGuardian(4)}
        accessibilityRole="button"
        accessibilityLabel="Guardian IV — Protector"
        style={[styles.archwayLeft1, { width: (screenWidth - 120 - 100 * 2) / 2, height: screenHeight * 0.20 }]}
      />
      <Pressable
        onPress={() => transitionToGuardian(5)}
        accessibilityRole="button"
        accessibilityLabel="Guardian V — Retroactive"
        style={[styles.archwayRight1, { width: (screenWidth - 120 - 100 * 2) / 2, height: screenHeight * 0.20 }]}
      />

      {/* Track list */}
      <Animated.View
        style={[
          styles.trackList,
          { opacity: trackListOpacity, transform: [{ translateY: trackListTranslateY }] },
        ]}
      >
        {displayTracks.map((track, idx) => (
          <View key={track.id}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={track.locked ? `${track.title} — locked` : `Play ${track.title}`}
              style={({ pressed }) => [styles.trackRow, { opacity: pressed && !track.locked ? 0.65 : 1 }]}
              onPress={() => handleTrackPress(track)}
            >
              <Text style={[styles.trackTitle, track.locked && styles.trackTitleLocked]}>
                {lockedFlash === track.id ? 'Locked' : track.title}
              </Text>
            </Pressable>
            {idx < displayTracks.length - 1 && <View style={styles.divider} />}
          </View>
        ))}
      </Animated.View>

      {/* Return */}
      <Pressable
        onPress={handleReturn}
        hitSlop={14}
        accessibilityRole="button"
        accessibilityLabel="Return"
        style={[styles.returnButton, { bottom: insets.bottom + 32 }]}
      >
        <Text style={styles.returnLabel}>Return</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0d0d1a',
  },
  chambersLabel: {
    position: 'absolute',
    top: '15%',
    alignSelf: 'center',
    fontFamily: 'CalSans-SemiBold',
    fontSize: 18,
    letterSpacing: 5,
    color: '#ffffff',
    textShadowColor: 'rgba(245,158,11,0.4)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 12,
  },
  detailHeader: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 10,
  },
  eyebrow: {
    fontFamily: 'Inter-ExtraLight',
    fontSize: 11,
    letterSpacing: 3,
    color: 'rgba(237,232,250,0.6)',
    textTransform: 'uppercase',
    marginBottom: 5,
    textShadowColor: 'rgba(0,0,0,0.8)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  title: {
    fontFamily: 'CalSans-SemiBold',
    fontSize: 18,
    letterSpacing: 5,
    color: '#ffffff',
    textShadowColor: 'rgba(245,158,11,0.4)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 12,
  },
  sigilWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: '31%',
    alignItems: 'center',
  },
  sigil: {
    opacity: 0.92,
  },

  // Archway tap zones — width/height overridden inline with proportional values
  archwayCenter: {
    position: 'absolute',
    alignSelf: 'center',
    top: '38%',
  },
  archwayLeft2: {
    position: 'absolute',
    left: '12%',
    top: '40%',
  },
  archwayRight2: {
    position: 'absolute',
    right: '12%',
    top: '40%',
  },
  archwayLeft1: {
    position: 'absolute',
    left: '2%',
    top: '42%',
  },
  archwayRight1: {
    position: 'absolute',
    right: '2%',
    top: '42%',
  },

  // Track list
  trackList: {
    position: 'absolute',
    left: '9%',
    right: '9%',
    top: '68%',
    alignItems: 'center',
  },
  trackRow: {
    alignItems: 'center',
    paddingVertical: 14,
    width: '100%',
  },
  trackTitle: {
    fontFamily: 'CalSans-SemiBold',
    fontSize: 15,
    letterSpacing: 0.2,
    color: '#EDE8FA',
    textAlign: 'center',
  },
  trackTitleLocked: {
    color: 'rgba(237,232,250,0.35)',
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    width: '100%',
    backgroundColor: 'rgba(255,255,255,0.10)',
  },
  returnButton: {
    position: 'absolute',
    alignSelf: 'center',
  },
  returnLabel: {
    fontFamily: 'Inter-ExtraLight',
    fontSize: 12,
    letterSpacing: 2,
    color: 'rgba(237,232,250,0.9)',
    textTransform: 'uppercase',
    textShadowColor: 'rgba(0,0,0,1)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 3,
  },
});
