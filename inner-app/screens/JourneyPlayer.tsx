import React, { useEffect, useRef, useState, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, BackHandler, Pressable, PanResponder, Animated, Easing, InteractionManager } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Slider from '@react-native-community/slider';
import { Audio, AVPlaybackStatus } from 'expo-av';
import TrackPlayer, { RepeatMode, State, Event, Capability } from 'react-native-track-player';
import { Asset } from 'expo-asset';
import * as Haptics from 'expo-haptics';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRoute, useNavigation } from '@react-navigation/native';
import OrbPortal from '../components/OrbPortal';
import { TRACKS, TRACK_INDEX, getTrackUrl } from '../data/tracks';
import { cacheRemoteOnce } from '../utils/audioCache';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Circle } from 'react-native-svg';
import { saveNow, markCompleted } from '../data/playbackStore';

type RouteParams = { id?: string; chamber?: string; trackId?: string };

const FADE_MS = 600;               // fade in/out duration
const SAVE_INTERVAL_MS = 4000;     // how often we save position
const DEFAULT_VOL = 0.9;
const RING_DIM_OPACITY = 0.2;
const RING_NORM_OPACITY = 0.7;
const RING_FLASH_MS = 120;

const DEBUG_AUDIO = true;
const logStatus = async (label: string, s: Audio.Sound | null) => {
  if (!DEBUG_AUDIO || !s) return;
  try {
    const st = await s.getStatusAsync();
    console.log(`[AUDIO] ${label}:`, JSON.stringify(st));
  } catch (e) {
    console.log(`[AUDIO] ${label} error:`, e);
  }
};

