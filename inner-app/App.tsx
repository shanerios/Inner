import React from "react";
import { Image } from "react-native";
import { NativeBaseProvider, Box, VStack, Text } from "native-base";
import { LinearGradient } from "expo-linear-gradient";

export default function App() {
  return (
    <NativeBaseProvider>
      <LinearGradient
        colors={["#0D0C1F", "#1F233A"]}
        style={{ flex: 1, justifyContent: "center", alignItems: "center", padding: 24 }}
      >
        <VStack space={6} alignItems="center" width="100%">
          <Image
            source={require("./assets/logo.png")}
            style={{ width: 150, height: 150, resizeMode: "contain" }}
          />

          <Text color="white" fontSize="xl" textAlign="center">
            Welcome to Inner — your sanctuary within.
          </Text>

          <Text color="gray.300" fontSize="md" textAlign="center">
            Coming Soon • v0.1
          </Text>
        </VStack>
      </LinearGradient>
    </NativeBaseProvider>
  );
}
