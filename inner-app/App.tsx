import React, { useEffect } from "react";
import AsyncStorage from '@react-native-async-storage/async-storage';
import OnboardingFlow from './screens/OnboardingFlow';
import { SafeAreaProvider } from "react-native-safe-area-context";
import { View, Text, Platform } from 'react-native';
import { NavigationContainer, DarkTheme } from "@react-navigation/native";
import { IntentionProvider } from './core/IntentionProvider';
import { BreathProvider } from './core/BreathProvider';
import { createStackNavigator, CardStyleInterpolators } from "@react-navigation/stack";
import TrackPlayer from "react-native-track-player";

import Purchases, { LOG_LEVEL } from 'react-native-purchases';
import SplashScreen from "./screens/SplashScreen";
import IntroScreen from "./screens/IntroScreen";
import IntentionScreen from "./screens/IntentionScreen";
import EssenceScreen from "./screens/EssenceScreen";
import ChambersScreen from "./screens/ChambersScreen";
import SoundscapesScreen from "./screens/SoundscapesScreen";
import { useFonts } from "expo-font";
import { StatusBar } from 'expo-status-bar';
import JourneyPlayer from './screens/JourneyPlayer';
import LearnHub from './learn/screens/LearnHub';
import LessonList from './learn/screens/LessonList';
import LessonReader from './learn/screens/LessonReader';
import JournalListScreen from './screens/JournalListScreen';
import JournalEntryScreen from './screens/JournalEntryScreen';
import HomeScreen from './screens/HomeScreen';
import PointZeroScreen from './screens/PointZeroScreen';
import CleanSlateScreen from './screens/CleanSlateScreen';
import InnerFlameScreen from './screens/InnerFlameScreen';
import DailyRitualScreen from './screens/DailyRitualScreen';
import { Asset } from 'expo-asset';

import { Audio } from "expo-av";
import * as FileSystem from 'expo-file-system';
import { InteractionManager, AppState, Easing } from 'react-native';
// import NetInfo from '@react-native-community/netinfo';
import { initAudioOnce } from './core/initAudio';
// import { TRACKS, getTrackUrl } from './data/tracks';
// import { cacheRemoteOnce } from './utils/audioCache';

// Register background playback service for lock screen / BT controls (guarded)
if (!(globalThis as any).__tp_service_registered) {
  (globalThis as any).__tp_service_registered = true;
  TrackPlayer.registerPlaybackService(() => require('./service.js'));
}

// Preload specific long-form tracks so first play is instant
const TRACKS_TO_PRELOAD = [
];

// Removed the Harmonic_Resonance track from preloading

async function preloadTracks() {
  try {
    const assets = await Promise.all(
      TRACKS_TO_PRELOAD.map((t) => Asset.fromModule(t.module).downloadAsync())
    );
    // Cache resolved local URIs globally so JourneyPlayer can load via URI (no re-copy)
    (globalThis as any).__TRACK_URIS = Object.fromEntries(
      assets.map((a, idx) => [TRACKS_TO_PRELOAD[idx].id, a.localUri ?? a.uri])
    );
    console.log('[PRELOAD] Tracks cached:', Object.keys((globalThis as any).__TRACK_URIS));
  } catch (e) {
    console.log('[PRELOAD] Error preloading audio', e);
  }
}

import FogTransitionOverlay from './components/FogTransitionOverlay';
import PaywallModal from './components/PaywallModal';
import { registerPaywallController } from './src/core/subscriptions/paywallController';

type RootStackParamList = {
  Splash: undefined;
  Intro: undefined;
  Intention: undefined;
  EssenceScreen: undefined;
  Home: undefined;
  LearnHub: undefined;
  LessonList: { trackId: 'lucid' | 'obe' };
  LessonReader: { trackId: 'lucid' | 'obe'; lessonId: string };
  Chambers: undefined;
  Soundscapes: undefined;
  JourneyPicker: undefined;
  JourneyPlayer: { trackId?: string; chamber?: string } | undefined;
  Glossary: { trackId: 'lucid' | 'obe' };
};

const Stack = createStackNavigator<RootStackParamList>();

// Soft “veil lift” transition: gentle fade-in + stronger upward settle + more noticeable dark veil overlay
const veilLiftInterpolator = ({ current }: any) => {
  const progress = current.progress;

  const opacity = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 1],
  });

  const translateY = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [22, 0], // Stronger upward settle
  });

  const overlayOpacity = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 0.28], // More noticeable veil
  });

  return {
    cardStyle: {
      opacity,
      transform: [{ translateY }],
    },
    overlayStyle: {
      // Purple-tinted veil (Inner midnight / plum) instead of pure black
      backgroundColor: '#1A1026',
      opacity: overlayOpacity,
    },
  };
};

