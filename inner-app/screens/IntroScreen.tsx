import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ImageBackground,
  TouchableOpacity,
  Animated,
  Dimensions,
  Switch,
  AccessibilityInfo,
} from 'react-native';
import { Audio } from 'expo-av';
import * as Haptics from 'expo-haptics';
import { useNavigation } from '@react-navigation/native';

const { width } = Dimensions.get('window');

const captions = [
  { time: 2, text: 'A sacred space' },
  { time: 4, text: 'to realign' },
  { time: 5.5, text: 'reflect' },
  { time: 6.5, text: 'rediscover' },
  { time: 8, text: 'and reawaken' },
  { time: 9, text: 'the deeper self' },
  { time: 11, text: 'through gentle' },
  { time: 13, text: 'guided journeys,' },
  { time: 15.5, text: 'immersive sound,' },
  { time: 18, text: 'and stillness.' },
  { time: 20, text: 'Tap to begin' },
  { time: 21, text: 'your return inward.' },
];

export default function IntroScreen() {
  const navigation = useNavigation();
  const soundRef = useRef<Audio.Sound | null>(null);
  const [currentCaption, setCurrentCaption] = useState('');
  const [showCaptions, setShowCaptions] = useState(true);
  const [isMuted, setIsMuted] = useState(false);
  const captionAnim = useRef(new Animated.Value(0)).current;
  const titleFadeAnim = useRef(new Animated.Value(0)).current;
  const lastCaptionRef = useRef<string | null>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  const stopAudioAndNavigate = async () => {
    if (soundRef.current) {
      await soundRef.current.stopAsync();
      await soundRef.current.unloadAsync();
      soundRef.current = null;
    }
    navigation.navigate('Intention');
  };

  const playVoice = async () => {
    const { sound } = await Audio.Sound.createAsync(
      require('../assets/audio/inner_intro_blended.mp3')
    );
    soundRef.current = sound;
    await sound.setVolumeAsync(isMuted ? 0 : 1);
    await sound.playAsync();

    const start = Date.now();
    intervalRef.current = setInterval(() => {
      const elapsed = (Date.now() - start) / 1000;
      const activeCaption = captions.findLast(c => elapsed >= c.time);
      if (activeCaption && activeCaption.text !== lastCaptionRef.current) {
        lastCaptionRef.current = activeCaption.text;
        animateCaptionChange(activeCaption.text);
      }
    }, 400);
  };

  const animateCaptionChange = (newText: string) => {
    Animated.timing(captionAnim, {
      toValue: 0,
      duration: 300,
      useNativeDriver: true,
    }).start(() => {
      setCurrentCaption(newText);
      Animated.timing(captionAnim, {
        toValue: 1,
        duration: 500,
        useNativeDriver: true,
      }).start();
    });
  };

  useEffect(() => {
    playVoice();

    setTimeout(() => {
      Animated.timing(titleFadeAnim, {
        toValue: 1,
        duration: 1500,
        useNativeDriver: true,
      }).start();
    }, 1000);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (soundRef.current) {
        soundRef.current.unloadAsync();
        soundRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (soundRef.current) {
      soundRef.current.setVolumeAsync(isMuted ? 0 : 1);
    }
  }, [isMuted]);

  return (
    <View style={{ flex: 1 }}>
      <ImageBackground source={require('../assets/images/intro-bg.png')} style={styles.container}>
        <Animated.Text
          style={[styles.headerText, { opacity: titleFadeAnim }]}
          accessibilityRole="header"
          accessibilityLabel="Welcome to Inner. This is your space for guided inner journeys."
        >
          Welcome to Inner
        </Animated.Text>

        <View style={styles.captionBox}>
          {showCaptions && (
            <Animated.Text style={[styles.caption, { opacity: captionAnim }]}>
              {currentCaption}
            </Animated.Text>
          )}
        </View>

        <View style={styles.buttons}>
          <TouchableOpacity
            onPress={async () => {
              await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              stopAudioAndNavigate();
            }}
            style={styles.primaryButton}
            accessibilityRole="button"
            accessibilityLabel="Move inward. Begin your inner journey."
          >
            <Text style={styles.primaryText}>Move Inward</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={async () => {
              await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              stopAudioAndNavigate();
            }}
            accessibilityRole="button"
            accessibilityLabel="Skip intro and continue to next screen."
          >
            <Text style={styles.skipText}>skip</Text>
          </TouchableOpacity>
        </View>

        {/* Caption Toggle (Right) */}
        <View style={styles.accessibilityToggleRight}>
          <Switch
            value={showCaptions}
            onValueChange={(value) => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              setShowCaptions(value);
            }}
            thumbColor={showCaptions ? '#fff' : '#888'}
            trackColor={{ false: '#555', true: '#ccc' }}
            accessibilityRole="switch"
            accessibilityLabel="Captions toggle"
            accessibilityHint="Turn on or off the on-screen captions for this intro."
          />
          <Text style={styles.toggleLabel}>Captions</Text>
        </View>

        {/* Mute Toggle (Left) */}
        <View style={styles.accessibilityToggleLeft}>
          <Switch
            value={!isMuted}
            onValueChange={(value) => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              setIsMuted(!value);
            }}
            thumbColor={!isMuted ? '#fff' : '#888'}
            trackColor={{ false: '#555', true: '#ccc' }}
            accessibilityRole="switch"
            accessibilityLabel="Audio toggle"
            accessibilityHint="Mute or unmute the voice audio."
          />
          <Text style={styles.toggleLabel}>Audio</Text>
        </View>
      </ImageBackground>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    resizeMode: 'cover',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 100,
    paddingBottom: 60,
  },
  headerText: {
    fontSize: 28,
    color: 'white',
    fontWeight: '600',
    textAlign: 'center',
  },
  captionBox: {
    justifyContent: 'center',
    alignItems: 'center',
    height: 120,
    width: width * 0.8,
  },
  caption: {
    fontSize: 20,
    color: 'white',
    textAlign: 'center',
    fontStyle: 'italic',
  },
  buttons: {
    alignItems: 'center',
    gap: 10,
  },
  primaryButton: {
    backgroundColor: '#CFC3E0',
    paddingVertical: 14,
    paddingHorizontal: 28,
    borderRadius: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  primaryText: {
    color: '#1F233A',
    fontSize: 20,
    fontWeight: '600',
  },
  skipText: {
    color: 'white',
    fontSize: 16,
    marginTop: 4,
    opacity: 0.7,
  },
  accessibilityToggleRight: {
    position: 'absolute',
    bottom: 20,
    right: 20,
    alignItems: 'center',
  },
  accessibilityToggleLeft: {
    position: 'absolute',
    bottom: 20,
    left: 20,
    alignItems: 'center',
  },
  toggleLabel: {
    fontSize: 12,
    color: '#ccc',
    marginTop: 0,
  },
});
