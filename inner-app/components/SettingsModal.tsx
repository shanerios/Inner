import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  Pressable,
  TextInput,
  ScrollView,
  Switch,
  Platform,
  Linking,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import * as FileSystem from 'expo-file-system';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Typography } from '../core/typography';
import { Typography as _Typography, Body as _Body } from '../core/typography';

const Body = _Body ?? ({ regular: { ..._Typography.body }, subtle: { ..._Typography.caption } } as const);

// ─── Types ───────────────────────────────────────────────────────────────────

export interface SettingsModalProps {
  visible: boolean;
  onClose: () => void;

  // Profile
  profileName: string | null;
  onProfileNameSaved: (name: string | null) => void;

  // Intentions
  onChangeIntentions: () => void;

  // Paywall
  onOpenPaywall: () => void;

  // Inner Pulse
  innerPulseUnlocked: boolean;
  innerPulseEnabled: boolean;
  onInnerPulseToggle: (enabled: boolean) => void;
  weeklyEmbers: number;
  totalEmbers: number;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const AUDIO_CACHE_DIR = `${FileSystem.cacheDirectory}inner_audio/`;

// ─── Component ───────────────────────────────────────────────────────────────

export default function SettingsModal({
  visible,
  onClose,
  profileName,
  onProfileNameSaved,
  onChangeIntentions,
  onOpenPaywall,
  innerPulseUnlocked,
  innerPulseEnabled,
  onInnerPulseToggle,
  weeklyEmbers,
  totalEmbers,
}: SettingsModalProps) {

  // ── Local state ──────────────────────────────────────────────────────────

  const [tempName, setTempName] = useState('');
  const [audioQuality, setAudioQuality] = useState<'low' | 'high'>('high');

  // Cache
  const [cacheEstimateMB, setCacheEstimateMB] = useState<number | null>(null);
  const [isEstimating, setIsEstimating] = useState(false);
  const [isClearing, setIsClearing] = useState(false);
  const [clearedMB, setClearedMB] = useState<number | null>(null);
  const [clearError, setClearError] = useState<string | null>(null);
  const [clearPressCount, setClearPressCount] = useState(0);

  // Sub-modals
  const [showPrivacy, setShowPrivacy] = useState(false);
  const [showClearCache, setShowClearCache] = useState(false);

  // ── Sync state when modal opens ──────────────────────────────────────────

  useEffect(() => {
    if (!visible) return;
    setTempName(profileName ?? '');
    setCacheEstimateMB(null);
    setClearedMB(null);
    setClearError(null);
    setClearPressCount(0);
    estimateAudioCacheMB().catch(() => {});
    AsyncStorage.getItem('audio:quality')
      .then(v => {
        if (v === 'low' || v === 'high') setAudioQuality(v);
      })
      .catch(() => {});
  }, [visible]);

  // ── Cache helpers ────────────────────────────────────────────────────────

  const estimateAudioCacheMB = useCallback(async (): Promise<number | null> => {
    try {
      setIsEstimating(true);

      const dirInfo = await FileSystem.getInfoAsync(AUDIO_CACHE_DIR);
      if (!dirInfo.exists || !dirInfo.isDirectory) {
        setCacheEstimateMB(0);
        return 0;
      }

      const files = await FileSystem.readDirectoryAsync(AUDIO_CACHE_DIR);

      if (__DEV__) {
        console.log('[CACHE] files in dir =', files.length);
      }

      let total = 0;
      const sizes: { name: string; size: number }[] = [];

      for (const name of files) {
        try {
          const info = await FileSystem.getInfoAsync(AUDIO_CACHE_DIR + name);
          if (info.exists && typeof info.size === 'number') {
            total += info.size;
            sizes.push({ name, size: info.size });
          }
        } catch {}
      }

      if (__DEV__ && sizes.length) {
        sizes.sort((a, b) => b.size - a.size);
        console.log(
          '[CACHE] largest files:',
          sizes.slice(0, 8).map(x => ({ name: x.name, mb: +(x.size / 1024 / 1024).toFixed(1) }))
        );
      }

      const mb = Math.round((total / (1024 * 1024)) * 10) / 10;
      setCacheEstimateMB(mb);
      return mb;
    } catch (e) {
      __DEV__ && console.log('[CACHE] estimate error', e);
      setCacheEstimateMB(null);
      return null;
    } finally {
      setIsEstimating(false);
    }
  }, []);

  const clearAudioCache = useCallback(async () => {
    if (isClearing) return;

    __DEV__ && console.log('[CACHE] clearAudioCache() start');
    setIsClearing(true);
    setClearError(null);
    setClearedMB(null);

    try {
      const before = await estimateAudioCacheMB();

      await FileSystem.deleteAsync(AUDIO_CACHE_DIR, { idempotent: true });
      await FileSystem.makeDirectoryAsync(AUDIO_CACHE_DIR, { intermediates: true }).catch(() => {});

      await estimateAudioCacheMB();

      __DEV__ && console.log('[CACHE] clearAudioCache() done');
      setClearedMB(before ?? 0);
      try {
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } catch {}
    } catch (e) {
      __DEV__ && console.log('[CACHE] clear error', e);
      setClearError('Could not clear cache.');
      try {
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      } catch {}
    } finally {
      setIsClearing(false);
    }
  }, [isClearing, estimateAudioCacheMB]);

  // ── Callbacks ────────────────────────────────────────────────────────────

  const saveName = useCallback(async () => {
    const trimmed = tempName.trim();
    try { await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch {}
    if (trimmed.length > 0) {
      try { await AsyncStorage.setItem('profileName', trimmed); } catch {}
      onProfileNameSaved(trimmed);
    } else {
      try { await AsyncStorage.removeItem('profileName'); } catch {}
      onProfileNameSaved(null);
    }
    onClose();
  }, [tempName, onProfileNameSaved, onClose]);

  const setQuality = useCallback(async (q: 'low' | 'high') => {
    try { await Haptics.selectionAsync(); } catch {}
    setAudioQuality(q);
    try { await AsyncStorage.setItem('audio:quality', q); } catch {}
  }, []);

  const handleOpenClearCache = useCallback(() => {
    __DEV__ && console.log('[CACHE] Clear audio cache tapped (settings)');
    // iOS can fail to present a second modal on top of another Modal.
    // Close Settings first, then open the confirm on the next tick.
    onClose();
    requestAnimationFrame(() => {
      setTimeout(() => {
        setShowClearCache(true);
      }, 50);
    });
  }, [onClose]);

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <>
      {/* ── Settings Modal ── */}
      <Modal
        visible={visible}
        transparent
        animationType="fade"
        onDismiss={() => {
          // Paywall after dismiss is handled by the parent via onOpenPaywall
        }}
      >
        <View style={modalStyles.backdrop}>
          {/* Backdrop tap closes settings */}
          <Pressable
            style={StyleSheet.absoluteFillObject}
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel="Close settings"
          />

          {/* Card */}
          <View style={modalStyles.card}>
            <ScrollView
              style={{ maxHeight: '100%' }}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ paddingBottom: 16 }}
            >
              {/* Header */}
              <View style={{ alignItems: 'center', marginBottom: 12 }}>
                <Text style={[Typography.title, { color: '#F0EEF8', fontSize: 20 }]}>
                  Settings
                </Text>
                <Text
                  style={[
                    Typography.caption,
                    {
                      marginTop: 2,
                      fontFamily: 'CalSans-SemiBold',
                      fontSize: 12,
                      letterSpacing: 0.8,
                      textTransform: 'uppercase',
                      color: '#CFC3E0',
                    },
                  ]}
                >
                  General
                </Text>
              </View>

