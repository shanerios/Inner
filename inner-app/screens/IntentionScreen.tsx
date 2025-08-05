import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Dimensions,
  ImageBackground,
  Image,
  Animated,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import { useNavigation } from '@react-navigation/native';

const { width } = Dimensions.get('window');

const intentions = [
  { id: 'calm', title: 'Calm', description: 'Ease tension and return to center' },
  { id: 'clarity', title: 'Clarity', description: 'Clear mental fog and sharpen awareness' },
  { id: 'grounding', title: 'Grounding', description: 'Feel rooted and supported in the present' },
  { id: 'healing', title: 'Healing', description: 'Nuture inner wounds and restore balance' },
  { id: 'reawakening', title: 'Reawakening', description: 'Stir the dormant self into awareness' },
  { id: 'expansion', title: 'Expansion', description: 'Open to growth, insight, and possibility' },
];

export default function IntentionScreen() {
  const navigation = useNavigation();
  const [selectedIntentions, setSelectedIntentions] = useState<string[]>([]);
  const scaleAnimRefs = useRef<{ [key: string]: Animated.Value }>({});
  // Initialize refs once on first render
if (Object.keys(scaleAnimRefs.current).length === 0) {
  intentions.forEach(({ id }) => {
    scaleAnimRefs.current[id] = new Animated.Value(1);
  });
}

  const toggleIntention = (id: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const isSelected = selectedIntentions.includes(id);
    const anim = scaleAnimRefs.current[id];

    Animated.sequence([
      Animated.timing(anim, {
        toValue: isSelected ? 1 : .95,
        duration: 100,
        useNativeDriver: true,
      }),
      Animated.timing(anim, {
        toValue: 1,
        friction: 4,
        tension: 100,
        duration: 100,
        useNativeDriver: true,
      }),
    ]).start();

    if (selectedIntentions.includes(id)) {
      setSelectedIntentions(selectedIntentions.filter(i => i !== id));
    } else if (selectedIntentions.length < 2) {
      setSelectedIntentions([...selectedIntentions, id]);
    }
  };

  const handleContinue = async () => {
    await AsyncStorage.setItem('userIntentions', JSON.stringify(selectedIntentions));
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    navigation.navigate('EssenceScreen');
  };

  return (
    <ImageBackground
      source={require('../assets/images/portal-closeup.png')}
      style={styles.container}
    >
      <View
        accessible={true}
        accessibilityLabel="Intention selection screen"
        accessibilityHint="Select up to two intentions to personalize your journey"
        style={{ alignItems: 'center' }}
      >
        <Image
          source={require('../assets/images/lotus.png')}
          style={styles.lotusImage}
        />
        <Text style={styles.title}>Select your intentions</Text>

        <Text style={styles.helperText}>
          {selectedIntentions.length < 2
            ? 'Choose up to 2 intentions'
            : 'You’ve selected 2 intentions'}
        </Text>

        <View style={styles.grid}>
          {intentions.map((intention) => {
            const isSelected = selectedIntentions.includes(intention.id);
            const isMaxSelected =
              selectedIntentions.length >= 2 && !isSelected;

            return (
              <TouchableOpacity
                key={intention.id}
                onPress={() => toggleIntention(intention.id)}
                disabled={isMaxSelected}
                style={[
                  styles.card,
                  isSelected && styles.cardSelected,
                  isMaxSelected && styles.cardDimmed,
                ]}
                accessibilityLabel={`${intention.title} intention`}
                accessibilityHint="Double tap to select or deselect this intention"
                accessibilityRole="button"
              >
                {isSelected && (
                  <View style={styles.checkmark}>
                    <Text style={styles.checkmarkText}>✓</Text>
                  </View>
                )}
                <Animated.View
                style={{ 
                  transform: [{ scale: scaleAnimRefs.current[intention.id] }],
                  alignItems: 'center',
                }}
                >
                <Text style={styles.cardText}>{intention.title}</Text>
                <Text style={styles.cardDescription}>{intention.description}</Text>
                </Animated.View>
              </TouchableOpacity>
            );
          })}
        </View>

        <TouchableOpacity
          onPress={handleContinue}
          disabled={selectedIntentions.length === 0}
          style={[
            styles.primaryButton,
            selectedIntentions.length === 0 && styles.disabledButton,
          ]}
          accessibilityLabel="Continue"
          accessibilityHint="Double tap to continue once you've selected your intentions"
          accessibilityRole="button"
        >
          <Text style={styles.primaryText}>Continue</Text>
        </TouchableOpacity>
      </View>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    resizeMode: 'cover',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  title: {
    fontSize: 24,
    color: 'white',
    fontWeight: '600',
    marginBottom: 10,
  },
  helperText: {
    fontSize: 14,
    color: 'white',
    marginBottom: 20,
    opacity: 0.7,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 10,
    marginBottom: 40,
  },
  card: {
    width: width * 0.4,
    padding: 16,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'white',
    alignItems: 'center',
    justifyContent: 'center',
    margin: 6,
    position: 'relative',
  },
  cardSelected: {
    backgroundColor: 'rgba(255,255,255,0.3)',
    borderColor: '#CFC3E0',
    borderWidth: 2,
  },
  cardDimmed: {
    opacity: 0.4,
  },
  cardText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '500',
    textAlign: 'center',
  },
  cardDescription: {
    color: 'white',
    fontSize: 12,
    textAlign: 'center',
    marginTop: 4,
    opacity: 0.7,
  },
  checkmark: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: 'rgba(0,0,0,0.4)',
    borderRadius: 16,
    paddingHorizontal: 6,
    paddingVertical: 2,
    zIndex: 1,
  },
  checkmarkText: {
    color: 'white',
    fontSize: 14,
  },
  primaryButton: {
    backgroundColor: '#CFC3E0',
    paddingVertical: 16,
    paddingHorizontal: 32,
    borderRadius: 24,
    borderWidth: 0,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 5,
  },
  lotusImage: {
  width: 200,
  height: 200,
  marginBottom: 0,
  resizeMode: 'contain',
  alignSelf: 'center',
  shadowColor: '#cfc3e0',
  shadowOffset: { width: 0, height: 0 },
  shadowOpacity: 0.7,
  shadowRadius: 10,
},
  primaryText: {
    color: '#1F233A',
    fontSize: 20,
    fontWeight: '600',
  },
  disabledButton: {
    opacity: 0.3,
  },
});