export default function JourneyPlayer() {
  const route = useRoute();
  const navigation = useNavigation();
  const { id: legacyId, chamber = 'Chamber 1', trackId } = (route.params || {}) as RouteParams;
  const meta = (legacyId && TRACK_INDEX ? TRACK_INDEX[legacyId] : undefined);

  const normalize = (s?: string) => (s || '').toString().trim().toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/_/g, '-');

  const findTrack = (id?: string) => {
    if (!id) return undefined;
    const n = normalize(id);
    // 1) exact id match
    let cand = TRACKS.find(t => t.id === id);
    if (cand) return cand;
    // 2) normalized id match (handles hyphen/underscore/whitespace)
    cand = TRACKS.find(t => normalize((t as any).id) === n);
    if (cand) return cand;
    // 3) try swapped separator variant (id with - <-> _)
    const swapped = id.includes('-') ? id.replace(/-/g, '_') : id.replace(/_/g, '-');
    cand = TRACKS.find(t => t.id === swapped || normalize((t as any).id) === normalize(swapped));
    if (cand) return cand;
    // 4) title match fallback
    cand = TRACKS.find(t => normalize((t as any).title) === n);
    return cand;
  };

  const selectedTrack = React.useMemo(() => {
    return findTrack(trackId) || findTrack(legacyId);
  }, [trackId, legacyId]);
  if (DEBUG_AUDIO) console.log('[PLAYER] route trackId=', trackId, 'legacyId=', legacyId, '→ selected =', selectedTrack?.id || meta?.id || 'fallback');
  const displayTitle = (selectedTrack?.title && String(selectedTrack.title).trim().length > 0)
    ? (selectedTrack.title as string)
    : (meta?.title && String(meta.title).trim().length > 0)
      ? (meta.title as string)
      : (chamber || 'Journey');
  const insets = useSafeAreaInsets();

  const soundRef = useRef<Audio.Sound | null>(null);
  const saveTimer = useRef<NodeJS.Timeout | null>(null);
  // --- Duration watchdog refs ---
  const durationWatchRef = useRef<NodeJS.Timeout | null>(null);
  const watchStartRef = useRef<number>(0);

  const [isPlaying, setIsPlaying] = useState(false);
  const [position, setPosition] = useState(0);     // ms
  const [duration, setDuration] = useState(1);     // ms (avoid div by zero)
  const [seeking, setSeeking] = useState(false);
  const [volume, setVolume] = useState(DEFAULT_VOL);

  const durationRef = useRef<number>(1);
  const tpCompletedRef = useRef(false);

  const STORAGE_KEY = `playback:${selectedTrack?.id || legacyId || 'default'}`;

  // Decide if we should use TrackPlayer (system media controls) for soundscapes
  const isSoundscape = ((selectedTrack as any)?.kind || (meta as any)?.kind) === 'soundscape';
  // Temporary hotfix: route soundscapes back to expo-av while stabilizing TrackPlayer
  const USE_TP_FOR_SOUNDSCAPES = true;
  const USE_TP_FOR_CHAMBERS = true;
  const useTP = 
    (isSoundscape && USE_TP_FOR_SOUNDSCAPES) ||
    (!isSoundscape && USE_TP_FOR_CHAMBERS);

  // Minimal one-time setup for TrackPlayer (v4-safe)
  const setupTrackPlayerOnce = useCallback(async () => {
    try {
      // In v4, simply attempt setup; if already set up, it will throw and we ignore
      try {
        await TrackPlayer.setupPlayer({ waitForBuffer: true });
      } catch {}

      await TrackPlayer.updateOptions({
        stopWithApp: false,
        capabilities: [Capability.Play, Capability.Pause, Capability.SeekTo],
        icon: require('../assets/images/inner_orb_icon.png'),
      });
    } catch (e) {
      console.log('[AUDIO][TP] updateOptions error', e);
    }
  }, []);

  // Infer whether this track should loop by default (soundscapes loop, chambers do not)
  const inferShouldLoop = useCallback(() => {
    // explicit flags first
    if (meta && typeof meta.loop === 'boolean') return !!meta.loop;
    if ((selectedTrack as any) && typeof (selectedTrack as any).loop === 'boolean') return !!(selectedTrack as any).loop;
    // explicit kind next
    const kind = (selectedTrack as any)?.kind || (meta as any)?.kind;
    if (kind === 'soundscape') return true;
    if (kind === 'chamber') return false;
    // heuristics fallback
    const idStr = (selectedTrack?.id || legacyId || '').toLowerCase();
    const chamberStr = (chamber || '').toLowerCase();
    if (chamberStr.includes('chamber')) return false; // guided journeys end
    if (idStr.includes('soundscape') || chamberStr.includes('soundscape')) return true; // ambient beds loop
    return false;
  }, [meta, selectedTrack, legacyId, chamber]);

  // --- Circular scrubber state ---
  const wasPlayingRef = useRef(false);
  const pausedDuringScrubRef = useRef(false);
  const ringLayoutRef = useRef({ size: 0 });
  const isScrubbingRef = useRef(false);
  const wasLoopingRef = useRef<boolean>(false);
  const lastSeekAtRef = useRef<number>(0); // throttle live setPositionAsync
  const [isLooping, setIsLooping] = useState(false);

  const [ringOpacity, setRingOpacity] = useState(RING_NORM_OPACITY);
  const [ringStrokeBoost, setRingStrokeBoost] = useState(false);

  const [isPrimed, setIsPrimed] = useState(false);
  const veilOpacity = useRef(new Animated.Value(1)).current;

  const closeOpacity = useRef(new Animated.Value(0)).current;

  // Mandala overlay breathing using a continuous phase (avoids end-of-cycle snap)
  const mandalaPhase = useRef(new Animated.Value(0)).current; // 0..1 repeating
  const mandalaLoopRef = useRef<Animated.CompositeAnimation | null>(null);
  const mandalaOpacity = mandalaPhase.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [0.20, 0.62, 0.20], // min → max → min
    extrapolate: 'clamp',
  });

  const startMandala = useCallback(() => {
    // Create a fresh loop each time we (re)start to avoid stale animations
    mandalaPhase.setValue(0);
    mandalaLoopRef.current = Animated.loop(
      Animated.timing(mandalaPhase, {
        toValue: 1,
        duration: 8400,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    );
    mandalaLoopRef.current.start();
  }, [mandalaPhase]);

  const stopMandala = useCallback(() => {
    try { mandalaLoopRef.current?.stop(); } catch {}
    mandalaLoopRef.current = null;
    mandalaPhase.stopAnimation(() => {});
  }, [mandalaPhase]);

  // Start/stop breathing based on play state
  useEffect(() => {
    if (isPlaying) {
      startMandala();
    } else {
      stopMandala();
      // hold whatever opacity parent sets (finalMandalaOpacity will clamp to 0.22)
    }
    return () => { /* no-op here; unmount handled below */ };
  }, [isPlaying, startMandala, stopMandala]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopMandala();
      mandalaPhase.setValue(0);
    };
  }, [stopMandala, mandalaPhase]);

  // Tie mandala breathing to play state: breathe when playing, dim when paused
  const finalMandalaOpacity = isPlaying ? mandalaOpacity : 0.22;

  // --- Completion banner state ---
  const [showComplete, setShowComplete] = useState(false);
  const completeOpacity = useRef(new Animated.Value(0)).current;

  const showCompletionBanner = () => {
    setRingOpacity(RING_DIM_OPACITY);
    setShowComplete(true);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    Animated.timing(completeOpacity, {
      toValue: 0.8,
      duration: 1000,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start(() => {
      setTimeout(() => {
        Animated.timing(completeOpacity, {
          toValue: 0,
          duration: 1500,
          easing: Easing.in(Easing.cubic),
          useNativeDriver: true,
        }).start(({ finished }) => {
          if (finished) setShowComplete(false);
        });
      }, 10000);
    });
  };

  const handleReplay = async () => {
    try {
      setRingOpacity(RING_NORM_OPACITY);
      await soundRef.current?.setPositionAsync(0);
      await soundRef.current?.playAsync();
      Haptics.selectionAsync().catch(() => {});
    } catch {}
  };

  // --- Orb double-tap detection refs ---
  const lastOrbTapRef = useRef<number>(0);
  const orbSingleTapTimerRef = useRef<NodeJS.Timeout | null>(null);
  const ORB_DOUBLE_TAP_MS = 300;
  const ORB_SKIP_MS = 15000; // 15s forward on double-tap

  const mmss = (ms: number) => {
    const sec = Math.floor(ms / 1000);
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${s < 10 ? '0' + s : s}`;
  };

  // Fade helper
  const fadeTo = async (target: number, ms = FADE_MS) => {
    const steps = 12;
    const start = volume;
    for (let i = 1; i <= steps; i++) {
      const v = start + (target - start) * (i / steps);
      await soundRef.current?.setVolumeAsync(v);
      setVolume(v);
      await new Promise(r => setTimeout(r, Math.max(1, Math.floor(ms / steps))));
    }
  };

  const loadResume = async (): Promise<number> => {
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      if (!raw) return 0;
      const { positionMillis } = JSON.parse(raw);
      return typeof positionMillis === 'number' ? positionMillis : 0;
    } catch {
      return 0;
    }
  };

  const savePosition = async (pos: number) => {
    try {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({ positionMillis: pos }));
    } catch {}
  };

  // Configure audio + load track
  useEffect(() => {
    let mounted = true;
    if (DEBUG_AUDIO) console.log('[AUDIO] JourneyPlayer setup start');

    // Animate in close button
    Animated.timing(closeOpacity, { toValue: 1, duration: 200, useNativeDriver: true }).start();

    const setup = async () => {
      try {
        // --- TrackPlayer path for soundscapes ---
        if (useTP) { tpCompletedRef.current = false;
          await setupTrackPlayerOnce();

          // Resolve URL (remote-first via B2 cache, fallback to local asset/registry/hum)
          let url: string | undefined;
          try {
            const baseMeta: any = selectedTrack ?? meta;
            if (baseMeta) {
              const res = getTrackUrl(baseMeta);
              if (res.isRemote) {
                // Cache remote once, return file:// for TrackPlayer
                url = await cacheRemoteOnce(res.url);
                console.log('[TP] using cached remote →', url);
              } else if (baseMeta.local) {
                const a = Asset.fromModule(baseMeta.local as any);
                await a.downloadAsync();
                url = a.localUri ?? a.uri;
                console.log('[TP] using local asset →', url);
              }
            }
          } catch (e) {
            console.log('[TP] getTrackUrl/cache resolve error', e);
          }

          // --- Minimal TP queueing + play (no artwork/metadata/repeat) ---
          const tpId = selectedTrack?.id || legacyId || 'default';
          try {
            console.log('[TP] reset()');
            await TrackPlayer.reset();
            console.log('[TP] add() start', { id: tpId, url: url, title: displayTitle });

            // Build Inner-branded metadata (artist fixed, series via album)
            const kind = (selectedTrack as any)?.kind || (meta as any)?.kind;
            const titleStr = displayTitle;
            let albumStr = 'Inner Journeys';
            if (kind === 'soundscape') albumStr = 'Inner Soundscapes';
            else if (kind === 'chamber') albumStr = 'Chamber Series';

            // Resolve local artwork for system media controls
            const artAsset = Asset.fromModule(require('../assets/images/orb-player-cover.png'));
            try { await artAsset.downloadAsync(); } catch {}

            await TrackPlayer.add({
              id: tpId,
              url: url!, // resolved file:// uri above
              title: titleStr,
              artist: 'Inner',
              album: albumStr,
              artwork: (artAsset as any).localUri ?? (artAsset as any).uri,
            } as any);
            console.log('[TP] add() done');

            // Loop soundscapes by default (safe, v4)
            if (isSoundscape) {
              console.log('[TP] setRepeatMode(Track)');
              await TrackPlayer.setRepeatMode(RepeatMode.Track);
            } else {
              console.log('[TP] setRepeatMode(Off) for chamber');
              await TrackPlayer.setRepeatMode(RepeatMode.Off);
            }


            // Resume position if present
            try {
              const resumeAt = await loadResume();
              if (resumeAt > 0) {
                console.log('[TP] seekTo()', resumeAt / 1000);
                await TrackPlayer.seekTo((resumeAt || 0) / 1000);
                setPosition(resumeAt);
              }
            } catch (e) {
              console.log('[TP] seekTo error', e);
            }

            console.log('[TP] play()');
            await TrackPlayer.play();
            setIsPlaying(true);

            // --- TrackPlayer start watchdog: ensure playback actually advances ---
            try {
              const t0 = Date.now();
              let advanced = false;
              while (Date.now() - t0 < 2500) { // up to ~2.5s
                const st = await TrackPlayer.getState();
                const pos = await TrackPlayer.getPosition();
                const dur = await TrackPlayer.getDuration();
                // consider "started" if clock ticks or state is Playing with known duration
                if ((pos ?? 0) > 0.05 || (st === State.Playing && (dur ?? 0) > 0)) {
                  advanced = true;
                  break;
                }
                await new Promise(r => setTimeout(r, 150));
              }
              if (!advanced) {
                console.log('[TP] watchdog: playback did not advance — retrying play + tiny seek');
                try { await TrackPlayer.play(); } catch {}
                try { await TrackPlayer.seekTo(0.05); } catch {}
              }
            } catch (e) {
              console.log('[TP] watchdog error', e);
            }

            // Mark UI as primed now that playback started (TrackPlayer path)
            if (!isPrimed) {
              setIsPrimed(true);
              try { Animated.timing(veilOpacity, { toValue: 0, duration: 300, useNativeDriver: true }).start(); } catch {}
            }
            setRingOpacity(RING_NORM_OPACITY);

            // Final auto-start verify (some devices need a second kick)
            setTimeout(async () => {
              try {
                const stVerify = await TrackPlayer.getState();
                if (stVerify !== State.Playing) {
                  console.log('[TP] verify kick: state=', stVerify, '→ play()');
                  await TrackPlayer.play();
                  setIsPlaying(true);
                }
              } catch {}
            }, 500);

            // Poll progress while in this screen
            const interval = setInterval(async () => {
              try {
                const pos = await TrackPlayer.getPosition();
                const dur = (await TrackPlayer.getDuration()) || durationRef.current || 1;
                setPosition(Math.floor(pos * 1000));
                if (!isPrimed && pos > 0) {
                  setIsPrimed(true);
                  try { Animated.timing(veilOpacity, { toValue: 0, duration: 300, useNativeDriver: true }).start(); } catch {}
                  setRingOpacity(RING_NORM_OPACITY);
                }
                if (dur && dur !== durationRef.current) {
                  durationRef.current = Math.floor(dur * 1000);
                  setDuration(durationRef.current);
                }
                try {
                  saveNow({
                    trackId: tpId,
                    title: displayTitle,
                    category: (selectedTrack as any)?.kind || (meta as any)?.kind || undefined,
                    positionMillis: Math.floor(pos * 1000),
                    durationMillis: durationRef.current,
                    isLooping: true,
                    completed: false,
                  });
                  if (!isSoundscape && !tpCompletedRef.current) {
                    const dMs = durationRef.current || Math.floor(dur * 1000);
                    const pMs = Math.floor(pos * 1000);
                    if (dMs > 0 && pMs >= dMs - 800) {
                      tpCompletedRef.current = true;
                      try {
                        await TrackPlayer.pause();
                        await TrackPlayer.seekTo(0);
                      } catch {}
                      setIsPlaying(false);
                      setPosition(0);
                      try { await savePosition(0); } catch {}
                      showCompletionBanner();
                      try { markCompleted(selectedTrack?.id || legacyId || 'default'); } catch {}
                    }
                  }
                } catch {}
              } catch (e) {
                console.log('[TP] poll error', e);
              }
            }, 750);
            (saveNow as any).__tpInt = interval;

            console.log('[TP] ready');
          } catch (e) {
            console.log('[TP] fatal in add/play path', e);
          }
          return; // skip expo-av path
        }

        await Audio.setIsEnabledAsync(true);
        const audioMode: any = {
          playsInSilentModeIOS: true,
          staysActiveInBackground: true,
          shouldDuckAndroid: false, // request exclusive focus (no ducking)
          playThroughEarpieceAndroid: false,
        };
        // SDK 53+: use the new namespaced enum if available; otherwise omit
        const AIM = (Audio as any).AndroidAudioInterruptionMode;
        if (AIM && AIM.DoNotMix != null) {
          audioMode.interruptionModeAndroid = AIM.DoNotMix;
        }
        await Audio.setAudioModeAsync(audioMode);

        const s = new Audio.Sound();
        soundRef.current = s;

        try {
          // Remote-first resolver for expo-av: cache remote to file:// once, else use local asset, else registry, else hum
          let playUri: string | undefined;
          try {
            const baseMeta: any = selectedTrack ?? meta;
            if (baseMeta) {
              const res = getTrackUrl(baseMeta);
              if (res.isRemote) {
                playUri = await cacheRemoteOnce(res.url);
                if (DEBUG_AUDIO) console.log('[AUDIO] cached remote →', playUri);
                await s.loadAsync({ uri: playUri }, { volume: 0.0, shouldPlay: true });
              } else if (baseMeta.local) {
                const a = Asset.fromModule(baseMeta.local as any);
                await a.downloadAsync();
                playUri = a.localUri ?? a.uri;
                if (DEBUG_AUDIO) console.log('[AUDIO] using local asset →', playUri);
                await s.loadAsync({ uri: playUri }, { volume: 0.0, shouldPlay: true });
              }
            }
          } catch (e) {
            console.log('[AUDIO] getTrackUrl/cache resolve error', e);
          }

          if (!playUri) {
            const cachedUris = (globalThis as any).__TRACK_URIS || {};
            const cacheKey = selectedTrack?.id || legacyId;
            const cachedUri: string | undefined = cacheKey ? cachedUris[cacheKey] : undefined;
            if (cachedUri) {
              if (DEBUG_AUDIO) console.log('[AUDIO] Loading from preloaded URI for id=', cacheKey, '→', cachedUri);
              await s.loadAsync({ uri: cachedUri }, { volume: 0.0, shouldPlay: true });
              playUri = cachedUri;
            } else {
              if (DEBUG_AUDIO) console.log('[AUDIO] Registry miss; loading fallback Homepage_Hum.mp3 for id=', selectedTrack?.id || legacyId);
              await s.loadAsync(require('../assets/audio/Homepage_Hum.mp3'), { volume: 0.0, shouldPlay: true });
              playUri = 'bundle://Homepage_Hum.mp3';
            }
          }

          await s.setVolumeAsync(0.0);
          setVolume(0.0);
        } catch (e) {
          console.log('[AUDIO] Local/registry load failed, trying remote test URL:', e);
          await s.loadAsync({ uri: 'https://www2.cs.uic.edu/~i101/SoundFiles/StarWars60.wav' }, { volume: 0.0, shouldPlay: true });
        }

        await logStatus('after loadAsync', s);
        // Log which source path was used at runtime
        try {
          const st = await s.getStatusAsync();
          if ((st as any)?.uri) {
            console.log('[AUDIO] playing from URI', (st as any).uri);
          }
        } catch {}

        // Loop behavior: soundscapes loop, chambers do not (overrideable by flags)
        const loopDefault = inferShouldLoop();
        await s.setIsLoopingAsync(loopDefault);
        setIsLooping(loopDefault);

        // Resume position if any
        const resumeAt = await loadResume();
        if (resumeAt > 0) {
          try { await s.setPositionAsync(resumeAt); } catch {}
          setPosition(resumeAt);
          if (DEBUG_AUDIO) console.log('[AUDIO] Resumed at', resumeAt);
        }
        // Prime duration ref once if available
        try {
          const stInit = await s.getStatusAsync();
          const dm = (stInit as any)?.durationMillis;
          const pd = (stInit as any)?.playableDurationMillis;
          const initialDur = (typeof dm === 'number' && dm > 0)
            ? dm
            : (typeof pd === 'number' && pd > 0)
              ? pd
              : 0;
          if (initialDur > 0) {
            durationRef.current = initialDur;
            setDuration(initialDur);
          }
          if (typeof (stInit as any)?.isLooping === 'boolean') {
            setIsLooping(!!(stInit as any).isLooping);
          }
        } catch {}

        // --- Duration Watchdog: short-lived poller to seed duration/position early ---
        const startDurationWatch = () => {
          if (durationWatchRef.current) clearInterval(durationWatchRef.current);
          watchStartRef.current = Date.now();
          durationWatchRef.current = setInterval(async () => {
            try {
              const st = await s.getStatusAsync();
              if (!st.isLoaded) return;
              const dm = (st as any)?.durationMillis || (st as any)?.playableDurationMillis || 0;
              const pm = (st as any)?.positionMillis || 0;
              if (dm > 0) {
                if (durationRef.current !== dm) {
                  durationRef.current = dm;
                  setDuration(dm);
                }
              }
              if (!seeking) setPosition(pm);
              // Stop watching once we have both duration and the position has advanced, or after 10s fallback
              if ((dm > 0 && pm > 0) || (Date.now() - watchStartRef.current > 10000)) {
                if (durationWatchRef.current) {
                  clearInterval(durationWatchRef.current);
                  durationWatchRef.current = null;
                }
              }
            } catch {}
          }, 300);
        };

        // Attach status updates BEFORE play
        s.setOnPlaybackStatusUpdate((st: AVPlaybackStatus) => {
          if (!mounted || !st.isLoaded) return;
          const d1 = (st as any).durationMillis;
          const d2 = (st as any).playableDurationMillis;
          const dur = (typeof d1 === 'number' && d1 > 0)
            ? d1
            : (typeof d2 === 'number' && d2 > 0)
              ? d2
              : durationRef.current;
          if (dur !== durationRef.current) {
            durationRef.current = dur;
            if (dur > 0) setDuration(dur);
          }
          const pos = (st as any).positionMillis ?? 0;
          if (!seeking) setPosition(pos);
          setIsPlaying(!!st.isPlaying);
          if (!isPrimed && pos > 0) {
            setIsPrimed(true);
            Animated.timing(veilOpacity, { toValue: 0, duration: 300, useNativeDriver: true }).start();
          }
          if ((st as any).isPlaying) {
            setRingOpacity(RING_NORM_OPACITY);
          }
          if (typeof (st as any).isLooping === 'boolean') setIsLooping(!!(st as any).isLooping);
          if ((st as any).error) console.log('[AUDIO] status error:', (st as any).error);
          // ---- Persist "last session" snapshot (throttled) ----
          {
            const nowTs = Date.now();
            (saveNow as any).__lastAt = (saveNow as any).__lastAt || 0;
            if (nowTs - (saveNow as any).__lastAt > 1200) {
              (saveNow as any).__lastAt = nowTs;
              try {
                saveNow({
                  trackId: selectedTrack?.id || legacyId || 'default',
                  title: displayTitle,
                  category: (selectedTrack as any)?.kind || (meta as any)?.kind || undefined,
                  positionMillis: (st as any).positionMillis ?? 0,
                  durationMillis: (st as any).durationMillis ?? durationRef.current ?? 1,
                  isLooping: (st as any).isLooping,
                  completed: false,
                });
              } catch {}
            }
          }
          if (st.didJustFinish) {
            // If looping, ignore completion events
            if ((st as any).isLooping) {
              return;
            }
            // For non-looping journeys, reset to start and stop
            setIsPlaying(false);
            setPosition(0);
            savePosition(0);
            const snd = soundRef.current;
            setTimeout(() => { snd?.stopAsync().catch(() => {}); }, 0);
            showCompletionBanner();
            try { markCompleted(selectedTrack?.id || legacyId || 'default'); } catch {}
          }
        });
        await s.setProgressUpdateIntervalAsync(250);
        // Start duration watchdog before play (to catch duration/position before callback fires)
        startDurationWatch();

        // Start playback
        try {
          await s.playAsync();
          await logStatus('after playAsync', s);
          // Immediately query and seed position/duration in case callback lags
          try {
            const stNow = await s.getStatusAsync();
            const dmNow = (stNow as any)?.durationMillis || (stNow as any)?.playableDurationMillis;
            if (typeof dmNow === 'number' && dmNow > 0) {
              durationRef.current = dmNow;
              setDuration(dmNow);
            }
            const posNow = (stNow as any)?.positionMillis;
            if (typeof posNow === 'number') setPosition(posNow);
          } catch {}
          // Start duration watchdog again after play (to catch both cases)
          startDurationWatch();
        } catch (e) {
          console.log('[AUDIO] playAsync error:', e);
        }

        // Optional: fade in to target volume after play
        try {
          await fadeTo(DEFAULT_VOL, FADE_MS);
        } catch (e) {
          console.log('[AUDIO] fade error:', e);
        }

        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
      } catch (e) {
        console.log('[AUDIO] setup fatal error:', e);
      }
    };

    setup().catch(console.log);

    // Android back button → graceful fade + goBack
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      handleClose();
      return true;
    });

    return () => {
      mounted = false;
      sub.remove();
      if (saveTimer.current) clearInterval(saveTimer.current);
      // --- Clear duration watchdog ---
      if (durationWatchRef.current) { clearInterval(durationWatchRef.current); durationWatchRef.current = null; }
      // Clear TrackPlayer poller if set
      if ((saveNow as any).__tpInt) { clearInterval((saveNow as any).__tpInt); (saveNow as any).__tpInt = null; }
      setIsPrimed(false);
      veilOpacity.setValue(1);
      setRingOpacity(RING_NORM_OPACITY);

      // If we were using expo-av (chambers), defer unload to avoid ExoPlayer wrong-thread crash.
      if (!useTP) {
        const s = soundRef.current;
        soundRef.current = null;
        if (s) {
          try {
            requestAnimationFrame(() => {
              InteractionManager.runAfterInteractions(() => {
                s.unloadAsync().catch(() => {});
              });
            });
          } catch {}
        }
      } else {
        // TrackPlayer path: no expo-av sound to unload
        soundRef.current = null;
      }
    };
  }, [selectedTrack?.id, legacyId]);

  // Periodically persist position
  useEffect(() => {
    if (saveTimer.current) clearInterval(saveTimer.current);
    saveTimer.current = setInterval(() => {
      if (!seeking && position > 0) savePosition(position);
    }, SAVE_INTERVAL_MS);
    return () => { if (saveTimer.current) clearInterval(saveTimer.current); };
  }, [position, seeking]);

  const toggle = useCallback(async () => {
    if (useTP) {
      try {
        const st = await TrackPlayer.getState();
        if (st === State.Playing) {
          const pos = await TrackPlayer.getPosition();
          await TrackPlayer.pause();
          await savePosition(Math.floor(pos * 1000));
          setIsPlaying(false);
        } else {
          // If at end (no end for repeat track), just play
          await TrackPlayer.play();
          setIsPlaying(true);
        }
      } catch {}
      return;
    }

    // expo-av path (chambers)
    const s = soundRef.current; if (!s) return;
    const st = await s.getStatusAsync();
    if (!st.isLoaded) return;

    const pos = st.positionMillis ?? 0;
    const dur = st.durationMillis ?? 0;
    const atEnd = dur > 0 && pos >= (dur - 500);

    if (st.isPlaying) {
      await s.pauseAsync();
      await savePosition(pos);
    } else {
      if (atEnd) {
        try {
          await s.setPositionAsync(0);
          setPosition(0);
          await savePosition(0);
        } catch {}
      }
      await s.playAsync();
    }
  }, [isSoundscape]);

  const onSlidingStart = () => setSeeking(true);
  const onSlidingComplete = async (val: number) => {
    setSeeking(false);
    try {
      await seekToMs(val);
      if (useTP) {
        // TrackPlayer path doesn't immediately reflect via expo-av status, so force UI update
        setPosition(val);
      } else {
        const s = soundRef.current; if (s) {
          try {
            const st = await s.getStatusAsync();
            if (st.isLoaded && !st.isPlaying) setPosition(val);
          } catch {}
        }
      }
      await savePosition(val);
      await Haptics.selectionAsync();
    } catch {}
  };

  const handleClose = async () => {
    const s = soundRef.current;
    if (useTP) {
      try {
        const pos = await TrackPlayer.getPosition();
        await savePosition(Math.floor(pos * 1000));
        // Save snapshot
        try {
          const dur = (await TrackPlayer.getDuration()) || 0;
          await saveNow({
            trackId: selectedTrack?.id || legacyId || 'default',
            title: displayTitle,
            category: (selectedTrack as any)?.kind || (meta as any)?.kind || undefined,
            positionMillis: Math.floor(pos * 1000),
            durationMillis: Math.floor(dur * 1000),
            isLooping: true,
            completed: false,
          });
        } catch {}
        await TrackPlayer.pause();
      } catch {}
      navigation.goBack();
      return;
    }
    try {
      if (s) {
        await fadeTo(0.0, FADE_MS);
        await s.pauseAsync();
        const st = await s.getStatusAsync();
        if (st.isLoaded) await savePosition(st.positionMillis ?? 0);
        if (st && st.isLoaded) {
          try {
            await saveNow({
              trackId: selectedTrack?.id || legacyId || 'default',
              title: displayTitle,
              category: (selectedTrack as any)?.kind || (meta as any)?.kind || undefined,
              positionMillis: st.positionMillis ?? 0,
              durationMillis: st.durationMillis ?? durationRef.current ?? 1,
              isLooping: (st as any).isLooping as boolean,
              completed: false,
            });
          } catch {}
        }
      }
    } catch {}
    navigation.goBack();
  };

  // Orb / ring geometry
  const ORB_SIZE = 250;        // orb is 280px
  const RING_SIZE = 270;       // ring wraps the orb with a bit of margin
  const STROKE = 8;

  // Playback progress 0..1
  const progress = Math.min(1, Math.max(0, duration ? position / duration : 0));
  const r = (RING_SIZE - STROKE) / 2;
  const c = 2 * Math.PI * r;
  const dash = c * progress;
  const gap = c - dash;

  // Map a touch point on the ring overlay to progress (0..1)
  const pointToProgress = (x: number, y: number) => {
    const size = RING_SIZE;
    const cx = size / 2;
    const cy = size / 2;
    const dx = x - cx;
    const dy = y - cy;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const inner = r - STROKE * 4.5; // hit band (wider)
    const outer = r + STROKE * 4.5;
    if (dist < inner || dist > outer) return null; // outside ring band
    // angle: 0 at right, -pi..pi. We want 0 at top → rotate -90deg
    let theta = Math.atan2(dy, dx) + Math.PI / 2; // shift so top=0
    if (theta < 0) theta += Math.PI * 2;
    const p = theta / (Math.PI * 2);
    return Math.max(0, Math.min(1, p));
  };

  // --- Double-tap seek logic for ring ---
  const lastTapRef = useRef<{ ts: number, x: number, y: number } | null>(null);
  const DOUBLE_TAP_MS = 300;
  const SEEK_AMOUNT = 15000; // 15 seconds

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: (evt) => {
        const { locationX, locationY } = (evt as any).nativeEvent;
        return pointToProgress(locationX, locationY) != null;
      },
      onMoveShouldSetPanResponder: (evt) => {
        const { locationX, locationY } = (evt as any).nativeEvent;
        return pointToProgress(locationX, locationY) != null;
      },
      onPanResponderGrant: async (evt) => {
        const { locationX, locationY } = (evt as any).nativeEvent;
        const now = Date.now();
        // Double-tap detection
        if (
          lastTapRef.current &&
          (now - lastTapRef.current.ts) < DOUBLE_TAP_MS
        ) {
          // Double-tap detected
          const x = locationX;
          // Left or right half of ring
          if (x < RING_SIZE / 2) {
            // Seek backward 15s
            try {
              await skipBy(-SEEK_AMOUNT);
            } catch {}
          } else {
            // Seek forward 15s
            try {
              await skipBy(SEEK_AMOUNT);
            } catch {}
          }
          await Haptics.selectionAsync();
          lastTapRef.current = null;
          return;
        }
        // Not a double-tap, store this tap
        lastTapRef.current = { ts: now, x: locationX, y: locationY };
        // Scrubbing logic
        const p = pointToProgress(locationX, locationY);
        if (p == null) return;
        isScrubbingRef.current = true;
        setSeeking(true);

        // If using expo-av, remember play state and pause during scrub to avoid stutter
        if (!useTP) {
          const s = soundRef.current;
          pausedDuringScrubRef.current = false;
          if (s) {
            try {
              const st = await s.getStatusAsync();
              const wasPlaying = !!st.isLoaded && !!(st as any).isPlaying;
              wasPlayingRef.current = wasPlaying;
              if (wasPlaying) {
                try { await s.pauseAsync(); } catch {}
                pausedDuringScrubRef.current = true; // we actually paused during this scrub
              }
            } catch {}
          }
        }

        const target = Math.floor((durationRef.current || 0) * p);
        setPosition(target);
        try { await seekToMs(target); } catch {}
      },
      onPanResponderMove: async (evt) => {
        if (!isScrubbingRef.current) return;
        const { locationX, locationY } = (evt as any).nativeEvent;
        const p = pointToProgress(locationX, locationY);
        if (p == null) return;
        const target = Math.floor((durationRef.current || 0) * p);
        const now = Date.now();
        if (now - lastSeekAtRef.current > 80) { // ~12 fps
          lastSeekAtRef.current = now;
          try { await seekToMs(target); } catch {}
        }
        setPosition(target);
      },
      onPanResponderRelease: async (evt) => {
        if (!isScrubbingRef.current) return;
        isScrubbingRef.current = false;
        const { locationX, locationY } = (evt as any).nativeEvent;
        const p = pointToProgress(locationX, locationY);
        const baseP = (p == null ? progress : p);
        const target = Math.floor((durationRef.current || 0) * baseP);
        try {
          await seekToMs(target);
          await savePosition(target);
          await Haptics.selectionAsync(); // seek confirm haptic
        } catch {}

        // Resume expo-av playback only if we paused during this scrub
        if (!useTP && pausedDuringScrubRef.current) {
          const s = soundRef.current;
          try { await s?.playAsync(); } catch {}
          pausedDuringScrubRef.current = false;
          wasPlayingRef.current = false;
        }

        setSeeking(false);
      },
      onPanResponderTerminationRequest: () => true,
      onPanResponderTerminate: () => {
        isScrubbingRef.current = false;
        setSeeking(false);
      },
    })
  ).current;

  // --- Loop and skip helpers ---
  const toggleLoop = useCallback(async () => {
    const s = soundRef.current; if (!s) return;
    try {
      await s.setIsLoopingAsync(!isLooping);
      setIsLooping(!isLooping);
      await Haptics.selectionAsync();
    } catch {}
  }, [isLooping]);

  const skipBy = useCallback(async (deltaMs: number) => {
    if (useTP) {
      try {
        const posSec = await TrackPlayer.getPosition();
        const durSec = (await TrackPlayer.getDuration()) || 0;
        const curMs = Math.floor((posSec || 0) * 1000);
        const durMs = Math.floor((durSec || 0) * 1000);
        const maxTarget = Math.max(0, durMs - 1);
        const target = Math.max(0, Math.min(maxTarget, curMs + deltaMs));
        await TrackPlayer.seekTo(target / 1000);
        setPosition(target);
        await savePosition(target);
        await Haptics.selectionAsync();
      } catch {}
      return;
    }

    const s = soundRef.current; if (!s) return;
    try {
      const st = await s.getStatusAsync();
      if (!st.isLoaded) return;
      const dur = durationRef.current || st.durationMillis || 0;
      const cur = st.positionMillis || 0;
      const target = Math.max(0, Math.min(dur - 1, cur + deltaMs));
      await s.setPositionAsync(target);
      setPosition(target);
      await savePosition(target);
      await Haptics.selectionAsync();
    } catch {}
  }, [useTP]);

  // --- Seek to ms helper (TP/expo-av aware) ---
  const seekToMs = useCallback(async (ms: number) => {
    const clamped = Math.max(0, ms);
    if (useTP) {
      try { await TrackPlayer.seekTo(clamped / 1000); } catch {}
      return;
    }
    try { await soundRef.current?.setPositionAsync(clamped); } catch {}
  }, [useTP]);

  // --- Orb single/double tap handler (left/right aware) ---
  const handleOrbPressIn = useCallback(async (evt: any) => {
    setRingStrokeBoost(true);
    setTimeout(() => setRingStrokeBoost(false), RING_FLASH_MS);
    const now = Date.now();
    const last = lastOrbTapRef.current || 0;
    const x = evt?.nativeEvent?.locationX ?? 0;
    const pressableW = ORB_SIZE - 40; // matches the Pressable width
    const isLeftHalf = x < pressableW / 2;

    if (now - last < ORB_DOUBLE_TAP_MS) {
      // Double-tap: left = back 15s, right = forward 15s
      lastOrbTapRef.current = 0;
      if (orbSingleTapTimerRef.current) {
        clearTimeout(orbSingleTapTimerRef.current);
        orbSingleTapTimerRef.current = null;
      }
      try {
        await skipBy(isLeftHalf ? -ORB_SKIP_MS : ORB_SKIP_MS);
        await Haptics.selectionAsync();
      } catch {}
      return;
    }

    // First tap: arm a single-tap timer for Play/Pause
    lastOrbTapRef.current = now;
    if (orbSingleTapTimerRef.current) clearTimeout(orbSingleTapTimerRef.current);
    orbSingleTapTimerRef.current = setTimeout(async () => {
      orbSingleTapTimerRef.current = null;
      lastOrbTapRef.current = 0;
      try { await toggle(); } catch {}
    }, ORB_DOUBLE_TAP_MS + 20);
  }, [toggle, skipBy]);

  return (
    <LinearGradient colors={["#0d0d1a", "#1a0f2d"]} style={styles.container}>
      <Text style={styles.title}>{displayTitle}</Text>
      <Text style={styles.subtitle}>ID: {selectedTrack?.id || legacyId || '—'}</Text>
      <View style={{ alignSelf: 'center', marginTop: 2, marginBottom: 12, paddingVertical: 4, paddingHorizontal: 10, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.08)' }}>
        <Text style={{ color: '#EDE8FA', fontSize: 12, letterSpacing: 0.4 }}>
          {isSoundscape ? 'Soundscape' : 'Chamber'}
        </Text>
      </View>

      {/* Transport */}
      <View style={styles.transport}>
        <LinearGradient
          colors={[isPlaying ? '#FFAD66' : '#B28BFF', '#7D5BD6']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.controlBtn}
        >
          <TouchableOpacity
            onPress={toggle}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel={isPlaying ? 'Pause' : 'Play'}
            accessibilityHint={isPlaying ? 'Pauses playback' : 'Starts playback'}
            style={{ width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center' }}
            activeOpacity={0.85}
          >
            <Ionicons name={isPlaying ? 'pause' : 'play'} size={28} color="#0E0A14" />
          </TouchableOpacity>
        </LinearGradient>
      </View>

      {/* Time above orb */}
      <Text style={styles.timeAbove}>{mmss(position)} / {mmss(duration)}</Text>

      {/* Orb portal player visual */}
      <View style={styles.orbContainer} {...panResponder.panHandlers}>
        {/* Loading veil overlay */}
        {!isPrimed && (
          <Animated.View
            pointerEvents="none"
            style={{
              position: 'absolute',
              top: 0, left: 0, right: 0, bottom: 0,
              backgroundColor: 'rgba(10,8,14,0.35)',
              zIndex: 3,
              opacity: veilOpacity,
              borderRadius: 16,
            }}
          />
        )}
        {/* Circular progress ring (track + progress + soft halo) */}
        <Svg
          width={RING_SIZE}
          height={RING_SIZE}
          style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: [{ translateX: -RING_SIZE / 2 }, { translateY: -RING_SIZE / 2 }],
            zIndex: 1,
            pointerEvents: 'none',
          }}
        >
          {/* Track */}
          <Circle
            cx={RING_SIZE / 2}
            cy={RING_SIZE / 2}
            r={r}
            stroke="#5A4E9C"   //indigo wash
            strokeWidth={STROKE + (ringStrokeBoost ? 2 : 0)}
            fill="none"
            opacity={0.20}
          />
          {/* Progress */}
          <Circle
            cx={RING_SIZE / 2}
            cy={RING_SIZE / 2}
            r={r}
            stroke="#5A4E9C"   // ember
            strokeWidth={STROKE + (ringStrokeBoost ? 2 : 0)}
            strokeLinecap="round"
            strokeDasharray={`${dash},${gap}`}
            rotation="-90"
            originX={RING_SIZE / 2}
            originY={RING_SIZE / 2}
            fill="none"
            opacity={ringOpacity}
          />
          {/* Soft halo */}
          <Circle
            cx={RING_SIZE / 2}
            cy={RING_SIZE / 2}
            r={r}
            stroke="rgba(255,140,80,0.25)"
            strokeWidth={STROKE * 1.6}
            strokeDasharray={`${dash},${gap}`}
            rotation="-90"
            originX={RING_SIZE / 2}
            originY={RING_SIZE / 2}
            strokeLinecap="round"
            fill="none"
            opacity={Math.min(0.25, ringOpacity)}
          />
        </Svg>


        <Pressable
          onPressIn={handleOrbPressIn}
          accessibilityRole="button"
          accessibilityLabel={isPlaying ? 'Pause' : 'Play'}
          accessibilityHint={isPlaying
            ? 'Pauses playback. Double-tap left to go back 15 seconds or right to skip forward 15 seconds.'
            : 'Starts playback. Double-tap left to go back 15 seconds or right to skip forward 15 seconds.'}
          hitSlop={10}
          style={{
            position: 'absolute',
            width: ORB_SIZE - 40,
            height: ORB_SIZE - 40,
            borderRadius: (ORB_SIZE - 40) / 2,
            alignItems: 'center',
            justifyContent: 'center',
            top: '50%',
            left: '50%',
            transform: [{ translateX: -(ORB_SIZE - 40) / 2 }, { translateY: -(ORB_SIZE - 40) / 2 }],
          }}
        >
          <OrbPortal
            variant="inner"
            size={ORB_SIZE}
            imageSource={require('../assets/images/orb-player.png')}
            enhance
            // Fit / alignment
            overlayScale={0.83}
            overlayOffsetX={-3}
            overlayOffsetY={0}
          />
          {/* Mandala overlay with breathing opacity */}
          <Animated.Image
            source={require('../assets/images/orb-player-mandala.png')}
            resizeMode="contain"
            style={{
              position: 'absolute',
              width: ORB_SIZE * 0.99,
              height: ORB_SIZE * 0.99,
              top: '40%',
              left: '40%',
              transform: [
                { translateX: -(ORB_SIZE * 0.83) / 2 },
                { translateY: -(ORB_SIZE * 0.83) / 2 },
              ],
              opacity: finalMandalaOpacity,
            }}
          />
        </Pressable>

        {/* Side actions */}
        {/* Loop button removed */}
      </View>

      {showComplete && (
        <Animated.View
          style={{
            position: 'absolute',
            top: '32%',
            left: 24,
            right: 24,
            alignItems: 'center',
            opacity: completeOpacity,
            transform: [{
              translateY: completeOpacity.interpolate({
                inputRange: [0, 1],
                outputRange: [8, 0],
              })
            }],
          }}
        >
          <View
            style={{
              paddingVertical: 12,
              paddingHorizontal: 16,
              borderRadius: 12,
              backgroundColor: 'rgba(12, 8, 14, 0.65)',
              borderWidth: 1,
              borderColor: 'rgba(255,255,255,0.08)',
            }}
          >
            <Text
              style={{
                color: '#EDE8FA',
                fontSize: 16,
                fontWeight: '700',
                textAlign: 'center',
                letterSpacing: 0.3,
                marginBottom: 6,
              }}
            >
              {displayTitle}: Journey Complete
            </Text>

            <View style={{ flexDirection: 'row', columnGap: 16, justifyContent: 'center' }}>
              <Pressable onPress={handleReplay} accessibilityRole="button" accessibilityLabel="Replay session">
                <Text style={{ color: '#C9B6FF' }}>Replay</Text>
              </Pressable>
              <Pressable onPress={() => navigation.goBack()} accessibilityRole="button" accessibilityLabel="Return Home">
                <Text style={{ color: '#FFC7A3' }}>Return Home</Text>
              </Pressable>
            </View>
          </View>
        </Animated.View>
      )}

      {/* Close */}
      <Animated.View style={{ opacity: closeOpacity }}>
        <TouchableOpacity
          style={[
            styles.close,
            { marginBottom: Math.max(24, insets.bottom + 16) },
          ]}
          onPress={handleClose}
          hitSlop={12}
        >
          <Text style={styles.closeText}>Close</Text>
        </TouchableOpacity>
      </Animated.View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0d0d1a', paddingTop: 80, paddingHorizontal: 20 },
  title: { color: '#F0EEF8', fontSize: 26, textAlign: 'center', letterSpacing: 1.5 },
  subtitle: { color: 'rgba(185,181,201,0.7)', fontSize: 14, textAlign: 'center', marginTop: 6, marginBottom: 16 },
  transport: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginBottom: 0 },
  btn: { paddingVertical: 10, paddingHorizontal: 16, borderRadius: 12, backgroundColor: 'rgba(207,195,224,0.18)' },
  btnText: { color: '#E8E4F3', fontSize: 16 },
  time: { color: '#B9B5C9', fontSize: 12 },
  timeAbove: { color: '#B9B5C9', fontSize: 12, textAlign: 'center', marginTop: 6, marginBottom: 6 },
  slider: { width: '90%', alignSelf: 'center', height: 30, marginTop: 12 },
  close: { alignSelf: 'center', marginTop: 18, marginBottom: 56, paddingVertical: 10, paddingHorizontal: 18, borderRadius: 16, borderWidth: 1, borderColor: 'rgba(207,195,224,0.4)', backgroundColor: 'transparent' },
  closeText: { color: '#E8E4F3', fontSize: 16 },
  orbWrap: { alignItems: 'center', justifyContent: 'center', marginVertical: 12 },

  orbContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', marginVertical: 24 },
  orbGlow: { position: 'absolute', width: 380, height: 380, borderRadius: 190, backgroundColor: 'rgba(155,85,245,0.18)' },
  controlBtn: {
    width: 72,
    height: 72,
    borderRadius: 36,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4,
  },
});