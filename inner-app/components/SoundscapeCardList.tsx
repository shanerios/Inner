// components/SoundscapeCardList.tsx
import React, { useEffect, useRef, useState } from 'react';
import { View, StyleSheet, ImageSourcePropType, ScrollView, Text, Image, Animated, Modal, Pressable } from 'react-native';
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
  description: string;
  sigil: ImageSourcePropType | React.ReactNode | string;
};

const CATEGORIES: Category[] = [
  {
    key: 'stillness',
    label: 'Stillness',
    colors: ['#6A4BA3', '#C7B5E8'],           // violet → lavender
    subtitle: 'Meditation • Calm • Presence',
    description: 'A place for quiet meditation, breath, and nervous-system settling. Stillness soundscapes are designed to soften the mind without pulling attention, helping the body return to presence.',
    sigil: <StillnessSigil width={44} height={44} />,
  },
  {
    key: 'clarity',
    label: 'Clarity',
    colors: ['#1B2A6E', '#4EC8D0'],           // indigo → teal
    subtitle: 'Focus • Awareness • Flow',
    description: 'Soundscapes for focus, awareness, and creative flow. Clarity is meant to support work, study, writing, movement, or mindful attention without becoming distracting.',
    sigil: <ClaritySigil width={46} height={46} />,
  },
  {
    key: 'renewal',
    label: 'Renewal',
    colors: ['#4a7b5cff', '#6b9f58ff'],           // green → light green
    subtitle: 'Healing • Energy • Rebirth',
    description: 'A restorative space for release, emotional softening, and gentle return. Renewal soundscapes help clear residue from the day and invite the system back into balance.',
    sigil: <RenewalSigil width={48} height={48} />,
  },
  {
    key: 'deeper',
    label: 'Deeper',
    colors: ['#1a190bff', '#3d256bff'],           // near-black → dark violet
    subtitle: 'Threshold • Descent • Beyond',
    description: 'A premium layer for threshold states, descent, lucid dreaming, and deeper inner work. These soundscapes are slower, heavier, and designed for users ready to move beyond surface calm.',
    sigil: <DeeperSigilWithLock />,
  },
  {
    key: 'tones',
    label: 'Tones',
    colors: ['#3e3e1fff', '#987d1aff'],           // desaturated gold → soft gold
    subtitle: 'Solfeggio • Binaural • Gamma',
    description: 'Minimal frequency-based audio for intentional listening. Tones gather solfeggio, binaural, and high-frequency experiences into a simple space for tuning and resonance.',
    sigil: <TonesSigil width={48} height={48} />,
  },
  {
    key: 'noise',
    label: 'Noise',
    colors: ['#26303A', '#9FA6B2'],           // slate → mist gray
    subtitle: 'White • Pink • Brown',
    description: 'Simple noise fields for sleep, focus, masking, and nervous-system steadiness. White, pink, and brown noise provide neutral texture without emotional direction.',
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
  const [selectedCategory, setSelectedCategory] = useState<Category | null>(null);

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
            onLongPress={() => setSelectedCategory(cat)}
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
      <Modal
        visible={!!selectedCategory}
        transparent
        animationType="fade"
        onRequestClose={() => setSelectedCategory(null)}
      >
        <Pressable style={styles.modalBackdrop} onPress={() => setSelectedCategory(null)}>
          <Pressable style={styles.modalCard} onPress={() => {}}>
            <Text style={styles.modalEyebrow}>Soundscape Path</Text>
            <Text style={styles.modalTitle}>{selectedCategory?.label}</Text>
            <Text style={styles.modalSubtitle}>{selectedCategory?.subtitle}</Text>
            <Text style={styles.modalDescription}>{selectedCategory?.description}</Text>
            <Pressable style={styles.modalCloseButton} onPress={() => setSelectedCategory(null)}>
              <Text style={styles.modalCloseText}>Return</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  list: {
    width: '100%',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(4, 3, 10, 0.72)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  modalCard: {
    width: '100%',
    maxWidth: 420,
    borderRadius: 28,
    paddingHorizontal: 24,
    paddingTop: 24,
    paddingBottom: 20,
    backgroundColor: 'rgba(18, 14, 34, 0.96)',
    borderWidth: 1,
    borderColor: 'rgba(237,232,250,0.18)',
  },
  modalEyebrow: {
    fontFamily: 'Inter-ExtraLight',
    fontSize: 12,
    letterSpacing: 1.8,
    textTransform: 'uppercase',
    color: 'rgba(237,232,250,0.52)',
    marginBottom: 8,
  },
  modalTitle: {
    fontFamily: 'CalSans-SemiBold',
    fontSize: 28,
    color: 'rgba(255,255,255,0.96)',
    marginBottom: 6,
  },
  modalSubtitle: {
    fontFamily: 'Inter-ExtraLight',
    fontSize: 14,
    lineHeight: 20,
    color: 'rgba(237,232,250,0.72)',
    marginBottom: 16,
  },
  modalDescription: {
    fontFamily: 'Inter-ExtraLight',
    fontSize: 15,
    lineHeight: 23,
    color: 'rgba(237,232,250,0.9)',
    marginBottom: 22,
  },
  modalCloseButton: {
    alignSelf: 'flex-start',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(237,232,250,0.22)',
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  modalCloseText: {
    fontFamily: 'Inter-ExtraLight',
    fontSize: 14,
    color: 'rgba(255,255,255,0.92)',
  },
});