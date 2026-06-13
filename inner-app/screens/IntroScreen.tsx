import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
  Switch,
  Easing,
  useWindowDimensions,
} from 'react-native';
import { Audio } from 'expo-av';
import * as Haptics from 'expo-haptics';
import { StatusBar } from 'expo-status-bar';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { useVideoPlayer, VideoView } from 'expo-video';

import { Typography, Body as _Body } from '../core/typography';
import { useScale } from '../utils/scale';

const Body = _Body ?? ({
  regular: { ...Typography.body },
  subtle:  { ...Typography.caption },
} as const);

const captions = [
  { time: 0.1,  text: 'You\'ve felt it.' },
  { time: 2.7,  text: 'That quiet pull' },
  { time: 4.1,  text: 'towards' },
  { time: 4.7,  text: 'something more.' },
  { time: 7,    text: 'It doesn\'t shout.' },
  { time: 9.5,  text: 'It doesn\'t demand' },
  { time: 11,   text: 'attention.' },
  { time: 13,   text: 'It just needs space.' },
  { time: 16.3, text: 'We\'ll' },
  { time: 17.2, text: 'begin with clarity' },
];

export default function IntroScreen() {
  const navigation = useNavigation();
  const { width: windowWidth } = useWindowDimensions();
  const { scale, verticalScale } = useScale();

  const captionFontSize = useMemo(
    () => Math.round(Math.min(scale(17), windowWidth * 0.045)),
    [scale, windowWidth],
  );

  const styles = useMemo(
    () =>
      StyleSheet.create({
        container: {
          flex: 1,
          backgroundColor: '#0d0d1a',
        },
        bgImage: {
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          width: '100%',
          height: '100%',
        },
        content: {
          flex: 1,
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingTop: verticalScale(80),
          paddingBottom: verticalScale(60),
        },
        captionBox: {
          justifyContent: 'center',
          alignItems: 'center',
          height: verticalScale(120),
          width: windowWidth * 0.8,
        },
        buttons: {
          alignItems: 'center',
        },
        primaryButton: {
          paddingVertical: verticalScale(12),
          paddingHorizontal: scale(28),
        },
        primaryButtonWrap: {
          position: 'relative',
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: verticalScale(8),
        },
        accessibilityToggleRight: {
          position: 'absolute',
          bottom: verticalScale(20),
          right: scale(20),
          alignItems: 'center',
        },
        accessibilityToggleLeft: {
          position: 'absolute',
          bottom: verticalScale(20),
          left: scale(20),
          alignItems: 'center',
        },
      }),
    [scale, verticalScale, windowWidth],
  );

  const primaryButtonRadius = scale(24);

  const soundRef = useRef<Audio.Sound | null>(null);
  const [currentCaption, setCurrentCaption] = useState('');
  const [showCaptions, setShowCaptions] = useState(true);
  const [isMuted, setIsMuted] = useState(false);
  const captionAnim = useRef(new Animated.Value(0)).current;
  const ctaFadeAnim = useRef(new Animated.Value(0)).current;
  const ctaScale = useRef(new Animated.Value(1)).current;
  const [ctaPressed, setCtaPressed] = useState(false);
  const lastCaptionRef = useRef<string | null>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  const bgPlayer = useVideoPlayer(require('../assets/videos/intro_revamp.mp4'), player => {
    player.loop = true;
    player.muted = true;
    player.play();
  });

  useFocusEffect(
    React.useCallback(() => {
      bgPlayer.play();
      return () => { bgPlayer.pause(); };
    }, [bgPlayer])
  );

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
      require('../assets/audio/intro_v3.mp3')
    );
    soundRef.current = sound;
    await sound.setVolumeAsync(isMuted ? 0 : 0.6);
    await sound.playAsync();

    sound.setOnPlaybackStatusUpdate((status) => {
      if (!status.isLoaded) return;
      if ((status as any).didJustFinish) {
        Animated.timing(ctaFadeAnim, {
          toValue: 1,
          duration: 1200,
          useNativeDriver: true,
        }).start();
      }
    });

    const start = Date.now();
    intervalRef.current = setInterval(() => {
      const elapsed = (Date.now() - start) / 1000;
      let activeCaption: { time: number; text: string } | null = null;
      for (let i = captions.length - 1; i >= 0; i--) {
        if (elapsed >= captions[i].time) {
          activeCaption = captions[i];
          break;
        }
      }
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
    const voiceDelayMs = 3500;
    const voiceTimer = setTimeout(playVoice, voiceDelayMs);

    return () => {
      clearTimeout(voiceTimer);
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (soundRef.current) {
        try { soundRef.current.setOnPlaybackStatusUpdate(null as any); } catch {}
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

  useEffect(() => {
    const breathingAnimation = Animated.loop(
      Animated.sequence([
        Animated.timing(ctaScale, {
          toValue: 1.05,
          duration: 2000,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(ctaScale, {
          toValue: 1.0,
          duration: 2000,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    );
    breathingAnimation.start();
    return () => { breathingAnimation.stop(); };
  }, [ctaScale]);

  return (
    <View style={styles.container}>
      <StatusBar style="light" backgroundColor="#0d0d1a" translucent={false} />

      {/* Looping MP4 background */}
      <VideoView
        player={bgPlayer}
        contentFit="cover"
        style={styles.bgImage}
        nativeControls={false}
        allowsFullscreen={false}
        allowsPictureInPicture={false}
      />

      <View style={styles.content}>
        {/* Caption box — positioned in the upper third (dark sky area) */}
        <View style={[styles.captionBox, { marginTop: verticalScale(40) }]}>
          {showCaptions && (
            <Animated.Text
              allowFontScaling={false}
              maxFontSizeMultiplier={1}
              style={{
                fontFamily: 'CalSans-SemiBold',
                color: 'white',
                textAlign: 'center',
                fontSize: captionFontSize,
                lineHeight: Math.round(captionFontSize * 1.35),
                opacity: captionAnim,
              }}
            >
              {currentCaption}
            </Animated.Text>
          )}
        </View>

        {/* Spacer pushes CTA to bottom */}
        <View style={{ flex: 1 }} />

        {/* CTA + Skip */}
        <View style={styles.buttons}>
          <Animated.View style={{ opacity: ctaFadeAnim }}>
            <View style={styles.primaryButtonWrap}>
              <Animated.View
                style={{
                  transform: [{ scale: ctaScale }],
                  borderRadius: 12,
                  overflow: 'hidden',
                  borderWidth: 1,
                  borderColor: 'rgba(255,255,255,0.12)',
                  backgroundColor: 'rgba(207,195,224,0.16)',
                }}
              >
                <TouchableOpacity
                  onPress={async () => {
                    setCtaPressed(true);
                    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                    setCtaPressed(false);
                    stopAudioAndNavigate();
                  }}
                  style={styles.primaryButton}
                  accessibilityRole="button"
                  accessibilityLabel="Move inward. Begin your inner journey."
                >
                  <Text style={{ fontFamily: 'CalSans-SemiBold', color: '#F3EDE7', letterSpacing: 0.2 }}>Move Inward</Text>
                </TouchableOpacity>
              </Animated.View>
            </View>
          </Animated.View>

          <TouchableOpacity
            onPress={async () => {
              await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              stopAudioAndNavigate();
            }}
            accessibilityRole="button"
            accessibilityLabel="Skip intro and continue to next screen."
          >
            <Text
              style={[
                Body.regular,
                {
                  fontFamily: 'Inter-ExtraLight',
                  color: 'white',
                  marginTop: verticalScale(10),
                  opacity: 0.7,
                },
              ]}
            >
              skip
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Caption Toggle (Right) */}
      <View style={[styles.accessibilityToggleRight, {
        backgroundColor: 'rgba(0,0,0,0.72)',
        borderRadius: 14,
        paddingVertical: 8,
        paddingHorizontal: 10,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.08)',
      }]}>
        <Switch
          value={showCaptions}
          onValueChange={(value) => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            setShowCaptions(value);
          }}
          thumbColor={showCaptions ? '#EDE8FA' : '#888'}
          trackColor={{ false: 'rgba(60,50,90,0.5)', true: 'rgba(207,195,224,0.35)' }}
          accessibilityRole="switch"
          accessibilityLabel="Captions toggle"
          accessibilityHint="Turn on or off the on-screen captions for this intro."
        />
        <Text style={{ fontFamily: 'Inter-ExtraLight', fontSize: 11, color: 'rgba(237,232,250,0.75)', marginTop: 4 }}>Captions</Text>
      </View>

      {/* Audio Toggle (Left) */}
      <View style={[styles.accessibilityToggleLeft, {
        backgroundColor: 'rgba(0,0,0,0.72)',
        borderRadius: 14,
        paddingVertical: 8,
        paddingHorizontal: 10,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.08)',
      }]}>
        <Switch
          value={!isMuted}
          onValueChange={(value) => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            setIsMuted(!value);
          }}
          thumbColor={!isMuted ? '#EDE8FA' : '#888'}
          trackColor={{ false: 'rgba(60,50,90,0.5)', true: 'rgba(207,195,224,0.35)' }}
          accessibilityRole="switch"
          accessibilityLabel="Audio toggle"
          accessibilityHint="Mute or unmute the voice audio."
        />
        <Text style={{ fontFamily: 'Inter-ExtraLight', fontSize: 11, color: 'rgba(237,232,250,0.75)', marginTop: 4 }}>Audio</Text>
      </View>
    </View>
  );
}