              {/* Name / greeting */}
              <View style={{ marginBottom: 18 }}>
                <Text
                  style={[
                    Body.subtle,
                    {
                      fontFamily: 'Inter-ExtraLight',
                      fontSize: 14,
                      color: '#EDEAF6',
                      textAlign: 'center',
                      marginBottom: 10,
                    },
                  ]}
                >
                  How should Inner address you?
                </Text>

                <View
                  style={{
                    borderRadius: 14,
                    borderWidth: 1,
                    borderColor: 'rgba(255,255,255,0.16)',
                    backgroundColor: 'rgba(8,8,20,0.92)',
                    paddingHorizontal: 14,
                    paddingVertical: 9,
                  }}
                >
                  <TextInput
                    value={tempName}
                    onChangeText={setTempName}
                    placeholder={profileName ? profileName : 'Your name (optional)'}
                    placeholderTextColor="rgba(198,192,230,0.6)"
                    style={{
                      fontFamily: 'Inter-ExtraLight',
                      fontSize: 14,
                      color: '#F4F1FF',
                    }}
                    returnKeyType="done"
                    onSubmitEditing={saveName}
                  />
                </View>
              </View>

              {/* Intentions helper / CTA */}
              <View style={{ marginBottom: 20 }}>
                <TouchableOpacity
                  onPress={onChangeIntentions}
                  accessibilityRole="button"
                  accessibilityLabel="Change intentions"
                  style={{
                    borderRadius: 999,
                    paddingVertical: 10,
                    paddingHorizontal: 14,
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: 'rgba(34,28,68,0.98)',
                    borderWidth: 1,
                    borderColor: 'rgba(207,195,224,0.65)',
                  }}
                >
                  <Text style={{ fontFamily: 'CalSans-SemiBold', fontSize: 14, color: '#F4F1FF' }}>
                    Change intentions
                  </Text>
                </TouchableOpacity>

