import { chamberReleaseManifest } from "./chamberReleaseManifest";

export function isReleased(
  release: { isPublished: boolean; releaseDate?: string | null },
  now = new Date()
) {
  if (!release.isPublished) return false;
  if (!release.releaseDate) return true;
  return new Date(release.releaseDate).getTime() <= now.getTime();
}

export function isChamberReleased(chamberId: string, now = new Date()) {
  const chamber = chamberReleaseManifest[chamberId];
  if (!chamber) return false;
  return isReleased(chamber, now);
}

export function getVisibleChambers(now = new Date()) {
  return Object.values(chamberReleaseManifest).filter((item) =>
    isReleased(item, now)
  );
}

export function getReleaseCountdownLabel(
  releaseDate?: string | null,
  now = new Date()
) {
  if (!releaseDate) return null;

  const target = new Date(releaseDate);
  const diffMs = target.getTime() - now.getTime();

  if (diffMs <= 0) return null;

  const dayMs = 24 * 60 * 60 * 1000;
  const days = Math.ceil(diffMs / dayMs);

  if (days === 1) return 'Arrives tomorrow';
  if (days <= 7) return `Arrives in ${days} days`;

  return `Arrives ${target.toLocaleDateString(undefined, {
    month: 'long',
    day: 'numeric',
  })}`;
}