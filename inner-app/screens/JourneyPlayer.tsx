import React, { useEffect, useRef, useState, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, BackHandler, Pressable, PanResponder, Animated, Easing, InteractionManager, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import SleepIcon from '../assets/images/sleep.svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Slider from '@react-native-community/slider';
import TrackPlayer, { RepeatMode, State, Event, Capability } from 'react-native-track-player';
import Purchases from 'react-native-purchases';
import { Asset } from 'expo-asset';
import * as Haptics from 'expo-haptics';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRoute, useNavigation } from '@react-navigation/native';
import OrbPortal from '../components/OrbPortal';
import AuraOverlay from '../components/AuraOverlay';
import { TRACKS, TRACK_INDEX, getTrackUrl, getPreferredQuality, setPreferredQuality } from '../data/tracks';
import { cacheRemoteOnce } from '../utils/audioCache';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Circle } from 'react-native-svg';
import { saveNow, markCompleted } from '../data/playbackStore';
import { Typography } from '../core/typography';
import { chamberEnvForTrack } from '../theme/chamberEnvironments';
import { saveThreadSignature } from '../src/core/threading/ThreadEngine';
import { ThreadMood } from '../src/core/threading/threadTypes';
import { maybeQueueThreshold } from '../src/core/thresholds/ThresholdEngine';
import { isLockedTrack } from '../src/core/subscriptions/accessPolicy';
import { safePresentPaywall } from '../src/core/subscriptions/safePresentPaywall';

import { useSleepTimer } from '../hooks/useSleepTimer';

type RouteParams = { id?: string; chamber?: string; trackId?: string };

const FADE_MS = 600;               // fade in/out duration
const SAVE_INTERVAL_MS = 4000;     // how often we save position
const DEFAULT_VOL = 0.9;
const RING_DIM_OPACITY = 0.2;
const RING_NORM_OPACITY = 0.7;
const RING_FLASH_MS = 120;
const SOUNDSCAPE_DEFAULT_MS = 60 * 60 * 1000; // 60 min default for long-form beds

// Near-gapless loop tuning (Option B)
const TIGHT_LOOP_MARGIN_MS = 260;   // pre-empt earlier to avoid EOF
const TIGHT_LOOP_ARM_MS = 3000;     // arm earlier for safety on slower devices
const TIGHT_LOOP_MICRO_INTERVAL_MS = 25; // micro-poll cadence while armed

// Force early end & restart a bit into the file (soundscapes only)
const TIGHT_LOOP_EARLY_MS = 2000;     // cut ~2s before end
const TIGHT_LOOP_RESTART_SEC = 1.2;   // restart ~1.5s from start

const DEBUG_AUDIO = false; // flip on when debugging audio
// logStatus removed: expo-av specific

const DEBUG_OVERLAY = false; // set to true only when debugging

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
  const env = chamberEnvForTrack((selectedTrack?.id || legacyId || ''), (selectedTrack as any) || (meta as any));
  const accent = env?.accent || '#8E7CFF';
  const insets = useSafeAreaInsets();

  const saveTimer = useRef<NodeJS.Timeout | null>(null);

  // --- Membership / entitlement cache (player-level gate) ---
  const entitlementCacheRef = useRef<{ ts: number; has: boolean } | null>(null);
  const getHasMembership = useCallback(async () => {
    try {
      const cached = entitlementCacheRef.current;
      if (cached && (Date.now() - cached.ts) < 10_000) return cached.has;
      const info = await Purchases.getCustomerInfo();
      const has = !!info && !!info.entitlements && Object.keys(info.entitlements.active || {}).length > 0;
      entitlementCacheRef.current = { ts: Date.now(), has };
      return has;
    } catch (e) {
      // Fail closed: if we cannot confirm membership, treat as not entitled.
      return false;
    }
  }, []);

  const presentingGateRef = useRef(false);
  const ensureNotLocked = useCallback(async () => {
    const base: any = selectedTrack ?? meta;
    const id = (selectedTrack as any)?.id || (meta as any)?.id || legacyId || 'default';

    // Build a policy-friendly shape from whatever metadata exists.
    const policyTrack: any = {
      id,
      // Many of your tracks use `category` (soundscapes list) and `isPremium` (chambers).
      // We also map `kind` as a fallback signal.
      category: base?.category ?? base?.categoryKey ?? base?.kind,
      kind: base?.kind,
      isPremium: !!base?.isPremium,
    };

    const hasMembership = await getHasMembership();
    if (isLockedTrack(policyTrack, hasMembership)) {
      if (presentingGateRef.current) return false;
      presentingGateRef.current = true;
      safePresentPaywall(); // modal renders at App level; goBack immediately
      try { navigation.goBack(); } catch {}
      presentingGateRef.current = false;
      return false;
    }
    return true;
  }, [selectedTrack, meta, legacyId, getHasMembership, navigation]);

  const [isPlaying, setIsPlaying] = useState(false);
  const [engineLabel, setEngineLabel] = useState<'TP' | '—'>('—');
  const [position, setPosition] = useState(0);     // ms
  const [duration, setDuration] = useState(0);     // ms
  const [seeking, setSeeking] = useState(false);
  const [volume, setVolume] = useState(DEFAULT_VOL);
  const [sleepMinutes, setSleepMinutes] = useState<number | null>(null);
  const [showTimerMenu, setShowTimerMenu] = useState(false);
  // --- TrackPlayer UI state smoothing ---
const [tpState, setTpState] = useState<State | null>(null);
const uiHoldUntilRef = useRef(0);
const now = () => Date.now();

useEffect(() => {
  const subState = TrackPlayer.addEventListener(Event.PlaybackState, ({ state }) => {
    setTpState(state);
  });

  const subError = TrackPlayer.addEventListener(Event.PlaybackError as any, (e: any) => {
    // This is the most useful signal on TestFlight when a remote URL can't be decoded / ATS blocks / range requests fail.
    console.log('[TP][ERROR] PlaybackError', {
      code: e?.code,
      message: e?.message,
      error: e?.error,
      track: e?.track,
    });
  });

  return () => {
    try { subState.remove(); } catch {}
    try { subError.remove(); } catch {}
  };
}, []);

// Treat Buffering/Connecting as Playing for UI; honor brief hold after seeks/toggles
const isPlayingUI =
  (tpState === State.Playing || tpState === State.Buffering || tpState === State.Connecting) ||
  now() < uiHoldUntilRef.current;
