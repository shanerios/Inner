// data/tracks.ts
export type TrackKind = 'soundscape' | 'chamber';

export type TrackMeta = {
  id: string;
  title: string;
  artist?: string;
  kind: TrackKind;
  loop?: boolean;          // override default if needed
  local: any;              // require(...) asset
  remote?: string;         // remote URL asset
  durationHintMs?: number; // optional, for predisplay
  category?: string;       // add category for grouping (e.g. 'tones')
};

export const TRACKS: TrackMeta[] = [
  {
    id: 'harmonic_resonance',
    title: 'Harmonic Resonance',
    description: 'A powerful, yet calming journey of frequencies that harmonize mind and body. Center your focus and embrace inner balance as you ascend into deep clarity.',
    kind: 'soundscape',
    loop: true,
    /** TEMP: using preview file until full-length asset is added */
    remote: 'https://f005.backblazeb2.com/file/inner-audio/Soundscapes/Harmonic_Resonance-64k.m4a',
    category: 'stillness',
    durationHintMs: 60 * 60 * 1000,
  },

  {
    id: 'deep_focus',
    title: 'Deep Focus',
    description: 'Immerse yourself in a soundscape designed to enhance concentration and mental clarity.',
    kind: 'soundscape',
    loop: true,
    remote: 'https://f005.backblazeb2.com/file/inner-audio/Soundscapes/Deep_Focus-64k.m4a',
    category: 'clarity',
    durationHintMs: 10 * 60 * 1000,

  },

  {
    id: 'yoga_movement',
    title: 'Yoga & Movement',
    description: 'A dynamic soundscape to accompany your yoga practice or movement flow, enhancing body awareness and rhythm.',
    kind: 'soundscape',
    loop: true,
    remote: 'https://f005.backblazeb2.com/file/inner-audio/Soundscapes/Yoga_and_Movement-64k.m4a',
    category: 'clarity',
    durationHintMs: 10 * 60 * 1000,
  },

  {
    id: 'calm_presence',
    title: 'Calm Presence',
    description: 'A tranquil soundscape to cultivate mindfulness and presence, helping you find calm in the moment.',
    kind: 'soundscape',
    loop: true,
    remote: 'https://f005.backblazeb2.com/file/inner-audio/Soundscapes/Calm_Presence-64k.m4a',
    category: 'renewal',
    durationHintMs: 10 * 60 * 1000,
  },

  {
    id: 'chamber_one',
    title: 'Chamber One: Outer Sanctum',
    kind: 'chamber',
    loop: false,
    durationHintMs: 30 * 60 * 1000, // adjust if you know exact
    local: require('../assets/audio/Chambers/Chamber1_Guided_AI-64k.m4a'),
  },

  {
    id: 'chamber_two',
    title: 'Chamber Two: Inner Flame',
    kind: 'chamber',
    loop: false,
    durationHintMs: 30 * 60 * 1000, // adjust if exact length is known
    local: require('../assets/audio/Chambers/Chamber2_guided-64k.m4a'),
  },
  {
    id: 'chamber_three',
    title: 'Chamber Three: Horizon Gate',
    kind: 'chamber',
    loop: false,
    durationHintMs: 30 * 60 * 1000, // adjust if exact length is known
    local: require('../assets/audio/Chambers/Chamber3_guided-64k.m4a'),
  },

  // --- Tone frequency tracks ---
  {
    id: 'tone_174',
    title: '174 Hz – Deep Relaxation',
    kind: 'soundscape',
    loop: true,
    local: require('../assets/audio/Tones/174hz.m4a'),
    category: 'tones',
    durationHintMs: 5 * 60 * 1000,
  },
  {
    id: 'tone_285',
    title: '285 Hz – Healing Presence',
    kind: 'soundscape',
    loop: true,
    local: require('../assets/audio/Tones/285hz.m4a'),
    category: 'tones',
    durationHintMs: 5 * 60 * 1000,
  },
  {
    id: 'tone_396',
    title: '396 Hz – Liberating Guilt & Fear',
    kind: 'soundscape',
    loop: true,
    local: require('../assets/audio/Tones/396hz.m4a'),
    category: 'tones',
    durationHintMs: 5 * 60 * 1000,
  },
  {
    id: 'tone_432',
    title: '432 Hz – Natural Tuning',
    kind: 'soundscape',
    loop: true,
    local: require('../assets/audio/Tones/432hz.m4a'),
    category: 'tones',
    durationHintMs: 5 * 60 * 1000,
  },
  {
    id: 'tone_528',
    title: '528 Hz – Transformation & Miracles',
    kind: 'soundscape',
    loop: true,
    local: require('../assets/audio/Tones/528hz.m4a'),
    category: 'tones',
    durationHintMs: 5 * 60 * 1000,
  },
  {
    id: 'tone_639',
    title: '639 Hz – Connecting Relationships',
    kind: 'soundscape',
    loop: true,
    local: require('../assets/audio/Tones/639hz.m4a'),
    category: 'tones',
    durationHintMs: 5 * 60 * 1000,
  },
  {
    id: 'tone_741',
    title: '741 Hz – Awakening Intuition',
    kind: 'soundscape',
    loop: true,
    local: require('../assets/audio/Tones/741hz.m4a'),
    category: 'tones',
    durationHintMs: 5 * 60 * 1000,
  },
  {
    id: 'tone_852',
    title: '852 Hz – Returning to Spiritual Order',
    kind: 'soundscape',
    loop: true,
    local: require('../assets/audio/Tones/852hz.m4a'),
    category: 'tones',
    durationHintMs: 5 * 60 * 1000,
  },
  {
    id: 'tone_888',
    title: '888 Hz – Abundance Alignment',
    kind: 'soundscape',
    loop: true,
    local: require('../assets/audio/Tones/888hz.m4a'),
    category: 'tones',
    durationHintMs: 5 * 60 * 1000,
  },
  {
    id: 'tone_963',
    title: '963 Hz – Pineal Activation',
    kind: 'soundscape',
    loop: true,
    local: require('../assets/audio/Tones/963hz.m4a'),
    category: 'tones',
    durationHintMs: 5 * 60 * 1000,
  },

  // --- Noise environment tracks ---
  {
    id: 'noise_white',
    title: 'Celestial Drift (White Noise)',
    kind: 'soundscape',
    loop: true,
    local: require('../assets/audio/Noise/white.m4a'),
    category: 'noise',
    durationHintMs: 10 * 60 * 1000,
  },
  {
    id: 'noise_pink',
    title: 'Ocean Veil (Pink Noise)',
    kind: 'soundscape',
    loop: true,
    local: require('../assets/audio/Noise/pink.m4a'),
    category: 'noise',
    durationHintMs: 10 * 60 * 1000,
  },
  {
    id: 'noise_brown',
    title: 'Earthen Pulse (Brown Noise)',
    kind: 'soundscape',
    loop: true,
    local: require('../assets/audio/Noise/brown.m4a'),
    category: 'noise',
    durationHintMs: 10 * 60 * 1000,
  },
  {
    id: 'noise_grey',
    title: 'Equilibrium Veil (Grey Noise)',
    kind: 'soundscape',
    loop: true,
    local: require('../assets/audio/Noise/grey.m4a'),
    category: 'noise',
    durationHintMs: 10 * 60 * 1000,
  },
];

