import React from 'react';
import { Text } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useScale } from '../utils/scale';

export default function BeginScreen() {
  const { scale, verticalScale } = useScale();

  return (
    <LinearGradient
      colors={["#0D0C1F", "#1F233A"]}
      style={{
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: scale(24),
        paddingVertical: verticalScale(24),
      }}
    >
      <Text color="white" fontSize="2xl">Welcome to Inner.</Text>
    </LinearGradient>
  );
}