// Canonical play-state for VISUALS (animations).
// Keep this tied to TrackPlayer UI truth so the mandala still breathes while buffering/connecting.
const playingForVisuals = isPlayingUI;
  // Animated controller for drop-up menu
  const menuAnim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (showTimerMenu) {
      Animated.sequence([
        Animated.delay(90), // subtle organic reveal
        Animated.timing(menuAnim, {
          toValue: 1,
          duration: 240,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      Animated.timing(menuAnim, {
        toValue: 0,
        duration: 180, // snappier close
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }).start();
    }
  }, [showTimerMenu]);
  // --- Sleep timer icon pulse animation ---
  const sleepScale = useRef(new Animated.Value(1)).current;
  const pulseSleepIcon = useCallback(() => {
    Animated.sequence([
      Animated.timing(sleepScale, { toValue: 0.94, duration: 90, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      Animated.timing(sleepScale, { toValue: 1.06, duration: 110, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      Animated.timing(sleepScale, { toValue: 1.0, duration: 120, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
    ]).start();
  }, [sleepScale]);
  // Per-option scale animation values for sleep timer
  const optionScales = useRef<{ [key: number]: Animated.Value }>({
    15: new Animated.Value(1),
    30: new Animated.Value(1),
    45: new Animated.Value(1),
    60: new Animated.Value(1),
  }).current;
  // --- Tiny in-app toast for quality swaps ---
  const [toast, setToast] = useState<string | null>(null);
  const toastOpacity = useRef(new Animated.Value(0)).current;
  const showToast = useCallback((msg: string) => {
    setToast(msg);
    toastOpacity.setValue(0);
    Animated.sequence([
      Animated.timing(toastOpacity, { toValue: 1, duration: 180, useNativeDriver: true }),
      Animated.delay(900),
      Animated.timing(toastOpacity, { toValue: 0, duration: 220, useNativeDriver: true }),
    ]).start(() => setToast(null));
  }, [toastOpacity]);
  // One-time gate so we only show the Low Data toast once per session
  const lowToastShownRef = useRef(false);
  // Integrate sleep timer hook
  useSleepTimer(sleepMinutes);

  const durationRef = useRef<number>(0);
  const tpCompletedRef = useRef(false);
  const loopGuardTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const loopMicroPollRef = useRef<NodeJS.Timeout | null>(null);
  // --- Quality tracking (hot-swap when user toggles Low/High) ---
  const appliedQualityRef = useRef(getPreferredQuality());
  const qualitySwapInProgressRef = useRef(false);

  const hotSwapQualityIfNeeded = useCallback(async () => {
    try {
      const currentPref = getPreferredQuality();
      if (currentPref === appliedQualityRef.current || qualitySwapInProgressRef.current) return;
      qualitySwapInProgressRef.current = true;

      // capture current play state + position
      const wasPlayingNow = (await TrackPlayer.getState()) === State.Playing;
      const posSecNow = await TrackPlayer.getPosition();
      const posMsNow = Math.floor((posSecNow || 0) * 1000);

      // resolve new URL via getTrackUrl() honoring global preferredQuality
      const baseMeta: any = selectedTrack ?? meta;
      if (!baseMeta) { qualitySwapInProgressRef.current = false; return; }
      let nextUrl: string | undefined;
      try {
        const res2 = getTrackUrl(baseMeta);
        if (res2.isRemote) {
          // Stream-first for soundscapes to avoid downloading the whole file just to switch quality.
          const cacheFirst = Platform.OS === 'ios' && ((baseMeta as any)?.kind !== 'soundscape');
          if (cacheFirst) {
            try {
              const local = await cacheRemoteOnce(res2.url);
              nextUrl = local || undefined;
            } catch {
              nextUrl = undefined;
            }
          } else {
            nextUrl = res2.url;
          }
        } else if (baseMeta.local) {
          const a2 = Asset.fromModule(baseMeta.local as any);
          await a2.downloadAsync();
          nextUrl = a2.localUri ?? a2.uri;
        }
      } catch {}

      if (!nextUrl) { qualitySwapInProgressRef.current = false; return; }

      // rebuild TP queue with the new source and resume at prior position
      const tpId = selectedTrack?.id || legacyId || 'default';
      try {
        await TrackPlayer.reset();
        await TrackPlayer.setVolume(1.0);
        const kind2 = (selectedTrack as any)?.kind || (meta as any)?.kind;
        const titleStr2 = displayTitle;
        let albumStr2 = 'Inner Journeys';
        if (kind2 === 'soundscape') albumStr2 = 'Inner Soundscapes';
        else if (kind2 === 'chamber') albumStr2 = 'Chamber Series';

        const artAsset2 = Asset.fromModule(require('../assets/images/orb-player-cover.png'));
        try { await artAsset2.downloadAsync(); } catch {}

        await TrackPlayer.add({
          id: tpId,
          url: nextUrl,
          title: titleStr2,
          artist: 'Inner',
          album: albumStr2,
          artwork: (artAsset2 as any).localUri ?? (artAsset2 as any).uri,
          type: 'default',
        } as any);

        if (posMsNow > 0) {
          await TrackPlayer.seekTo(Math.max(0.01, posMsNow / 1000));
          setPosition(posMsNow);
        }
        appliedQualityRef.current = currentPref;
        // Announce first switch to Low data mode only once per session
        if (currentPref === 'lq' && !lowToastShownRef.current) {
          lowToastShownRef.current = true;
          try { await Haptics.selectionAsync(); } catch {}
          showToast('Switched to Low data mode');
        }
        if (currentPref === 'hq' && !lowToastShownRef.current) {
          // Do not set the ref here so Low data toast still shows the first time that happens.
          try { await Haptics.selectionAsync(); } catch {}
          showToast('Switched to High quality');
        }
        if (wasPlayingNow) {
          await TrackPlayer.play();
          setIsPlaying(true);
          uiHoldUntilRef.current = Date.now() + 600;
        }
      } catch {}
    } finally {
      qualitySwapInProgressRef.current = false;
    }
  }, [selectedTrack, meta, displayTitle, showToast]);

  // Keep global preferred quality in sync with AsyncStorage (in case Settings didn’t fire the setter)
  const ensurePreferredFromStorage = useCallback(async () => {
    try {
      const v = await AsyncStorage.getItem('audio:quality');
      const desired = v === 'low' ? 'lq' : 'hq';
      if (desired !== getPreferredQuality()) {
        setPreferredQuality(desired as any);
      }
    } catch {}
    // After syncing, try to swap if needed
    try { await hotSwapQualityIfNeeded(); } catch {}
  }, [hotSwapQualityIfNeeded]);
  // --- Tight loop control refs ---
  const tightLoopArmedRef = useRef(false);
  const tightLoopDidJumpAtRef = useRef<number>(0);

const STORAGE_KEY = `playback:${selectedTrack?.id || legacyId || 'default'}`;


  // Decide if we should use TrackPlayer (system media controls) for soundscapes
  const isSoundscape = ((selectedTrack as any)?.kind || (meta as any)?.kind) === 'soundscape';
  const inferChamberMood = (id?: string): ThreadMood => {
    const safe = (id || '').toLowerCase();
    if (safe.includes('chamber-1') || safe === 'chamber1' || safe.includes('outer-sanctum')) return 'grounded';
    if (safe.includes('chamber-2') || safe === 'chamber2' || safe.includes('inner-flame')) return 'activated';
    if (safe.includes('chamber-3') || safe === 'chamber3' || safe.includes('horizon-gate')) return 'expanded';
    if (safe.includes('chamber-4') || safe === 'chamber4' || safe.includes('resonance-field') || safe.includes('resonance')) return 'reflective';
    if (safe.includes('chamber-5') || safe === 'chamber5' || safe.includes('remembrance-code') || safe.includes('remembrance')) return 'reflective';
    return 'grounded';
  };
  // Always use TrackPlayer now
  const useTP = true;

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

  // TrackPlayer scrub state
  const tpWasPlayingRef = useRef(false);
  const tpPausedDuringScrubRef = useRef(false);

  const [ringOpacity, setRingOpacity] = useState(RING_NORM_OPACITY);
  const [ringStrokeBoost, setRingStrokeBoost] = useState(false);

  const [isPrimed, setIsPrimed] = useState(false);
  const startedAtRef = useRef<number>(0); // timestamp when playback actually advances (>0 position)
  const suppressCompleteRef = useRef<boolean>(true); // block early complete until real start

  // Guarded completion predicate – avoids false "complete" when no real playback occurred
  const shouldMarkComplete = useCallback((posMs: number, durMs: number) => {
    // must have known duration, advanced position, primed playback, and not suppressed
    if (!isPrimed) return false;
    if (suppressCompleteRef.current) return false;
    if (!durMs || durMs <= 1500) return false;
    if (!posMs || posMs <= 0) return false;
    const startedForMs = startedAtRef.current ? (Date.now() - startedAtRef.current) : 0;
    if (startedForMs <= 1500) return false;
    // within last ~0.8s of the track counts as completion
    return posMs >= (durMs - 800);
  }, [isPrimed]);
  const veilOpacity = useRef(new Animated.Value(1)).current;

  const closeOpacity = useRef(new Animated.Value(0)).current;

  // Crossfade from aura → chamber tint
  const chamberFade = useRef(new Animated.Value(0)).current;
  // Brief aura pulse at start (strength 1.0 → 0.75 over ~1s)
  const auraPulse = useRef(new Animated.Value(1)).current;
  // Boosted aura strength for transition (a touch stronger, clamped to 0..1)
  const auraStrength = Animated.multiply(auraPulse, 1.2).interpolate({
    inputRange: [0, 1],
    outputRange: [0, 1],
    extrapolate: 'clamp',
  });

  // Mandala overlay breathing using a continuous phase (avoids end-of-cycle snap)
  const mandalaPhase = useRef(new Animated.Value(0)).current; // 0..1 repeating
  const mandalaLoopRef = useRef<Animated.CompositeAnimation | null>(null);
  const mandalaOpacity = mandalaPhase.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [0.22, 0.74, 0.22], // min → max → min (stronger, more visible “breath”)
    extrapolate: 'clamp',
  });

  // Mandala focus crossfade: blurred when paused, sharp when playing
  // IMPORTANT: we do NOT animate blurRadius (driver conflict). We crossfade two layers instead.
  const mandalaFocus = useRef(new Animated.Value(0)).current; // 0=blurred, 1=sharp
  const mandalaSharpMix = mandalaFocus.interpolate({ inputRange: [0, 1], outputRange: [0, 1] });
  const mandalaBlurMix = mandalaFocus.interpolate({ inputRange: [0, 1], outputRange: [1, 0] });

  useEffect(() => {
    Animated.timing(mandalaFocus, {
      toValue: playingForVisuals ? 1 : 0,
      duration: 520,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [playingForVisuals, mandalaFocus]);

  // Subtle orb stack vertical drift (soundscapes) — runs only while playing
  const orbDriftPhase = useRef(new Animated.Value(0)).current; // 0..1 repeating
  const orbDriftLoopRef = useRef<Animated.CompositeAnimation | null>(null);
  const orbDriftY = orbDriftPhase.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [0, -2, 0], // 1–2px max feels right
    extrapolate: 'clamp',
  });

  const startOrbDrift = useCallback(() => {
    orbDriftPhase.setValue(0);
    try { orbDriftLoopRef.current?.stop?.(); } catch {}
    orbDriftLoopRef.current = Animated.loop(
      Animated.timing(orbDriftPhase, {
        toValue: 1,
        duration: 24000, // slow = subconscious
        easing: Easing.inOut(Easing.quad),
        useNativeDriver: true,
      })
    );
    orbDriftLoopRef.current.start();
  }, [orbDriftPhase]);

  const stopOrbDrift = useCallback(() => {
    try { orbDriftLoopRef.current?.stop(); } catch {}
    orbDriftLoopRef.current = null;
    orbDriftPhase.stopAnimation(() => {});
  }, [orbDriftPhase]);

  // Background parallax (chambers only)
  const bgPhase = useRef(new Animated.Value(0)).current;
  const bgLoopRef = useRef<Animated.CompositeAnimation | null>(null);
  const bgScale = bgPhase.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [1, 1.04, 1],
    extrapolate: 'clamp',
  });
  const bgTx = bgPhase.interpolate({ inputRange: [0, 0.5, 1], outputRange: [-8, 8, -8] });
  const bgTy = bgPhase.interpolate({ inputRange: [0, 0.5, 1], outputRange: [-6, 6, -6] });

  const startBgParallax = useCallback(() => {
    // restart cleanly
    bgPhase.setValue(0);
    bgLoopRef.current?.stop?.();
    bgLoopRef.current = Animated.loop(
      Animated.timing(bgPhase, {
        toValue: 1,
        duration: 16000,
        easing: Easing.inOut(Easing.quad),
        useNativeDriver: true,
      })
    );
    bgLoopRef.current.start();
  }, [bgPhase]);

  const stopBgParallax = useCallback(() => {
    try { bgLoopRef.current?.stop(); } catch {}
    bgLoopRef.current = null;
    bgPhase.stopAnimation(() => {});
  }, [bgPhase]);

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
    if (playingForVisuals) {
      startMandala();
      if (!isSoundscape) startBgParallax();
      if (isSoundscape) startOrbDrift();
    } else {
      stopMandala();
      if (!isSoundscape) stopBgParallax();
      if (isSoundscape) stopOrbDrift();
      // hold whatever opacity parent sets
    }
    return () => { /* no-op here; unmount handled below */ };
  }, [
    playingForVisuals,
    startMandala,
    stopMandala,
    startBgParallax,
    stopBgParallax,
    isSoundscape,
    startOrbDrift,
    stopOrbDrift,
  ]);

  // Cleanup on unmount
  // On enter, fade from the app's current aura to the chamber-tinted overlay
  useEffect(() => {
    chamberFade.setValue(0);
    Animated.timing(chamberFade, {
      toValue: 1,
      duration: 2500, // was 350 — longer to make the effect more noticeable
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
    // Reset and animate aura strength down slightly (keep it stronger, fade a bit longer)
    auraPulse.setValue(1);
    Animated.timing(auraPulse, {
      toValue: 0.88,
      duration: 1400,
      easing: Easing.inOut(Easing.quad),
      useNativeDriver: true,
    }).start();

    return () => {
      stopMandala();
      stopBgParallax();
      stopOrbDrift();
      mandalaPhase.setValue(0);
    };
  }, [stopMandala, stopBgParallax, stopOrbDrift, mandalaPhase]);

  // Tie mandala breathing to play state: breathe when playing, dim when paused
  const finalMandalaBaseOpacity: any = playingForVisuals ? mandalaOpacity : 0.24;
  const finalMandalaSharpOpacity: any = Animated.multiply(finalMandalaBaseOpacity, mandalaSharpMix);
  const finalMandalaBlurOpacity: any = Animated.multiply(finalMandalaBaseOpacity, mandalaBlurMix);

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
      if (useTP) {
        try { await TrackPlayer.seekTo(0); } catch {}
        try { await TrackPlayer.play(); } catch {}
      } else {
        await soundRef.current?.setPositionAsync(0);
        await soundRef.current?.playAsync();
      }
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

  // fadeTo removed: expo-av only

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
      // Player-level hard gate: prevents deep links / search from bypassing locks.
      const allowed = await ensureNotLocked();
      if (!allowed) return;
      // Fresh state for new track load
      setShowComplete(false);
      setIsPlaying(false);
      setPosition(0);
      setDuration(0);
      durationRef.current = 0;
      setIsPrimed(false);
      veilOpacity.setValue(1);
      setRingOpacity(RING_NORM_OPACITY);
      setEngineLabel('TP');
      suppressCompleteRef.current = true;
      startedAtRef.current = 0;
      // Track which quality is currently applied
      appliedQualityRef.current = getPreferredQuality();

      try {
        // --- TrackPlayer path (now always used) ---
        if (useTP) { tpCompletedRef.current = false;
          await setupTrackPlayerOnce();

          // Resolve URL (prefer cached local if available, else remote, else asset)
          let url: string | undefined;
          try {
            const baseMeta: any = selectedTrack ?? meta;
            if (baseMeta) {
              const res = getTrackUrl(baseMeta);
              if (res.isRemote) {
                // Stream-first for soundscapes to avoid huge cache + long “first play” waits.
                // Cache-first for chambers on iOS for reliability.
                const cacheFirst = Platform.OS === 'ios' && !isSoundscape;

                if (cacheFirst) {
                  try {
                    const local = await cacheRemoteOnce(res.url);
                    if (local) {
                      url = local;
                      console.log('[TP] using cached local (cache-first) →', url);
                    } else {
                      console.log('[TP] cache-first required but cacheRemoteOnce returned null', { remote: res.url });
                      url = undefined;
                    }
                  } catch (err) {
                    console.log('[TP] cacheRemoteOnce failed (cache-first)', { remote: res.url, err });
                    url = undefined;
                  }
                } else {
                  // Stream immediately (no implicit caching). Explicit download/offline flows handled elsewhere.
                  url = res.url;
                  console.log('[TP] streaming remote (no cache) →', url);
                }
              } else if (baseMeta.local) {
                // Bundled/local asset
                const asset = Asset.fromModule(baseMeta.local as any);
                await asset.downloadAsync();
                url = asset.localUri ?? asset.uri;
                console.log('[TP] using bundled asset →', url);
              }
            }
          } catch (e) {
            console.log('[TP] getTrackUrl/cache resolve error', e);
          }

          // Guard: abort setup if no URL was resolved
          if (!url) {
            console.log('[TP] No URL resolved for playback', {
              platform: Platform.OS,
              dev: __DEV__,
              trackId: selectedTrack?.id || legacyId,
              kind: (selectedTrack as any)?.kind || (meta as any)?.kind,
            });
            // Keep UI in a safe state; this will surface as 00:00/— but with clear logs.
            setIsPlaying(false);
            setEngineLabel('TP');
            return;
          }

          // --- Minimal TP queueing + play (no artwork/metadata/repeat) ---
          const tpId = selectedTrack?.id || legacyId || 'default';
          try {
            console.log('[TP] reset()');
            await TrackPlayer.reset();
            await TrackPlayer.setVolume(1.0);
            // Sanity check: confirm the cached file exists and has non-zero size.
            try {
              const FileSystem = require('expo-file-system');
              if (typeof url === 'string' && url.startsWith('file://')) {
                const info = await FileSystem.getInfoAsync(url);
                console.log('[TP] local file info', { exists: info?.exists, size: info?.size, uri: info?.uri });
              }
            } catch (e) {
              console.log('[TP] local file info error', e);
            }
            console.log('[TP] add() start', {
              id: tpId,
              title: displayTitle,
              url,
              isLocalFile: typeof url === 'string' ? url.startsWith('file://') : false,
            });

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
              type: 'default',
            } as any);
            console.log('[TP] add() done');

            // Fallback: if the queue ends unexpectedly on a soundscape, restart immediately
            try {
              const endSub = TrackPlayer.addEventListener(Event.PlaybackQueueEnded, async (e: any) => {
                if (!isSoundscape) return;
                // If we just jumped pre-EOF, ignore the event
                if (tightLoopDidJumpAtRef.current && Date.now() - tightLoopDidJumpAtRef.current < 400) return;
                try {
                  await TrackPlayer.seekTo(Math.max(0.01, TIGHT_LOOP_RESTART_SEC));
                  await TrackPlayer.play();
                  setPosition(Math.floor(TIGHT_LOOP_RESTART_SEC * 1000));
                  uiHoldUntilRef.current = Date.now() + 600;
                } catch {}
              });
              (saveNow as any).__tpEndSub = endSub;
            } catch {}

            // Loop soundscapes by default (safe, v4)
            if (isSoundscape) {
              console.log('[TP] setRepeatMode(Off) for tight loop');
              await TrackPlayer.setRepeatMode(RepeatMode.Off);
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
            setEngineLabel('TP');
            uiHoldUntilRef.current = Date.now() + 600;

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
                try { await TrackPlayer.play(); uiHoldUntilRef.current = Date.now() + 600; } catch {}
                try { await TrackPlayer.seekTo(0.05); } catch {}
              }
              // Second check: if still not advancing, surface a clear log and keep UI safe.
              // (We removed expo-av fallback; a missing fallback was causing a runtime ReferenceError.)
              try {
                let advanced2 = false;
                const t1 = Date.now();
                while (Date.now() - t1 < 1500) {
                  const pos2 = await TrackPlayer.getPosition();
                  const dur2 = await TrackPlayer.getDuration();
                  const st2 = await TrackPlayer.getState();
                  if ((pos2 ?? 0) > 0.05 || (st2 === State.Playing && (dur2 ?? 0) > 0)) { advanced2 = true; break; }
                  await new Promise(r => setTimeout(r, 150));
                }
                if (!advanced2) {
                  console.log('[TP] watchdog: still stalled — TrackPlayer could not start playback', {
                    platform: Platform.OS,
                    url,
                  });
                  // Ensure we don't show a misleading playing state.
                  setIsPlaying(false);
                  uiHoldUntilRef.current = 0;
                  return;
                }
              } catch (e) {
                console.log('[TP] secondary watchdog error', e);
              }
            } catch (e) {
              console.log('[TP] watchdog error', e);
            }

            // Mark UI as primed now that playback started (TrackPlayer path)
            if (!isPrimed) {
              setIsPrimed(true);
              startedAtRef.current = Date.now();
              suppressCompleteRef.current = false;
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
                  uiHoldUntilRef.current = Date.now() + 600;
                }
              } catch {}
            }, 500);

            // Poll progress while in this screen
            const interval = setInterval(async () => {
              try {
                const pos = await TrackPlayer.getPosition();
                const dur = (await TrackPlayer.getDuration()) || durationRef.current || 1;
                setPosition(Math.floor(pos * 1000));

                // --- Tight loop (soundscapes only) ---
                if (isSoundscape) {
                  const pMs = Math.floor((pos || 0) * 1000);
                  const dSecLive = await TrackPlayer.getDuration();
                  const dMs = Math.floor(((dSecLive || 0) * 1000));
                  if (dMs > 1000) {
                    const remaining = dMs - pMs;

                    // Enter high-frequency poller in the last few seconds
                    if (remaining <= TIGHT_LOOP_ARM_MS) {
                      if (!tightLoopArmedRef.current) {
                        tightLoopArmedRef.current = true;
                        tightLoopDidJumpAtRef.current = 0;
                      }
                      if (!loopMicroPollRef.current) {
                        loopMicroPollRef.current = setInterval(async () => {
                          try {
                            const posNow = await TrackPlayer.getPosition();
                            const durNow = await TrackPlayer.getDuration();
                            const remNow = Math.floor(((durNow || 0) * 1000) - ((posNow || 0) * 1000));

                            // If we've already jumped and we're clearly past restart point, nothing to do
                            if (tightLoopDidJumpAtRef.current && (posNow * 1000) > (TIGHT_LOOP_RESTART_SEC * 1000 + 600)) {
                              // keep polling for next cycle arm
                            }

                            // Pre-empt EOF aggressively: cut ~2s early and restart ~1.5s in
                            if (remNow <= TIGHT_LOOP_EARLY_MS) {
                              const stNow = await TrackPlayer.getState();
                              if (stNow === State.Playing || stNow === State.Buffering || stNow === State.Connecting) {
                                try {
                                  const restartSec = Math.max(0.01, TIGHT_LOOP_RESTART_SEC);
                                  await TrackPlayer.seekTo(restartSec);
                                  setPosition(Math.floor(restartSec * 1000));
                                  uiHoldUntilRef.current = Date.now() + 600;
                                  tightLoopDidJumpAtRef.current = Date.now();
                                } catch {}
                              }
                            }

                            // If we left the arm window (user scrubbed away), stop micropoll
                            if (remNow > (TIGHT_LOOP_ARM_MS + 50)) {
                              if (loopMicroPollRef.current) { clearInterval(loopMicroPollRef.current); loopMicroPollRef.current = null; }
                              tightLoopArmedRef.current = false;
                            }
                          } catch {}
                        }, TIGHT_LOOP_MICRO_INTERVAL_MS);
                      }
                    } else {
                      // Not inside ARM window: ensure micro-poller is stopped
                      if (loopMicroPollRef.current) { clearInterval(loopMicroPollRef.current); loopMicroPollRef.current = null; }
                      tightLoopArmedRef.current = false;
                    }
                  }
                }

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
                    if (shouldMarkComplete(pMs, dMs)) {
                      tpCompletedRef.current = true;
                      try {
                        await TrackPlayer.pause();
                        await TrackPlayer.seekTo(0);
                      } catch {}
                      setIsPlaying(false);
                      setPosition(0);
                      try { await savePosition(0); } catch {}
                      showCompletionBanner();
                      const chamberId = selectedTrack?.id || legacyId || 'default';

                      // Mark chamber complete (existing behavior)
                      try {
                        markCompleted(chamberId);
                      } catch {}

                      // ThresholdEngine now handles queuing a structured payload for HomeScreen
                      try {
                        await maybeQueueThreshold({ event: { type: 'chamber_complete', chamberId } });
                      } catch (e) {
                        console.log('[Threshold] chamber threshold error', e);
                      }

                      // Journey Threading v1: record this chamber as the last completed step
                      try {
                        const mood = inferChamberMood(chamberId);
                        await saveThreadSignature({
                          type: 'chamber',
                          id: chamberId,
                          mood,
                          timestamp: Date.now(),
                        });
                      } catch (e) {
                        console.log('[Threading] chamber thread save error', e);
                      }
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

        // No expo-av fallback path
        return;
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
      // Clear TrackPlayer poller if set
      if ((saveNow as any).__tpInt) { clearInterval((saveNow as any).__tpInt); (saveNow as any).__tpInt = null; }
      setIsPrimed(false);
      veilOpacity.setValue(1);
      setRingOpacity(RING_NORM_OPACITY);
      // No expo-av cleanup needed
      if (loopGuardTimeoutRef.current) { clearTimeout(loopGuardTimeoutRef.current); loopGuardTimeoutRef.current = null; }
      if (loopMicroPollRef.current) { clearInterval(loopMicroPollRef.current); loopMicroPollRef.current = null; }
      tightLoopArmedRef.current = false;
      tightLoopDidJumpAtRef.current = 0;
      try { (saveNow as any).__tpEndSub?.remove?.(); (saveNow as any).__tpEndSub = null; } catch {}
      presentingGateRef.current = false;
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
    // TrackPlayer only
    try {
      const durWarm = durationRef.current || (await TrackPlayer.getDuration()) || 0;
      const stWarm = await TrackPlayer.getState();
      if (durWarm <= 0 || !isPrimed || stWarm === State.Buffering) {
        try { await TrackPlayer.play(); } catch {}
        setIsPlaying(true);
        return;
      }
    } catch {}
    try {
      const st = await TrackPlayer.getState();
      if (st === State.Playing) {
        const pos = await TrackPlayer.getPosition();
        await TrackPlayer.pause();
        await savePosition(Math.floor(pos * 1000));
        setIsPlaying(false);
      } else {
        await TrackPlayer.play();
        setIsPlaying(true);
        uiHoldUntilRef.current = Date.now() + 600; // ~0.6s smoothing
      }
    } catch {}
    return;
  }, [isPrimed]);

  const onSlidingStart = () => setSeeking(true);
  const onSlidingComplete = async (val: number) => {
    setSeeking(false);
    try {
      await seekToMs(val);
      setPosition(val);
      await savePosition(val);
      await Haptics.selectionAsync();
      uiHoldUntilRef.current = Date.now() + 600; // ~0.6s smoothing
    } catch {}
  };

  const handleClose = async () => {
    try {
      const pos = await TrackPlayer.getPosition();
      const posMs = Math.floor(pos * 1000);
      await savePosition(posMs);
      // Save snapshot
      try {
        const dur = (await TrackPlayer.getDuration()) || 0;
        await saveNow({
          trackId: selectedTrack?.id || legacyId || 'default',
          title: displayTitle,
          category: (selectedTrack as any)?.kind || (meta as any)?.kind || undefined,
          positionMillis: posMs,
          durationMillis: Math.floor(dur * 1000),
          isLooping: true,
          completed: false,
        });
      } catch {}
      // Journey Threading v1: treat closing an active soundscape as a completed soundscape session
      try {
        if (isSoundscape && posMs > 5000) {
          await saveThreadSignature({
            type: 'soundscape',
            id: selectedTrack?.id || legacyId || 'default',
            mood: 'expanded',
            timestamp: Date.now(),
          });
        }
      } catch (e) {
        console.log('[Threading] soundscape thread save error', e);
      }
      // ThresholdEngine now handles queuing a structured payload for HomeScreen
      try {
        if (isSoundscape && posMs > 5 * 60 * 1000) {
          await maybeQueueThreshold({ event: { type: 'ritual_complete', ritualId: 'soundscape_session' } });
        }
      } catch (e) {
        console.log('[Threshold] soundscape threshold error', e);
      }
      await TrackPlayer.pause();
    } catch {}
    navigation.goBack();
  };

  // Orb / ring geometry
  const ORB_SIZE = 250;
  const ORB_VISUAL_SCALE = 1.10;
  const ORB_VISUAL_SIZE = ORB_SIZE * ORB_VISUAL_SCALE;

  // Mandala overlay tuning (keeps breathing, hides outer ember rim)
  const MANDALA_SCALE = 1.0;          // keep 1.0 unless you want the mandala slightly smaller/larger
  const MANDALA_EDGE_MASK = 32;       // px thickness that covers the orange rim
  const MANDALA_EDGE_MASK_COLOR = 'rgba(8,6,12,0.78)'; // matches the app veil/space tone

  // Ring now exactly matches orb visual diameter
  const RING_SIZE = ORB_VISUAL_SIZE;
  const STROKE = 8;

  // Playback progress 0..1
  const safeDur = duration && duration > 50 ? duration : 0; // ignore sub-50ms noise
  const progress = Math.min(1, Math.max(0, safeDur ? position / safeDur : 0));
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

  // Choose a safe, non-zero duration for scrubbing math
  const getSeekableDuration = () => {
    const metaAny: any = selectedTrack ?? meta;
    const metaDur =
      (metaAny?.durationMs ? Number(metaAny.durationMs) : 0) ||
      (metaAny?.durationSec ? Number(metaAny.durationSec) * 1000 : 0);
    const candidate =
      (durationRef.current && durationRef.current > 0 ? durationRef.current : 0) ||
      (duration && duration > 0 ? duration : 0) ||
      (isSoundscape ? SOUNDSCAPE_DEFAULT_MS : 0) ||
      metaDur;
    return Math.max(1000, candidate); // never below 1s, avoids 0→seek-to-start glitches
  };

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
        // While scrubbing, suppress accidental "complete" and pause engines as needed
        suppressCompleteRef.current = true;

        if (useTP) {
          tpWasPlayingRef.current = false;
          tpPausedDuringScrubRef.current = false;
          try {
            const st = await TrackPlayer.getState();
            tpWasPlayingRef.current = (st === State.Playing);
            if (tpWasPlayingRef.current) {
              try { await TrackPlayer.pause(); } catch {}
              tpPausedDuringScrubRef.current = true;
            }
          } catch {}
        }

        const p = pointToProgress(locationX, locationY);
        if (p == null) return;
        isScrubbingRef.current = true;
        setSeeking(true);

        // Expo‑AV path: remember running state and pause handled above for TP
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
                pausedDuringScrubRef.current = true;
              }
            } catch {}
          }
        }

        const safeDur = getSeekableDuration();
        const target = Math.max(10, Math.min(safeDur - 1, Math.floor(safeDur * p)));
        setPosition(target);
        try { await seekToMs(target); } catch {}
      },
      onPanResponderMove: async (evt) => {
        if (!isScrubbingRef.current) return;
        const { locationX, locationY } = (evt as any).nativeEvent;
        const p = pointToProgress(locationX, locationY);
        if (p == null) return;
        const safeDur = getSeekableDuration();
        const target = Math.max(10, Math.min(safeDur - 1, Math.floor(safeDur * p)));
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
        const safeDur = getSeekableDuration();
        const target = Math.max(10, Math.min(safeDur - 1, Math.floor(safeDur * baseP)));
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

        // Resume TrackPlayer playback only if we paused during this scrub
        if (useTP && tpPausedDuringScrubRef.current) {
          try { await TrackPlayer.play(); uiHoldUntilRef.current = Date.now() + 600; } catch {}
          tpPausedDuringScrubRef.current = false;
          tpWasPlayingRef.current = false;
        }

        // Re-enable completion check after a tiny delay so post-seek state settles
        setTimeout(() => { suppressCompleteRef.current = false; }, 200);

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
  // Loop toggle removed: expo-av only (TrackPlayer loop is set on load)

  const skipBy = useCallback(async (deltaMs: number) => {
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
      uiHoldUntilRef.current = Date.now() + 600;
    } catch {}
    return;
  }, []);

  // --- Seek to ms helper (TP/expo-av aware) ---
  const seekToMs = useCallback(async (ms: number) => {
    // Clamp into [0, duration-1] to avoid end-of-track edge cases
    const maxDur = (durationRef.current && durationRef.current > 0)
      ? durationRef.current - 1
      : Number.MAX_SAFE_INTEGER;
    const clamped = Math.max(0, Math.min(maxDur, ms));
    try {
      await TrackPlayer.seekTo(clamped / 1000);
      setPosition(clamped);
      try {
        const st = await TrackPlayer.getState();
        if (st !== State.Playing) {
          await TrackPlayer.play();
          uiHoldUntilRef.current = Date.now() + 600; // ~0.6s smoothing
        }
      } catch {}
      setTimeout(async () => {
        try {
          const posSec = await TrackPlayer.getPosition();
          const posMs = Math.floor((posSec || 0) * 1000);
          if (clamped > 2000 && posMs <= 250) {
            await TrackPlayer.seekTo(clamped / 1000);
            setPosition(clamped);
          }
        } catch {}
      }, 120);
    } catch {}
    return;
  }, []);

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

  // Watch for storage or global preference changes and hot-swap accordingly
  useEffect(() => {
    const int = setInterval(() => { ensurePreferredFromStorage().catch(() => {}); }, 1200);
    return () => clearInterval(int);
  }, [ensurePreferredFromStorage]);

  return (
    <View style={styles.container}>
      {/* Chamber environment background (blurred image) */}
      {!!env?.backgroundImage && (
        <Animated.Image
          pointerEvents="none"
          source={env.backgroundImage as any}
          blurRadius={env?.blur ?? 1}
          resizeMode="cover"
          // On some Android devices very large images may not auto-scale; this
          // forces a proper downscale instead of showing only the top-left corner.
          resizeMethod="resize"
          style={[
            StyleSheet.absoluteFill,
            { width: '100%', height: '100%', transform: [{ scale: bgScale }, { translateX: bgTx }, { translateY: bgTy }] }
          ]}
        />
      )}

      {/* Aura → Chamber crossfade overlays */}
      <Animated.View
        pointerEvents="none"
        style={[
          StyleSheet.absoluteFill,
          { opacity: Animated.subtract(1, chamberFade) },
        ]}
      >
        {/* Uses the existing aura overlay from Home/Essence; if this component renders nothing, the fade is effectively a no-op on the aura layer */}
        <AuraOverlay strength={auraStrength as any} />
      </Animated.View>

      <Animated.View
        pointerEvents="none"
        style={[
          StyleSheet.absoluteFill,
          { opacity: chamberFade },
        ]}
      >
        {/* Chamber-tinted gradient that softly lifts the environment using its accent color */}
        <LinearGradient
          colors={[`${accent}24`, `${accent}14`, 'transparent']}
          locations={[0, 0.35, 1]}
          style={StyleSheet.absoluteFill}
        />
      </Animated.View>

      {/* Ambient veil to keep foreground legible */}
      <View
        pointerEvents="none"
        style={[
          StyleSheet.absoluteFill,
          {
            backgroundColor: 'rgba(8,6,12,0.55)',
            opacity: env?.overlayOpacity ?? 1,
          },
        ]}
      />

      {/* Foreground content wrapper (keeps previous layout) */}
      <View style={{ flex: 1, paddingTop: 80, paddingHorizontal: 20 }}>
      <Text style={[Typography.display, { color: '#F0EEF8', textAlign: 'center', letterSpacing: 0.3 }]}>{displayTitle}</Text>
      <View style={{ height: 16 }} />

      {/* Transport */}
      <View style={styles.transport}>
        <LinearGradient
          colors={[playingForVisuals ? 'rgba(255,173,102,0.78)' : 'rgba(178,139,255,0.75)', 'rgba(125,91,214,0.85)']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.controlBtn}
        >
          <View pointerEvents="none" style={styles.controlBtnInset} />
          <TouchableOpacity
            onPress={toggle}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel={isPlayingUI ? 'Pause' : 'Play'}
            accessibilityHint={isPlayingUI ? 'Pauses playback' : 'Starts playback'}
            style={{ width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center' }}
            activeOpacity={0.85}
          >
            <Ionicons name={isPlayingUI ? 'pause' : 'play'} size={28} color="rgba(14,10,20,0.9)" />
          </TouchableOpacity>
        </LinearGradient>
      </View>

      {/* 
        Use a "safe" duration (fallback if needed) for display so users don't see 0:00/0:00 on streams.
      */}
      <Text
        style={[
          Typography.caption,
          {
            color: '#B9B5C9',
            textAlign: 'center',
            marginTop: 6,
            marginBottom: 6,
            letterSpacing: 0.9,
          },
        ]}
      >
        {(durationRef.current && durationRef.current > 0)
          ? `${mmss(position)} / −${mmss(Math.max(0, durationRef.current - position))}`
          : (duration > 0
              ? `${mmss(position)} / −${mmss(Math.max(0, duration - position))}`
              : 'warming…')}
      </Text>

      {/* Quality indicator */}
      <View style={styles.qualityWrap}>
        <Text style={styles.qualityText}>
          {getPreferredQuality() === 'hq' ? 'High Quality Audio' : 'Low Data Mode'}
        </Text>
      </View>

      {/* Orb portal player visual */}
      {isSoundscape && (
        <View style={styles.orbContainer} {...panResponder.panHandlers}>
          <Animated.View
            style={{
              width: RING_SIZE,
              height: RING_SIZE,
              alignItems: 'center',
              justifyContent: 'center',
              transform: [{ translateY: orbDriftY }],
            }}
          >
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
                top: 0,
                left: 0,
                zIndex: 1,
                pointerEvents: 'none',
              }}
            >
              <Circle cx={RING_SIZE / 2} cy={RING_SIZE / 2} r={r} stroke="#5A4E9C" strokeWidth={STROKE + (ringStrokeBoost ? 2 : 0)} fill="none" opacity={0.20} />
              <Circle cx={RING_SIZE / 2} cy={RING_SIZE / 2} r={r} stroke="#5A4E9C" strokeWidth={STROKE + (ringStrokeBoost ? 2 : 0)} strokeLinecap="round" strokeDasharray={`${dash},${gap}`} rotation="-90" originX={RING_SIZE / 2} originY={RING_SIZE / 2} fill="none" opacity={ringOpacity} />
            </Svg>

            <Pressable
              onPressIn={handleOrbPressIn}
              accessibilityRole="button"
              accessibilityLabel={isPlayingUI ? 'Pause' : 'Play'}
              accessibilityHint={isPlayingUI
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
                size={ORB_VISUAL_SIZE}
                imageSource={require('../assets/splash.webp')}
                enhance
                overlayScale={0.83}
                overlayOffsetX={-3}
                overlayOffsetY={0}
              />
              {/* Mandala (blurred layer when paused) */}
              <Animated.Image
                source={require('../assets/images/orb-player-mandala.webp')}
                resizeMode="contain"
                blurRadius={2}
                style={{
                  position: 'absolute',
                  width: ORB_VISUAL_SIZE * MANDALA_SCALE,
                  height: ORB_VISUAL_SIZE * MANDALA_SCALE,
                  top: '50%',
                  left: '50%',
                  transform: [
                    { translateX: -(ORB_VISUAL_SIZE * MANDALA_SCALE) / 2 },
                    { translateY: -(ORB_VISUAL_SIZE * MANDALA_SCALE) / 2 },
                    { scale: 1.002 },
                  ],
                  opacity: finalMandalaBlurOpacity,
                }}
              />

              {/* Mandala (sharp layer when playing) */}
              <Animated.Image
                source={require('../assets/images/orb-player-mandala.webp')}
                resizeMode="contain"
                style={{
                  position: 'absolute',
                  width: ORB_VISUAL_SIZE * MANDALA_SCALE,
                  height: ORB_VISUAL_SIZE * MANDALA_SCALE,
                  top: '50%',
                  left: '50%',
                  transform: [
                    { translateX: -(ORB_VISUAL_SIZE * MANDALA_SCALE) / 2 },
                    { translateY: -(ORB_VISUAL_SIZE * MANDALA_SCALE) / 2 },
                  ],
                  opacity: finalMandalaSharpOpacity,
                }}
              />

              {/* Mask the mandala’s outer rim so the orange/ember edge doesn’t show */}
              <View
                pointerEvents="none"
                style={{
                  position: 'absolute',
                  width: ORB_VISUAL_SIZE,
                  height: ORB_VISUAL_SIZE,
                  top: '50%',
                  left: '50%',
                  transform: [
                    { translateX: -ORB_VISUAL_SIZE / 2 },
                    { translateY: -ORB_VISUAL_SIZE / 2 },
                  ],
                  borderRadius: ORB_VISUAL_SIZE / 2,
                  borderWidth: MANDALA_EDGE_MASK,
                  borderColor: MANDALA_EDGE_MASK_COLOR,
                }}
              />
            </Pressable>
          </Animated.View>
        </View>
      )}
      {!isSoundscape && <View style={{ flex: 1 }} />}

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
              style={[Typography.title, { color: '#EDE8FA', textAlign: 'center', letterSpacing: 0.3, marginBottom: 6 }]}
            >
              {displayTitle}: Journey Complete
            </Text>

            <View style={{ flexDirection: 'row', columnGap: 16, justifyContent: 'center' }}>
              <Pressable onPress={handleReplay} accessibilityRole="button" accessibilityLabel="Replay session">
                <Text style={[Typography.caption, { color: '#C9B6FF' }]}>Replay</Text>
              </Pressable>
              <Pressable onPress={() => navigation.goBack()} accessibilityRole="button" accessibilityLabel="Return Home">
                <Text style={[Typography.caption, { color: '#FFC7A3' }]}>Return Home</Text>
              </Pressable>
            </View>
          </View>
        </Animated.View>
      )}

      {/* Toast overlay */}
      {toast && (
        <Animated.View
          pointerEvents="none"
          style={{
            position: 'absolute',
            top: insets.top + 10,
            left: 24,
            right: 24,
            alignItems: 'center',
            opacity: toastOpacity,
            zIndex: 50,
            transform: [{ translateY: toastOpacity.interpolate({ inputRange: [0, 1], outputRange: [8, 0] }) }],
          }}
        >
          <View style={{
            paddingVertical: 8,
            paddingHorizontal: 12,
            borderRadius: 12,
            backgroundColor: 'rgba(12, 8, 14, 0.8)',
            borderWidth: 1,
            borderColor: 'rgba(255,255,255,0.08)'
          }}>
            <Text style={[Typography.caption, { color: '#EDE8FA' }]}>{toast}</Text>
          </View>
        </Animated.View>
      )}

      {/* Sleep Timer UI */}
      {isSoundscape && (
        <View style={{ alignItems: 'center', marginTop: 12 }}>
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel={showTimerMenu ? 'Close sleep timer menu' : 'Open sleep timer menu'}
            accessibilityHint="Opens options for 15, 30, 45, or 60 minutes"
            accessibilityState={{ expanded: showTimerMenu }}
            onPress={async () => {
              pulseSleepIcon();
              try { await Haptics.selectionAsync(); } catch {}
              setShowTimerMenu(prev => !prev);
            }}
            activeOpacity={0.95}
            style={{
              alignItems: 'center',
              justifyContent: 'center',
              padding: 12, // 44x44-ish hit target
            }}
          >
            <Animated.View
              style={{
                width: 72,
                height: 72,
                borderRadius: 36,
                alignItems: 'center',
                justifyContent: 'center',
                position: 'relative',
                backgroundColor: sleepMinutes ? '#CFC3E0' : 'transparent',
                // Disable glow when selected; keep mild lifted shadow when not selected (iOS-only)
                shadowColor: sleepMinutes ? 'transparent' : '#CFC3E0',
                shadowOpacity: sleepMinutes ? 0 : 0.45,
                shadowRadius: sleepMinutes ? 0 : 12,
                shadowOffset: sleepMinutes ? { width: 0, height: 0 } : { width: 0, height: -16 },
                elevation: 0, // no Android elevation; we want a flat filled circle when selected
                transform: [{ scale: sleepScale }],
              }}
            >
              <SleepIcon width={60} height={60} fill={sleepMinutes ? '#1F233A' : '#CFC3E0'} />
              {sleepMinutes && (
                <View
                  style={{
                    position: 'absolute',
                    right: -8,
                    top: -6,
                    paddingHorizontal: 6,
                    paddingVertical: 2,
                    borderRadius: 10,
                    backgroundColor: '#CFC3E0',
                  }}
                >
                  <Text
                    style={{
                      fontFamily: 'Inter-ExtraLight',
                      fontSize: 10,
                      color: '#1F233A',
                    }}
                  >
                    {sleepMinutes}m
                  </Text>
                </View>
              )}
            </Animated.View>
          </TouchableOpacity>

          <Animated.View
            style={{
              opacity: menuAnim,
              transform: [{
                translateY: menuAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [10, -6],
                }),
              }],
            }}
          >
            <View style={{ flexDirection: 'row', justifyContent: 'center', marginTop: 10 }}>
              {[15, 30, 45, 60].map(opt => (
                <TouchableOpacity
                  key={opt}
                  onPress={() => {
                    Animated.sequence([
                      Animated.timing(optionScales[opt], { toValue: 0.94, duration: 70, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
                      Animated.timing(optionScales[opt], { toValue: 1.06, duration: 100, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
                      Animated.timing(optionScales[opt], { toValue: 1.0, duration: 90, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
                    ]).start();
                    setSleepMinutes(prev => prev === opt ? null : opt);
                    setShowTimerMenu(false);
                  }}
                  style={{
                    paddingVertical: 8,
                    paddingHorizontal: 14,
                    borderRadius: 14,
                    borderWidth: 1,
                    borderColor: sleepMinutes === opt ? '#CFC3E0' : 'rgba(207,195,224,0.4)',
                    backgroundColor: sleepMinutes === opt ? '#CFC3E0' : 'transparent',
                    marginHorizontal: 4,
                    transform: [{ scale: optionScales[opt] }],
                  }}
                >
                  <Text
                    style={{
                      fontFamily: 'Inter-ExtraLight',
                      fontSize: 13,
                      color: sleepMinutes === opt ? '#1F233A' : '#E8E4F3',
                    }}
                  >
                    {opt} min
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </Animated.View>
        </View>
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
          <Text style={[Typography.body, { color: '#E8E4F3' }]}>Close</Text>
        </TouchableOpacity>
      </Animated.View>
      {__DEV__ && DEBUG_OVERLAY && (
        <View style={{ position: 'absolute', right: 10, bottom: 10, backgroundColor: 'rgba(0,0,0,0.38)', paddingHorizontal: 10, paddingVertical: 8, borderRadius: 8, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' }}>
          <Text style={[Typography.caption, { color: '#EDE8FA' }]}>Engine: {engineLabel}</Text>
          <Text style={[Typography.caption, { color: '#C6C1D8' }]}>Playing: {String(isPlaying)}</Text>
          <Text style={[Typography.caption, { color: '#C6C1D8' }]}>Primed: {String(isPrimed)}</Text>
          <Text style={[Typography.caption, { color: '#C6C1D8' }]}>Pos/Dur: {duration > 0 ? `${mmss(position)} / ${mmss(duration)}` : '—'}</Text>
        </View>
      )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  transport: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginBottom: 0 },
  btn: { paddingVertical: 10, paddingHorizontal: 16, borderRadius: 12, backgroundColor: 'rgba(207,195,224,0.18)' },
  slider: { width: '90%', alignSelf: 'center', height: 30, marginTop: 12 },
  close: { alignSelf: 'center', marginTop: 18, marginBottom: 56, paddingVertical: 10, paddingHorizontal: 18, borderRadius: 16, borderWidth: 1, borderColor: 'rgba(207,195,224,0.4)', backgroundColor: 'transparent' },
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
  controlBtnInset: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 36,
    // subtle “inset” depth + etched rim (deeper inner-shadow, softer rim)
    backgroundColor: 'rgba(0,0,0,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.16)',
  },
  qualityWrap: {
    alignItems: 'center',
    marginTop: 4,
    marginBottom: 8,
  },
  qualityText: {
    fontFamily: 'CalSans-SemiBold',
    fontSize: 12,
    letterSpacing: 0.5,
    color: 'rgba(255,255,255,0.6)',
  },
});