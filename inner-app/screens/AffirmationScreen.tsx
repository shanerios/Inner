import React from 'react';
import { Box, VStack, Text, Button } from 'native-base';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation } from '@react-navigation/native';
import * as Haptics from 'expo-haptics';

export default function AffirmationScreen() {
  const navigation = useNavigation();

  const handleBegin = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    navigation.navigate('Center');
  };

  return (
    <LinearGradient
      colors={['#0D0C1F', '#1F233A']}
      style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 }}
    >
      <VStack space={6} width="100%" alignItems="center">
        <Text color="white" fontSize="xl" textAlign="center">
          You are safe. You are seen. You are home.
        </Text>

        <Button onPress={handleBegin} colorScheme="indigo">
          Begin
        </Button>
      </VStack>
    </LinearGradient>
  );
}