                <Text
                  style={{
                    fontFamily: 'Inter-ExtraLight',
                    fontSize: 12,
                    color: '#9C96C2',
                    textAlign: 'center',
                    marginTop: 6,
                  }}
                >
                  Intentions shape your Inner experience with soft color guidance
                  and adaptive themes throughout your journey.
                </Text>
              </View>

              {/* Membership / Subscription */}
              <View style={{ marginBottom: 20 }}>
                <TouchableOpacity
                  onPress={onOpenPaywall}
                  accessibilityRole="button"
                  accessibilityLabel="Open Continuing with Inner"
                  accessibilityHint="Opens the membership paywall"
                  style={{
                    borderRadius: 999,
                    paddingVertical: 10,
                    paddingHorizontal: 14,
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: 'rgba(180,140,255,0.16)',
                    borderWidth: 1,
                    borderColor: 'rgba(220,200,255,0.55)',
                  }}
                >
                  <Text style={{ fontFamily: 'CalSans-SemiBold', fontSize: 14, color: '#F4F1FF' }}>
                    Continuing with Inner
                  </Text>
                </TouchableOpacity>
                <Text
                  style={{
                    fontFamily: 'Inter-ExtraLight',
                    fontSize: 11,
                    color: '#9C96C2',
                    textAlign: 'center',
                    marginTop: 6,
                  }}
                >
                  Membership access to Chambers 5–9, all Soundscapes, and future expansions.
                </Text>
              </View>

              {/* Audio Settings */}
              <View style={{ marginBottom: 20 }}>
                <Text
                  style={[
                    Typography.caption,
                    {
                      fontFamily: 'CalSans-SemiBold',
                      fontSize: 13,
                      textAlign: 'center',
                      letterSpacing: 0.6,
                      textTransform: 'uppercase',
                      color: '#CFC3E0',
                      marginBottom: 6,
                    },
                  ]}
                >
                  Audio Settings
                </Text>

                {/* Audio quality pill buttons */}
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                  <TouchableOpacity
                    onPress={() => setQuality('low')}
                    style={{
                      flex: 1,
                      paddingVertical: 8,
                      borderRadius: 999,
                      borderWidth: 1,
                      borderColor: audioQuality === 'low' ? '#CFC3E0' : 'rgba(255,255,255,0.16)',
                      backgroundColor: audioQuality === 'low' ? 'rgba(207,195,224,0.16)' : 'transparent',
                      alignItems: 'center',
                    }}
                  >
                    <Text
                      style={{
                        fontFamily: 'CalSans-SemiBold',
                        fontSize: 13,
                        color: audioQuality === 'low' ? '#F0EEF8' : '#C2BCD8',
                      }}
                    >
                      Low data
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    onPress={() => setQuality('high')}
                    style={{
                      flex: 1,
                      paddingVertical: 8,
                      borderRadius: 999,
                      borderWidth: 1,
                      borderColor: audioQuality === 'high' ? '#CFC3E0' : 'rgba(255,255,255,0.16)',
                      backgroundColor: audioQuality === 'high' ? 'rgba(207,195,224,0.16)' : 'transparent',
                      alignItems: 'center',
                    }}
                  >
                    <Text
                      style={{
                        fontFamily: 'CalSans-SemiBold',
                        fontSize: 13,
                        color: audioQuality === 'high' ? '#F0EEF8' : '#C2BCD8',
                      }}
                    >
                      High quality
                    </Text>
                  </TouchableOpacity>
                </View>