const InnerTheme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    background: '#0d0d1a', // Inner midnight
    card: '#0d0d1a',
    primary: '#d4af37',
    text: '#ffffff',
    border: 'transparent',
    notification: DarkTheme.colors.notification,
  },
};

function JourneyPicker() {
  return (
    <View style={{ flex: 1, backgroundColor: '#0d0d1a', justifyContent: 'center', alignItems: 'center' }}>
      <Text style={{ color: '#ffffff', fontSize: 20 }}>Journey Picker (placeholder)</Text>
    </View>
  );
}


export default function App() {
  const [fontsLoaded] = useFonts({
    'CalSans-Regular': require('./assets/fonts/CalSans-Regular.ttf'),
    'CalSans-SemiBold': require('./assets/fonts/calsans-semibold.otf'),
    'Inter-ExtraLight': require('./assets/fonts/Inter-ExtraLight.ttf'),
  });

  const [fogVisible, setFogVisible] = React.useState(false);
  const [sealBoost, setSealBoost] = React.useState(0);

  // ── Paywall modal state ──────────────────────────────────────────────────────
  const [paywallVisible, setPaywallVisible] = React.useState(false);
  const paywallSuccessRef = React.useRef<(() => void) | undefined>(undefined);
  const paywallDismissRef = React.useRef<(() => void) | undefined>(undefined);

  // RevenueCat (Subscriptions) — initialize once
  useEffect(() => {
    try {
      if (Purchases.setLogHandler) {
        Purchases.setLogHandler((level: any, message: string) => {
          if (__DEV__) {
            console.log('[RC]', level, message);
          }
        });
      }
      // Verbose logs in dev only
      Purchases.setLogLevel(__DEV__ ? LOG_LEVEL.VERBOSE : LOG_LEVEL.WARN);

      const apiKey =
        Platform.OS === 'android'
          ? process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY
          : process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY;

      // Safe log presence of env keys (do NOT log raw key)
      console.log('[RC ENV] iOS key present?', !!process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY);
      console.log('[RC ENV] Android key present?', !!process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY);

      if (!apiKey) {
        console.warn('[RevenueCat] Missing API key for platform:', Platform.OS);
        return;
      }

      Purchases.configure({ apiKey });
      console.log('[RevenueCat] configured for', Platform.OS);
    } catch (e) {
      console.log('[RevenueCat] configure error', e);
    }
  }, []);


  // Expose global controls so screens can trigger the shared fog without remounting
  React.useEffect(() => {
    (globalThis as any).__fog = {
      show: () => setFogVisible(true),
      hide: () => setFogVisible(false),
      boost: (amount: number = 0.12, ms: number = 900) => {
        setSealBoost(amount);
        setTimeout(() => setSealBoost(0), ms);
      },
    };
    return () => { (globalThis as any).__fog = undefined; };
  }, []);

  // Register the imperative paywall controller so safePresentPaywall() works anywhere
  React.useEffect(() => {
    registerPaywallController((onSuccess, onDismiss) => {
      paywallSuccessRef.current = onSuccess;
      paywallDismissRef.current = onDismiss;
      setPaywallVisible(true);
    });
  }, []);

  // Safety auto-hide: fog will always disappear after 7 seconds
  React.useEffect(() => {
    if (!fogVisible) return;
    const t = setTimeout(() => setFogVisible(false), 7000);
    return () => clearTimeout(t);
  }, [fogVisible]);

  // Global one-time asset preloader
  useEffect(() => {
    (async () => {
      try {
        await Asset.loadAsync([
          require('./assets/audio/Homepage_Hum.mp3'),
        ]);
        await preloadTracks();
        // Preload fog overlay asset for smooth transitions
        await Asset.fromModule(require('./assets/fx/fog.webp')).downloadAsync().catch(() => {});
        console.log('[PRELOAD] Audio assets cached.');
        console.log('[PRELOAD] Chamber One cached. ');
      } catch (e) {
        console.log('[PRELOAD] Error preloading audio', e);
      }
    })();

    return () => {
      // optional cleanup if you ever create preloaded Audio.Sound objects globally
    };
  }, []);

  // Initialize audio engine and background warmups
  useEffect(() => {
    initAudioOnce().catch(() => {});

    InteractionManager.runAfterInteractions(() => {
      warmStaticAssets().catch(() => {});
      warmCdnHead().catch(() => {});
      cleanAudioCache().catch(() => {});
    });

    const sub = AppState.addEventListener('change', (st) => {
      if (st === 'active') {
        cleanAudioCache().catch(() => {});
      }
    });
    return () => { sub.remove(); };
  }, []);

  if (!fontsLoaded) return null;

  return (
    <SafeAreaProvider>
      <BreathProvider>
        <IntentionProvider>
          <NavigationContainer theme={InnerTheme}>
            <StatusBar style="light" backgroundColor="#0d0d1a" translucent={false} />
            <Stack.Navigator initialRouteName="Splash"
              detachInactiveScreens={false}
              screenOptions={{
                headerShown: false,
                cardStyle: { backgroundColor: '#0d0d1a' },
                cardStyleInterpolator: CardStyleInterpolators.forFadeFromCenter,
                transitionSpec: {
                  open:  { animation: 'timing', config: { duration: 500 } },
                  close: { animation: 'timing', config: { duration: 500 } },
                },
              }}
            >
              <Stack.Screen name="Splash" component={SplashScreen} />
              <Stack.Screen name="Intro" component={IntroScreen} />
              <Stack.Screen
                name="Intention"
                component={IntentionScreen}
                options={{
                  cardStyle: { backgroundColor: 'transparent' },
                  presentation: 'transparentModal',
                }}
              />
              <Stack.Screen
                name="EssenceScreen"
                component={EssenceScreen}
                options={{
                  cardStyle: { backgroundColor: 'transparent' },
                  presentation: 'transparentModal',
                }}
              />
              <Stack.Screen name="Home" component={HomeScreen} options={{ headerShown: false }} />
              <Stack.Screen name="LearnHub" component={LearnHub} options={{ headerShown: false }} />
              <Stack.Screen name="LessonList" component={LessonList} options={{ headerShown: false }} />
              <Stack.Screen
                name="LessonReader"
                component={LessonReader}
                listeners={{
                  transitionStart: (e) => {
                    // Only on open (not closing)
                    // @ts-ignore
                    if (e?.data?.closing) return;
                    try {
                      (globalThis as any).__fog?.show?.();
                      (globalThis as any).__fog?.boost?.(0.08, 1200);
                      setTimeout(() => (globalThis as any).__fog?.hide?.(), 1200);
                    } catch {}
                  },
                  focus: () => {
                    // Fallback: ensure a tiny haze even if transition events are missed
                    try {
                      (globalThis as any).__fog?.show?.();
                      (globalThis as any).__fog?.boost?.(0.06, 900);
                      setTimeout(() => (globalThis as any).__fog?.hide?.(), 900);
                    } catch {}
                  },
                }}
                options={{
                  headerShown: false,
                  cardOverlayEnabled: true,
                  cardStyleInterpolator: veilLiftInterpolator,
                  transitionSpec: {
                    open: { animation: 'timing', config: { duration: 1100, easing: Easing.out(Easing.cubic) } },
                    close:{ animation: 'timing', config: { duration: 650, easing: Easing.out(Easing.cubic) } },
                  },
                }}
              />
              <Stack.Screen name="Chambers" component={ChambersScreen} options={{ headerShown: false }} />
              <Stack.Screen name="Soundscapes" component={SoundscapesScreen} options={{ headerShown: false }} />
              <Stack.Screen name="JourneyPicker" component={JourneyPicker} />
              <Stack.Screen name="JourneyPlayer" component={JourneyPlayer} options={{ headerShown: false, presentation: 'transparentModal' }} />
              <Stack.Screen name="Glossary" component={require('./learn/screens/GlossaryScreen').default} options={{ headerShown: false }} />
              <Stack.Screen
                name="Journal"
                component={JournalListScreen}
                options={{ headerShown: true, headerTransparent: true, headerTitle: '' }}
              />
              <Stack.Screen
                name="JournalEntry"
                component={JournalEntryScreen}
                listeners={{
                  transitionStart: (e) => {
                    // Only on open (not closing)
                    // @ts-ignore
                    if (e?.data?.closing) return;
                    try {
                      (globalThis as any).__fog?.show?.();
                      (globalThis as any).__fog?.boost?.(0.08, 1200);
                      setTimeout(() => (globalThis as any).__fog?.hide?.(), 1200);
                    } catch {}
                  },
                  focus: () => {
                    // Fallback: ensure a tiny haze even if transition events are missed
                    try {
                      (globalThis as any).__fog?.show?.();
                      (globalThis as any).__fog?.boost?.(0.06, 900);
                      setTimeout(() => (globalThis as any).__fog?.hide?.(), 900);
                    } catch {}
                  },
                }}
                options={{
                  headerShown: true,
                  headerTransparent: true,
                  headerTitle: '',
                  cardOverlayEnabled: true,
                  cardStyleInterpolator: veilLiftInterpolator,
                  transitionSpec: {
                    open: { animation: 'timing', config: { duration: 1100, easing: Easing.out(Easing.cubic) } },
                    close:{ animation: 'timing', config: { duration: 650, easing: Easing.out(Easing.cubic) } },
                  },
                }}
              />
              <Stack.Screen name="PointZero" component={PointZeroScreen} options={{ headerShown: false }} />
              <Stack.Screen name="CleanSlate" component={CleanSlateScreen} options={{ headerShown: false }} />
              <Stack.Screen name="InnerFlame" component={InnerFlameScreen} options={{ headerShown: false }} />
              <Stack.Screen name="DailyRitual" component={DailyRitualScreen} options={{ headerShown: false }} />
            </Stack.Navigator>
            <FogTransitionOverlay
              visible={fogVisible}
              tint={'#5e3b7c'}
              onHidden={() => setFogVisible(false)}
              sealBoost={sealBoost}
            />
          </NavigationContainer>
          <PaywallModal
            visible={paywallVisible}
            onClose={() => {
              setPaywallVisible(false);
              paywallSuccessRef.current = undefined;
              paywallDismissRef.current?.();
              paywallDismissRef.current = undefined;
            }}
            onPurchaseSuccess={() => {
              paywallSuccessRef.current?.();
              paywallSuccessRef.current = undefined;
            }}
          />
        </IntentionProvider>
      </BreathProvider>
    </SafeAreaProvider>
  );
}