export const TRACK_INDEX: Record<string, TrackMeta> =
  Object.fromEntries(TRACKS.map(t => [t.id, t]));

// -----------------------------------------------------------------------------
// Normalized lookup & resolver (future‑proof id/title matching)
// -----------------------------------------------------------------------------

/** Normalize a string for resilient id/title matching. */
export const normalizeTrackKey = (s?: string) =>
  (s || '')
    .toString()
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')  // spaces → dashes
    .replace(/_/g, '-')     // underscores → dashes
    .replace(/[^a-z0-9\-]/g, ''); // strip other punctuation

/**
 * Dictionary of tracks with multiple alias keys per item:
 *  - original id
 *  - normalized dashed id (underscores/spaces collapsed)
 *  - underscore variant
 *  - normalized title key (if present)
 */
export const tracksById: Record<string, TrackMeta> = (() => {
  const map: Record<string, TrackMeta> = {};
  for (const t of TRACKS) {
    if (!t?.id) continue;
    const original = t.id;
    const dashed = normalizeTrackKey(original);            // e.g., harmonic-resonance
    const underscored = dashed.replace(/-/g, '_');         // e.g., harmonic_resonance

    map[original] = t;     // exact id
    map[dashed] = t;       // dashed alias
    map[underscored] = t;  // underscored alias

    if ((t as any).title) {
      const titleKey = normalizeTrackKey((t as any).title as string);
      if (titleKey) map[titleKey] = t;                     // normalized title alias
    }
  }
  return map;
})();

/** Resolve a track from id or title (resilient to hyphen/underscore/title variants). */
export function resolveTrack(idOrTitle?: string): TrackMeta | undefined {
  if (!idOrTitle) return undefined;
  const raw = idOrTitle;
  const n = normalizeTrackKey(raw);

  // direct or normalized lookups
  const direct = tracksById[raw] || tracksById[n];
  if (direct) return direct;

  // loose id match by normalized key over all known ids
  const byId = Object.keys(tracksById).find(k => normalizeTrackKey(k) === n);
  if (byId) return tracksById[byId];

  return undefined;
}

/** Helper to get the URL and whether it is remote or local for a track */
export function getTrackUrl(t: TrackMeta): { url: string; isRemote: boolean } {
  if (t.remote) {
    return { url: t.remote, isRemote: true };
  }
  return { url: t.local, isRemote: false };
}