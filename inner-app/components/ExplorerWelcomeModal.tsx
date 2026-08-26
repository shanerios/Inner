// components/ExplorerWelcomeModal.tsx
//
// Shown once per install to users who arrive via the Littlest Explorer QR
// deferred deep link. Reuses LunarWhisperModal's tablet background/chrome
// (src/lunar/LunarWhisperModal.tsx) for visual consistency with the app's
// other "mythic moment" modals.
import React from 'react';
import { Modal, View, Text, TouchableOpacity, StyleSheet, ImageBackground } from 'react-native';
import * as Haptics from 'expo-haptics';
import LottieView from 'lottie-react-native';

type Props = {
  visible: boolean;
  onClose: () => void;
};

export default function ExplorerWelcomeModal({ visible, onClose }: Props) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <ImageBackground
          source={require('../assets/images/moon_modal.png')}
          style={styles.tabletContainer}
          imageStyle={styles.tabletImage}
        >
          <View style={styles.tabletInner}>
            <Text style={styles.title}>Welcome, Explorer!</Text>

            <View style={styles.middleBlock}>
              <Text style={styles.unlockedText}>Your soundscapes are now unlocked!</Text>

              <Text style={styles.bodyText}>
                Follow the adventure with handpicked, sleepy sounds for your Little Explorer during bed time.
              </Text>

              <Text style={styles.noteText}>
                All soundscapes loop seamlessly to aid your Little Explorer in a restful sleep
              </Text>
            </View>

            <TouchableOpacity
              onPress={async () => {
                try { await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch {}
                onClose();
              }}
              accessibilityRole="button"
              accessibilityLabel="Enter Explorer's Grove"
              style={styles.enterButton}
            >
              <Text style={styles.enterButtonText}>Enter the Grove</Text>
            </TouchableOpacity>
          </View>
        </ImageBackground>

        {/* Rendered after the tablet so fireflies drift in front, not lost behind it */}
        <View style={StyleSheet.absoluteFill} pointerEvents="none" accessible={false}>
          <LottieView
            source={require('../assets/animations/explorers-grove-fireflies.json')}
            autoPlay
            loop
            speed={1}
            resizeMode="cover"
            style={[StyleSheet.absoluteFill, { opacity: 0.9 }]}
          />
        </View>
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
    justifyContent: 'space-between',
    paddingTop: 60,
    paddingBottom: 50,
  },
  title: {
    color: 'rgba(255,221,150,1)',
    fontSize: 18,
    fontWeight: '600',
    textAlign: 'center',
    letterSpacing: 0.5,
    fontFamily: 'CalSans-SemiBold',
  },
  middleBlock: {
    gap: 10,
  },
  unlockedText: {
    color: 'rgba(240,238,248,0.95)',
    fontSize: 15,
    fontWeight: '600',
    fontFamily: 'CalSans-SemiBold',
    textAlign: 'center',
  },
  bodyText: {
    color: 'rgba(255,255,255,0.75)',
    fontSize: 12,
    lineHeight: 17,
    fontFamily: 'Inter-ExtraLight',
    textAlign: 'center',
    marginTop: 6,
  },
  noteText: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 10,
    lineHeight: 14,
    fontFamily: 'Inter-ExtraLight',
    fontStyle: 'italic',
    textAlign: 'center',
  },
  enterButton: {
    alignSelf: 'center',
    width: '82%',
    paddingVertical: 9,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(200,160,80,0.6)',
    backgroundColor: 'rgba(180,140,80,0.15)',
    borderRadius: 4,
  },
  enterButtonText: {
    color: 'rgba(240,238,248,0.95)',
    fontSize: 16,
    fontFamily: 'CalSans-SemiBold',
  },
});
