import React from 'react';
import { Image, Platform, StyleSheet, View, type ImageStyle } from 'react-native';
import * as Device from 'expo-device';
import {
  VideoView as ExpoVideoView,
  useVideoPlayer as useExpoVideoPlayer,
  type VideoPlayer,
  type VideoSource,
} from 'expo-video';
import { useFocusEffect, useIsFocused, useRoute } from '@react-navigation/native';
import * as Sentry from '@sentry/react-native';

const GIB = 1024 * 1024 * 1024;

/**
 * Decoder-backed backgrounds are the largest repeatable allocation in the app.
 * Keep the cutoff intentionally conservative: devices around 6 GB and below can
 * still receive a 256 MB app heap, as seen in production.
 */
export const usesStaticBackgrounds =
  Platform.OS === 'android' &&
  ((Device.totalMemory != null && Device.totalMemory <= 6 * GIB) ||
    (Device.deviceYearClass != null && Device.deviceYearClass <= 2021));

type StaticSource = React.ComponentProps<typeof Image>['source'];

const STATIC_BACKGROUNDS = new Map<VideoSource, StaticSource>([
  [require('../assets/videos/archive_bg.mp4'), require('../assets/static-backgrounds/archive_bg.webp')],
  [require('../assets/videos/arrive_bg.mp4'), require('../assets/static-backgrounds/arrive_bg.webp')],
  [require('../assets/videos/chamber_eight_bg.mp4'), require('../assets/static-backgrounds/chamber_eight_bg.webp')],
  [require('../assets/videos/chamber_five_bg.mp4'), require('../assets/static-backgrounds/chamber_five_bg.webp')],
  [require('../assets/videos/chamber_four_bg.mp4'), require('../assets/static-backgrounds/chamber_four_bg.webp')],
  [require('../assets/videos/chamber_nine_bg.mp4'), require('../assets/static-backgrounds/chamber_nine_bg.webp')],
  [require('../assets/videos/chamber_one_bg.mp4'), require('../assets/static-backgrounds/chamber_one_bg.webp')],
  [require('../assets/videos/chamber_seven_bg.mp4'), require('../assets/static-backgrounds/chamber_seven_bg.webp')],
  [require('../assets/videos/chamber_six_bg.mp4'), require('../assets/static-backgrounds/chamber_six_bg.webp')],
  [require('../assets/videos/chamber_three_bg.mp4'), require('../assets/static-backgrounds/chamber_three_bg.webp')],
  [require('../assets/videos/chamber_two_bg.mp4'), require('../assets/static-backgrounds/chamber_two_bg.webp')],
  [require('../assets/videos/clean_slate_bg.mp4'), require('../assets/static-backgrounds/clean_slate_bg.webp')],
  [require('../assets/videos/dream_journal_bg.mp4'), require('../assets/static-backgrounds/dream_journal_bg.webp')],
  [require('../assets/videos/essence_bg.mp4'), require('../assets/static-backgrounds/essence_bg.webp')],
  [require('../assets/videos/garden_bg.mp4'), require('../assets/static-backgrounds/garden_bg.webp')],
  [require('../assets/videos/garden_player.mp4'), require('../assets/static-backgrounds/garden_player.webp')],
  [require('../assets/videos/guardian_screen.mp4'), require('../assets/static-backgrounds/guardian_screen.webp')],
  [require('../assets/videos/inner_flame_bg.mp4'), require('../assets/static-backgrounds/inner_flame_bg.webp')],
  [require('../assets/videos/intentions_bg.mp4'), require('../assets/static-backgrounds/intentions_bg.webp')],
  [require('../assets/videos/intro_revamp.mp4'), require('../assets/static-backgrounds/intro_revamp.webp')],
  [require('../assets/videos/paywall_bg.mp4'), require('../assets/static-backgrounds/paywall_bg.webp')],
  [require('../assets/videos/point_zero_bg.mp4'), require('../assets/static-backgrounds/point_zero_bg.webp')],
  [require('../assets/videos/settings_bg.mp4'), require('../assets/static-backgrounds/settings_bg.webp')],
  [require('../assets/images/home_revamp.mp4'), require('../assets/static-backgrounds/home_revamp.webp')],
  [require('../assets/images/splash-intro.mp4'), require('../assets/static-backgrounds/splash-intro.webp')],
  [require('../assets/images/chamber_revamp.mp4'), require('../assets/static-backgrounds/chamber_revamp.webp')],
]);

