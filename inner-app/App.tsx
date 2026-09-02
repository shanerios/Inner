import React, { useEffect, useRef } from "react";
import AsyncStorage from '@react-native-async-storage/async-storage';
import OnboardingFlow from './screens/OnboardingFlow';
import { SafeAreaProvider } from "react-native-safe-area-context";
import { View, Text, Platform } from 'react-native';
import { NavigationContainer, DarkTheme } from "@react-navigation/native";
import { IntentionProvider } from './core/IntentionProvider';
import { BreathProvider } from './core/BreathProvider';
import { createStackNavigator, CardStyleInterpolators } from "@react-navigation/stack";

import SplashScreen from "./screens/SplashScreen";
import IntroScreen from "./screens/IntroScreen";
import ValueCaptureScreen from "./screens/onboarding/ValueCaptureScreen";
import ValueHookScreen from "./screens/onboarding/ValueHookScreen";
import AccountCreateScreen from "./screens/AccountCreateScreen";
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
import AerisScreen from './screens/AerisScreen';
import GuardianScreen from './screens/GuardianScreen';
import GuardianPlayerScreen from './screens/GuardianPlayerScreen';
import { Asset } from 'expo-asset';

import { Audio } from "expo-av";
import * as FileSystem from 'expo-file-system';
import * as Notifications from 'expo-notifications';
import { InteractionManager, AppState, Easing } from 'react-native';
// import NetInfo from '@react-native-community/netinfo';
import { initAudioOnce } from './core/initAudio';
import { scheduleReengagementNotification } from './utils/notifications';
import { createEntry } from './core/journalRepo';
import { initChottuLinkOnce } from './src/core/deeplinking/chottuLink';
// import { TRACKS, getTrackUrl } from './data/tracks';
// import { cacheRemoteOnce } from './utils/audioCache';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

