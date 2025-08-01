import React from 'react';
import { Box, Text, VStack, Button } from 'native-base';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation } from '@react-navigation/native';
import * as Haptics from 'expo-haptics';

export default function IntroScreen() {
  const navigation = useNavigation();

  const handleNext = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    navigation.navigate('SoulPrompt');
  };

  return (
    <LinearGradient
      colors={['#0D0C1F', '#1F233A']}
      style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 }}
    >
      <VStack space={6} alignItems="center">
        <Text fontSize="2xl" color="white" textAlign="center">
          Welcome to Inner.
        </Text>
        <Text color="gray.300" textAlign="center">
          This space is for your soul. For truth. For remembering who you are.
        </Text>
        <Button onPress={handleNext} colorScheme="indigo" mt={4}>
          Continue
        </Button>
      </VStack>
    </LinearGradient>
  );
}
