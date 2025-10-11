import React, { useEffect, useState } from 'react';
import { Pressable, ActivityIndicator, View, Text, Alert } from 'react-native';
import * as Haptics from 'expo-haptics';
import { prefetch, isCached } from '../utils/audioCache';

type Props = {
  remoteUrl: string;
  compact?: boolean;
  onCachedChange?: (cached: boolean) => void;
};

export default function OfflineButton({ remoteUrl, compact, onCachedChange }: Props) {
  const [busy, setBusy] = useState(false);
  const [cached, setCached] = useState(false);

  // initial cache check
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const ok = await isCached(remoteUrl);
        if (mounted) {
          setCached(ok);
          onCachedChange?.(ok);
        }
      } catch {
        // ignore
      }
    })();
    return () => { mounted = false; };
  }, [remoteUrl]);

  async function handlePress() {
    if (busy) return;

    if (cached) {
      // Give explicit feedback if already cached
      Haptics.selectionAsync();
      Alert.alert('Offline', 'Already available offline.');
      return;
    }

    try {
      setBusy(true);
      const ok = await prefetch(remoteUrl);
      setBusy(false);
      setCached(ok);
      onCachedChange?.(ok);
      if (ok) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } else {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        Alert.alert('Download failed', 'Please check your connection and try again.');
      }
    } catch {
      setBusy(false);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert('Download failed', 'Please check your connection and try again.');
    }
  }

  const baseStyles = {
    paddingHorizontal: compact ? 10 : 14,
    paddingVertical: compact ? 6 : 10,
    borderRadius: 999,
    alignSelf: 'flex-start' as const,
    backgroundColor: cached ? '#213d2b' : '#1b1e33',
    borderWidth: 1,
    borderColor: cached ? '#3ddc84' : '#3a3f6b',
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 8,
    opacity: busy ? 0.7 : 1,
  };

  return (
    <Pressable onPress={handlePress} style={baseStyles}>
      {busy ? (
        <ActivityIndicator size="small" />
      ) : (
        <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: cached ? '#3ddc84' : '#9aa0ff' }} />
      )}
      <Text style={{ color: '#e6e8ff', fontSize: compact ? 12 : 14 }}>
        {cached ? 'Available offline' : 'Make available offline'}
      </Text>
    </Pressable>
  );
}