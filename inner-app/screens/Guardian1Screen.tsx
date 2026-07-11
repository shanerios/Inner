import React, { useCallback } from 'react';
import {
  View,
  Text,
  Pressable,
  Image,
  StyleSheet,
} from 'react-native';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useFocusEffect } from '@react-navigation/native';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const GUARDIAN_SIGIL = require('../assets/images/guardian_active.png');

const TRACKS = [
  { id: 'guardian_1_cultivation', title: 'Cultivation', locked: false },
  { id: 'guardian_1_calibration', title: 'Calibration', locked: true },
  { id: 'guardian_1_field',       title: 'Field',        locked: true },
];

export default function Guardian1Screen({ navigation }: any) {
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
    navigation.navigate('GuardianChamber');
  };

  const handleTrackPress = async (trackId: string) => {
    try { await Haptics.selectionAsync(); } catch {}
    navigation.navigate('JourneyPlayer', { trackId });
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

      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 16 }]}>
        <Text style={styles.eyebrow}>GUARDIAN I</Text>
        <Text style={styles.title}>RECOGNITION</Text>
      </View>

      {/* Sigil above archway — ~47% down */}
      <View style={styles.sigilWrap} pointerEvents="none">
        <Image source={GUARDIAN_SIGIL} style={styles.sigil} resizeMode="contain" />
      </View>

      {/* Track list — lower third */}
      <View style={styles.trackList}>
        {TRACKS.map((track, idx) => (
          <View key={track.id}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={track.locked ? `${track.title} — locked` : `Play ${track.title}`}
              style={({ pressed }) => [styles.trackRow, { opacity: pressed ? 0.65 : 1 }]}
              onPress={() => {
                if (!track.locked) handleTrackPress(track.id);
              }}
            >
              <Text style={[styles.trackTitle, track.locked && styles.trackTitleLocked]}>
                {track.title}
              </Text>
              {track.locked && (
                <Text style={styles.lockedLabel}>LOCKED</Text>
              )}
            </Pressable>
            {idx < TRACKS.length - 1 && <View style={styles.divider} />}
          </View>
        ))}
      </View>

      {/* Return */}
      <Pressable
        onPress={handleReturn}
        hitSlop={14}
        accessibilityRole="button"
        accessibilityLabel="Return to Guardians"
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

  // Header
  header: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 10,
  },
  eyebrow: {
    fontFamily: 'Inter-ExtraLight',
    fontSize: 11,
    letterSpacing: 3,
    color: 'rgba(237,232,250,0.6)',
    textTransform: 'uppercase',
    marginBottom: 5,
    textShadowColor: 'rgba(0,0,0,0.8)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  title: {
    fontFamily: 'CalSans-SemiBold',
    fontSize: 18,
    letterSpacing: 5,
    color: '#ffffff',
    textShadowColor: 'rgba(245,158,11,0.4)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 12,
  },

  // Sigil
  sigilWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: '31%',
    alignItems: 'center',
  },
  sigil: {
    width: 90,
    height: 90,
    opacity: 0.92,
  },

  // Track list
  trackList: {
    position: 'absolute',
    left: 36,
    right: 36,
    top: '68%',
  },
  trackRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
  },
  trackTitle: {
    flex: 1,
    fontFamily: 'CalSans-SemiBold',
    fontSize: 15,
    letterSpacing: 0.2,
    color: '#EDE8FA',
  },
  trackTitleLocked: {
    color: 'rgba(237,232,250,0.35)',
  },
  lockedLabel: {
    fontFamily: 'Inter-ExtraLight',
    fontSize: 10,
    letterSpacing: 2,
    color: 'rgba(237,232,250,0.35)',
    textTransform: 'uppercase',
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(255,255,255,0.10)',
  },

  // Return
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
