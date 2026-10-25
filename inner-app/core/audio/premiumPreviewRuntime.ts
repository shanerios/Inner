import { useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  clearMembershipCache,
  resolveMembership,
} from '../../src/core/subscriptions/membership';
import { PREVIEW_STORAGE_KEY, type PreviewWorld } from './premiumPreview';
import { PreviewService, type PreviewHost, type PreviewReview, type PreviewSnapshot } from './premiumPreviewService';
import type { ProceduralPlaybackSession } from './proceduralSession';

/**
 * One allowance shared by Live Mix and the chamber mixer. The service is a
 * process singleton, so leaving a screen never resets remaining time.
 */
export const previewService = new PreviewService({
  readStored: () => AsyncStorage.getItem(PREVIEW_STORAGE_KEY),
  writeStored: value => AsyncStorage.setItem(PREVIEW_STORAGE_KEY, value),
  now: () => Date.now(),
  setTimer: (fn, ms) => setTimeout(fn, ms),
  clearTimer: handle => clearTimeout(handle as ReturnType<typeof setTimeout>),
  membership: () => resolveMembership(),
});

const hosts = new WeakMap<ProceduralPlaybackSession, PreviewHost>();

/** A stable host per session. The service compares hosts by identity. */
export function previewHostFor(session: ProceduralPlaybackSession): PreviewHost {
  let host = hosts.get(session);
  if (!host) {
    host = {
      getConfig: () => session.getConfig(),
      isPlaying: () => session.isPlaying(),
      ownsEngine: () => session.ownsEngine(),
      update: patch => session.update(patch),
    };
    hosts.set(session, host);
  }
  return host;
}

export type PreviewPresentation = {
  /** Label shown on each premium environment pill. Null means no label (members, or no premium worlds). */
  labelFor(world: PreviewWorld): string | null;
  /** One explanatory line shown before and during previews. Null when nothing needs explaining. */
  note: string | null;
};

const WORLD_NAMES: Record<PreviewWorld, string> = {
  temple: 'Temple',
  abyssal: 'Abyssal Glass',
  cosmic: 'Cosmic',
  fire: 'Fire',
};

export function formatPreviewTime(ms: number): string {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

/** Derives pill labels and the explanatory note from a snapshot. Members see neither. */
export function presentPreview(snapshot: PreviewSnapshot): PreviewPresentation {
  const member = snapshot.membership === 'member';
  const labelFor = (world: PreviewWorld): string | null => {
    if (member || !snapshot.loaded) return null;
    const remaining = snapshot.remainingMs[world];
    if (remaining <= 0) return 'Full Experience';
    if (snapshot.usedMs[world] === 0 && !snapshot.charging.includes(world)) return 'Preview · 5 minutes';
    return `Preview · ${formatPreviewTime(remaining)} left`;
  };
  return {
    labelFor,
    note: member || !snapshot.loaded
      ? null
      : 'Temple, Abyssal Glass, Cosmic, and Fire preview for 5 minutes each, shared by Live Mix and the chamber mixer. A world fades out when its time ends.',
  };
}

export type PreviewNotice = {
  text: string;
  action: { label: string; kind: 'membership' | 'retry' };
};

/** The message for a denied change. Verification failures never claim non-membership. */
export function noticeFor(review: PreviewReview): PreviewNotice | null {
  if (!review.reason) return null;
  const world = review.denied[0];
  const name = world ? WORLD_NAMES[world] : 'This world';
  if (review.reason === 'verification_failed') {
    return {
      text: `We couldn't confirm Full Experience just now, so ${name} can't start. Check your connection and try again.`,
      action: { label: 'Try again', kind: 'retry' },
    };
  }
  return {
    text: `Your 5-minute preview of ${name} has ended. Full Experience keeps every world open.`,
    action: { label: 'Full Experience', kind: 'membership' },
  };
}

/** Re-checks membership after a retry, bypassing the confirmed-result cache. */
export async function retryPreviewMembership(): Promise<void> {
  clearMembershipCache();
  await previewService.refreshMembership();
}

export function usePreviewSnapshot(): PreviewSnapshot {
  const [snapshot, setSnapshot] = useState(() => previewService.snapshot());
  useEffect(() => {
    setSnapshot(previewService.snapshot());
    return previewService.subscribe(() => setSnapshot(previewService.snapshot()));
  }, []);
  return snapshot;
}

