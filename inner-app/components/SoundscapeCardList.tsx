// components/SoundscapeCardList.tsx
import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, ImageSourcePropType, ScrollView, Text, Image, Animated } from 'react-native';
import SoundscapeCard from './SoundscapeCard';
import ClaritySigil from '../assets/sigils/clarity.svg';
import StillnessSigil from '../assets/sigils/stillness.svg';
import RenewalSigil from '../assets/sigils/renewal.svg';
import DeeperSigil from '../assets/sigils/deeper.svg';
import TonesSigil from '../assets/sigils/tones.svg';
import NoiseSigil from '../assets/sigils/noise.svg';

import { Body as _Body } from '../core/typography';
import { isLockedTrack } from '../src/core/subscriptions/accessPolicy';
import { safePresentPaywall } from '../src/core/subscriptions/safePresentPaywall';
import { useScale } from '../utils/scale';
const Body = _Body ?? ({
  regular: { fontFamily: 'Inter-ExtraLight', fontSize: 14 },
  subtle: { fontFamily: 'Inter-ExtraLight', fontSize: 12 },
} as const);

function LockPulse({ size = 22, opacity = 0.38 }: { size?: number; opacity?: number }) {
  const scale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(scale, {
          toValue: 1.15,
          duration: 2000,
          useNativeDriver: true,
        }),
        Animated.timing(scale, {
          toValue: 1.0,
          duration: 3000,
          useNativeDriver: true,
        }),
      ])
    );
    anim.start();
    return () => anim.stop();
  }, [scale]);

  return (
    <View
      pointerEvents="none"
      style={{
        position: 'absolute',
        top: '50%',
        left: '50%',
        width: size,
        height: size,
        marginLeft: -size / 2,
        marginTop: -size / 2,
        borderRadius: size / 2,
        backgroundColor: `rgba(0,0,0,${opacity})`,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Animated.View style={{ transform: [{ scale }] }}>
        <Image
          source={require('../assets/images/locked_gate.png')}
          style={{ width: size * 0.58, height: size * 0.58, resizeMode: 'contain' }}
        />
      </Animated.View>
    </View>
  );
}

function DeeperSigilWithLock({ sigilSize, lockSize }: { sigilSize: number; lockSize: number }) {
  return (
    <View style={{ width: sigilSize, height: sigilSize }}>
      <DeeperSigil width={sigilSize} height={sigilSize} />
      <LockPulse size={lockSize} opacity={0.34} />
    </View>
  );
}

type Category = {
  key: 'stillness' | 'clarity' | 'renewal' | 'deeper' | 'tones' | 'noise';
  label: string;
  colors: [string, string]; // gradient pair
  subtitle: string;
  sigil: ImageSourcePropType | React.ReactNode | string;
};

const CATEGORIES: Category[] = [
  {
    key: 'stillness',
    label: 'Stillness',
    colors: ['#6A4BA3', '#C7B5E8'],           // violet → lavender
    subtitle: 'Meditation • Calm • Presence',
    sigil: <StillnessSigil width={44} height={44} />,
  },
  {
    key: 'clarity',
    label: 'Clarity',
    colors: ['#1B2A6E', '#4EC8D0'],           // indigo → teal
    subtitle: 'Focus • Awareness • Flow',
    sigil: <ClaritySigil width={46} height={46} />,
  },
  {
    key: 'renewal',
    label: 'Renewal',
    colors: ['#4a7b5cff', '#6b9f58ff'],           // green → light green
    subtitle: 'Healing • Energy • Rebirth',
    sigil: <RenewalSigil width={48} height={48} />,
  },
  {
    key: 'deeper',
    label: 'Deeper',
    colors: ['#1a190bff', '#3d256bff'],           // near-black → dark violet
    subtitle: 'Threshold • Descent • Beyond',
    sigil: <DeeperSigilWithLock />,
  },
  {
    key: 'tones',
    label: 'Tones',
    colors: ['#3e3e1fff', '#987d1aff'],           // desaturated gold → soft gold
    subtitle: 'Solfeggio • Binaural • Gamma',
    sigil: <TonesSigil width={48} height={48} />,
  },
  {
    key: 'noise',
    label: 'Noise',
    colors: ['#26303A', '#9FA6B2'],           // slate → mist gray
    subtitle: 'White • Pink • Brown',
    sigil: <NoiseSigil width={48} height={48} />,
  },
];

type Props = {
  onSelectCategory?: (key: Category['key']) => void;

  // NEW (preferred): pass the current membership state so this component can gate reliably
  hasMembership?: boolean;

  // Legacy support (still works if parent is using the older pattern)
  onDeeperLockedPress?: () => void; // when Deeper is locked, open paywall directly
  isDeeperLocked?: boolean; // controls lock overlay on Deeper card

  cardHeight?: number;
  spacing?: number; // vertical gap between cards
};

export default function SoundscapeCardList({
  onSelectCategory,
  hasMembership,
  onDeeperLockedPress,
  cardHeight,
  spacing = 16,
  isDeeperLocked = true,
}: Props) {
  const { scale, verticalScale, matchesCompactLayout } = useScale();
  const effectiveHasMembership = hasMembership ?? false;
  const deeperLocked = hasMembership != null ? !effectiveHasMembership : isDeeperLocked;
  const resolvedCardHeight = cardHeight ?? (matchesCompactLayout ? verticalScale(82) : verticalScale(96));
  const resolvedGap = spacing ?? (matchesCompactLayout ? verticalScale(12) : verticalScale(16));
  const sigilSize = matchesCompactLayout ? scale(40) : scale(48);
  const lockSize = matchesCompactLayout ? scale(20) : scale(22);

  return (
    <View style={[styles.list, { height: '100%' }]}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ gap: resolvedGap, paddingBottom: verticalScale(12) }}
      >
        {CATEGORIES.map((cat) => (
          <SoundscapeCard
            key={cat.key}
            label={cat.label}
            colors={cat.colors}
            style={{ height: resolvedCardHeight }}
            subtitle={
              <Text
                style={[
                  Body.regular,
                  { color: 'rgba(237,232,250,0.85)' },
                  matchesCompactLayout && {
                    fontSize: scale(13),
                    lineHeight: Math.round(scale(18)),
                  },
                ]}
              >
                {cat.subtitle}
              </Text>
            }
            sigil={
              cat.key === 'deeper'
                ? (deeperLocked
                    ? <DeeperSigilWithLock sigilSize={sigilSize} lockSize={lockSize} />
                    : <DeeperSigil width={sigilSize} height={sigilSize} />)
                : cat.key === 'stillness'
                ? <StillnessSigil width={sigilSize} height={sigilSize} />
                : cat.key === 'clarity'
                ? <ClaritySigil width={sigilSize} height={sigilSize} />
                : cat.key === 'renewal'
                ? <RenewalSigil width={sigilSize} height={sigilSize} />
                : cat.key === 'tones'
                ? <TonesSigil width={sigilSize} height={sigilSize} />
                : <NoiseSigil width={sigilSize} height={sigilSize} />
            }
            showArrow={true}
            onPress={async () => {
              // Centralized gating for the Deeper category
              if (cat.key === 'deeper' && deeperLocked) {
                // Preferred path: use safe paywall presentation (crash-safe)
                if (hasMembership != null) {
                  const pseudoTrack = { id: 'category:deeper', category: cat.key };
                  if (isLockedTrack(pseudoTrack, effectiveHasMembership)) {
                    await safePresentPaywall();
                    return;
                  }
                }

                // Legacy fallback: if parent wants to handle paywall
                onDeeperLockedPress?.();
                // If no legacy handler provided, still present paywall
                if (!onDeeperLockedPress) {
                  await safePresentPaywall();
                }
                return;
              }

              onSelectCategory?.(cat.key);
            }}
          />
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  list: {
    width: '100%',
  },
});