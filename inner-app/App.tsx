import React from "react";
import { NavigationContainer } from "@react-navigation/native";
import { createStackNavigator, CardStyleInterpolators } from "@react-navigation/stack";
import SplashScreen from "./screens/SplashScreen";
import IntroScreen from "./screens/IntroScreen";
import IntentionScreen from "./screens/IntentionScreen";
import EssenceScreen from "./screens/EssenceScreen";
import BeginScreen from "./screens/BeginScreen";
import { useFonts } from "expo-font";

const Stack = createStackNavigator();

export default function App() {
  const [fontsLoaded] = useFonts({
    "CalSans-Regular": require("./assets/fonts/CalSans-Regular.ttf"),
  });

  if (!fontsLoaded) return null;

  return (
    <NavigationContainer>
      <Stack.Navigator
        screenOptions={{
          headerShown: false,
          cardStyleInterpolator: CardStyleInterpolators.forFadeFromBottomAndroid,
          transitionSpec: {
            open: {
              animation: "timing",
              config: {
                duration: 1000, // 1 second fade in
              },
            },
            close: {
              animation: "timing",
              config: {
                duration: 1000, // 1 second fade out
              },
            },
          },
        }}
      >
        <Stack.Screen name="Splash" component={SplashScreen} />
        <Stack.Screen name="Intro" component={IntroScreen} />
        <Stack.Screen name="Intention" component={IntentionScreen} />
        <Stack.Screen name="EssenceScreen" component={EssenceScreen} />
        <Stack.Screen name="Begin" component={BeginScreen} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
