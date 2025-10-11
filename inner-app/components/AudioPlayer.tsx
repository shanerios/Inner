import React, { useEffect, useRef, useState, useCallback } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import Slider from '@react-native-community/slider';
import { Audio, AVPlaybackStatus } from 'expo-av';

type Props = {
  source: number | { uri: string }; // require(...) or remote/local URI
  startVolume?: number;             // e.g. 0.9
  onPlay?: () => void;
  onPause?: () => void;
  onEnd?: () => void;
  autoPlay?: boolean;
};

export default function AudioPlayer({
  source,
  startVolume = 0.9,
  onPlay,
  onPause,
  onEnd,
  autoPlay = true,
}: Props) {
  const soundRef = useRef<Audio.Sound | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [position, setPosition] = useState(0); // ms
  const [duration, setDuration] = useState(1); // ms (avoid div by zero)
  const [seeking, setSeeking] = useState(false);

  // Helpers
  const mmss = (ms: number) => {
    const sec = Math.floor(ms / 1000);
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${s < 10 ? '0' + s : s}`;
  };

  // Load + configure
  useEffect(() => {
    let mounted = true;

    const setup = async () => {
      await Audio.setAudioModeAsync({
        playsInSilentModeIOS: true,
        staysActiveInBackground: true,
        shouldDuckAndroid: true,
        interruptionModeIOS: Audio.INTERRUPTION_MODE_IOS_DO_NOT_MIX,
        interruptionModeAndroid: Audio.INTERRUPTION_MODE_ANDROID_DO_NOT_MIX,
      });

      const s = new Audio.Sound();
      await s.loadAsync(source, { volume: startVolume, shouldPlay: autoPlay });
      soundRef.current = s;

      s.setOnPlaybackStatusUpdate((st: AVPlaybackStatus) => {
        if (!mounted || !st.isLoaded) return;
        setDuration(st.durationMillis ?? duration);
        if (!seeking) setPosition(st.positionMillis ?? 0);
        setIsPlaying(!!st.isPlaying);
        if (st.didJustFinish) {
          onEnd?.();
          setIsPlaying(false);
        }
      });

      if (autoPlay) onPlay?.();
    };

    setup().catch(console.log);

    return () => {
      mounted = false;
      soundRef.current?.unloadAsync().catch(() => {});
      soundRef.current = null;
    };
  }, []);

  const toggle = useCallback(async () => {
    const s = soundRef.current;
    if (!s) return;
    const st = await s.getStatusAsync();
    if (!st.isLoaded) return;
    if (st.isPlaying) {
      await s.pauseAsync();
      onPause?.();
    } else {
      await s.playAsync();
      onPlay?.();
    }
  }, []);

  const onSlidingStart = () => setSeeking(true);
  const onSlidingComplete = async (val: number) => {
    const s = soundRef.current;
    if (!s) return;
    setSeeking(false);
    await s.setPositionAsync(val);
    const st = await s.getStatusAsync();
    if (st.isLoaded && !st.isPlaying) {
      // stay paused where user scrubbed to
      setPosition(val);
    }
  };

  return (
    <View style={styles.wrap}>
      <View style={styles.row}>
        <TouchableOpacity style={styles.btn} onPress={toggle} hitSlop={10}>
          <Text style={styles.btnText}>{isPlaying ? 'Pause' : 'Play'}</Text>
        </TouchableOpacity>
        <Text style={styles.time}>{mmss(position)} / {mmss(duration)}</Text>
      </View>

      <Slider
        style={styles.slider}
        minimumValue={0}
        maximumValue={duration}
        value={position}
        onSlidingStart={onSlidingStart}
        onSlidingComplete={onSlidingComplete}
        minimumTrackTintColor="#CFC3E0"
        maximumTrackTintColor="rgba(255,255,255,0.25)"
        thumbTintColor="#E6DAFF"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { width: '100%', paddingHorizontal: 20, paddingVertical: 12 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  btn: { paddingVertical: 8, paddingHorizontal: 14, borderRadius: 12, backgroundColor: 'rgba(207,195,224,0.18)' },
  btnText: { color: '#E8E4F3', fontSize: 16 },
  time: { color: '#B9B5C9', fontSize: 12 },
  slider: { width: '100%', height: 34 },
});
