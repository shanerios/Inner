// components/SoundscapeCardList.tsx
import React from 'react';
import { View, StyleSheet, ImageSourcePropType, ScrollView } from 'react-native';
import SoundscapeCard from './SoundscapeCard';
import ClaritySigil from '../assets/sigils/clarity.svg';
import StillnessSigil from '../assets/sigils/stillness.svg';
import RenewalSigil from '../assets/sigils/renewal.svg';
import TonesSigil from '../assets/sigils/tones.svg';
import NoiseSigil from '../assets/sigils/noise.svg';

type Category = {
  key: 'stillness' | 'clarity' | 'renewal' | 'tones' | 'noise';
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
    colors: ['#1D4D2E', '#CFC16C'],           // green → gold
    subtitle: 'Healing • Energy • Rebirth',
    sigil: <RenewalSigil width={48} height={48} />,
  },
  {
    key: 'tones',
    label: 'Tones',
    colors: ['#2A1E5C', '#8A5CF6'],           // deep indigo → soft violet
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
  spacing?: number;           // vertical gap between cards
};

export default function SoundscapeCardList({
  onSelectCategory,
  spacing = 12,
}: Props) {
  return (
    <View style={[styles.list, { height: '100%' }]}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ gap: spacing, paddingBottom: 12 }}
      >
        {CATEGORIES.map((cat) => (
          <SoundscapeCard
            key={cat.key}
            label={cat.label}
            colors={cat.colors}
            subtitle={cat.subtitle}
            sigil={cat.sigil}
            showArrow={true}
            onPress={() => onSelectCategory?.(cat.key)}
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