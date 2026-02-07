

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
  /** Local static asset. Prefer WebP/PNG in assets/images/chambers */
  backgroundImage: number; // require() result
  /** UI accent (buttons, focus ring, sliders) */
  accent: string; // hex
  /** Optional: stronger/softer blur when used as fullscreen bg */
  blurIntensity?: number; // 0–100 (expo-blur baseline)
  /** Optional: dark overlay on top of the image to keep UI readable */
  overlayOpacity?: number; // 0–1
};

/**
 * NOTE: Replace the require() paths with your real images.
 * Keep files small (<= 200–400 KB) and visually soft/ambient.
 */
export const CHAMBER_ENVIRONMENTS: Record<ChamberEnvId, ChamberEnvironment> = {
  chamber_one: {
    id: 'chamber_one',
    title: 'Outer Sanctum',
    backgroundImage: require('../assets/images/chambers/outer_sanctum.webp'),
    accent: '#E2E8F0', // soft pearl
    blurIntensity: 30,
    overlayOpacity: 0.25,
  },
  chamber_two: {
    id: 'chamber_two',
    title: 'Inner Flame',
    backgroundImage: require('../assets/images/chambers/inner_flame.webp'),
    accent: '#F97316', // ember orange
    blurIntensity: 28,
    overlayOpacity: 0.30,
  },
  chamber_three: {
    id: 'chamber_three',
    title: 'Horizon Gate',
    backgroundImage: require('../assets/images/chambers/horizon_gate.webp'),
    accent: '#6366F1', // indigo
    blurIntensity: 28,
    overlayOpacity: 0.30,
  },
  chamber_four: {
    id: 'chamber_four',
    title: 'Resonance Field',
    backgroundImage: require('../assets/images/chambers/resonance_field.webp'),
    accent: '#22C55E', // rainforest green
    blurIntensity: 26,
    overlayOpacity: 0.30,
  },
  chamber_five: {
    id: 'chamber_five',
    title: 'Remembrance Code',
    backgroundImage: require('../assets/images/chambers/remembrance_code.webp'),
    accent: '#14B8A6', // teal
    blurIntensity: 26,
    overlayOpacity: 0.30,
  },
  chamber_six: {
    id: 'chamber_six',
    title: 'Transcendence Veil',
    backgroundImage: require('../assets/images/chambers/transcendence_veil.webp'),
    accent: '#A855F7', // violet
    blurIntensity: 32,
    overlayOpacity: 0.35,
  },
  chamber_seven: {
    id: 'chamber_seven',
    title: 'Return to Light',
    backgroundImage: require('../assets/images/chambers/return_to_light.webp'),
    accent: '#FDE68A', // light gold
    blurIntensity: 24,
    overlayOpacity: 0.25,
  },
  chamber_eight: {
    id: 'chamber_eight',
    title: 'Free Flow Corridor',
    backgroundImage: require('../assets/images/chambers/free_flow_corridor.webp'),
    accent: '#60A5FA', // sky
    blurIntensity: 24,
    overlayOpacity: 0.28,
  },
  chamber_nine: {
    id: 'chamber_nine',
    title: 'Inquiry Gate (The Mirror)',
    backgroundImage: require('../assets/images/chambers/inquiry_gate.webp'),
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
  // Fallback to a neutral environment (Outer Sanctum)
  return CHAMBER_ENVIRONMENTS.chamber_one;
}

/**
 * If your TRACK ids differ from these env ids, create a small map here.
 * Otherwise, you can pass trackId casted as ChamberEnvId when it’s a chamber.
 */
export function chamberEnvForTrack(trackId: string): ChamberEnvironment | null {
  const normalized = trackId as ChamberEnvId;
  return CHAMBER_ENVIRONMENTS[normalized] ?? null;
}