                <Text style={{ fontFamily: 'Inter-ExtraLight', fontSize: 11, color: '#8E88B4' }}>
                  Low data reduces download size. High quality preserves full
                  fidelity for immersive listening.
                </Text>
              </View>

              {/* Audio cache controls */}
              <View style={{ marginBottom: 20 }}>
                <TouchableOpacity
                  onPress={handleOpenClearCache}
                  accessibilityRole="button"
                  accessibilityLabel="Clear downloaded audio"
                  style={{
                    paddingVertical: 8,
                    paddingHorizontal: 14,
                    borderRadius: 999,
                    borderWidth: 1,
                    borderColor: 'rgba(255,255,255,0.20)',
                    alignItems: 'center',
                    backgroundColor: 'rgba(10,10,24,0.98)',
                  }}
                >
                  <Text style={{ fontFamily: 'CalSans-SemiBold', fontSize: 13, color: '#EDEAF6' }}>
                    Clear audio cache
                  </Text>
                </TouchableOpacity>

                <Text
                  style={{
                    fontFamily: 'Inter-ExtraLight',
                    fontSize: 11,
                    textAlign: 'center',
                    color: '#F0EEF8',
                    marginTop: 4,
                  }}
                >
                  {isEstimating
                    ? 'Estimating cache size…'
                    : cacheEstimateMB != null
                    ? `Cache size: ${cacheEstimateMB.toFixed(1)} MB on this device.`
                    : 'Deletes downloaded audio files to free up space on your device.'}
                </Text>
              </View>

              {/* Inner Pulse heartbeat toggle + Ember stats */}
              {innerPulseUnlocked ? (
                <View
                  style={{
                    marginBottom: 20,
                    paddingTop: 14,
                    borderTopWidth: StyleSheet.hairlineWidth,
                    borderTopColor: 'rgba(255,255,255,0.10)',
                  }}
                >
                  <Text
                    style={[
                      Typography.caption,
                      {
                        fontFamily: 'CalSans-SemiBold',
                        fontSize: 13,
                        letterSpacing: 0.6,
                        textAlign: 'center',
                        textTransform: 'uppercase',
                        color: '#CFC3E0',
                        marginBottom: 6,
                      },
                    ]}
                  >
                    Inner Pulse
                  </Text>

                  <View
                    style={{
                      flexDirection: 'row',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      marginBottom: 6,
                    }}
                  >
                    <View style={{ flex: 1, paddingRight: 12 }}>
                      <Text
                        style={[
                          Body.subtle,
                          { fontFamily: 'Inter-ExtraLight', fontSize: 13, color: '#EDEAF6', marginBottom: 2 },
                        ]}
                      >
                        Heartbeat under the orb
                      </Text>
                      <Text
                        style={[
                          Body.subtle,
                          { fontFamily: 'Inter-ExtraLight', fontSize: 12, color: '#9B96B8' },
                        ]}
                      >
                        A subtle pulse unlocked by your daily embers. You can
                        turn it off anytime.
                      </Text>
                    </View>

                    <Switch
                      value={innerPulseEnabled && innerPulseUnlocked}
                      onValueChange={(v) => {
                        if (!innerPulseUnlocked) return;
                        try { Haptics.selectionAsync(); } catch {}
                        onInnerPulseToggle(v);
                      }}
                      trackColor={{ false: 'rgba(255,255,255,0.14)', true: '#CFC3E0' }}
                      thumbColor={innerPulseEnabled && innerPulseUnlocked ? '#1F233A' : '#EDEAF6'}
                    />
                  </View>

                  <Text
                    style={[
                      Body.subtle,
                      { fontFamily: 'CalSans-SemiBold', fontSize: 11, color: '#9189C8' },
                    ]}
                  >
                    This week: {weeklyEmbers} embers · All-time: {totalEmbers}
                  </Text>
                </View>
              ) : null}

