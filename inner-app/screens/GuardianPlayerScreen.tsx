import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  BackHandler,
  PanResponder,
  useWindowDimensions,
  Animated,
  Easing,
} from 'react-native';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useFocusEffect } from '@react-navigation/native';
import TrackPlayer, {
  State,
  Event,
  IOSCategory,
  IOSCategoryOptions,
  RepeatMode,
} from 'react-native-track-player';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { TRACKS, getTrackUrl } from '../data/tracks';

function mmss(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

const GOLD         = 'rgba(220,185,100,1)';
const GOLD_BORDER  = 'rgba(200,160,80,0.6)';
const GOLD_BG      = 'rgba(180,140,80,0.15)';
const MUTED_WHITE  = 'rgba(207,195,224,0.16)';
const MUTED_BORDER = 'rgba(255,255,255,0.12)';
const TEXT_DIM     = '#B9B5C9';

const DEFAULT_DURATION_MS = 60 * 60 * 1000;

export default function GuardianPlayerScreen({ route, navigation }: any) {
  const insets = useSafeAreaInsets();
  const { width: screenWidth } = useWindowDimensions();
  const { trackId } = (route.params || {}) as { trackId?: string };

  const track = TRACKS.find(t => t.id === trackId);

  const [isPlaying, setIsPlaying] = useState(false);
  const [position, setPosition]   = useState(0);
  const [duration, setDuration]   = useState(0);
  const [seeking, setSeeking]     = useState(false);

  const overlayOpacity  = useRef(new Animated.Value(0)).current;
  const storageKey      = `playback:${trackId ?? 'guardian'}`;
  const loadedRef       = useRef(false);
  const setupDoneRef    = useRef(false);
  const durationRef     = useRef(0);
  const seekingRef      = useRef(false);
  const scrubStartPosRef = useRef(0);
  const scrubPausedRef  = useRef(false);
  const pollRef         = useRef<ReturnType<typeof setInterval> | null>(null);
  const saveIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastSavedMsRef  = useRef(-1);

  const savePosition = async (ms: number) => {
    if (ms === lastSavedMsRef.current) return;
    lastSavedMsRef.current = ms;
    try {
      await AsyncStorage.setItem(storageKey, JSON.stringify({ positionMillis: ms }));
    } catch {}
  };

  // --- Background video ---
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
        handleReturn();
        return true;
      });
      return () => sub.remove();
    }, [])
  );

  // --- TrackPlayer setup & load ---
  useEffect(() => {
    if (loadedRef.current || !track) return;
    loadedRef.current = true;

    (async () => {
      try {
        try {
          await TrackPlayer.setupPlayer({
            waitForBuffer: true,
            autoHandleInterruptions: true,
            iosCategory: IOSCategory.Playback,
            iosCategoryOptions: [
              IOSCategoryOptions.AllowBluetooth,
              IOSCategoryOptions.AllowBluetoothA2DP,
            ],
          });
        } catch (e: any) {
          if (!String(e).toLowerCase().includes('already')) throw e;
        }

        const qualityPref = await AsyncStorage.getItem('audio:quality').catch(() => null);
        const { url } = getTrackUrl({
          ...track,
          remoteLow: qualityPref === 'lq' ? track.remoteLow : undefined,
        });

        if (__DEV__) console.log('[GuardianPlayer] loading url:', url);

        await TrackPlayer.reset();
        await TrackPlayer.setVolume(1.0);
        await TrackPlayer.add({
          id: track.id,
          url,
          title: track.title,
          artist: 'Inner',
          album: 'Guardians',
        } as any);
        await TrackPlayer.setRepeatMode(RepeatMode.Off);

        // Resume saved position if present
        try {
          const raw = await AsyncStorage.getItem(storageKey);
          if (raw) {
            const { positionMillis } = JSON.parse(raw);
            if (typeof positionMillis === 'number' && positionMillis > 0) {
              await TrackPlayer.seekTo(positionMillis / 1000);
              setPosition(positionMillis);
              lastSavedMsRef.current = positionMillis;
            }
          }
        } catch {}

        await TrackPlayer.play();
        setupDoneRef.current = true;
        setIsPlaying(true);

        // Poll position + duration for scrubber display
        pollRef.current = setInterval(async () => {
          if (seekingRef.current) return;
          try {
            const pos = await TrackPlayer.getPosition();
            const dur = await TrackPlayer.getDuration();
            if (isFinite(pos) && pos >= 0) setPosition(Math.floor(pos * 1000));
            if (isFinite(dur) && dur > 0 && dur < 86400) {
              durationRef.current = Math.floor(dur * 1000);
              setDuration(Math.floor(dur * 1000));
            }
          } catch {}
        }, 500);

        // Save position every 4 seconds (matches JourneyPlayer cadence)
        saveIntervalRef.current = setInterval(async () => {
          if (seekingRef.current) return;
          try {
            const pos = await TrackPlayer.getPosition();
            if (isFinite(pos) && pos > 0) await savePosition(Math.floor(pos * 1000));
          } catch {}
        }, 4000);
      } catch (e) {
        if (__DEV__) console.log('[GuardianPlayer] setup error', e);
      }
    })();

    return () => {
      if (__DEV__) console.log('[GuardianPlayer] effect cleanup firing');
      if (pollRef.current) clearInterval(pollRef.current);
      if (saveIntervalRef.current) clearInterval(saveIntervalRef.current);
      TrackPlayer.pause().catch(() => {});
    };
  }, [track]);

  // --- Sync play state ---
  useEffect(() => {
    const errSub = TrackPlayer.addEventListener(Event.PlaybackError, (e) => {
      if (__DEV__) console.log('[GuardianPlayer] PlaybackError:', JSON.stringify(e));
    });
    const sub = TrackPlayer.addEventListener(Event.PlaybackState, ({ state }) => {
      if (__DEV__) console.log('[GuardianPlayer] PlaybackState:', state, 'setupDone:', setupDoneRef.current);
      if (!setupDoneRef.current) return;
      setIsPlaying(
        state === State.Playing ||
        state === State.Buffering ||
        (state as any) === State.Connecting
      );
    });
    return () => { try { sub.remove(); errSub.remove(); } catch {} };
  }, []);

  // --- Fade overlay in when playing, out when paused ---
  useEffect(() => {
    Animated.timing(overlayOpacity, {
      toValue: isPlaying ? 0.5 : 0,
      duration: 400,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [isPlaying, overlayOpacity]);

  // --- Garden-style drag scrubber (horizontal drag on time text) ---
  const scrubResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_, gs) =>
        Math.abs(gs.dx) > 6 && Math.abs(gs.dx) > Math.abs(gs.dy),
      onPanResponderGrant: async () => {
        scrubPausedRef.current = false;
        try {
          const posSec = await TrackPlayer.getPosition();
          scrubStartPosRef.current = Math.floor((posSec || 0) * 1000);
          const st = await TrackPlayer.getState();
          if (st === State.Playing) {
            await TrackPlayer.pause();
            scrubPausedRef.current = true;
          }
        } catch {}
        seekingRef.current = true;
        setSeeking(true);
      },
      onPanResponderMove: (_, gs) => {
        const dur = (durationRef.current && durationRef.current > 0)
          ? durationRef.current
          : DEFAULT_DURATION_MS;
        const delta = Math.round((gs.dx / screenWidth) * dur);
        const target = Math.max(0, Math.min(dur - 1, scrubStartPosRef.current + delta));
        setPosition(target);
      },
      onPanResponderRelease: async (_, gs) => {
        const dur = (durationRef.current && durationRef.current > 0)
          ? durationRef.current
          : DEFAULT_DURATION_MS;
        const delta = Math.round((gs.dx / screenWidth) * dur);
        const target = Math.max(0, Math.min(dur - 1, scrubStartPosRef.current + delta));
        try {
          await TrackPlayer.seekTo(Math.max(0.01, target / 1000));
          setPosition(target);
          await savePosition(target);
          await Haptics.selectionAsync();
        } catch {}
        if (scrubPausedRef.current) {
          try { await TrackPlayer.play(); } catch {}
          scrubPausedRef.current = false;
        }
        seekingRef.current = false;
        setSeeking(false);
      },
      onPanResponderTerminate: () => {
        scrubPausedRef.current = false;
        seekingRef.current = false;
        setSeeking(false);
      },
    })
  ).current;

  // --- Controls ---
  const togglePlayPause = async () => {
    try { await Haptics.selectionAsync(); } catch {}
    try {
      if (isPlaying) await TrackPlayer.pause();
      else           await TrackPlayer.play();
    } catch {}
  };

  const handleReturn = async () => {
    if (pollRef.current) clearInterval(pollRef.current);
    if (saveIntervalRef.current) clearInterval(saveIntervalRef.current);
    try {
      const pos = await TrackPlayer.getPosition();
      if (isFinite(pos) && pos > 0) await savePosition(Math.floor(pos * 1000));
    } catch {}
    try {
      await TrackPlayer.pause();
      await TrackPlayer.reset();
    } catch {}
    navigation.goBack();
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

      {/* Black overlay — fades in while playing */}
      <Animated.View
        pointerEvents="none"
        style={[StyleSheet.absoluteFill, { backgroundColor: '#000000', opacity: overlayOpacity }]}
      />

      {/* Title block — hierarchy matches GuardianScreen header */}
      <View style={[styles.titleBlock, { top: insets.top + 20 }]}>
        <Text style={styles.titleMain}>GUARDIANS</Text>
        <Text style={styles.titleSub}>RECOGNITION</Text>
        <Text style={styles.titleTrack}>{(track?.title ?? 'Cultivation').toUpperCase()}</Text>
      </View>

      {/* Play / Pause */}
      <View style={styles.playWrap}>
        <TouchableOpacity
          onPress={togglePlayPause}
          accessibilityRole="button"
          accessibilityLabel={isPlaying ? 'Pause' : 'Play'}
          style={[
            styles.playButton,
            {
              borderColor:     isPlaying ? MUTED_BORDER : GOLD_BORDER,
              backgroundColor: isPlaying ? MUTED_WHITE  : GOLD_BG,
            },
          ]}
          activeOpacity={0.7}
        >
          <Ionicons
            name={isPlaying ? 'pause' : 'play'}
            size={28}
            color={isPlaying ? '#F3EDE7' : GOLD}
          />
        </TouchableOpacity>
      </View>

      {/* Garden-style drag scrubber */}
      <View
        style={styles.scrubberSection}
        {...scrubResponder.panHandlers}
        hitSlop={{ top: 14, bottom: 14, left: 40, right: 40 }}
        accessibilityRole="adjustable"
        accessibilityLabel="Scrub playback position"
        accessibilityHint="Drag left or right to seek"
      >
        <Text style={[styles.timeText, seeking && { color: '#E8E4F3' }]}>
          {isFinite(duration) && duration > 0
            ? `${mmss(position)} / −${mmss(Math.max(0, duration - position))}`
            : 'warming…'}
        </Text>
        <View style={[styles.dragAffordance, { opacity: (isFinite(duration) && duration > 0) ? (seeking ? 0.9 : 0.35) : 0 }]}>
          <Text style={styles.dragArrow}>‹</Text>
          <View style={styles.dragLine} />
          <Text style={styles.dragArrow}>›</Text>
        </View>
      </View>

      {/* Return */}
      <TouchableOpacity
        onPress={handleReturn}
        hitSlop={{ top: 14, bottom: 14, left: 14, right: 14 }}
        accessibilityRole="button"
        accessibilityLabel="Return"
        style={[styles.returnButton, { bottom: insets.bottom + 32 }]}
        activeOpacity={0.7}
      >
        <Text style={styles.returnLabel}>Return</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0d0d1a',
  },

  // Title hierarchy
  titleBlock: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    gap: 4,
  },
  // "GUARDIANS" — matches GuardianScreen's main GUARDIANS label
  titleMain: {
    fontFamily: 'Inter-ExtraLight',
    fontSize: 12,
    letterSpacing: 5,
    color: '#ffffff7b',
    textShadowColor: 'rgba(245,158,11,0.4)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 12,
  },
  // "RECOGNITION" — matches GuardianScreen's RECOGNITION title
  titleSub: {
    fontFamily: 'CalSans-SemiBold',
    fontSize: 14,
    letterSpacing: 4,
    color: '#ffffff',
    textShadowColor: 'rgba(245,158,11,0.3)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 8,
  },
  // "CULTIVATION" — matches GuardianScreen's GUARDIAN I eyebrow size
  titleTrack: {
    fontFamily: 'Inter-ExtraLight',
    fontSize: 11,
    letterSpacing: 3,
    color: 'rgba(237,232,250,0.6)',
    textTransform: 'uppercase',
    textShadowColor: 'rgba(0,0,0,0.8)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },

  // Play / Pause
  playWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: '20%',
    alignItems: 'center',
  },
  playButton: {
    width: 64,
    height: 64,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Scrubber
  scrubberSection: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: '30%',
    alignItems: 'center',
    paddingVertical: 6,
  },
  timeText: {
    fontFamily: 'Inter-ExtraLight',
    fontSize: 11,
    color: TEXT_DIM,
    letterSpacing: 0.9,
    textAlign: 'center',
  },
  dragAffordance: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  dragArrow: {
    color: TEXT_DIM,
    fontSize: 10,
  },
  dragLine: {
    width: 36,
    height: 1,
    backgroundColor: TEXT_DIM,
    marginHorizontal: 4,
  },

  // Return
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
