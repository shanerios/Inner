import React from 'react';
import { TouchableOpacity } from 'react-native';
import { Box, Text, VStack } from 'native-base';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation } from '@react-navigation/native';
import * as Haptics from 'expo-haptics';

export default function SplashScreen() {
  const navigation = useNavigation();

  const handleTap = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    navigation.navigate('Intro');
  };

  return (
    <LinearGradient
      colors={['#0D0C1F', '#1F233A']}
      style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}
    >
      <TouchableOpacity onPress={handleTap} style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <VStack space={4} alignItems="center">
          <Text fontSize="3xl" color="white" fontWeight="bold">
            Inner
          </Text>
          <Text color="gray.300">Tap to begin</Text>
        </VStack>
      </TouchableOpacity>
    </LinearGradient>
  );
}