              {/* Privacy entry */}
              <View style={{ marginBottom: 8 }}>
                <TouchableOpacity
                  onPress={() => setShowPrivacy(true)}
                  accessibilityRole="button"
                  accessibilityLabel="Open privacy notice"
                  style={{
                    borderRadius: 999,
                    paddingVertical: 9,
                    paddingHorizontal: 18,
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: 'rgba(207,195,224,0.14)',
                    borderWidth: 1,
                    borderColor: 'rgba(255,255,255,0.20)',
                  }}
                >
                  <Text style={{ fontFamily: 'CalSans-SemiBold', fontSize: 13, color: '#F0EEF8' }}>
                    Privacy &amp; Data
                  </Text>
                </TouchableOpacity>
              </View>
            </ScrollView>

            {/* Footer: Save button row */}
            <View style={{ marginTop: 6, flexDirection: 'row', justifyContent: 'flex-end', gap: 12 }}>
              <TouchableOpacity
                onPress={onClose}
                accessibilityRole="button"
                accessibilityLabel="Cancel and close settings"
                style={{ paddingVertical: 8, paddingHorizontal: 16, borderRadius: 999 }}
              >
                <Text style={{ fontFamily: 'CalSans-SemiBold', fontSize: 13, color: '#D0CAE8' }}>
                  Cancel
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={saveName}
                accessibilityRole="button"
                accessibilityLabel="Save settings"
                style={{
                  paddingVertical: 8,
                  paddingHorizontal: 18,
                  borderRadius: 999,
                  backgroundColor: '#CFC3E0',
                  borderWidth: 1,
                  borderColor: 'rgba(255,255,255,0.24)',
                }}
              >
                <Text style={{ fontFamily: 'CalSans-SemiBold', fontSize: 13, color: '#1F233A' }}>
                  Save
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── Privacy Notice Modal ── */}
      <Modal
        visible={showPrivacy}
        transparent
        animationType="fade"
        onRequestClose={() => setShowPrivacy(false)}
      >
        <Pressable style={modalStyles.modalBackdrop} onPress={() => setShowPrivacy(false)}>
          <Pressable onPress={() => { /* capture */ }}>
            <View style={modalStyles.modalCard}>
              <Text style={[Typography.title, { color: '#F0EEF8', textAlign: 'center', marginBottom: 10 }]}>
                Privacy &amp; Data
              </Text>
              <Text style={[Body.subtle, { fontFamily: 'Inter-ExtraLight', color: '#DCD5F0', fontSize: 14, textAlign: 'center' }]}>
                Inner stores your chosen name, intentions, and playback preferences on your device. Audio you play may be cached locally to reduce bandwidth. You can clear cached audio anytime in Settings.
              </Text>
              <Text style={[Body.subtle, { fontFamily: 'Inter-ExtraLight', color: '#B9B5C9', fontSize: 12, textAlign: 'center', marginTop: 8 }]}>
                We don't use third‑party trackers inside the app. See our site for the full policy.
              </Text>
              <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 16, marginTop: 14 }}>
                <TouchableOpacity
                  onPress={async () => {
                    try { await Haptics.selectionAsync(); } catch {}
                    try { await Linking.openURL('https://getinner.app/privacy'); } catch {}
                  }}
                  accessibilityRole="button"
                  accessibilityLabel="Open full privacy policy"
                  style={{ backgroundColor: '#CFC3E0', paddingVertical: 8, paddingHorizontal: 20, borderRadius: 14, borderWidth: 1, borderColor: 'rgba(255,255,255,0.20)' }}
                >
                  <Text style={[Typography.subtle, { color: '#1F233A' }]}>Read full policy</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => setShowPrivacy(false)}
                  accessibilityRole="button"
                  accessibilityLabel="Close privacy notice"
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Text style={{ color: '#F0EEF8', fontSize: 14, opacity: 0.9 }}>Close</Text>
                </TouchableOpacity>
              </View>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* ── Clear Cache Confirmation Modal ── */}
      <Modal
        visible={showClearCache}
        transparent
        animationType="fade"
        onRequestClose={() => setShowClearCache(false)}
      >
        <Pressable style={modalStyles.modalBackdrop} onPress={() => setShowClearCache(false)}>
          <Pressable onPress={() => {}}>
            <View style={[modalStyles.modalCard, { maxHeight: '70%' }]}>
              <Text style={[Typography.title, { color: '#F0EEF8', textAlign: 'center', marginBottom: 8 }]}>
                Clear audio cache?
              </Text>

              <Text style={[Body.subtle, { fontFamily: 'Inter-ExtraLight', color: '#DCD5F0', fontSize: 14, marginBottom: 10, textAlign: 'center' }]}>
                This removes downloaded audio stored on your device. Your content remains available online and can be re-cached when played again.
              </Text>

              <View style={{ alignItems: 'center', marginVertical: 6 }}>
                {isEstimating ? (
                  <Text style={[Body.subtle, { color: '#B9B5C9' }]}>Estimating cache size…</Text>
                ) : (
                  <Text style={[Body.subtle, { color: '#EDEAF6' }]}>
                    {cacheEstimateMB == null ? 'Unable to estimate size.' : `Approx. cached audio: ${cacheEstimateMB} MB`}
                  </Text>
                )}
                {clearedMB != null && (
                  <Text style={[Body.subtle, { color: '#CFC3E0', marginTop: 6 }]}>
                    Cleared ~{clearedMB} MB
                  </Text>
                )}
                {!!clearError && (
                  <Text style={[Body.subtle, { color: '#FFB4B4', marginTop: 6 }]}>{clearError}</Text>
                )}
              </View>

              <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 16, marginTop: 12 }}>
                {clearedMB != null && !isClearing ? (
                  <TouchableOpacity
                    onPress={() => setShowClearCache(false)}
                    accessibilityRole="button"
                    accessibilityLabel="Close"
                    style={{ backgroundColor: '#CFC3E0', paddingVertical: 8, paddingHorizontal: 20, borderRadius: 14, borderWidth: 1, borderColor: 'rgba(255,255,255,0.20)' }}
                  >
                    <Text style={[Typography.subtle, { color: '#1F233A' }]}>Done</Text>
                  </TouchableOpacity>
                ) : (
                  <>
                    <TouchableOpacity
                      onPress={() => setShowClearCache(false)}
                      accessibilityRole="button"
                      accessibilityLabel="Cancel"
                      style={{ paddingVertical: 8, paddingHorizontal: 20, borderRadius: 14, borderWidth: 1, borderColor: 'rgba(255,255,255,0.20)' }}
                    >
                      <Text style={{ color: '#F0EEF8', fontSize: 14, opacity: 0.9 }}>Cancel</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={async () => {
                        if (isClearing) return;
                        setClearPressCount((n) => n + 1);
                        __DEV__ && console.log('[CACHE] onPress fired');
                        try { await Haptics.selectionAsync(); } catch {}
                        try {
                          await clearAudioCache();
                        } catch (e) {
                          __DEV__ && console.log('[CACHE] clearAudioCache() threw', e);
                        }
                      }}
                      onPressIn={() => __DEV__ && console.log('[CACHE] Clear cache pressIn')}
                      accessibilityRole="button"
                      accessibilityLabel="Confirm clear"
                      disabled={isClearing}
                      style={{ backgroundColor: '#CFC3E0', paddingVertical: 8, paddingHorizontal: 20, borderRadius: 14, borderWidth: 1, borderColor: 'rgba(255,255,255,0.20)', opacity: isClearing ? 0.7 : 1 }}
                    >
                      <Text style={[Typography.subtle, { color: '#1F233A' }]}>{isClearing ? 'Clearing…' : 'Clear cache'}</Text>
                    </TouchableOpacity>
                  </>
                )}
              </View>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const modalStyles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(4,4,10,0.82)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  card: {
    width: '92%',
    maxWidth: 460,
    maxHeight: '82%',
    borderRadius: 22,
    paddingHorizontal: 20,
    paddingVertical: 18,
    backgroundColor: 'rgba(16,16,32,0.96)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.16)',
  },
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalCard: {
    width: '84%',
    backgroundColor: 'rgba(18,18,32,0.96)',
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
});
