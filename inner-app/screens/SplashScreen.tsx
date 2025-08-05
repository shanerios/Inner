import React, { useEffect, useRef } from 'react';
import { Animated, Pressable, View, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation } from '@react-navigation/native';
import * as Haptics from 'expo-haptics';
import LottieView from 'lottie-react-native';

export default function SplashScreen() {
  const navigation = useNavigation();
  const titleOpacity = useRef(new Animated.Value(0)).current;
  const subtitleOpacity = useRef(new Animated.Value(0)).current;
  const logoOpacity = useRef(new Animated.Value(0)).current;
  const lottieRef = useRef(null);

  useEffect(() => {
    Animated.sequence([
      Animated.parallel([
        Animated.timing(logoOpacity, {
          toValue: 1,
          duration: 1200,
          useNativeDriver: true,
        }),
        Animated.timing(titleOpacity, {
          toValue: 1,
          duration: 1800,
          useNativeDriver: true,
        }),
      ]),
      Animated.timing(subtitleOpacity, {
        toValue: 1,
        duration: 3000,
        delay: 600,
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  const handlePress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    navigation.navigate('Intro');
  };

  return (
    <Pressable onPress={handlePress} style={{ flex: 1 }}>
      <LinearGradient
        colors={['#0D0C1F', '#1F233A']}
        style={StyleSheet.absoluteFill}
      />
      
      {/* Lottie Particle Background */}
      <LottieView
        ref={lottieRef}
        source={require('../assets/animations/ambientParticles_opacityAdjusted.json')}
        autoPlay
        loop
        style={StyleSheet.absoluteFill}
        resizeMode="cover"
      />

      <View style={styles.content}>
        <View style={{ alignItems: 'center', gap: 24 }}>
          <Animated.Image
            source={require('../assets/logo.png')}
            style={{ width: 220, height: 220, opacity: logoOpacity }}
            resizeMode="contain"
            accessibilityLabel="Inner app logo"
            accessible={true}
          />
          <Animated.Text
            style={{
              fontSize: 16,
              color: 'white',
              fontFamily: 'CalSans',
              textAlign: 'center',
              opacity: titleOpacity,
            }}
            accessibilityLabel="Rediscover the inner you"
            accessible={true}
          >
            Rediscover the inner you.
          </Animated.Text>
          <Animated.Text
            style={{
              fontSize: 12,
              color: '#ccc',
              fontFamily: 'CalSans',
              textAlign: 'center',
              marginTop: 16,
              opacity: subtitleOpacity,
            }}
            accessibilityLabel="Tap anywhere to begin"
            accessible={true}
          >
            Tap anywhere to begin
          </Animated.Text>
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
});