// Preload specific long-form tracks so first play is instant
const TRACKS_TO_PRELOAD: Array<{ id: string; module: number }> = [
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
import PaywallScreen from './screens/PaywallScreen';
import { navigationRef } from './src/navigation/navigationRef';
import * as Sentry from '@sentry/react-native';
import { initializeMemoryTelemetry } from './core/memorySafeVideo';
import { PostHogProvider, usePostHog } from 'posthog-react-native';
import { sanitizeSentryEvent } from './core/sentrySanitizer';

Sentry.init({
  dsn: process.env.EXPO_PUBLIC_SENTRY_DSN,

  // Adds more context data to events (IP address, cookies, user, etc.)
  // For more information, visit: https://docs.sentry.io/platforms/react-native/data-management/data-collected/
  sendDefaultPii: false,

  // Enable Logs
  enableLogs: false,

  // uncomment the line below to enable Spotlight (https://spotlightjs.com)
  // spotlight: __DEV__,

  beforeSend: sanitizeSentryEvent,
});

initializeMemoryTelemetry();

type RootStackParamList = {
  Splash: undefined;
  Intro: undefined;
  ValueCapture: undefined;
  ValueHook: undefined;
  Intention: undefined;
  EssenceScreen: undefined;
  Home: undefined;
  LearnHub: undefined;
  LessonList: { trackId: 'lucid' | 'obe' };
  LessonReader: { trackId: 'lucid' | 'obe'; lessonId: string };
  Chambers: undefined;
  Soundscapes: { category?: string; showExplorerWelcome?: boolean } | undefined;
  JourneyPicker: undefined;
  JourneyPlayer: { trackId?: string; chamber?: string } | undefined;
  Glossary: { trackId: 'lucid' | 'obe' };
  Journal: undefined;
  JournalEntry: { id: string; isNew?: boolean };
  Guardian: undefined;
  GuardianPlayer: { trackId: string };
  PointZero: undefined;
  CleanSlate: undefined;
  InnerFlame: undefined;
  DailyRitual: undefined;
  Aeris: undefined;
  Paywall: undefined;
  AccountCreate: undefined;
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

// Deep-links a notification tap into the right screen. "wake" creates a
// fresh entry and drops the user straight into writing — the notification's
// whole point is capturing a dream before it fades, so skip the list.
// "reengagement" is generic ("come back"), so it lands on Home like a plain
// orb tap would for a returning user.
async function handleNotificationResponse(response: Notifications.NotificationResponse | null) {
  if (!response) return;
  const type = response.notification.request.content.data?.type;
  if (!navigationRef.isReady()) return;

  if (type === 'wake') {
    try {
      const entry = await createEntry({});
      // Home sits beneath JournalEntry so the entry's own back button has
      // somewhere to go — a bare single-route reset leaves goBack() with
      // nothing and RETURN throws "action not handled".
      // @ts-ignore
      navigationRef.reset({
        index: 1,
        routes: [{ name: 'Home' }, { name: 'JournalEntry', params: { id: entry.id, isNew: true } }],
      });
    } catch {}
  } else if (type === 'reengagement') {
    // @ts-ignore
    navigationRef.reset({ index: 0, routes: [{ name: 'Home' }] });
  }
}

function JourneyPicker() {
  return (
    <View style={{ flex: 1, backgroundColor: '#0d0d1a', justifyContent: 'center', alignItems: 'center' }}>
      <Text style={{ color: '#ffffff', fontSize: 20 }}>Journey Picker (placeholder)</Text>
    </View>
  );
}



function PostHogBootTracker() {
  const posthog = usePostHog();

  React.useEffect(() => {
    posthog.capture('app_opened', {
      platform: Platform.OS,
    });
  }, [posthog]);

  return null;
}

export default Sentry.wrap(function App() {
  const previousRouteName = useRef<string | undefined>(undefined);
  const [fontsLoaded] = useFonts({
    'CalSans-Regular': require('./assets/fonts/CalSans-Regular.ttf'),
    'CalSans-SemiBold': require('./assets/fonts/calsans-semibold.otf'),
    'Inter-ExtraLight': require('./assets/fonts/Inter-ExtraLight.ttf'),
  });

  const [fogVisible, setFogVisible] = React.useState(false);
  const [sealBoost, setSealBoost] = React.useState(0);

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


  // Start deferred deep-link resolution after React's first render instead of
  // during module evaluation. Paywall entry points initialize RevenueCat when needed.
  useEffect(() => {
    initChottuLinkOnce();
  }, []);

  // Notification tap deep-linking: covers both the app already running
  // (live listener) and a cold launch triggered by the tap itself (checked
  // once navigation is ready, via onReady below).
  useEffect(() => {
    const sub = Notifications.addNotificationResponseReceivedListener(handleNotificationResponse);
    return () => sub.remove();
  }, []);

  // paywallController now uses navigationRef directly — no registration needed here.

  // Safety auto-hide: fog will always disappear after 7 seconds
  React.useEffect(() => {
    if (!fogVisible) return;
    const t = setTimeout(() => setFogVisible(false), 7000);
    return () => clearTimeout(t);
  }, [fogVisible]);

  // Initialize audio engine and background warmups
  useEffect(() => {
    initAudioOnce().catch(() => {});

    InteractionManager.runAfterInteractions(() => {
      preloadStartupAssets().catch(() => {});
      warmStaticAssets().catch(() => {});
      warmCdnHead().catch(() => {});
      cleanAudioCache().catch(() => {});
    });

    // Every open/foreground pushes the "come back" reminder further out —
    // an active user keeps deferring it forever; a lapsed one leaves the
    // last-scheduled one to actually fire. No-ops if permission was never
    // granted (this never prompts on its own — see utils/notifications.ts).
    scheduleReengagementNotification().catch(() => {});

    const sub = AppState.addEventListener('change', (st) => {
      if (st === 'active') {
        cleanAudioCache().catch(() => {});
        scheduleReengagementNotification().catch(() => {});
      }
    });
    return () => { sub.remove(); };
  }, []);

  if (!fontsLoaded) return null;

  return (
    <PostHogProvider
      apiKey={process.env.EXPO_PUBLIC_POSTHOG_KEY ?? ''}
      autocapture={false}
      options={{
        host: process.env.EXPO_PUBLIC_POSTHOG_HOST ?? 'https://us.i.posthog.com',
        captureAppLifecycleEvents: true,
      }}
    >
      <PostHogBootTracker />
      <SafeAreaProvider>
        <BreathProvider>
          <IntentionProvider>
            <NavigationContainer
              theme={InnerTheme}
              ref={navigationRef}
              onReady={() => {
                previousRouteName.current = (navigationRef.getCurrentRoute() as any)?.name;
                // Cold launch via a notification tap — the live listener above
                // only catches taps while already running.
                Notifications.getLastNotificationResponseAsync().then(handleNotificationResponse);
              }}
              onStateChange={() => {
                const current = (navigationRef.getCurrentRoute() as any)?.name as string | undefined;
                if (!current || current === previousRouteName.current) return;
                Sentry.addBreadcrumb({
                  category: 'navigation.lifecycle',
                  level: 'info',
                  message: 'screen changed',
                  data: { from: previousRouteName.current, to: current },
                });
                Sentry.setTag('navigation.current_screen', current);
                previousRouteName.current = current;
              }}
            >
              <StatusBar style="light" backgroundColor="#0d0d1a" translucent={false} />
              <Stack.Navigator initialRouteName="Splash"
                detachInactiveScreens
                screenOptions={{
                  headerShown: false,
                  freezeOnBlur: true,
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
                <Stack.Screen name="ValueCapture" component={ValueCaptureScreen} />
                <Stack.Screen name="ValueHook" component={ValueHookScreen} />
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
                <Stack.Screen name="Guardian" component={GuardianScreen} options={{ headerShown: false }} />
                <Stack.Screen name="GuardianPlayer" component={GuardianPlayerScreen} options={{ headerShown: false }} />
                <Stack.Screen name="PointZero" component={PointZeroScreen} options={{ headerShown: false }} />
                <Stack.Screen name="CleanSlate" component={CleanSlateScreen} options={{ headerShown: false }} />
                <Stack.Screen name="InnerFlame" component={InnerFlameScreen} options={{ headerShown: false }} />
                <Stack.Screen name="DailyRitual" component={DailyRitualScreen} options={{ headerShown: false }} />
                <Stack.Screen
                  name="Aeris"
                  component={AerisScreen}
                  listeners={{
                    transitionStart: (e) => {
                      // @ts-ignore
                      if (e?.data?.closing) return;
                      try {
                        (globalThis as any).__fog?.show?.();
                        (globalThis as any).__fog?.boost?.(0.08, 1200);
                        setTimeout(() => (globalThis as any).__fog?.hide?.(), 1200);
                      } catch {}
                    },
                    focus: () => {
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
                      open:  { animation: 'timing', config: { duration: 900, easing: Easing.out(Easing.cubic) } },
                      close: { animation: 'timing', config: { duration: 600, easing: Easing.out(Easing.cubic) } },
                    },
                  }}
                />
                <Stack.Screen
                  name="Paywall"
                  component={PaywallScreen}
                  options={{ headerShown: false, presentation: 'modal' }}
                />
                <Stack.Screen
                  name="AccountCreate"
                  component={AccountCreateScreen}
                  options={{ headerShown: false, presentation: 'modal' }}
                />
              </Stack.Navigator>
              <FogTransitionOverlay
                visible={fogVisible}
                tint={'#5e3b7c'}
                onHidden={() => setFogVisible(false)}
                sealBoost={sealBoost}
              />
            </NavigationContainer>
          </IntentionProvider>
        </BreathProvider>
      </SafeAreaProvider>
    </PostHogProvider>
  );
});

async function warmStaticAssets() {
  try {
    await Asset.loadAsync([
      require('./assets/images/orb-player-cover.png'),
    ]);
  } catch {}
}

async function preloadStartupAssets() {
  try {
    await preloadTracks();
    await Asset.fromModule(require('./assets/fx/fog.webp')).downloadAsync().catch(() => {});
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
    const CLEANUP_KEY = 'inner.audioCache.lastCleanup.v1';
    const CLEANUP_INTERVAL_MS = 24 * 60 * 60 * 1000;
    const CACHE_DIR = `${FileSystem.cacheDirectory}inner_audio/`;
    const now = Date.now();
    const lastCleanup = Number(await AsyncStorage.getItem(CLEANUP_KEY)) || 0;
    if (now - lastCleanup < CLEANUP_INTERVAL_MS) return;

    const cacheInfo = await FileSystem.getInfoAsync(CACHE_DIR);
    if (!cacheInfo.exists || !cacheInfo.isDirectory) {
      await AsyncStorage.setItem(CLEANUP_KEY, String(now));
      return;
    }
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
        if (info.isDirectory) continue;
        const lower = name.toLowerCase();
        if (AUDIO_EXTS.some(ext => lower.endsWith(ext))) {
          const mtime = (info.modificationTime ?? now / 1000) * 1000; // Expo returns seconds
          candidates.push({ uri, size: info.size ?? 0, mtime });
        }
      }
    };

    // Scan only the app-owned offline-audio cache.
    await scanDir(CACHE_DIR);

    if (!candidates.length) {
      await AsyncStorage.setItem(CLEANUP_KEY, String(now));
      return;
    }

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
    await AsyncStorage.setItem(CLEANUP_KEY, String(now));
  } catch {
    // Swallow errors; cleanup is best-effort only
  }
}
