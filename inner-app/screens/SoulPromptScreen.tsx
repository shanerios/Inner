import React, { useState } from 'react';
import { Box, VStack, Text, TextArea, Button } from 'native-base';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation } from '@react-navigation/native';
import * as Haptics from 'expo-haptics';

export default function SoulPromptScreen() {
  const [soulNote, setSoulNote] = useState('');
  const navigation = useNavigation();

  const handleNext = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    navigation.navigate('Affirmation');
  };

  return (
    <LinearGradient
      colors={['#0D0C1F', '#1F233A']}
      style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 }}
    >
      <VStack space={4} width="100%" alignItems="center">
        <Text fontSize="xl" color="white" textAlign="center">
          What is your soul asking for right now?
        </Text>

        <TextArea
          placeholder="Write what you feel..."
          value={soulNote}
          onChangeText={setSoulNote}
          bg="white"
          borderRadius="md"
          p={3}
          h={32}
          width="100%"
        />

        <Button onPress={handleNext} colorScheme="indigo" mt={4}>
          Continue
        </Button>
      </VStack>
    </LinearGradient>
  );
}
