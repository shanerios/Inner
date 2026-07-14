import React, { useCallback } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useVideoPlayer, VideoView } from '../core/memorySafeVideo';
import { useFocusEffect } from '@react-navigation/native';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function GuardianChamberScreen({ navigation }: any) {
  const insets = useSafeAreaInsets();

  const bgPlayer = useVideoPlayer(require('../assets/videos/guardian_screen.mp4'), player => {
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

  const handleReturn = async () => {
    try { await Haptics.selectionAsync(); } catch {}
    navigation.popTo('Home');
  };

  const handleGuardian1 = async () => {
    try { await Haptics.selectionAsync(); } catch {}
    navigation.navigate('Guardian1');
  };

  return (
    <View style={styles.container}>
      <VideoView
        player={bgPlayer}
        contentFit="cover"
        style={StyleSheet.absoluteFill}
        nativeControls={false}
        allowsFullscreen={false}
        allowsPictureInPicture={false}
      />

      <Text style={styles.screenTitle}>GUARDIANS</Text>

      {/* Archway tap target — center of screen, over the archway */}
      <Pressable
        onPress={handleGuardian1}
        accessibilityRole="button"
        accessibilityLabel="Enter Guardian I — Recognition"
        style={styles.archwayTarget}
      />

      <Pressable
        onPress={handleReturn}
        hitSlop={14}
        accessibilityRole="button"
        accessibilityLabel="Return to home"
        style={[styles.returnButton, { bottom: insets.bottom + 32 }]}
      >
        <Text style={styles.returnLabel}>Return</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0d0d1a',
  },
  archwayTarget: {
    position: 'absolute',
    alignSelf: 'center',
    top: '38%',
    width: 180,
    height: 220,
  },
  screenTitle: {
    position: 'absolute',
    top: '15%',
    alignSelf: 'center',
    fontFamily: 'CalSans-SemiBold',
    fontSize: 16,
    letterSpacing: 5,
    color: '#ffffff',
    textShadowColor: 'rgba(245,158,11,0.6)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 12,
  },
  returnButton: {
    position: 'absolute',
    alignSelf: 'center',
  },
  returnLabel: {
    fontFamily: 'Inter-ExtraLight',
    fontSize: 12,
    letterSpacing: 2,
    color: 'rgba(237,232,250,0.9)',
    textTransform: 'uppercase',
    textShadowColor: 'rgba(0,0,0,1)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 3,
  },
});
