import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { NativeBaseProvider } from 'native-base';

import SplashScreen from './screens/SplashScreen';
import IntroScreen from './screens/IntroScreen';
import SoulPromptScreen from './screens/SoulPromptScreen';
import AffirmationScreen from './screens/AffirmationScreen';
import BeginScreen from './screens/BeginScreen';

const Stack = createNativeStackNavigator();

export default function App() {
  return (
    <NativeBaseProvider>
      <NavigationContainer>
        <Stack.Navigator initialRouteName="Splash" screenOptions={{ headerShown: false }}>
          <Stack.Screen name="Splash" component={SplashScreen} />
          <Stack.Screen name="Intro" component={IntroScreen} />
          <Stack.Screen name="SoulPrompt" component={SoulPromptScreen} />
          <Stack.Screen name="Affirmation" component={AffirmationScreen} />
          <Stack.Screen name="Begin" component={BeginScreen} />
        </Stack.Navigator>
      </NavigationContainer>
    </NativeBaseProvider>
  );
}
