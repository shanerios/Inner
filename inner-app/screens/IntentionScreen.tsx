import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Animated,
  Easing,
  Platform,
  useWindowDimensions,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useVideoPlayer, VideoView } from '../core/memorySafeVideo';
import { useIntention } from '../core/IntentionProvider';
import { Typography, Body as _Body } from '../core/typography';
import * as Haptics from 'expo-haptics';
import { useNavigation, useRoute, useFocusEffect } from '@react-navigation/native';
import { Asset } from 'expo-asset';
import { getNudge } from '../src/core/language/nudgeLibrary';
import { getIntentions, getIntentionSetAt, getLastNudgeShownAt, setLastNudgeShownAt } from '../core/session';
import { useScale } from '../utils/scale';

const Body = _Body ?? ({
  regular: { ...Typography.body },
  subtle:  { ...Typography.caption },
} as const);

const intentions = [
  { id: 'lucidity',     title: 'Lucidity',     description: 'Enter the aware dream' },
  { id: 'clarity',      title: 'Clarity',      description: 'Part the haze, let vision sharpen' },
  { id: 'grounding',    title: 'Grounding',    description: 'Root deep into the present' },
  { id: 'healing',      title: 'Healing',      description: 'Mend the unseen, restore balance' },
  { id: 'reawakening',  title: 'Reawakening',  description: 'Stir the dormant self into light' },
  { id: 'expansion',    title: 'Expansion',    description: 'Open wide to growth and possibility' },
];

// Aura color mapping for selected-state tinting (subtle, brand-aligned)
const AURA_TINTS: Record<string, string> = {
  lucidity:    'rgba(180, 210, 255, 0.22)',    // ethereal blue
  clarity:     'rgba(123, 232, 201, 0.22)',    // mint
  grounding:   'rgba(196, 154, 108, 0.22)',    // earth
  healing:     'rgba(120, 217, 168, 0.22)',    // green
  reawakening: 'rgba(255, 183, 213, 0.22)',    // rose
  expansion:   'rgba(207, 195, 224, 0.22)',    // lavender (brand CTA)
};

const AURA_BORDERS: Record<string, string> = {
  lucidity:    '#B4D2FF',
  clarity:     '#7BE8C9',
  grounding:   '#C49A6C',
  healing:     '#78D9A8',
  reawakening: '#FFB7D5',
  expansion:   '#CFC3E0',
};

