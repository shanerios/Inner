// src/lunar/LunarWhisperModal.tsx
import React from 'react';
import { Modal, View, Text, TouchableOpacity, StyleSheet, ImageBackground } from 'react-native';
import * as Haptics from 'expo-haptics';
import type { MoonPhase } from '../../utils/lunar';
import { lunarMeanings } from './lunarMeanings';
import { lunarLore } from './lunarLore';

type Props = {
  visible: boolean;
  phase: MoonPhase;
  onClose: () => void;
  onReflect?: () => void; // optional: jump to Journal
};

export default function LunarWhisperModal({ visible, phase, onClose, onReflect }: Props) {
  const data = lunarMeanings[phase];
  const lore = lunarLore[phase];

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <ImageBackground
          source={require('../../assets/images/moon_modal.png')}
          style={styles.tabletContainer}
          imageStyle={styles.tabletImage}
        >
          <View style={styles.tabletInner}>
            {/* Moon phase title */}
            <Text style={styles.moonTitle}>
              {phase.replace('-', ' ')} · {data.title}
            </Text>
            <Text style={styles.moonSubtitle}>{data.summary}</Text>

            <View style={styles.divider} />

            <Text style={styles.sectionLabel}>RITUAL</Text>
            <Text style={styles.bodyText}>{data.ritualTip}</Text>

            <Text style={styles.sectionLabel}>AFFIRMATION</Text>
            <Text style={styles.bodyText}>"{data.affirmation}"</Text>

            {lore && (
              <>
                <Text style={styles.sectionLabel}>LORE</Text>
                <Text style={styles.bodyText}>{lore}</Text>
              </>
            )}

            <View style={styles.buttonRow}>
              <TouchableOpacity
                onPress={async () => { try { await Haptics.selectionAsync(); } catch {} onClose(); }}
                accessibilityRole="button"
                accessibilityLabel="Close lunar guidance"
                style={styles.closeButton}
              >
                <Text style={styles.closeButtonText}>Close</Text>
              </TouchableOpacity>

              {onReflect && (
                <TouchableOpacity
                  onPress={async () => { try { await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch {} onReflect(); }}
                  accessibilityRole="button"
                  accessibilityLabel="Open Journal to reflect"
                  style={styles.reflectButton}
                >
                  <Text style={styles.reflectButtonText}>Reflect</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        </ImageBackground>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.88)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingBottom: '25%',
  },
  tabletContainer: {
    width: '92%',
    aspectRatio: 0.68,
    justifyContent: 'center',
    alignItems: 'center',
  },
  tabletImage: {
    resizeMode: 'contain',
    alignSelf: 'center',
    left: 12,
  },
  tabletInner: {
    width: '72%',
    height: '80%',
    maxWidth: 240,
    alignSelf: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  moonTitle: {
    color: 'rgba(220,185,100,0.95)',
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
    letterSpacing: 0.5,
    fontFamily: 'CalSans-SemiBold',
    textTransform: 'capitalize',
  },
  moonSubtitle: {
    color: 'rgba(255,255,255,0.65)',
    fontSize: 12,
    textAlign: 'center',
    lineHeight: 18,
    fontFamily: 'Inter-ExtraLight',
  },
  divider: {
    height: 1,
    backgroundColor: 'rgba(180,140,80,0.2)',
    marginVertical: 4,
  },
  sectionLabel: {
    color: 'rgba(200,160,80,0.95)',
    fontSize: 9,
    letterSpacing: 2,
    textTransform: 'uppercase',
    marginTop: 6,
    textAlign: 'center',
    fontFamily: 'CalSans-SemiBold',
  },
  bodyText: {
    color: 'rgba(255,255,255,0.75)',
    fontSize: 12,
    lineHeight: 17,
    fontFamily: 'Inter-ExtraLight',
  },
  buttonRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 12,
    gap: 10,
  },
  closeButton: {
    flex: 1,
    paddingVertical: 9,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    borderRadius: 4,
  },
  closeButtonText: {
    color: 'rgba(255,255,255,0.35)',
    fontSize: 12,
    fontFamily: 'Inter-ExtraLight',
  },
  reflectButton: {
    flex: 1,
    paddingVertical: 9,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(200,160,80,0.6)',
    backgroundColor: 'rgba(180,140,80,0.15)',
    borderRadius: 4,
  },
  reflectButtonText: {
    color: 'rgba(220,185,100,1)',
    fontSize: 12,
    fontFamily: 'CalSans-SemiBold',
  },
});
