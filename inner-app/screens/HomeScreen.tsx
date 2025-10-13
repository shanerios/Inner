import React, { useEffect, useRef } from 'react';
import SuggestionCard from '../components/SuggestionCard';
import { getTodaySuggestion } from '../utils/suggest';
import { CHAMBERS, SOUNDSCAPES, LESSONS } from '../data/suggestions';
import type { Suggestion } from '../types/suggestion';
import { View, Text, StyleSheet, Image, ImageBackground, TouchableOpacity, Pressable, Modal, Animated, Easing, Dimensions, AppState } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Asset } from 'expo-asset';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import LottieView from 'lottie-react-native';
import * as Haptics from 'expo-haptics';
import { Audio } from 'expo-av';
import { useFocusEffect, useIsFocused } from '@react-navigation/native';
import { useCallback } from 'react';
import { getLastSession, setLastSession } from '../core/session';


import SoundscapeCard from '../components/SoundscapeCard';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { resume } from 'expo-speech';

import { useIntention } from '../core/IntentionProvider';
import { startFromSuggestion } from '../lib/startRoutes';

import { useBreath } from '../core/BreathProvider';

// Helper: TitleCase for levels like 'advanced' → 'Advanced'
const toTitle = (s?: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : '');


const AnimatedPressable = Animated.createAnimatedComponent(Pressable);


function formatMinSec(ms?: number) {
    if (!ms || ms < 0) return '0:00';
    const totalSec = Math.floor(ms / 1000);
    const m = Math.floor(totalSec / 60);
    const s = totalSec % 60;
    return `${m}:${s < 10 ? '0' : ''}${s}`;
}

// Map chamber names to a sensible default track id for resume fallback
const CHAMBER_DEFAULT_TRACK: Record<string, string> = {
  'chamber 1': 'chamber1_guided',
  'chamber one': 'chamber1_guided',
};

function normalizeChamberName(v?: string) {
  return (v || '').trim().toLowerCase();
}

// IDs we should never "resume" (ambient/background)
const AMBIENT_IDS = new Set(['home_hum', 'homepage_hum', 'ambient_hum']);
const isAmbient = (id?: string) => !!id && AMBIENT_IDS.has(id);