type PlayerMetadata = {
  enabled: boolean;
  focused: boolean;
  staticSource?: StaticSource;
};

const playerMetadata = new WeakMap<VideoPlayer, PlayerMetadata>();
let activeVideoSources = 0;

type MemorySafeVideoOptions = {
  /** Use for carousel pages or conditionally visible modals within a focused route. */
  enabled?: boolean;
  /** Backgrounds autoplay by default after their source is restored. */
  autoplay?: boolean;
};

function breadcrumb(message: string, screen: string, data?: Record<string, unknown>) {
  Sentry.addBreadcrumb({
    category: 'media.lifecycle',
    level: 'info',
    message,
    data: { screen, activeVideoSources, ...data },
  });
}

/** Drop the decoder on blur instead of merely pausing it. The hook-owned player
 * itself is released by Expo on unmount. */
export function useVideoPlayer(
  source: VideoSource,
  setup?: (player: VideoPlayer) => void,
  options: MemorySafeVideoOptions = {}
): VideoPlayer {
  const focused = useIsFocused();
  const route = useRoute();
  const player = useExpoVideoPlayer(null, setup);
  const staticSource = STATIC_BACKGROUNDS.get(source);
  const enabled = options.enabled ?? true;
  const autoplay = options.autoplay ?? true;

  playerMetadata.set(player, { enabled, focused, staticSource });

  useFocusEffect(
    React.useCallback(() => {
      if (!source || !enabled || usesStaticBackgrounds) {
        breadcrumb(usesStaticBackgrounds ? 'static background active' : 'empty video source', route.name);
        return () => {};
      }

      let cancelled = false;
      void player.replaceAsync(source).then(() => {
        if (cancelled) {
          void player.replaceAsync(null).catch(() => {});
          return;
        }
        activeVideoSources += 1;
        if (autoplay) player.play();
        breadcrumb('video source loaded', route.name);
      }).catch((error) => {
        Sentry.captureException(error, { tags: { subsystem: 'video-lifecycle', screen: route.name } });
      });

      return () => {
        cancelled = true;
        try { player.pause(); } catch {}
        void player.replaceAsync(null).catch(() => {});
        activeVideoSources = Math.max(0, activeVideoSources - 1);
        breadcrumb('video source released', route.name);
      };
    }, [autoplay, enabled, player, route.name, source])
  );

  return player;
}

/** API-compatible wrapper, allowing existing screens to gain static fallback
 * rendering without duplicating lifecycle code. */
export function VideoView(props: React.ComponentProps<typeof ExpoVideoView>) {
  const metadata = playerMetadata.get(props.player);

  if (metadata && (!metadata.enabled || !metadata.focused)) {
    return <View style={[styles.empty, props.style]} />;
  }

  if (usesStaticBackgrounds && metadata?.staticSource) {
    return <Image source={metadata.staticSource} style={props.style as ImageStyle} resizeMode="cover" />;
  }

  return <ExpoVideoView {...props} />;
}

const styles = StyleSheet.create({
  empty: { backgroundColor: '#0d0d1a' },
});

export function initializeMemoryTelemetry() {
  Sentry.setTag('memory.static_backgrounds', String(usesStaticBackgrounds));
  Sentry.setContext('memory_profile', {
    totalMemoryBytes: Device.totalMemory,
    deviceYearClass: Device.deviceYearClass,
    staticBackgrounds: usesStaticBackgrounds,
  });
}

export type { VideoPlayer, VideoSource } from 'expo-video';