export default function IntentionScreen() {
  const navigation = useNavigation();
  const { setIntentions } = useIntention();
  const { width: windowWidth } = useWindowDimensions();
  const { scale, verticalScale } = useScale();

  const route = useRoute<any>();
  const fromSettings = route?.params?.fromSettings === true;

  const [retuneNudge, setRetuneNudge] = useState<string | null>(null);

  const returnHeaderLift = verticalScale(6);

  // Return ritual header (only when arriving via Settings → Change Intentions)
  const returnHeaderOpacity = useRef(new Animated.Value(0)).current;
  const returnHeaderTranslateY = useRef(new Animated.Value(-returnHeaderLift)).current;

  // Video background
  const bgPlayer = useVideoPlayer(require('../assets/videos/intentions_bg.mp4'), player => {
    player.loop = true;
    player.muted = true;
    // Muted decorative video must not claim exclusive AVAudioSession ownership —
    // the default 'doNotMix' mode fights TrackPlayer's session on background/lock.
    player.audioMixingMode = 'mixWithOthers';
    player.play();
  });

  useFocusEffect(
    useCallback(() => {
      bgPlayer.play();
      return () => { bgPlayer.pause(); };
    }, [bgPlayer])
  );

  const styles = useMemo(
    () =>
      StyleSheet.create({
        container: {
          flex: 1,
          backgroundColor: '#0d0d1a',
        },
        inner: {
          flex: 1,
        },
        scroll: {
          flex: 1,
        },
        scrollContent: {
          flexGrow: 1,
          alignItems: 'center',
          justifyContent: 'center',
          paddingHorizontal: scale(20),
          paddingTop: verticalScale(8),
          paddingBottom: verticalScale(12),
        },
        title: {
          ...Typography.title,
          fontSize: scale(24),
          color: 'white',
          marginBottom: verticalScale(10),
        },
        helperText: {
          ...Body.regular,
          fontFamily: 'Inter-ExtraLight',
          color: 'white',
          fontSize: scale(11),
          marginBottom: verticalScale(20),
          opacity: 0.7,
          maxWidth: scale(260),
          textAlign: 'center',
        },
        grid: {
          flexDirection: 'row',
          flexWrap: 'wrap',
          justifyContent: 'center',
          marginBottom: verticalScale(16),
          paddingHorizontal: scale(4),
        },
        card: {
          width: windowWidth * 0.32,
          paddingVertical: verticalScale(8),
          paddingHorizontal: 8,
          backgroundColor: 'rgba(0,0,0,0.25)',
          borderRadius: 8,
          borderWidth: 1,
          borderColor: 'rgba(255,255,255,0.15)',
          alignItems: 'center',
          justifyContent: 'center',
          marginHorizontal: scale(2),
          marginVertical: verticalScale(4),
          position: 'relative',
        },
        cardSelected: {
          borderColor: 'rgba(251,191,36,0.8)',
          borderWidth: 1.5,
          backgroundColor: 'rgba(180, 140, 80, 0.12)',
          ...Platform.select({
            ios: {
              shadowColor: '#F59E0B',
              shadowOffset: { width: 0, height: 0 },
              shadowRadius: 10,
              shadowOpacity: 0.7,
            },
            android: {
              // Border is the selection indicator on Android — no shadow/elevation
            },
          }),
        },
        cardDimmed: {
          opacity: 0.4,
        },
        cardText: {
          color: 'white',
          fontFamily: 'CalSans-SemiBold',
          fontSize: scale(15),
          textAlign: 'center',
          fontWeight: '600',
        },
        cardDescription: {
          fontFamily: 'Inter-ExtraLight',
          color: 'rgba(255,255,255,0.6)',
          textAlign: 'center',
          fontSize: scale(10),
          marginTop: verticalScale(4),
        },
        checkmark: {
          position: 'absolute',
          top: verticalScale(8),
          right: scale(8),
          backgroundColor: 'rgba(0,0,0,0.4)',
          borderRadius: scale(16),
          paddingHorizontal: scale(6),
          paddingVertical: verticalScale(2),
          zIndex: 1,
        },
        checkmarkText: {
          color: 'white',
          fontSize: scale(8),
        },
        primaryButton: {
          backgroundColor: 'rgba(207,195,224,0.16)',
          paddingVertical: verticalScale(14),
          paddingHorizontal: scale(32),
          borderRadius: 12,
          borderWidth: 1,
          borderColor: 'rgba(255,255,255,0.12)',
          alignItems: 'center',
        },
        primaryText: {
          fontFamily: 'CalSans-SemiBold',
          color: '#F3EDE7',
          letterSpacing: 0.2,
          fontSize: scale(16),
        },
        disabledButton: {
          opacity: 0.3,
        },
        ctaFooter: {
          width: '100%',
          alignItems: 'center',
          paddingHorizontal: scale(20),
          paddingTop: verticalScale(8),
          paddingBottom: verticalScale(20),
        },
      }),
    [scale, verticalScale, windowWidth],
  );

  const [selectedIntentions, setSelectedIntentions] = useState<string[]>([]);
  const scaleAnimRefs = useRef<{ [key: string]: Animated.Value }>({});
  if (Object.keys(scaleAnimRefs.current).length === 0) {
    intentions.forEach(({ id }) => {
      scaleAnimRefs.current[id] = new Animated.Value(1);
    });
  }

  // CTA enable reveal
  const ctaEnabledAnim = useRef(new Animated.Value(0)).current;

  const glowAnimRefs = useRef<{ [key: string]: Animated.Value }>({});
  if (Object.keys(glowAnimRefs.current).length === 0) {
    intentions.forEach(({ id }) => {
      glowAnimRefs.current[id] = new Animated.Value(0);
    });
  }

  const ensureEssenceAssets = async () => {
    try {
      await Asset.loadAsync([
        require('../assets/images/particle-overlay.png'),
      ]);
    } catch (e) {
      console.log('Essence asset prefetch error', e);
    }
  };

  React.useEffect(() => {
    ctaEnabledAnim.setValue(0);
  }, []);

  React.useEffect(() => {
    if (!fromSettings) return;

    returnHeaderOpacity.setValue(0);
    returnHeaderTranslateY.setValue(-returnHeaderLift);

    Animated.parallel([
      Animated.timing(returnHeaderOpacity, {
        toValue: 1,
        duration: 700,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(returnHeaderTranslateY, {
        toValue: 0,
        duration: 700,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();
  }, [fromSettings, returnHeaderOpacity, returnHeaderTranslateY, returnHeaderLift]);

  useEffect(() => {
    if (!fromSettings) {
      setRetuneNudge(null);
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        const [savedIntentions, setAt, lastShown] = await Promise.all([
          getIntentions(),
          getIntentionSetAt(),
          getLastNudgeShownAt(),
        ]);

        const DEV_DAYS_OVERRIDE = __DEV__ ? 8 : null;

        const intentionSetAt =
          DEV_DAYS_OVERRIDE != null
            ? Date.now() - DEV_DAYS_OVERRIDE * 24 * 60 * 60 * 1000
            : setAt ?? Date.now();

        const nudge = getNudge({
          intentions: (savedIntentions as any) ?? [],
          intentionSetAt,
          lastNudgeShownAt: lastShown ?? undefined,
          cooldownDays: __DEV__ ? 0 : 7,
        });

        if (cancelled) return;

        if (nudge?.text) {
          setRetuneNudge(nudge.text);
          await setLastNudgeShownAt(Date.now());
        } else {
          setRetuneNudge(null);
        }
      } catch (e) {
        if (!cancelled) setRetuneNudge(null);
      }
    })();

    return () => { cancelled = true; };
  }, [fromSettings]);

  const toggleIntention = (id: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const isSelected = selectedIntentions.includes(id);
    const anim = scaleAnimRefs.current[id];
    const glow = glowAnimRefs.current[id];

    Animated.sequence([
      Animated.timing(anim, {
        toValue: isSelected ? 1 : 0.95,
        duration: 100,
        useNativeDriver: true,
      }),
      Animated.spring(anim, {
        toValue: 1,
        friction: 5,
        useNativeDriver: true,
      }),
    ]).start();

    if (isSelected) {
      setSelectedIntentions(prev => {
        const next = prev.filter(i => i !== id);
        Animated.timing(glow, { toValue: 0, duration: 220, useNativeDriver: true }).start();
        Animated.timing(ctaEnabledAnim, { toValue: next.length > 0 ? 1 : 0, duration: 220, useNativeDriver: true }).start();
        return next;
      });
    } else if (selectedIntentions.length < 2) {
      setSelectedIntentions(prev => {
        const next = [...prev, id];
        if (prev.length === 0) {
          ensureEssenceAssets();
        }
        Animated.timing(glow, { toValue: 1, duration: 260, useNativeDriver: true }).start();
        Animated.timing(ctaEnabledAnim, { toValue: 1, duration: 260, useNativeDriver: true }).start();
        return next;
      });
    }
  };

  const handleContinue = async () => {
    await setIntentions(selectedIntentions);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const preload = ensureEssenceAssets();
    await Promise.race([
      preload,
      new Promise((res) => setTimeout(res, 300)),
    ]);
    navigation.navigate('EssenceScreen');
  };

  return (
    <View style={styles.container}>
      {/* Full-screen looping video background */}
      <VideoView
        player={bgPlayer}
        contentFit="cover"
        style={StyleSheet.absoluteFill}
        nativeControls={false}
        allowsFullscreen={false}
        allowsPictureInPicture={false}
      />

      {/* Top gradient */}
      <LinearGradient
        colors={['rgba(0,0,0,0.5)', 'transparent']}
        style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '20%' }}
        pointerEvents="none"
      />

      {/* Bottom gradient */}
      <LinearGradient
        colors={['transparent', 'rgba(0,0,0,0.5)']}
        style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: '20%' }}
        pointerEvents="none"
      />

      <View style={styles.inner}>
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          accessible={false}
        >
          <View
            accessible={true}
            accessibilityLabel="Intention selection screen"
            accessibilityHint="Select up to two intentions to personalize your journey"
            style={{ alignItems: 'center', width: '100%' }}
          >
          {fromSettings && (
            <Animated.View
              style={{
                opacity: returnHeaderOpacity,
                transform: [{ translateY: returnHeaderTranslateY }],
                marginTop: verticalScale(10),
                marginBottom: verticalScale(12),
                paddingVertical: verticalScale(12),
                paddingHorizontal: scale(14),
                borderRadius: scale(14),
                backgroundColor: 'rgba(15, 12, 36, 0.96)',
                borderWidth: 1,
                borderColor: 'rgba(207,195,224,0.45)',
                maxWidth: scale(340),
                alignSelf: 'center',
              }}
            >
              <Text
                style={{
                  fontFamily: 'CalSans-SemiBold',
                  fontSize: scale(20),
                  letterSpacing: scale(0.4),
                  color: '#F4F1FF',
                  textAlign: 'center',
                  marginBottom: verticalScale(4),
                }}
              >
                Re-tune Intentions
              </Text>
              <Text
                style={{
                  fontFamily: 'Inter-ExtraLight',
                  fontSize: scale(13),
                  lineHeight: verticalScale(18),
                  color: '#DCD5F0',
                  textAlign: 'center',
                }}
              >
                {retuneNudge ?? 'Every intention quietly colors everything inside Inner. Adjust them when your inner tuning shifts.'}
              </Text>
            </Animated.View>
          )}

          {!fromSettings && <Text style={styles.title}>Set your path.</Text>}

          <Text style={styles.helperText}>
            {fromSettings
              ? selectedIntentions.length < 2
                ? 'Select up to 2 intentions to re-tune your experience.'
                : 'Your field is set.'
              : selectedIntentions.length < 2
                ? 'Select up to 2 intentions to shape your path'
                : 'Your path is set.'}
          </Text>

          <View style={styles.grid}>
            {intentions.map((intention) => {
              const isSelected = selectedIntentions.includes(intention.id);
              const isMaxSelected = selectedIntentions.length >= 2 && !isSelected;

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
          </View>
        </ScrollView>

        <View style={styles.ctaFooter}>
          <Animated.View
            style={{
              opacity: ctaEnabledAnim,
              transform: [{ scale: ctaEnabledAnim.interpolate({ inputRange: [0, 1], outputRange: [0.98, 1] }) }],
            }}
          >
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
              <Text style={styles.primaryText}>Move Inward</Text>
            </TouchableOpacity>
          </Animated.View>
        </View>
      </View>
    </View>
  );
}