export default function HomeScreen({ navigation }: any) {
  // --- DEBUG: visualize/tune orb hit area ---
  const DEBUG_ORB_HIT = false; // set to false to hide the debug ring
  const ORB_HIT_DIAMETER = 150;
  const ORB_HIT_OFFSET_X = 0; // tweak to nudge hit-area horizontally
  const ORB_HIT_OFFSET_Y = -30; // tweak to nudge hit-area vertically
  const portalScale = useRef(new Animated.Value(1)).current;
  // Shared breath (0 → exhale, 1 → inhale)
  const breath = useBreath();

  // Orb breath scale driven by shared breath
  const orbScale = breath.interpolate({ inputRange: [0, 1], outputRange: [0.98, 1.15] });

  // Sigil base pulse (opacity + micro scale) driven by shared breath
  const sigilOpacityBase = breath.interpolate({ inputRange: [0, 1], outputRange: [0.86, 1.0] });
  const sigilScaleBase   = breath.interpolate({ inputRange: [0, 1], outputRange: [0.95, 1.10] });

  // Left/Right sigil values (kept same phase for cohesion)
  const sigilOpacityL = sigilOpacityBase;
  const sigilOpacityR = sigilOpacityBase;
  const sigilScaleL   = sigilScaleBase;
  const sigilScaleR   = sigilScaleBase;

  // Colored halo opacity (higher on inhale → richer color), diffuse halo (higher on exhale → softer/desaturated)
  const sigilColorOpacityL  = breath.interpolate({ inputRange: [0, 1], outputRange: [0.70, 1.00] });
  const sigilColorOpacityR  = breath.interpolate({ inputRange: [0, 1], outputRange: [0.70, 1.00] });
  const sigilDiffuseOpacityL = breath.interpolate({ inputRange: [0, 1], outputRange: [0.20, 0.10] }); // more diffuse on exhale
  const sigilDiffuseOpacityR = breath.interpolate({ inputRange: [0, 1], outputRange: [0.20, 0.10] });
  // Press feedback for orb (multiplies with breathing scale)
  const portalPress = useRef(new Animated.Value(0)).current;
  const portalPressScale = portalPress.interpolate({ inputRange: [0, 1], outputRange: [1, 1.08] });
  const isFocused = useIsFocused();
  const appStateRef = useRef<'active' | 'inactive' | 'background'>('active');
  const retryTimerRef = useRef<NodeJS.Timeout | null>(null);
  const maybeStartHum = useCallback(async () => {
    if (retryTimerRef.current) {
      clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }
    if (!isFocused || appStateRef.current !== 'active') return;

    try {
      await ensureHumLoaded();
      await humRef.current!.playAsync();
    } catch (e: any) {
      const msg = String(e?.message || e);
      if (msg.includes('AudioFocusNotAcquiredException')) {
        // give Android a beat after coming to foreground, then try once
        retryTimerRef.current = setTimeout(async () => {
          if (isFocused && appStateRef.current === 'active') {
            try {
              await ensureHumLoaded();
              await humRef.current!.playAsync();
            } catch {}
          }
        }, 300);
      }
    }
  }, [ensureHumLoaded, isFocused]);
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => {
      appStateRef.current = s as any;
      if (s !== 'active') {
        try { humRef.current?.pauseAsync(); } catch {}
      } else if (isFocused) {
        maybeStartHum();
      }
    });
    return () => sub.remove();
  }, [isFocused, maybeStartHum]);

  // Hint pulse anim for side arrows
  const leftHint = useRef(new Animated.Value(0)).current;
  const rightHint = useRef(new Animated.Value(0)).current;

  const runHint = useCallback((v: Animated.Value) => {
    v.setValue(0);
    Animated.sequence([
      Animated.timing(v, { toValue: 0.5, duration: 450, useNativeDriver: true }),
      Animated.timing(v, { toValue: 1, duration: 450, useNativeDriver: true }),
    ]).start(() => v.setValue(0));
  }, []);

  const leftHintOpacity = leftHint.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, 0.5, 0] });
  const leftHintScale   = leftHint.interpolate({ inputRange: [0, 1],   outputRange: [1, 1.8] });

  const rightHintOpacity = rightHint.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, 0.5, 0] });
  const rightHintScale   = rightHint.interpolate({ inputRange: [0, 1],   outputRange: [1, 1.8] });

  const [showPicker, setShowPicker] = React.useState(false);
  const [navigating, setNavigating] = React.useState(false);
  const lastJourneyKey = 'lastJourney';

  const startingRef = useRef(false);
  const [resumeLabel, setResumeLabel] = React.useState('My Journey');
  const [resumeSub, setResumeSub] = React.useState('');
  const [resumePct, setResumePct] = React.useState(0);
  const [suggestion, setSuggestion] = React.useState<Suggestion | null>(null);
  const [suggDismissed, setSuggDismissed] = React.useState(false);
  const todayKey = React.useMemo(() => {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `suggestion:dismissed:${y}-${m}-${day}`;
  }, []);
  useEffect(() => {
    if (!suggestion) return;
    (async () => {
      try {
        const v = await AsyncStorage.getItem(todayKey);
        setSuggDismissed(!!v);
      } catch {
        setSuggDismissed(false);
      }
    })();
  }, [suggestion, todayKey]);

  const handleDismissSuggestion = useCallback(async () => {
    // subtle haptic to acknowledge the choice
    try { await Haptics.selectionAsync(); } catch {}

    try {
      Animated.parallel([
        Animated.timing(suggOpacity, {
          toValue: 0,
          duration: 800,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(suggTranslate, {
          toValue: -6,
          duration: 800,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ]).start(async () => {
        // small post-fade linger so the longer fade is perceived
        await new Promise(res => setTimeout(res, 240));
        setSuggDismissed(true);
        try { await AsyncStorage.setItem(todayKey, '1'); } catch {}
      });
    } catch {
      setSuggDismissed(true);
      try { await AsyncStorage.setItem(todayKey, '1'); } catch {}
    }
  }, [todayKey, suggOpacity, suggTranslate]);
  const suggOpacity = useRef(new Animated.Value(0)).current;
  const suggTranslate = useRef(new Animated.Value(-6)).current;
  useEffect(() => {
    (async () => {
      try {
        const s = await getTodaySuggestion(CHAMBERS, SOUNDSCAPES, LESSONS);
        setSuggestion(s);
      } catch {}
    })();
  }, []);

  useEffect(() => {
    if (!suggestion) return;
    // reset & fade/slide in
    suggOpacity.setValue(0);
    suggTranslate.setValue(-6);
    Animated.parallel([
      Animated.timing(suggOpacity, {
        toValue: 1,
        duration: 700,
        delay: 1000,
        useNativeDriver: true,
      }),
      Animated.timing(suggTranslate, {
        toValue: 0,
        duration: 700,
        delay: 1000,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();
  }, [suggestion, suggOpacity, suggTranslate]);

  const handleStartSuggestion = useCallback(async () => {
    if (!suggestion || startingRef.current) return;
    startingRef.current = true;

    // gentle haptic tick on start
    try { await Haptics.selectionAsync(); } catch {}

    // fade background hum first
    try { await fadeOutHum(); } catch {}

    // Fade the card out more slowly, then pause briefly so the fade is actually perceived before navigation kicks in
    Animated.parallel([
      Animated.timing(suggOpacity, { toValue: 0, duration: 800, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      Animated.timing(suggTranslate, { toValue: -6, duration: 800, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
    ]).start(async () => {
      // small post-fade linger so the longer fade reads
      await new Promise(res => setTimeout(res, 240));
      startFromSuggestion(suggestion, navigation);
      // allow future starts after we leave this screen; safe reset
      setTimeout(() => { startingRef.current = false; }, 1000);
    });
  }, [suggestion, navigation, suggOpacity, suggTranslate]);

  // Intentions (global)
  const { intentions, label: intentionLabel, theme } = useIntention();
  console.log('[INTENTION] label=', intentionLabel);
  console.log('[INTENTION] raw=', intentions);

  // Ritual-style affirmations per intention
  const AFFIRMATIONS: Record<string, string[]> = {
    calm: [
      'The tide of stillness carries you inward.',
      'All is quiet within the sanctum of your being.',
    ],
    clarity: [
      'Your inner sky clears—truth shines without distortion.',
      'Every breath opens space for clear vision.',
    ],
    grounding: [
      'Your roots sink deep into the eternal earth.',
      'Stillness anchors you to what is real and true.',
    ],
    healing: [
      'Every breath restores your body, your heart, your light.',
      'Gentle currents wash away what no longer serves you.',
    ],
    reawakening: [
      'The flame within rises again, radiant and unafraid.',
      'You remember yourself beyond the noise of the world.',
    ],
    expansion: [
      'The horizon opens—your spirit moves without limit.',
      'You are vast, endless, and free.',
    ],
  };

  // Rotate which line we show each day (keeps it fresh but not random-chaotic)
  const variantIndex = React.useMemo(() => {
    const now = new Date();
    const start = new Date(now.getFullYear(), 0, 1);
    const dayOfYear = Math.floor((+now - +start) / 86400000); // 0..365
    return dayOfYear % 2; // pick index 0 or 1
  }, []);

  // Choose up to two lines: one for each selected intention (if present)
  const ritualLines: string[] = [];
  if (intentions && intentions.length > 0) {
    const first = intentions[0];
    const second = intentions[1];
    if (first && AFFIRMATIONS[first]) {
      const line = AFFIRMATIONS[first][variantIndex] ?? AFFIRMATIONS[first][0];
      ritualLines.push(line);
    }
    if (second && AFFIRMATIONS[second]) {
      const line = AFFIRMATIONS[second][variantIndex] ?? AFFIRMATIONS[second][0];
      ritualLines.push(line);
    }
  }

  // Ambient hum sound ref
  const humRef = useRef<Audio.Sound | null>(null);

  const ensureHumLoaded = useCallback(async () => {
    try {
      if (!humRef.current) {
        humRef.current = new Audio.Sound();
      }
      const status = await humRef.current.getStatusAsync().catch(() => null as any);
      if (!status || !('isLoaded' in status) || !status.isLoaded) {
        await humRef.current.loadAsync(require('../assets/audio/Homepage_Hum.mp3'));
        await humRef.current.setIsLoopingAsync(true);
        await humRef.current.setVolumeAsync(0.15);
      }
    } catch (e) {
      console.log('ensureHumLoaded error', e);
    }
  }, []);

  // Ensure audio plays politely (silent mode iOS, duck others on Android)
  useEffect(() => {
    Audio.setAudioModeAsync({
      playsInSilentModeIOS: true,
      staysActiveInBackground: false,
      shouldDuckAndroid: true,
      interruptionModeIOS: Audio.INTERRUPTION_MODE_IOS_DO_NOT_MIX,
      interruptionModeAndroid: Audio.INTERRUPTION_MODE_ANDROID_DO_NOT_MIX,
    }).catch(() => {});
  }, []);

  const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');

  // Resolve intrinsic size from the bundled background asset (no hardcoded dims)
  const BG_ASSET = require('../assets/images/home_arch_bg_v2.webp');
  const SIGIL_JOURNAL = require('../assets/sigils/journal_button.png');
  const SIGIL_COMMUNITY = require('../assets/sigils/community_button.png');
  const HALO_LAVENDER = require('../assets/sigils/sigil_halo_lavender.png');
  const HALO_GOLD = require('../assets/sigils/sigil_halo_gold.png');
  const HALO_DIFFUSE = require('../assets/sigils/sigil_halo_diffuse.png');
  // Glow padding for halo images
  const GLOW_PAD = 18;
  const BG_SRC = Image.resolveAssetSource(BG_ASSET);
  const BG_W = BG_SRC?.width ?? 2048;
  const BG_H = BG_SRC?.height ?? 3072;

  // Edge-to-edge sizing (fill the entire screen, behind system UI)
  const insets = useSafeAreaInsets();
  const SAFE_W = SCREEN_W;
  const SAFE_H = SCREEN_H;

  // Full-bleed cover inside the entire screen (no top/bottom gaps)
  const BG_FIT: 'contain' | 'cover' = 'cover';
  const BG_BOX_W = SCREEN_W;
  const BG_BOX_H = SCREEN_H;
  const BG_BOX_LEFT = 0;
  const BG_BOX_TOP = 0;

  const HERO_MIN = Math.max(300, SCREEN_H - 480); // ensures CTA sits near bottom of first viewport

  // Orb anchored inside the background box (reduced size ~30% and nudged up)
  const ORB_SIZE_PCT = 0.30; // was 0.425 → ~29% smaller
  const ORB_Y_OFFSET = -55;  // nudged up an extra 10px
  const ORB_WIDTH = BG_BOX_W * ORB_SIZE_PCT;
  const ORB_LEFT  = BG_BOX_LEFT + BG_BOX_W * 0.499 - ORB_WIDTH / 2; // ~centered horizontally
  const ORB_TOP   = BG_BOX_TOP  + BG_BOX_H * 0.461 - ORB_WIDTH / 2 + ORB_Y_OFFSET;

  // Sigils: placed symmetrically below the orb base, sized relative to bg width
  const SIGIL_SIZE_PCT = 0.11;              // ~35% of orb diameter (orb is 0.30 of bg width)
  const SIGIL_SIZE = BG_BOX_W * SIGIL_SIZE_PCT;

  // Vertical placement near the orb base
  const SIGIL_CENTER_Y = ORB_TOP + ORB_WIDTH * 0.95;

  // Horizontal centers (symmetry around orb center ~0.499)
  const SIGIL_LEFT_CENTER_X  = BG_BOX_LEFT + BG_BOX_W * 0.34;
  const SIGIL_RIGHT_CENTER_X = BG_BOX_LEFT + BG_BOX_W * 0.66;

  // Convert centers to top-left for absolute positioning (adjusted positions)
  const SIGIL_LEFT_LEFT  = SIGIL_LEFT_CENTER_X  - SIGIL_SIZE / 2 - 15;  // moved 15px left
  const SIGIL_LEFT_TOP   = SIGIL_CENTER_Y       - SIGIL_SIZE / 2 + 70;  // moved 50px down
  const SIGIL_RIGHT_LEFT = SIGIL_RIGHT_CENTER_X - SIGIL_SIZE / 2 + 15;  // moved 15px right
  const SIGIL_RIGHT_TOP  = SIGIL_CENTER_Y       - SIGIL_SIZE / 2 + 70;  // moved 50px down

  // Welcome message fade-up
  const msgOpacity = useRef(new Animated.Value(0)).current;
  const msgTranslate = useRef(new Animated.Value(10)).current; // starts slightly lower

  // Top intention header fade/slide (appears after a short delay)
  const topAffOpacity = useRef(new Animated.Value(0)).current;
  const topAffTranslate = useRef(new Animated.Value(-6)).current;

  // Shimmer for "My Journey" button
  const shimmerX = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const run = () => {
      shimmerX.setValue(0);
      Animated.timing(shimmerX, {
        toValue: 1,
        duration: 5200,
        easing: Easing.inOut(Easing.cubic),
        useNativeDriver: true,
      }).start(() => {
        setTimeout(run, 1000);
      });
    };
    run();
    return () => shimmerX.stopAnimation();
  }, [shimmerX]);

  // Scroll-driven depth (0 = outer sanctum → 1 = deeper chamber)
  const scrollY = useRef(new Animated.Value(0)).current;
  const depth = scrollY.interpolate({ inputRange: [0, 240], outputRange: [0, 1], extrapolate: 'clamp' });

  // Parallax/attenuation for orb as you descend
  const orbParallaxScale = scrollY.interpolate({ inputRange: [0, 200], outputRange: [1, 0.98], extrapolate: 'clamp' });
  const orbParallaxOpacity = scrollY.interpolate({ inputRange: [0, 200], outputRange: [1, 0.92], extrapolate: 'clamp' });

  // Dust dims slightly with depth
  const dustOpacity = depth.interpolate({ inputRange: [0, 1], outputRange: [0.26, 0.16] });

  // Vignette deepens with chamber depth
  const vignetteOpacity = depth.interpolate({ inputRange: [0, 1], outputRange: [0.14, 0.42] });


  // Tap feedback for sigils (multiplies with idle pulse)
  const sigilPressL = useRef(new Animated.Value(0)).current;
  const sigilPressR = useRef(new Animated.Value(0)).current;
  const sigilPressScaleL = sigilPressL.interpolate({ inputRange: [0, 1], outputRange: [1, 1.04] });
  const sigilPressScaleR = sigilPressR.interpolate({ inputRange: [0, 1], outputRange: [1, 1.04] });

  // Smoothly reduce hum volume as user descends (depth 0->1 maps 0.15 -> 0.08)
  useEffect(() => {
    const listenerId = scrollY.addListener(({ value }) => {
      const d = Math.max(0, Math.min(1, value / 240));
      const vol = 0.50 - 0.15 * d;
      humRef.current?.setVolumeAsync(vol).catch(() => {});
    });
    return () => scrollY.removeListener(listenerId);
  }, [scrollY]);

  // Preload key imagery to avoid first-frame delay
  useEffect(() => {
    Asset.fromModule(BG_ASSET).downloadAsync();
    Asset.fromModule(SIGIL_JOURNAL).downloadAsync();
    Asset.fromModule(SIGIL_COMMUNITY).downloadAsync();
    Asset.fromModule(HALO_LAVENDER).downloadAsync();
    Asset.fromModule(HALO_GOLD).downloadAsync();
    Asset.fromModule(HALO_DIFFUSE).downloadAsync();
  }, []);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      (async () => {
        try {
          await loadResumeInfo();
          if (!cancelled && appStateRef.current === 'active') {
            await maybeStartHum();
          }
        } catch (e) {
          console.log('Hum load/play error', e);
        }
      })();

      return () => {
        cancelled = true;
        humRef.current?.pauseAsync().catch(() => {});
      };
    }, [maybeStartHum, loadResumeInfo])
  );

  // Unload on unmount (app exit)
  useEffect(() => () => { humRef.current?.unloadAsync().catch(() => {}); }, []);

  // Fade/slide in the welcome message on mount
  useEffect(() => {
    Animated.parallel([
      Animated.timing(msgOpacity, {
        toValue: 1,
        duration: 800,
        delay: 250,
        useNativeDriver: true,
      }),
      Animated.timing(msgTranslate, {
        toValue: 0,
        duration: 800,
        delay: 250,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  // Reveal the intention header after a brief pause (ritual beat)
  useEffect(() => {
    const hasIntention = !!(intentions && intentions.length > 0);
    if (hasIntention) {
      topAffOpacity.setValue(0);
      topAffTranslate.setValue(-6);
      Animated.parallel([
        Animated.timing(topAffOpacity, {
          toValue: 1,
          duration: 4000,
          delay: 2000, // ~2s after screen enters
          useNativeDriver: true,
        }),
        Animated.timing(topAffTranslate, {
          toValue: 0,
          duration: 700,
          delay: 2000,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      // reset when no intentions
      topAffOpacity.setValue(0);
      topAffTranslate.setValue(-6);
    }
  }, [intentions, topAffOpacity, topAffTranslate]);


  // Fade the ambient hum before navigating into a Journey / Library
  const fadeOutHum = async () => {
    try {
      const s = humRef.current;
      if (!s) return;
      const st = await s.getStatusAsync().catch(() => null as any);
      if (!st || !('isLoaded' in st) || !st.isLoaded) return;
      await s.setVolumeAsync(0);
      await s.pauseAsync();
    } catch (e) {
      console.log('Hum fade/pause error', e);
    }
  };

  const getLastJourney = async () => {
    try {
      const raw = await AsyncStorage.getItem(lastJourneyKey);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  };


  const saveLastJourney = async (journey: { id: string; chamber?: string }) => {
    try { await AsyncStorage.setItem(lastJourneyKey, JSON.stringify(journey)); } catch {}
  };

  const handleOrbTap = async () => {
    console.log('Orb tapped'); // For debugging
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    const last = await getLastSession();
    if (last) {
        await fadeOutHum();
        if (last.type === 'journey') {
            navigation.navigate('JourneyPlayer', { id: last.id });
    } else {
      // soundscape resumes through the same player using trackId
      navigation.navigate('JourneyPlayer', { trackId: last.id });
    }
  } else {
    setShowPicker(true);
  }
};

  const handleOrbLongPress = async () => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    setShowPicker(true);
  };

  const loadResumeInfo = useCallback(async () => {
    try {
      // Prefer last *content* snapshot (excludes ambient)
      const rawContent = await AsyncStorage.getItem('player:lastContent'); // { trackId, positionMs, durationMs, chamber? }
      const content = rawContent ? JSON.parse(rawContent) : null;

      let base = content;

      // Fallback to generic last snapshot (filter ambient)
      if (!base) {
        const rawLast = await AsyncStorage.getItem('player:last'); // may include ambient
        const fallback = rawLast ? JSON.parse(rawLast) : null;
        if (fallback && !isAmbient(fallback.trackId)) base = fallback;
      }

      const last = await getLastSession();

      // derive id/chamber
      const id = base?.trackId || (last ? last.id : undefined);
      const chamber = base?.chamber; // session doesn't carry a chamber label

      // If nothing valid or ambient, reset to "My Journey"
      if (!id || isAmbient(id)) {
        setResumeLabel('My Journey');
        setResumeSub('');
        setResumePct(0);
        return;
      }

      // progress snapshot (position/duration)
      const snapRaw = await AsyncStorage.getItem(`player:progress:${id}`);
      const snap = snapRaw ? JSON.parse(snapRaw) : null;

      const position = snap?.positionMs ?? base?.positionMs ?? 0;
      const duration = snap?.durationMs ?? base?.durationMs ?? 0;
      const pct = duration > 0 ? Math.max(0, Math.min(1, position / duration)) : 0;
      const remaining = duration > 0 ? Math.max(0, duration - position) : 0;

      const hasPlayable = duration > 0;
      const hasMappedChamber = !!(chamber && CHAMBER_DEFAULT_TRACK[normalizeChamberName(chamber)]);

      if (hasPlayable || hasMappedChamber) {
        setResumeLabel(chamber ? `Resume • ${chamber}` : 'Resume');
        setResumeSub(hasPlayable ? `${formatMinSec(position)} / ${formatMinSec(duration)}  •  ${formatMinSec(remaining)} left` : '');
        setResumePct(pct);
      } 
      
      if (!hasPlayable && !hasMappedChamber && last) {
        setResumeLabel(last.type === 'journey' ? 'Resume - Chamber' : 'Resume - Soundscape');
        setResumeSub('');
        setResumePct(0);
        return;
      }

      else {
        setResumeLabel('My Journey');
        setResumeSub('');
        setResumePct(0);
      }
    } catch {
      setResumeLabel('My Journey');
      setResumeSub('');
      setResumePct(0);
    }
  }, []);

  const startJourney = async (id: string, chamber?: string) => {
    await saveLastJourney({ id, chamber });              // keep existing fallback for now
    await setLastSession({ type: 'journey', id });       // <-- add this
    await fadeOutHum();
    navigation.navigate('JourneyPlayer', { id, chamber });
    setShowPicker(false);
  };

  // Helper to get the best resume target (lastJourney or player:last)
  const getResumeTarget = useCallback(async (): Promise<{ id: string; chamber?: string } | null> => {
    try {
      // 1) Prefer last *content* (never ambient)
      const rawContent = await AsyncStorage.getItem('player:lastContent');
      const lastContent = rawContent ? JSON.parse(rawContent) : null;
      if (lastContent?.trackId && !isAmbient(lastContent.trackId)) {
        return { id: lastContent.trackId, chamber: lastContent.chamber };
      }

      // 2) Fallbacks
      const rawLast = await AsyncStorage.getItem('player:last'); // may be ambient; filter
      const playerLast = rawLast ? JSON.parse(rawLast) : null;
      const lastJourney = await getLastJourney();

      let id: string | undefined = playerLast?.trackId || lastJourney?.id;
      let chamber: string | undefined = lastJourney?.chamber || playerLast?.chamber;

      // Filter ambient
      if (isAmbient(id)) id = undefined;

      // Map from chamber label if needed
      if (!id && chamber) {
        const key = normalizeChamberName(chamber);
        const mapped = CHAMBER_DEFAULT_TRACK[key];
        if (mapped) id = mapped;
      }

      return id ? { id, chamber } : null;
    } catch {
      return null;
    }
  }, []);


  return (
    <View style={styles.container}>
      {/* Background — rendered in a computed fit box (contain/cover) */}
      <Image
        source={BG_ASSET}
        fadeDuration={0}
        resizeMode={BG_FIT}  // 'cover'
        style={{
          position: 'absolute',
          left: BG_BOX_LEFT,
          top: BG_BOX_TOP,
          width: BG_BOX_W,
          height: BG_BOX_H,
        }}
      />
      <StatusBar style="light" backgroundColor="transparent" translucent />

      {/* Dust overlay – above bg, below orb & UI */}
      <Animated.View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, opacity: dustOpacity }}>
        <LottieView
          source={require('../assets/animations/dust-drift.json')}
          autoPlay
          loop
          pointerEvents="none"
          style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
          speed={0.8}
        />
      </Animated.View>

      {/* Vignette overlay – simplified to full-screen gradients to avoid rectangular seams */}
      <Animated.View style={[StyleSheet.absoluteFillObject, { opacity: vignetteOpacity }]} pointerEvents="none">
        {/* Vertical fade (top→bottom) */}
        <LinearGradient
          colors={["rgba(0,0,0,0.00)", "rgba(0,0,0,0.65)"]}
          locations={[0, 1]}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
        {/* Horizontal fade (edges→center) */}
        <LinearGradient
          colors={["rgba(0,0,0,0.50)", "rgba(0,0,0,0.00)", "rgba(0,0,0,0.50)"]}
          locations={[0, 0.5, 1]}
          start={{ x: 0, y: 0.5 }}
          end={{ x: 1, y: 0.5 }}
          style={StyleSheet.absoluteFill}
        />
      </Animated.View>

      {/* Top Suggestion Card (fixed near top, above orb) */}
      {suggestion && !suggDismissed && (
        <Animated.View
          pointerEvents="box-none"
          style={{
            position: 'absolute',
            top: insets.top + 16,
            left: 0,
            right: 0,
            zIndex: 80,
            elevation: 80,
            opacity: suggOpacity,
            transform: [{ translateY: suggTranslate }],
          }}
        >
          {
            // Build a contextual subtitle that explains *why* it was chosen
          }
          {(() => {
            const reasonSubtitle = (() => {
              const levelLabel = toTitle((suggestion as any)?.level);
              const pathLabel = intentionLabel || (intentions?.length ? intentions.join(' · ') : 'your path');
              // If the suggestion already has a subtitle, append the reason softly
              if (suggestion?.subtitle) {
                if (levelLabel) return `${suggestion.subtitle}  •  Selected for ${pathLabel} · ${levelLabel}`;
                return `${suggestion.subtitle}  •  Selected for ${pathLabel}`;
              }
              // Otherwise provide a clean, branded reason line
              return levelLabel
                ? `Selected for ${pathLabel} · ${levelLabel}`
                : `Selected for ${pathLabel}`;
            })();
            return (
              <SuggestionCard
                title={suggestion.title}
                subtitle={reasonSubtitle}
                onStart={handleStartSuggestion}
                onDismiss={handleDismissSuggestion}
              />
            );
          })()}
        </Animated.View>
      )}


      {/* Portal / Orb */}
      <View style={styles.portalWrap} pointerEvents="box-none">
        <Animated.Image
          pointerEvents="none"
          source={require('../assets/images/orb-enhanced.png')}
          resizeMode="contain"
          style={[
            styles.orbImage,
            {
              position: 'absolute',
              left: ORB_LEFT,
              top: ORB_TOP,
              width: ORB_WIDTH,
              height: ORB_WIDTH,
              transform: [{
                scale: Animated.multiply(
                  Animated.multiply(orbScale, orbParallaxScale),
                  portalPressScale
                ),
              }],
            },
          ]}
        />
        {/* Tap target limited to orb center so list below remains touchable */}
        <AnimatedPressable
          pointerEvents="box-only"
          onPress={handleOrbTap}
          onLongPress={handleOrbLongPress}
          delayLongPress={800}
          hitSlop={0}
          pressRetentionOffset={0}
          onLayout={(e) => {
            const { x, y, width, height } = e.nativeEvent.layout;
            console.log('[DEBUG ORB] layout:', { x, y, width, height });
          }}
          onPressIn={async () => {
            try { await Haptics.selectionAsync(); } catch {}
            portalPress.stopAnimation();
            portalPress.setValue(0);
            Animated.timing(portalPress, {
              toValue: 1,
              duration: 120,
              easing: Easing.out(Easing.cubic),
              useNativeDriver: true,
            }).start();
          }}
          onPressOut={() => {
            Animated.timing(portalPress, {
              toValue: 0,
              duration: 160,
              easing: Easing.out(Easing.cubic),
              useNativeDriver: true,
            }).start();
          }}
          style={[
            {
              position: 'absolute',
              left: ORB_LEFT + ORB_WIDTH / 2,
              top: ORB_TOP + ORB_WIDTH / 2,
              width: ORB_HIT_DIAMETER,
              height: ORB_HIT_DIAMETER,
              borderRadius: ORB_HIT_DIAMETER / 2,
              transform: [
                { translateX: (-ORB_HIT_DIAMETER / 2) + ORB_HIT_OFFSET_X },
                { translateY: (-ORB_HIT_DIAMETER / 2) + ORB_HIT_OFFSET_Y },
                { scale: Animated.multiply(
                    Animated.multiply(orbScale, orbParallaxScale),
                    portalPressScale
                  )
                },
              ],
              ...(DEBUG_ORB_HIT ? {
                backgroundColor: 'rgba(255, 0, 0, 0.12)',
                borderWidth: 1,
                borderColor: 'rgba(255, 230, 0, 0.9)',
              } : null),
            },
          ]}
        >
          {DEBUG_ORB_HIT ? (
            <>
              <View
                pointerEvents="none"
                style={{
                  position: 'absolute',
                  left: '50%',
                  top: 0,
                  width: 2,
                  height: '100%',
                  backgroundColor: 'rgba(255,230,0,0.9)',
                  transform: [{ translateX: -1 }],
                }}
              />
              <View
                pointerEvents="none"
                style={{
                  position: 'absolute',
                  top: '50%',
                  left: 0,
                  height: 2,
                  width: '100%',
                  backgroundColor: 'rgba(255,230,0,0.9)',
                  transform: [{ translateY: -1 }],
                }}
              />
            </>
          ) : null}
        </AnimatedPressable>

        {/* Left Sigil Halo — Lavender (soft PNG radial) */}
        <Animated.Image
          pointerEvents="none"
          source={HALO_LAVENDER}
          resizeMode="contain"
          style={{
            position: 'absolute',
            left: SIGIL_LEFT_LEFT - GLOW_PAD * 2,
            top: SIGIL_LEFT_TOP - GLOW_PAD * 2,
            width: SIGIL_SIZE + GLOW_PAD * 4,
            height: SIGIL_SIZE + GLOW_PAD * 4,
            opacity: sigilColorOpacityL,
            transform: [{ scale: sigilScaleL }],
            zIndex: 55,
            elevation: 55,
          }}
        />
        {/* Left Sigil Diffusion — soft white */}
        <Animated.Image
          pointerEvents="none"
          source={HALO_DIFFUSE}
          resizeMode="contain"
          style={{
            position: 'absolute',
            left: SIGIL_LEFT_LEFT - GLOW_PAD * 1.4,
            top: SIGIL_LEFT_TOP - GLOW_PAD * 1.4,
            width: SIGIL_SIZE + GLOW_PAD * 2.8,
            height: SIGIL_SIZE + GLOW_PAD * 2.8,
            opacity: sigilDiffuseOpacityL,
            transform: [{ scale: sigilScaleL }],
            zIndex: 55.5,
            elevation: 55,
          }}
        />
        {/* Left Sigil — Journal / Reflections */}
        <Animated.View
          style={{
            position: 'absolute',
            left: SIGIL_LEFT_LEFT,
            top: SIGIL_LEFT_TOP,
            width: SIGIL_SIZE,
            height: SIGIL_SIZE,
            transform: [{ scale: Animated.multiply(sigilScaleL, sigilPressScaleL) }],
            opacity: sigilOpacityL,
            zIndex: 56,
            elevation: 56,
          }}
          pointerEvents="box-none"
        >
          <Pressable
            onPress={async () => {
              try { await Haptics.selectionAsync(); } catch {}
              try {
                navigation.navigate('Journal');
              } catch (e) {
                console.log('[Nav] Journal route missing, implement screen route:', e);
              }
            }}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel="Open Journal"
            style={{ flex: 1 }}
            onPressIn={async () => {
              try { await Haptics.selectionAsync(); } catch {}
              sigilPressL.stopAnimation();
              sigilPressL.setValue(0);
              Animated.timing(sigilPressL, {
                toValue: 1,
                duration: 120,
                easing: Easing.out(Easing.cubic),
                useNativeDriver: true,
              }).start();
            }}
            onPressOut={() => {
              Animated.timing(sigilPressL, {
                toValue: 0,
                duration: 160,
                easing: Easing.out(Easing.cubic),
                useNativeDriver: true,
              }).start();
            }}
          >
            <Image source={SIGIL_JOURNAL} resizeMode="contain" style={{ width: '100%', height: '100%' }} />
          </Pressable>
        </Animated.View>

        {/* Right Sigil Halo — Gold (soft PNG radial) */}
        <Animated.Image
          pointerEvents="none"
          source={HALO_GOLD}
          resizeMode="contain"
          style={{
            position: 'absolute',
            left: SIGIL_RIGHT_LEFT - GLOW_PAD * 2,
            top: SIGIL_RIGHT_TOP - GLOW_PAD * 2,
            width: SIGIL_SIZE + GLOW_PAD * 4,
            height: SIGIL_SIZE + GLOW_PAD * 4,
            opacity: sigilColorOpacityR,
            transform: [{ scale: sigilScaleR }],
            zIndex: 55,
            elevation: 55,
          }}
        />
        {/* Right Sigil Diffusion — soft white */}
        <Animated.Image
          pointerEvents="none"
          source={HALO_DIFFUSE}
          resizeMode="contain"
          style={{
            position: 'absolute',
            left: SIGIL_RIGHT_LEFT - GLOW_PAD * 1.4,
            top: SIGIL_RIGHT_TOP - GLOW_PAD * 1.4,
            width: SIGIL_SIZE + GLOW_PAD * 2.8,
            height: SIGIL_SIZE + GLOW_PAD * 2.8,
            opacity: sigilDiffuseOpacityR,
            transform: [{ scale: sigilScaleR }],
            zIndex: 55.5,
            elevation: 55,
          }}
        />
        {/* Right Sigil — Community / Resonance */}
        <Animated.View
          style={{
            position: 'absolute',
            left: SIGIL_RIGHT_LEFT,
            top: SIGIL_RIGHT_TOP,
            width: SIGIL_SIZE,
            height: SIGIL_SIZE,
            transform: [{ scale: Animated.multiply(sigilScaleR, sigilPressScaleR) }],
            opacity: sigilOpacityR,
            zIndex: 56,
            elevation: 56,
          }}
          pointerEvents="box-none"
        >
          <Pressable
            onPress={async () => {
              try { await Haptics.selectionAsync(); } catch {}
              try {
                navigation.navigate('Community');
              } catch (e) {
                console.log('[Nav] Community route missing, implement screen route:', e);
              }
            }}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel="Open Community"
            style={{ flex: 1 }}
            onPressIn={async () => {
              try { await Haptics.selectionAsync(); } catch {}
              sigilPressR.stopAnimation();
              sigilPressR.setValue(0);
              Animated.timing(sigilPressR, {
                toValue: 1,
                duration: 120,
                easing: Easing.out(Easing.cubic),
                useNativeDriver: true,
              }).start();
            }}
            onPressOut={() => {
              Animated.timing(sigilPressR, {
                toValue: 0,
                duration: 160,
                easing: Easing.out(Easing.cubic),
                useNativeDriver: true,
              }).start();
            }}
          >
            <Image source={SIGIL_COMMUNITY} resizeMode="contain" style={{ width: '100%', height: '100%' }} />
          </Pressable>
        </Animated.View>
      </View>

      <View
        pointerEvents="box-none"
        style={{ alignSelf: 'stretch', alignItems: 'center', paddingTop: 360, paddingBottom: 40 }}
      >
        {/* Hero section (keeps welcome + CTA visually centered) */}
        <View
          pointerEvents="box-none"
          style={[styles.heroSection, { minHeight: HERO_MIN }]}> 
          {/* Message */}
          <Animated.Text style={[styles.message, { opacity: msgOpacity, transform: [{ translateY: msgTranslate }] }]}> 
            Welcome back to your sanctum 
          </Animated.Text>

          {/* Primary CTA(s) */}
          <View style={styles.actions} pointerEvents="box-none">
            <TouchableOpacity
              onPress={async () => {
                if (navigating) return;
                setNavigating(true);
                try {
                    try { await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); } catch {}
                    const last = await getLastSession();
                    if (last) {
                        await fadeOutHum();
                        if (last.type === 'journey') {
                            navigation.navigate('JourneyPlayer', { id: last.id });
                    } else {
                            navigation.navigate('JourneyPlayer', { trackId: last.id });
                        }
                    } else {
                    // no last session → let user choose their path
                    await fadeOutHum();
                    setShowPicker(true);
                    }
                } finally {
                setTimeout(() => setNavigating(false), 400);
                }
              }}
              hitSlop={0}
              pressRetentionOffset={0}
              activeOpacity={0.95}
              disabled={navigating}
              style={[styles.primaryButton, { overflow: 'hidden', opacity: navigating ? 0.7 : 1 }]}
              accessibilityRole="button"
              accessibilityLabel={resumeLabel}
            >
              {/* Static top gloss */}
              <LinearGradient
                colors={['rgba(255,255,255,0.12)', 'rgba(255,255,255,0.04)', 'rgba(255,255,255,0.00)']}
                start={{ x: 0.5, y: 0 }}
                end={{ x: 0.5, y: 1 }}
                style={StyleSheet.absoluteFill}
                pointerEvents="none"
              />

              {/* Moving shimmer band */}
              <Animated.View
                pointerEvents="none"
                style={{
                  position: 'absolute',
                  top: -12,
                  bottom: -12,
                  width: 80,
                  opacity: 0.45,
                  transform: [
                    {
                      translateX: shimmerX.interpolate({
                        inputRange: [0, 1],
                        outputRange: [-220, 260],
                      }),
                    },
                    { rotate: '-18deg' },
                  ],
                }}
              >
                <LinearGradient
                  colors={['rgba(255,255,255,0.00)', 'rgba(199,170,255,.9)', 'rgba(255,255,255,0.00)']}
                  start={{ x: 0, y: 0.5 }}
                  end={{ x: 1, y: 0.5 }}
                  style={{ flex: 1 }}
                />
              </Animated.View>

              <Text style={styles.primaryText}>{resumeLabel}</Text>
              {false && !!resumeSub && <Text style={styles.primarySub}>{resumeSub}</Text>}
              {false && (
                <View style={styles.progressTrack}>
                  <Animated.View style={[styles.progressFill, { width: `${Math.round(resumePct * 100)}%` }]} />
                </View>
              )}
            </TouchableOpacity>
          </View>
        </View>
        {/* Cards row (no scrolling) */}
      </View>

      {/* --- NAV ARROWS OVERLAY (absolute, high zIndex/elevation) --- */}
      <View
        pointerEvents="box-none"
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          zIndex: 100,
          elevation: 100,
        }}
      >
        {/* Left: Soundscapes */}
        <Animated.View
          pointerEvents="none"
          style={[
            styles.navArrowHint,
            styles.navArrowLeft,
            { transform: [{ scale: leftHintScale }], opacity: leftHintOpacity },
          ]}
          accessibilityElementsHidden={true}
        />
        <Pressable
          onPress={async () => {
            try { await Haptics.selectionAsync(); } catch {}
            try { await fadeOutHum(); } catch {}
            navigation.navigate('Soundscapes');
          }}
          accessibilityRole="button"
          accessibilityLabel="Go to Soundscapes"
          style={[styles.navArrowLeft, { zIndex: 61, elevation: 61 }]}
          hitSlop={16}
          onLongPress={async () => {
            try { await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch {}
            runHint(leftHint);
          }}
          delayLongPress={450}
        >
          <Text style={styles.navArrowText}>{'\u2039'}</Text>
        </Pressable>

        {/* Right: Chambers */}
        <Animated.View
          pointerEvents="none"
          style={[
            styles.navArrowHint,
            styles.navArrowRight,
            { transform: [{ scale: rightHintScale }], opacity: rightHintOpacity },
          ]}
          accessibilityElementsHidden={true}
        />
        <Pressable
          onPress={async () => {
            try { await Haptics.selectionAsync(); } catch {}
            try { await fadeOutHum(); } catch {}
            navigation.navigate('Chambers');
          }}
          accessibilityRole="button"
          accessibilityLabel="Go to Chambers"
          style={[styles.navArrowRight, { zIndex: 61, elevation: 61 }]}
          hitSlop={16}
          onLongPress={async () => {
            try { await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch {}
            runHint(rightHint);
          }}
          delayLongPress={450}
        >
          <Text style={styles.navArrowText}>{'\u203A'}</Text>
        </Pressable>

        {/* Bottom: Learning Hub */}
        <Pressable
          onPress={async () => {
            try { await Haptics.selectionAsync(); } catch {}
            try { await fadeOutHum(); } catch {}
            navigation.navigate('LearnHub');
          }}
          accessibilityRole="button"
          accessibilityLabel="Open Learning Hub"
          accessibilityHint="Opens Inner’s Learning Hub with guides and lessons"
          accessible={true}
          importantForAccessibility="yes"
          style={[styles.navArrowBottom, { bottom: insets.bottom + 24 }]}
          hitSlop={16}
        >
          <Text style={styles.navArrowText}>{'\u2304'}</Text>
        </Pressable>
        <Text
          pointerEvents="none"
          accessibilityRole="text"
          style={[styles.navArrowCaption, { bottom: insets.bottom + 4 }]}
        >
          Learning Hub
        </Text>
      </View>
      <Modal visible={showPicker} transparent animationType="fade" onRequestClose={() => setShowPicker(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Choose your path</Text>
            <TouchableOpacity style={styles.modalBtn} onPress={() => startJourney('outer_sanctum', 'Chamber 1')}>
              <Text style={styles.modalBtnText}>Outer Sanctum</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.modalBtn} onPress={() => startJourney('lucid_prep', 'Dream Gate')}>
              <Text style={styles.modalBtnText}>Lucid Dream Prep</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.modalBtn} onPress={() => startJourney('deep_silence', 'Silence') }>
              <Text style={styles.modalBtnText}>Deep Silence</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setShowPicker(false)}>
              <Text style={styles.modalCancel}>Not now</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
      {/* Fixed cards over Home (no scrolling) */}
    </View>

  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0d0d1a',
    justifyContent: 'flex-start',
    alignItems: 'center',
    paddingVertical: 0,
  },
  // NOTE: portalWrap sits *under* heroSection. If CTA becomes untouchable, raise heroSection zIndex/elevation.
  portalWrap: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 55,
    elevation: 55,
  },
  orbImage: {},
  orbHit: {
    position: 'absolute',
    left: '50%',
    top: '50%',
    borderRadius: 9999,
  },
  portalCore: {
    width: 147,
    height: 147,
    borderRadius: 90,
    backgroundColor: 'rgba(203, 179, 240, 0.35)', // inner light
  },
  portalGlow: {
    position: 'absolute',
    left: -30, right: -30, top: -30, bottom: -30,
    borderRadius: 220,
    backgroundColor: 'rgba(203, 179, 240, 0.18)', // lavender aura
  },
  message: {
    color: '#F0EEF8',
    fontSize: 16,
    opacity: 0.9,
    marginTop: 8,
    marginBottom: 12,
  },
  actions: {
    alignItems: 'center',
    marginBottom: 12,
    zIndex: 75,
    elevation: 75, // Android elevation
  },
  primaryButton: {
    backgroundColor: '#CFC3E0',
    paddingVertical: 10,
    paddingHorizontal: 32,
    borderRadius: 20,
    marginBottom: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.20)',
  },
  primaryText: { color: '#1F233A', fontSize: 18, fontWeight: '600', lineHeight: 20 },
  secondaryText: { color: '#F0EEF8', fontSize: 14, opacity: 0.85 },
  // heroSection is intentionally stacked above orb for reliable tap handling on CTA
  heroSection: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingBottom: 12,
    zIndex: 70,
    elevation: 70, // Android elevation
  },

  primarySub: {
  color: '#2B2F46',
  fontSize: 12,
  marginTop: 2,
  opacity: 0.8,
  textAlign: 'center',
  },

  intentionAffirmation: {
    marginTop: 4,
    color: '#E8E5F3',
    fontSize: 14,
    opacity: 0.9,
    textAlign: 'center',
},
progressTrack: {
  marginTop: 6,
  width: '86%',
  height: 3,
  borderRadius: 3,
  backgroundColor: 'rgba(31,35,58,0.25)',
  alignSelf: 'center',
  overflow: 'hidden',
},
progressFill: {
  height: '100%',
  backgroundColor: '#6B5AE0', // Deep indigo — subtle, on-brand
},

  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalCard: {
    width: '84%',
    backgroundColor: 'rgba(18,18,32,0.96)',
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)'
  },
  modalTitle: {
    color: '#F0EEF8',
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 10,
    textAlign: 'center',
  },
  modalBtn: {
    backgroundColor: 'rgba(207,195,224,0.18)',
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 12,
    marginTop: 10,
  },
  modalBtnText: {
    color: '#E8E4F3',
    fontSize: 16,
    textAlign: 'center',
  },
  modalCancel: {
    color: '#B9B5C9',
    fontSize: 14,
    textAlign: 'center',
    marginTop: 14,
  },
  tileBlur: {
    flex: 1,
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)'
  },
  tileBg: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 16,
  },
  tileHighlight: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    height: 28,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
  },
  navArrowHint: {
    position: 'absolute',
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 2,
    borderColor: 'rgba(207,195,224,0.85)', // lavender ring
    backgroundColor: 'transparent',
    zIndex: 24, // just beneath the arrows (which render after)
  },
  navArrowLeft: {
    position: 'absolute',
    left: 12,
    top: 400, // centers vertically around the 50% container line
    width: 48,
    height: 48,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.30)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  navArrowRight: {
    position: 'absolute',
    right: 12,
    top: 400,
    width: 48,
    height: 48,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.30)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  navArrowBottom: {
    position: 'absolute',
    left: '50%',
    bottom: 0,
    width: 48,
    height: 48,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.30)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    transform: [{ translateX: -24 }],
    zIndex: 61,
    elevation: 61,
  },
  navArrowCaption: {
    position: 'absolute',
    left: '50%',
    bottom: 0, // actual bottom offset is applied inline with insets
    // Give it a fixed width so we can truly center under the 48px arrow
    width: 96,
    transform: [{ translateX: -48 }], // center the caption under the arrow
    color: '#EDEAF6',
    fontSize: 12,
    opacity: 0.9,
    letterSpacing: 0.3,
    textAlign: 'center',
    backgroundColor: 'transparent',
    zIndex: 61,
    elevation: 61,
  },
  navArrowText: {
    color: '#EDEAF6',
    fontSize: 22,
    lineHeight: 22,
  },
  intentionTopWrap: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 200,
    elevation: 200,
  },
  intentionTopText: {
    color: '#E8E5F3',
    fontSize: 20,
    letterSpacing: 0.2,
    opacity: 0.9,
  },
  intentionTopSub: {
    marginTop: 2,
    color: '#CFC9E8',
    fontSize: 12,
    letterSpacing: 0.2,
    opacity: 0.85,
  },
});