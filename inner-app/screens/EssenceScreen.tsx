import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { useEffect, useState, useRef } from 'react';
const affirmationMap: { [key: string]: string } = {
  calm: 'You are embracing calm and inviting peace into your being.',
  clarity: 'Clarity guides your every step as your path becomes illuminated.',
  grounding: 'You are rooted, steady, and supported by the earth beneath you.',
  healing: 'You are in a sacred space of healing and wholeness.',
  reawakening: 'You are remembering your truth and awakening your inner light.',
  expansion: 'You are opening to new dimensions of growth and cosmic awareness.',
};
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ImageBackground,
  Dimensions,
  Image,
  Animated,
  Easing,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { useNavigation } from '@react-navigation/native';


const { width } = Dimensions.get('window');

export default function EssenceScreen() {
  const navigation = useNavigation();

  const [userIntentions, setUserIntentions] = useState<string[]>([]);
  const [personalizedAffirmation, setPersonalizedAffirmation] = useState<string | null>(null);

  const inhaleOpacity = useRef(new Animated.Value(0)).current;
  const exhaleOpacity = useRef(new Animated.Value(0)).current;
  const titleOpacity = useRef(new Animated.Value(0)).current;
  const descriptionOpacity = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const breathing = Animated.loop(
      Animated.sequence([
        Animated.timing(scaleAnim, {
          toValue: 1.85,
          duration: 4000,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(scaleAnim, {
          toValue: 1,
          duration: 6000,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    );

    breathing.start();

    const animateBreath = () => {
      Animated.sequence([
        Animated.timing(inhaleOpacity, {
          toValue: 1,
          duration: 500,
          useNativeDriver: true,
        }),
        Animated.delay(2500),
        Animated.timing(inhaleOpacity, {
          toValue: 0,
          duration: 1000,
          useNativeDriver: true,
        }),
        Animated.timing(exhaleOpacity, {
          toValue: 1,
          duration: 500,
          useNativeDriver: true,
        }),
        Animated.delay(500),
        Animated.timing(exhaleOpacity, {
          toValue: 0,
          duration: 1000,
          useNativeDriver: true,
        }),
        Animated.delay(3500),
      ]).start(() => animateBreath());
    };

    animateBreath();

    Animated.sequence([
      Animated.delay(4000),
      Animated.timing(titleOpacity, {
        toValue: 1,
        duration: 4000,
        useNativeDriver: true,
      }),
      Animated.timing(descriptionOpacity, {
        toValue: 1,
        duration: 800,
        useNativeDriver: true,
      }),
    ]).start();

    return () => {
      breathing.stop();
      inhaleOpacity.stopAnimation();
      exhaleOpacity.stopAnimation();
      titleOpacity.stopAnimation();
      descriptionOpacity.stopAnimation();
    };
  }, []);

  useEffect(() => {
    const loadIntentions = async () => {
      const stored = await AsyncStorage.getItem('userIntentions');
      if (stored) {
        const parsed = JSON.parse(stored);
        setUserIntentions(parsed);

        const messages = parsed.map((intent: string) => affirmationMap[intent]).filter(Boolean);
        setPersonalizedAffirmation(messages.join(' '));
      }
    };

    loadIntentions();
  }, []);

  return (
    <ImageBackground
      source={require('../assets/images/essence-bg.png')} // Your softened cosmic image
      style={styles.container}
    >
      <View style={styles.centerContent}>
        <Animated.Image
          source={require('../assets/images/essence-symbol.png')}
          style={[styles.symbol, { transform: [{ scale: scaleAnim }] }]}
        />
        <Animated.Text
          style={[styles.breathText, { opacity: inhaleOpacity }]}
          accessibilityLabel="Inhale for 4 seconds"
          accessible
          accessibilityRole="text"
        >
          Inhale
        </Animated.Text>
        <Animated.Text
          style={[styles.breathText, { opacity: exhaleOpacity }]}
          accessibilityLabel="Exhale for 6 seconds"
          accessible
          accessibilityRole="text"
        >
          Exhale
        </Animated.Text>
        <Animated.Text
          style={[styles.title, { opacity: titleOpacity }]}
          accessibilityLabel="Your path is unfolding"
          accessible
          accessibilityRole="header"
        >
          Your path is unfolding…
        </Animated.Text>
        {personalizedAffirmation && (
          <Animated.Text
            style={[styles.description, { opacity: descriptionOpacity }]}
            accessible
            accessibilityRole="text"
            accessibilityLabel={`Your affirmations: ${personalizedAffirmation}`}
          >
            {personalizedAffirmation}
          </Animated.Text>
        )}
        {userIntentions.length > 0 && (
          <View style={{ marginTop: 20 }}>
            <Text
              style={styles.reaffirmation}
              accessibilityLabel="Your selected intentions"
              accessible
              accessibilityRole="header"
            >
              Your Intentions:
            </Text>
            {userIntentions.map((intent, index) => (
              <Text
                key={index}
                style={styles.intentItem}
                accessibilityLabel={`Intention: ${intent}`}
                accessible
                accessibilityRole="text"
              >
                • {intent}
              </Text>
            ))}
          </View>
        )}
      </View>

      <View style={styles.buttonContainer}>
        <TouchableOpacity
          onPress={async () => {
            await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            navigation.navigate('MainApp');
          }}
          style={styles.primaryButton}
          accessibilityLabel="Begin your journey based on your intentions"
          accessibilityRole="button"
          accessible
        >
          <Text style={styles.primaryText}>Begin Journey</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          accessibilityLabel="Go back to change your selected intentions"
          accessibilityRole="button"
          accessible
        >
          <Text style={styles.secondaryText}>Go Back</Text>
        </TouchableOpacity>
      </View>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    resizeMode: 'cover',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 80,
    paddingHorizontal: 20,
  },
  centerContent: {
    alignItems: 'center',
    marginTop: 40,
  },
  symbol: {
    width: 120,
    height: 120,
    marginBottom: 24,
    resizeMode: 'contain',
    opacity: 0.9,
    shadowColor: '#CFC3E0',
    shadowOffset: { width: 2, height: 4 },
    shadowOpacity: 0.9,
    shadowRadius: 20,
  },
  breathText: {
    fontSize: 20,
    fontWeight: '500',
    color: '#F0EEF8',
    marginBottom: 16,
  },
  title: {
    fontSize: 24,
    color: '#F0EEF8',
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: 12,
  },
  description: {
    fontSize: 16,
    color: '#F0EEF8',
    textAlign: 'center',
    opacity: 0.75,
    paddingHorizontal: 10,
  },
  buttonContainer: {
    alignItems: 'center',
  },
  primaryButton: {
    backgroundColor: '#CFC3E0',
    paddingVertical: 14,
    paddingHorizontal: 40,
    borderRadius: 24,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
  primaryText: {
    color: '#1F233A',
    fontSize: 18,
    fontWeight: '600',
  },
  secondaryText: {
    color: '#F0EEF8',
    fontSize: 14,
    opacity: 0.7,
  },
  reaffirmation: {
    fontSize: 16,
    color: '#F0EEF8',
    fontWeight: '500',
    textAlign: 'center',
    marginBottom: 4,
  },
  intentItem: {
    fontSize: 15,
    color: '#F0EEF8',
    textAlign: 'center',
    opacity: 0.8,
  },
});