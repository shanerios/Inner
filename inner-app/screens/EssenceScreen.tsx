import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { useEffect, useState, useRef, useMemo } from 'react';
import { useIntention } from '../core/IntentionProvider';
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
import { LinearGradient } from 'expo-linear-gradient';
const AnimatedLinear = Animated.createAnimatedComponent(LinearGradient as any);
import * as Haptics from 'expo-haptics';
import { useNavigation } from '@react-navigation/native';


const { width } = Dimensions.get('window');

// Unified breath timing so all cues stay in sync
// Changing INHALE_MS or EXHALE_MS will automatically re-sync scale, glow, and sheen animations
const INHALE_MS = 4000;  // 4s inhale
const EXHALE_MS = 6000;  // 6s exhale
const CYCLE_MS  = INHALE_MS + EXHALE_MS; // 10s total

export default function EssenceScreen() {
  const navigation = useNavigation();

  const { intentions: ctxIntentions } = useIntention?.() || { intentions: [] as string[] };

  const [userIntentions, setUserIntentions] = useState<string[]>([]);
  const effectiveIntentions = (ctxIntentions && ctxIntentions.length > 0) ? ctxIntentions : userIntentions;
  const [personalizedAffirmation, setPersonalizedAffirmation] = useState<string | null>(null);

  // Breathing sheen setup
  const sheenX = useRef(new Animated.Value(0)).current;
  const [descWidth, setDescWidth] = useState(0);

  useEffect(() => {
    // animate a soft sheen left → right once per breath cycle, during exhale
    const run = () => {
      if (!descWidth) return;
      const sweepDuration = Math.min(1800, EXHALE_MS - 400); // keep sweep within exhale window
      sheenX.setValue(-descWidth);
      Animated.sequence([
        Animated.delay(INHALE_MS), // wait through inhale
        Animated.timing(sheenX, {
          toValue: descWidth,
          duration: sweepDuration,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.delay(CYCLE_MS - INHALE_MS - sweepDuration), // rest until next cycle
      ]).start(({ finished }) => { if (finished) run(); });
    };
    run();
    return () => { sheenX.stopAnimation(); };
  }, [descWidth]);
  const titleOpacity = useRef(new Animated.Value(0)).current;
  const descriptionOpacity = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const glowAnim = useRef(new Animated.Value(0.15)).current;
  const journeyPromptOpacity = useRef(new Animated.Value(0)).current;
  // Card glow animation for intention cards
  const cardGlowAnim = useRef(new Animated.Value(0)).current;

  const promptDelayRef = useRef<NodeJS.Timeout | null>(null);
  const promptLoopRef = useRef<Animated.CompositeAnimation | null>(null);

  useEffect(() => {
    // Card glow animation loop
    Animated.loop(
      Animated.sequence([
        Animated.timing(cardGlowAnim, {
          toValue: 1,
          duration: 3000,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: false,
        }),
        Animated.timing(cardGlowAnim, {
          toValue: 0,
          duration: 3000,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: false,
        }),
      ])
    ).start();
    const breathing = Animated.loop(
      Animated.sequence([
        Animated.timing(scaleAnim, {
          toValue: 1.5,
          duration: INHALE_MS,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(scaleAnim, {
          toValue: 1,
          duration: EXHALE_MS,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    );

    breathing.start();


    Animated.loop(
      Animated.sequence([
        // Inhale phase
        Animated.timing(glowAnim, {
          toValue: 0.30,
          duration: INHALE_MS,
          useNativeDriver: false,
        }),
        // Exhale phase (slightly brighter/clearer)
        Animated.timing(glowAnim, {
          toValue: 0.40,
          duration: EXHALE_MS,
          useNativeDriver: false,
        }),
      ])
    ).start();

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

    // After the title appears, start a repeating prompt every ~6s
    promptDelayRef.current = setTimeout(() => {
      promptLoopRef.current = Animated.loop(
        Animated.sequence([
          Animated.timing(journeyPromptOpacity, { toValue: 0.5, duration: 900, useNativeDriver: true }),
          Animated.delay(1600), // linger so it can be read
          Animated.timing(journeyPromptOpacity, { toValue: 0, duration: 1800, useNativeDriver: true }),
          Animated.delay(3000), // rest; total cycle ≈ 900+1600+1800+1700 = 6000ms
        ])
      );
      promptLoopRef.current.start();
    }, 4600);

    return () => {
      breathing.stop();
      titleOpacity.stopAnimation();
      descriptionOpacity.stopAnimation();
      if (promptDelayRef.current) {
        clearTimeout(promptDelayRef.current);
        promptDelayRef.current = null;
      }
      try { promptLoopRef.current?.stop(); } catch {}
    };
  }, []);

  useEffect(() => {
    const loadIntentions = async () => {
      if (ctxIntentions && ctxIntentions.length > 0) {
        // Context provides intentions; mirror into local state for cards/affirmation
        setUserIntentions(ctxIntentions);
        const messages = ctxIntentions.map((i: string) => affirmationMap[i]).filter(Boolean);
        setPersonalizedAffirmation(messages.join(' '));
        return;
      }
      // Fallback: read from AsyncStorage for older flows
      const raw = await AsyncStorage.getItem('userIntentions');
      const alt = !raw ? await AsyncStorage.getItem('intentions') : null; // legacy key support
      const stored = raw || alt;
      if (stored) {
        try {
          const parsed = JSON.parse(stored);
          if (Array.isArray(parsed)) {
            setUserIntentions(parsed);
            const messages = parsed.map((i: string) => affirmationMap[i]).filter(Boolean);
            setPersonalizedAffirmation(messages.join(' '));
          }
        } catch {}
      }
    };
    loadIntentions();
  }, [ctxIntentions]);

  return (
    <View style={{ flex: 1, backgroundColor: '#0d0d1a' }}>
      <ImageBackground
        source={require('../assets/images/essence-bg.png')} // Your softened cosmic image
        defaultSource={require('../assets/images/essence-bg.png')}
        style={styles.container}
        imageStyle={{ backgroundColor: '#0d0d1a' }}
        fadeDuration={0}
        renderToHardwareTextureAndroid
        needsOffscreenAlphaCompositing
        resizeMode="cover"
      >
      <Animated.Image
        source={require('../assets/images/particle-overlay.png')}
        style={[styles.particleOverlay, { opacity: glowAnim }]}
        resizeMode="cover"
        pointerEvents="none"
        accessible={false}
        fadeDuration={0}
      />
      <Animated.Text
          style={[styles.titleTop, { opacity: titleOpacity }]}
          accessibilityLabel="Your path is unfolding"
          accessible
          accessibilityRole="header"
        >
          The orb breathes with you.
      </Animated.Text>
      <Animated.Text
        style={[
          styles.journeyPrompt,
          {
            opacity: journeyPromptOpacity,
            transform: [{
              translateY: journeyPromptOpacity.interpolate({
                inputRange: [0, 1],
                outputRange: [10, 0],
              })
            }]
          }
        ]}
        accessible
        accessibilityRole="text"
        accessibilityLabel="Your breathing clears the way"
      >
        Your breathing clears the way.
      </Animated.Text>
      <View style={styles.centerContent}>
        <Animated.Image
          source={require('../assets/images/orb-enhanced.png')}
          style={[styles.symbol, { transform: [{ scale: scaleAnim }] }]}
        />
      </View>

      {!!personalizedAffirmation && (
        <View style={styles.descriptionWrapper}>
          <Animated.View style={{ opacity: descriptionOpacity }}>
            <View
              style={styles.descriptionSheenHost}
              onLayout={e => setDescWidth(e.nativeEvent.layout.width)}
            >
              <Text
                style={styles.description}
                accessible
                accessibilityRole="text"
                accessibilityLabel={`Your affirmations: ${personalizedAffirmation}`}
              >
                {personalizedAffirmation}
              </Text>
              {/* Breathing sheen overlay */}
              {descWidth > 0 && (
                <AnimatedLinear
                  pointerEvents="none"
                  colors={[
                    'rgba(255,255,255,0)',
                    'rgba(255,255,255,0.35)',
                    'rgba(255,255,255,0)'
                  ]}
                  start={{ x: 0, y: 0.5 }}
                  end={{ x: 1, y: 0.5 }}
                  style={[
                    styles.sheen,
                    { transform: [{ translateX: sheenX }] }
                  ]}
                />
              )}
            </View>
          </Animated.View>
        </View>
      )}

      <View style={styles.buttonContainer}>
        <TouchableOpacity
          onPress={async () => {
            await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            navigation.navigate('Home');
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
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 60,
    paddingHorizontal: 20,
    backgroundColor: '#0d0d1a',
  },
  centerContent: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center', // centers orb + breath block vertically
    alignSelf: 'stretch',
    paddingTop: 200,           // push a touch lower; adjust 40–100 to taste
  },
  descriptionWrapper: {
    marginTop: 48,
    marginBottom: 32,
    alignSelf: 'center',
  },
  symbol: {
    width: 150,
    height: 150,
    marginBottom: 16,
    resizeMode: 'contain',
    opacity: 0.9,
    shadowColor: '#CFC3E0',
    shadowOffset: { width: 2, height: 4 },
    shadowOpacity: 0.9,
    shadowRadius: 20,
  },
  titleTop: {
    fontSize: 22,
    color: '#F0EEF8',
    fontWeight: '600',
    textAlign: 'center',
    marginTop: 60,
    marginBottom: 12,
  },
  title: {
    fontSize: 24,
    color: '#F0EEF8',
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: 12,
    marginTop: 60,
  },
  description: {
    fontSize: 16,
    color: '#F0EEF8',
    textAlign: 'center',
    opacity: 0.85,
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
    opacity: 0.85,
  },
  reaffirmation: {
    fontSize: 18,
    color: '#F0EEF8',
    fontWeight: '500',
    textAlign: 'center',
    marginBottom: 4,
    marginTop: 20,
  },
  intentItem: {
    fontSize: 16,
    color: '#F0EEF8',
    textAlign: 'center',
    opacity: 0.8,
  },
  cardContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    marginTop: 12,
  },
  intentionCard: {
    backgroundColor: 'rgba(240, 238, 248, 0.1)',
    borderColor: '#F0EEF8',
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 16,
    margin: 8,
    width: 160,
    // Soft glow shadow
    shadowColor: '#F0EEF8',
    shadowOffset: { width: 0, height: 0 },
    shadowRadius: 12,
    // shadowOpacity is animated
  },
  cardText: {
    color: '#F0EEF8',
    fontSize: 14,
    fontWeight: '500',
    textAlign: 'center',
  },
  particleOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 0,
  },
  journeyPrompt: {
    fontSize: 16,
    color: '#F0EEF8',
    textAlign: 'center',
    marginTop: 4,
    marginBottom: 8,
    opacity: 1,
    fontStyle: 'italic',
    zIndex: 2, // ensure above overlay
  },
  cardDescriptor: {
    color: '#F0EEF8',
    fontSize: 12,
    fontStyle: 'italic',
    marginTop: 4,
    textAlign: 'center',
    opacity: 0.85,
  },
  descriptionSheenHost: {
    alignSelf: 'center',
    position: 'relative',
    overflow: 'hidden',
  },
  sheen: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 90, // width of the sheen band; adjust 70–120
    zIndex: 3,
  },
});