import { DEEPER_CATEGORY } from "./constants";

type AnyTrack = {
  id: string;
  type?: "soundscape" | "chamber" | string;
  category?: string;
  isPremium?: boolean;
};

export function isLockedTrack(track: AnyTrack, hasMembership: boolean) {
  if (hasMembership) return false;

  // Soundscapes: deeper category
  if (track.category === DEEPER_CATEGORY) return true;

  // Chambers: premium flag
  if (track.isPremium) return true;

  return false;
}

export function lockReason(track: AnyTrack) {
  if (track.category === DEEPER_CATEGORY) return "deeper";
  if (track.isPremium) return "premium";
  return "unknown";
}