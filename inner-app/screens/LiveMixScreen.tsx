import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useVideoPlayer, VideoView } from '../core/memorySafeVideo';
import ProceduralMixerPanel from '../components/ProceduralMixerPanel';
import {
  DEFAULT_PROCEDURAL_AUDIO_CONFIG,
  normalizeProceduralAudioConfig,
  proceduralAudioEngine,
  ProceduralPlaybackSession,
} from '../core/audio';
import type { ProceduralAudioConfig, ProceduralAudioPatch } from '../core/audio';
import { Typography } from '../core/typography';

const LAST_MIX_KEY = 'inner.audio.live-mix.last.v1';
const FIRST_LIVE_MIX: ProceduralAudioConfig = normalizeProceduralAudioConfig({
  ...DEFAULT_PROCEDURAL_AUDIO_CONFIG,
  toneGain: 0,
  binauralCarrierHz: 200,
  binauralDeltaHz: 6,
  binauralGain: 0.32,
  noiseColor: 'pink',
  noiseGain: 0.2,
  masterGain: 0.78,
  rampMs: 1_200,
});

export default function LiveMixScreen() {
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const sessionRef = useRef(new ProceduralPlaybackSession(proceduralAudioEngine));
  const [config, setConfig] = useState(FIRST_LIVE_MIX);
  const [isPlaying, setIsPlaying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const background = useVideoPlayer(require('../assets/videos/lucidscreen.mp4'), player => {
    player.loop = true;
    player.muted = true;
    player.audioMixingMode = 'mixWithOthers';
    player.play();
  });

  useEffect(() => {
    let active = true;
    const session = sessionRef.current;
    const start = async () => {
      try {
        const raw = await AsyncStorage.getItem(LAST_MIX_KEY);
        const initial = raw ? normalizeProceduralAudioConfig(JSON.parse(raw)) : FIRST_LIVE_MIX;
        if (!active) return;
        setConfig(initial);
        if (!session.isAvailable()) throw new Error('Live Mix is unavailable in this build.');
        await session.start(initial, 'Inner Live Mix');
        if (active) setIsPlaying(true);
      } catch (startError) {
        if (active) setError(startError instanceof Error ? startError.message : String(startError));
      }
    };
    void start();
    return () => {
      active = false;
      void session.stop();
    };
  }, []);

  const applyPatch = useCallback(async (patch: ProceduralAudioPatch) => {
    try {
      await sessionRef.current.update(patch);
      const next = sessionRef.current.getConfig();
      if (!next) return;
      setConfig(next);
      void AsyncStorage.setItem(LAST_MIX_KEY, JSON.stringify(next));
    } catch (patchError) {
      setError(patchError instanceof Error ? patchError.message : String(patchError));
    }
  }, []);

  const togglePlayback = async () => {
    try {
      if (isPlaying) await sessionRef.current.pause();
      else await sessionRef.current.play();
      setIsPlaying(!isPlaying);
    } catch (playbackError) {
      setError(playbackError instanceof Error ? playbackError.message : String(playbackError));
    }
  };

  const returnToJourneys = async () => {
    await sessionRef.current.stop().catch(() => {});
    navigation.goBack();
  };

  return (
    <View style={styles.root}>
      <VideoView player={background} contentFit="cover" style={StyleSheet.absoluteFill} nativeControls={false} allowsFullscreen={false} allowsPictureInPicture={false} />
      <View style={styles.veil} pointerEvents="none" />
      <View style={[styles.header, { paddingTop: insets.top + 102 + (Platform.OS === 'android' ? 30 : 0) }]}>
        <Text style={[Typography.display, styles.title]}>Live Mix</Text>
        <Text style={[Typography.body, styles.subtitle]}>Shape sound in real time.</Text>
        <Pressable onPress={() => void togglePlayback()} accessibilityRole="button" accessibilityLabel={isPlaying ? 'Pause live mix' : 'Play live mix'} style={styles.playButton}>
          <Text style={styles.playText}>{isPlaying ? 'PAUSE' : 'PLAY'}</Text>
        </Pressable>
        {error ? <Text style={styles.error}>{error}</Text> : null}
      </View>
      <View style={[styles.mixer, { top: insets.top + 190 + (Platform.OS === 'android' ? 30 : 0), bottom: insets.bottom + 62 }]}>
        <ProceduralMixerPanel config={config} onPatch={applyPatch} isPlaying={isPlaying} onClose={() => {}} standalone />
      </View>
      <Pressable onPress={() => void returnToJourneys()} accessibilityRole="button" accessibilityLabel="Return to Lucid Journeys" style={[styles.returnButton, { bottom: insets.bottom + 16 }]}>
        <Text style={styles.returnText}>RETURN</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#02040B' },
  veil: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.62)' },
  header: { position: 'absolute', left: 0, right: 0, alignItems: 'center', zIndex: 2 },
  title: { color: '#F5F2FC', fontSize: 24, textAlign: 'center', textShadowColor: 'rgba(0,0,0,0.9)', textShadowRadius: 12 },
  subtitle: { color: '#D6D0DF', fontFamily: 'Inter-ExtraLight', fontSize: 13, marginTop: 5 },
  playButton: { marginTop: 9, paddingHorizontal: 18, paddingVertical: 7, borderRadius: 14, borderWidth: 1, borderColor: 'rgba(210,198,255,0.42)', backgroundColor: 'rgba(169,149,245,0.16)' },
  playText: { color: '#F0EBFA', fontFamily: 'Inter-Medium', fontSize: 9, letterSpacing: 1.5 },
  error: { color: '#D8BFCB', fontFamily: 'Inter-Light', fontSize: 10, marginTop: 6 },
  mixer: { position: 'absolute', left: 10, right: 10 },
  returnButton: { position: 'absolute', alignSelf: 'center', paddingHorizontal: 24, paddingVertical: 13 },
  returnText: { color: '#E8E2F2', fontFamily: 'Inter-Medium', fontSize: 10, letterSpacing: 2.1 },
});
