import React, { useMemo, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Animated, Easing } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

type Props = {
  isPlaying: boolean;
  position: number;     // ms
  duration: number;     // ms
  onToggle: () => void; // play/pause
  onLoopToggle?: () => void;
  isLooping?: boolean;
  onMuteToggle?: () => void;
  isMuted?: boolean;
  title?: string;
};

const SIZE = 240;          // overall diameter of the radial control
const STROKE = 8;          // progress ring thickness
const R = (SIZE - STROKE) / 2; // radius
const CIRC = 2 * Math.PI * R;

const mmss = (ms: number) => {
  const sec = Math.floor(ms / 1000);
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s < 10 ? '0' + s : s}`;
};

export default function RadialTransport({
  isPlaying,
  position,
  duration,
  onToggle,
  onLoopToggle,
  isLooping = false,
  onMuteToggle,
  isMuted = false,
  title = 'Chamber 1 — Outer Sanctum',
}: Props) {
  const progress = duration > 0 ? position / duration : 0;
  const dashOffset = useMemo(() => CIRC * (1 - progress), [progress]);

  // Breathing halo
  const halo = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(halo, { toValue: 1, duration: 4000, easing: Easing.inOut(Easing.quad), useNativeDriver: false }),
        Animated.timing(halo, { toValue: 0, duration: 4000, easing: Easing.inOut(Easing.quad), useNativeDriver: false }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, []);

  const haloScale = halo.interpolate({ inputRange: [0, 1], outputRange: [1.0, 1.04] });
  const haloOpacity = halo.interpolate({ inputRange: [0, 1], outputRange: [0.18, 0.32] });

  return (
    <View style={styles.wrap}>
      {/* Title */}
      <Text style={styles.title} numberOfLines={1}>{title}</Text>

      {/* Radial stack */}
      <View style={styles.stack}>
        {/* Breathing halo */}
        <Animated.View style={[
          styles.halo,
          { width: SIZE, height: SIZE, borderRadius: SIZE/2, opacity: haloOpacity, transform: [{ scale: haloScale }] }
        ]} />

        {/* SVG progress */}
        <Svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`}>
          {/* Track */}
          <Circle
            cx={SIZE/2}
            cy={SIZE/2}
            r={R}
            stroke="rgba(255,255,255,0.12)"
            strokeWidth={STROKE}
            fill="none"
          />
          {/* Progress arc */}
          <Circle
            cx={SIZE/2}
            cy={SIZE/2}
            r={R}
            stroke="#CFC3E0"
            strokeWidth={STROKE}
            strokeLinecap="round"
            fill="none"
            strokeDasharray={`${CIRC}, ${CIRC}`}
            strokeDashoffset={dashOffset}
            transform={`rotate(-90 ${SIZE/2} ${SIZE/2})`} // start at top
          />
        </Svg>

        {/* Center control */}
        <TouchableOpacity onPress={onToggle} style={styles.centerBtn} hitSlop={12}>
          <Text style={styles.centerBtnText}>{isPlaying ? 'Pause' : 'Play'}</Text>
        </TouchableOpacity>
      </View>

      {/* Time row */}
      <View style={styles.timeRow}>
        <Text style={styles.time}>{mmss(position)}</Text>
        <Text style={styles.time}>-{mmss(Math.max(0, duration - position))}</Text>
      </View>

      {/* Utility row */}
      <View style={styles.utilRow}>
        <TouchableOpacity onPress={onLoopToggle} style={styles.utilBtn} hitSlop={10}>
          <Text style={styles.utilText}>{isLooping ? 'Loop: On' : 'Loop: Off'}</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={onMuteToggle} style={styles.utilBtn} hitSlop={10}>
          <Text style={styles.utilText}>{isMuted ? 'Muted' : 'Sound'}</Text>
        </TouchableOpacity>
        {/* Reserved for future: guided voice mix, etc. */}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', width: '100%' },
  title: { color: '#EDEAF7', fontSize: 16, marginBottom: 12 },
  stack: { width: SIZE, height: SIZE, alignItems: 'center', justifyContent: 'center' },
  halo: { position: 'absolute', backgroundColor: '#CFC3E0', opacity: 0.2 },
  centerBtn: {
    position: 'absolute',
    width: SIZE * 0.42,
    height: SIZE * 0.42,
    borderRadius: (SIZE * 0.42) / 2,
    backgroundColor: 'rgba(207,195,224,0.14)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(207,195,224,0.28)',
  },
  centerBtnText: { color: '#F3F1FA', fontSize: 16 },
  timeRow: { width: SIZE, flexDirection: 'row', justifyContent: 'space-between', marginTop: 12 },
  time: { color: '#BEB8D1', fontSize: 12 },
  utilRow: { flexDirection: 'row', gap: 12, marginTop: 16 },
  utilBtn: { paddingVertical: 8, paddingHorizontal: 12, borderRadius: 12, backgroundColor: 'rgba(207,195,224,0.12)' },
  utilText: { color: '#DAD4EA', fontSize: 12 },
});