async function warmStaticAssets() {
  try {
    await Asset.loadAsync([
      require('./assets/images/orb-player-cover.png'),
    ]);
  } catch {}
}

async function warmCdnHead() {
  try {
    await fetch('https://f005.backblazeb2.com/file/inner-audio/ping.txt', { method: 'HEAD' });
  } catch {}
}

async function warmAudioSmallSet() {
  // Stream-first policy: do not silently download/cache remote audio on app start.
  // Offline caching should be explicit (e.g., via a future “Download for offline” action).
  return;
}

// Conservative cleanup of stale audio cache to prevent bloat and speed IO
async function cleanAudioCache() {
  try {
    const AUDIO_EXTS = ['.m4a', '.aac', '.mp3', '.m4b', '.wav', '.ogg'];
    const MAX_BYTES = 300 * 1024 * 1024; // 300 MB safety cap
    const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
    
    const now = Date.now();
    const candidates: { uri: string; size: number; mtime: number }[] = [];

    // Helper to scan a directory shallowly and collect audio-like files
    const scanDir = async (dir: string) => {
      let names: string[] = [];
      try { names = await FileSystem.readDirectoryAsync(dir); } catch { return; }
      for (const name of names) {
        const uri = dir.endsWith('/') ? dir + name : dir + '/' + name;
        let info;
        try { info = await FileSystem.getInfoAsync(uri); } catch { continue; }
        if (!info || !info.exists) continue;
        if (info.isDirectory) {
          // Shallow-scan only likely audio subfolders to keep things light
          const lower = name.toLowerCase();
          if (lower.includes('audio') || lower.includes('av') || lower.includes('inner')) {
            await scanDir(uri);
          }
          continue;
        }
        const lower = name.toLowerCase();
        if (AUDIO_EXTS.some(ext => lower.endsWith(ext))) {
          const mtime = (info.modificationTime ?? info.mtime ?? now) * 1000; // Expo returns seconds
          candidates.push({ uri, size: info.size ?? 0, mtime });
        }
      }
    };

    // Start at cache root, scan shallowly
    await scanDir(FileSystem.cacheDirectory!);

    if (!candidates.length) return;

    // 1) Purge by age
    const tooOld = candidates.filter(f => now - f.mtime > MAX_AGE_MS);
    for (const f of tooOld) {
      try { await FileSystem.deleteAsync(f.uri, { idempotent: true }); } catch {}
    }

    // 2) Enforce disk budget
    const remaining = candidates.filter(f => !(tooOld.some(t => t.uri === f.uri)));
    let total = remaining.reduce((sum, f) => sum + (f.size || 0), 0);
    if (total > MAX_BYTES) {
      // delete oldest first
      const byOldest = [...remaining].sort((a, b) => a.mtime - b.mtime);
      for (const f of byOldest) {
        if (total <= MAX_BYTES) break;
        try {
          await FileSystem.deleteAsync(f.uri, { idempotent: true });
          total -= f.size || 0;
        } catch {}
      }
    }
  } catch {
    // Swallow errors; cleanup is best-effort only
  }
}
