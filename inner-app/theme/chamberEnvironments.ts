

export type ChamberEnvId =
  | 'chamber_one'
  | 'chamber_two'
  | 'chamber_three'
  | 'chamber_four'
  | 'chamber_five'
  | 'chamber_six'
  | 'chamber_seven'
  | 'chamber_eight'
  | 'chamber_nine';

export type ChamberEnvironment = {
  id: ChamberEnvId;
  title: string;
  /** UI accent (buttons, focus ring, sliders) */
  accent: string; // hex
  /** Optional: stronger/softer blur when used as fullscreen bg */
  blurIntensity?: number; // 0–100 (expo-blur baseline)
  /** Optional: dark overlay on top of the image to keep UI readable */
  overlayOpacity?: number; // 0–1
};

export const CHAMBER_ENVIRONMENTS: Record<ChamberEnvId, ChamberEnvironment> = {
  chamber_one: {
    id: 'chamber_one',
    title: 'Outer Sanctum',
    accent: '#E2E8F0', // soft pearl
    blurIntensity: 30,
    overlayOpacity: 0.25,
  },
  chamber_two: {
    id: 'chamber_two',
    title: 'Inner Flame',
    accent: '#F97316', // ember orange
    blurIntensity: 28,
    overlayOpacity: 0.30,
  },
  chamber_three: {
    id: 'chamber_three',
    title: 'Horizon Gate',
    accent: '#6366F1', // indigo
    blurIntensity: 28,
    overlayOpacity: 0.30,
  },
  chamber_four: {
    id: 'chamber_four',
    title: 'Resonance Field',
    accent: '#22C55E', // rainforest green
    blurIntensity: 26,
    overlayOpacity: 0.30,
  },
  chamber_five: {
    id: 'chamber_five',
    title: 'Remembrance Code',
    accent: '#14B8A6', // teal
    blurIntensity: 26,
    overlayOpacity: 0.30,
  },
  chamber_six: {
    id: 'chamber_six',
    title: 'Transcendence Veil',
    accent: '#A855F7', // violet
    blurIntensity: 32,
    overlayOpacity: 0.35,
  },
  chamber_seven: {
    id: 'chamber_seven',
    title: 'Return to Light',
    accent: '#FDE68A', // light gold
    blurIntensity: 24,
    overlayOpacity: 0.25,
  },
  chamber_eight: {
    id: 'chamber_eight',
    title: 'Free Flow Corridor',
    accent: '#60A5FA', // sky
    blurIntensity: 24,
    overlayOpacity: 0.28,
  },
  chamber_nine: {
    id: 'chamber_nine',
    title: 'Inquiry Gate (The Mirror)',
    accent: '#94A3B8', // slate
    blurIntensity: 30,
    overlayOpacity: 0.35,
  },
};

export const chamberEnvironments = CHAMBER_ENVIRONMENTS;

/** Safe getter with fallback (useful while assets are being added) */
export function getChamberEnv(envId: ChamberEnvId): ChamberEnvironment {
  const env = CHAMBER_ENVIRONMENTS[envId];
  if (env) return env;
  return CHAMBER_ENVIRONMENTS.chamber_one;
}

/**
 * If your TRACK ids differ from these env ids, create a small map here.
 * Otherwise, you can pass trackId casted as ChamberEnvId when it's a chamber.
 */
export function chamberEnvForTrack(trackId: string): ChamberEnvironment | null {
  const normalized = trackId as ChamberEnvId;
  return CHAMBER_ENVIRONMENTS[normalized] ?? null;
}
