import React from 'react';
import { Text } from 'native-base';
import { LinearGradient } from 'expo-linear-gradient';

export default function BeginScreen() {
  return (
    <LinearGradient
      colors={["#0D0C1F", "#1F233A"]}
      style={{ flex: 1, justifyContent: "center", alignItems: "center", padding: 24 }}
    >
      <Text color="white" fontSize="2xl">Welcome to Inner.</Text>
    </LinearGradient>
  );
}
