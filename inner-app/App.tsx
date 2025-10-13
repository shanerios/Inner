import React, { useEffect } from "react";
import { View, Text } from 'react-native';
import { NavigationContainer, DarkTheme } from "@react-navigation/native";
import { IntentionProvider } from './core/IntentionProvider';
import { BreathProvider } from './core/BreathProvider';
import { createStackNavigator, CardStyleInterpolators } from "@react-navigation/stack";
import TrackPlayer from "react-native-track-player";
import SplashScreen from "./screens/SplashScreen";
import IntroScreen from "./screens/IntroScreen";
import IntentionScreen from "./screens/IntentionScreen";
import EssenceScreen from "./screens/EssenceScreen";
import HomeScreen from "./screens/HomeScreen";
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
import { Asset } from 'expo-asset';

import { Audio } from "expo-av";

// Register background playback service for lock screen / BT controls
TrackPlayer.registerPlaybackService(() => require('./service.js'));

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
    "CalSans-Regular": require("./assets/fonts/CalSans-Regular.ttf"),
  });

  // Global one-time asset preloader
  useEffect(() => {
    (async () => {
      try {
        await Asset.loadAsync([
          require('./assets/audio/Homepage_Hum.mp3'),
          require('./assets/audio/Chambers/Chamber1_Guided_AI-64k.m4a'),
          require('./assets/audio/Chambers/Chamber2_guided-64k.m4a'),
          require('./assets/audio/Chambers/Chamber3_guided-64k.m4a'),
        ]);
        await preloadTracks();
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

  if (!fontsLoaded) return null;

  return (
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
            <Stack.Screen name="LessonList" component={LessonList} options={{ headerShown: false }}/>
            <Stack.Screen name="LessonReader" component={LessonReader} options={{ headerShown: false }}/>
            <Stack.Screen name="Chambers" component={ChambersScreen} options={{ headerShown: false }} />
            <Stack.Screen name="Soundscapes" component={SoundscapesScreen} options={{ headerShown: false }} />
            <Stack.Screen name="JourneyPicker" component={JourneyPicker} />
            <Stack.Screen name="JourneyPlayer" component={JourneyPlayer} options={{ headerShown: false, presentation: 'transparentModal' }} />
            <Stack.Screen name="Glossary" component={require('./learn/screens/GlossaryScreen').default} options={{ headerShown: false }} />
            <Stack.Screen name="Journal" component={JournalListScreen} options={{ headerShown: true, headerTransparent: true, headerTitle: '' }} />
            <Stack.Screen name="JournalEntry" component={JournalEntryScreen} options={{ headerShown: true, headerTransparent: true, headerTitle: '' }} />
          </Stack.Navigator>
        </NavigationContainer>
      </IntentionProvider>
    </BreathProvider>
  );
}
