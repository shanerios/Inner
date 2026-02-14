// data/tracks.ts
export type TrackKind = 'soundscape' | 'chamber';

export type TrackMeta = {
  id: string;
  title: string;
  artist?: string;
  kind: TrackKind;
  loop?: boolean;          // override default if needed
  local?: any;             // require(...) asset (optional when using remote URLs)
  remote?: string;         // remote URL asset
  remoteLow?: string;      // optional fallback lower-quality URL
  durationHintMs?: number; // optional, for predisplay
  category?: string;       // add category for grouping (e.g. 'tones')
  description?: string;
  frequencies?: number[];
  frequencyLabel?: string;
  meta?: any;              // optional extra metadata (e.g., envId for chambers)
  isPremium?: boolean;                 // gated behind subscription
  paywallKey?: 'continuing_with_inner'; // which paywall/entitlement should unlock (for now, single entitlement)
};

export type AudioQuality = 'hq' | 'lq';
let preferredQuality: AudioQuality = 'hq';

/** Set global preferred audio quality (affects getTrackUrl). */
export function setPreferredQuality(q: AudioQuality) {
  preferredQuality = q;
}

/** Read current global preferred audio quality. */
export function getPreferredQuality(): AudioQuality {
  return preferredQuality;
}

// -----------------------------------------------------------------------------
// Premium gating helpers
// -----------------------------------------------------------------------------


// Soundscape gating (category-based)
export const DEEPER_CATEGORY = 'deeper' as const;
export const CONTINUING_PAYWALL_KEY = 'continuing_with_inner' as const;

/** True if this track is meant to be gated behind "Continuing with Inner". */
export function isContinuingPremiumTrack(t?: TrackMeta): boolean {
  return !!t?.isPremium && t?.paywallKey === CONTINUING_PAYWALL_KEY;
}

/** True if this track is in the Deeper soundscape category (category-based gating). */
export function isDeeperCategoryTrack(t?: TrackMeta): boolean {
  return t?.category === DEEPER_CATEGORY;
}

export const TRACKS: TrackMeta[] = [
  {
    id: 'harmonic_resonance',
    title: 'Harmonic Resonance',
    description: 'A powerful, yet calming journey of frequencies that harmonize mind and body. Center your focus and embrace inner balance as you ascend into deep clarity. Frequency Signature: 963 Hz with 432 Hz and 528 Hz supporting tones for crown clarity, natural harmony, and heart resonance.',
    frequencies: [963, 432, 528],
    frequencyLabel: '963 Hz • 432 Hz • 528 Hz',
    kind: 'soundscape',
    loop: true,
    remote: 'https://f005.backblazeb2.com/file/inner-audio/Soundscapes/harmonic_resonance_hq_ios.m4a',
    remoteLow: 'https://f005.backblazeb2.com/file/inner-audio/Soundscapes/Harmonic_Resonance-64k_ios.m4a',
    category: 'stillness',
    durationHintMs: 60 * 60 * 1000,
  },

  {
    id: 'deep_focus',
    title: 'Deep Focus',
    description: 'Immerse yourself in a soundscape designed to enhance concentration and mental clarity. Frequency Signature: 963 Hz for a spacious clarity field around your thoughts.',
    frequencies: [963],
    frequencyLabel: '963 Hz • Clarity Field',
    kind: 'soundscape',
    loop: true,
    remote: 'https://f005.backblazeb2.com/file/inner-audio/Soundscapes/deep_focus_hq_ios.m4a',
    remoteLow: 'https://f005.backblazeb2.com/file/inner-audio/Soundscapes/Deep_Focus-64k_ios.m4a',
    category: 'clarity',
    durationHintMs: 60 * 60 * 1000,

  },

  {
    id: 'yoga_movement',
    title: 'Yoga & Movement',
    description: 'A dynamic soundscape to accompany your yoga practice or movement flow, enhancing body awareness, rhythm, and natural alignment. Frequency Signature: 432 Hz for body-mind balance and organic flow.',
    frequencies: [432],
    frequencyLabel: '432 Hz • Natural Alignment',
    kind: 'soundscape',
    loop: true,
    remote: 'https://f005.backblazeb2.com/file/inner-audio/Soundscapes/yoga_and_movement_hq_ios.m4a',
    remoteLow: 'https://f005.backblazeb2.com/file/inner-audio/Soundscapes/Yoga_and_Movement-64k_ios.m4a',
    category: 'clarity',
    durationHintMs: 60 * 60 * 1000,
  },

  {
    id: 'calm_presence',
    title: 'Calm Presence',
    description: 'A tranquil soundscape to cultivate mindfulness and presence, helping you find calm in the moment. Frequency Signature: 528 Hz for gentle heart-centered resonance and emotional ease.',
    frequencies: [528],
    frequencyLabel: '528 Hz • Heart Resonance',
    kind: 'soundscape',
    loop: true,
    remote: 'https://f005.backblazeb2.com/file/inner-audio/Soundscapes/calm_presence_hq_ios.m4a',
    remoteLow: 'https://f005.backblazeb2.com/file/inner-audio/Soundscapes/Calm_Presence-64k_ios.m4a',
    category: 'renewal',
    durationHintMs: 60 * 60 * 1000,
  },

  {
    id: 'focus_field',
    title: 'Focus Field',
    description: 'An immersive soundscape designed to sharpen your focus and enhance cognitive function. Frequency Signature: 852 Hz for heightened intuition and mental clarity.',
    frequencies: [741],
    frequencyLabel: '741 hz',
    kind: 'soundscape',
    loop: true,
    remote: 'https://f005.backblazeb2.com/file/inner-audio/Soundscapes/focus_field_hq_ios.m4a',
    remoteLow: 'https://f005.backblazeb2.com/file/inner-audio/Soundscapes/focus_field_64k_ios.m4a',
    category: 'clarity',
    durationHintMs: 60 * 60 * 1000,
  },

  {
    id: 'stillness_between_breaths',
    title: 'Stillness Between Breaths',
    description: 'A serene soundscape to guide you into deep relaxation and inner stillness. Frequency Signature: 396 Hz for releasing tension and embracing tranquility.',
    frequencies: [528],
    frequencyLabel: '528 hz',
    kind: 'soundscape',
    loop: true,
    remote: 'https://f005.backblazeb2.com/file/inner-audio/Soundscapes/stillness_between_breaths_hq_ios.m4a',
    remoteLow: 'https://f005.backblazeb2.com/file/inner-audio/Soundscapes/stillness_between_breaths_64k_ios.m4a',
    category: 'stillness',
    durationHintMs: 60 * 60 * 1000,
  },

  {
    id: 'grounding_field',
    title: 'Grounding Field',
    description: 'A grounding soundscape to connect you with the earth and foster a sense of stability. Frequency Signature: 174 Hz for deep relaxation and rooted presence.',
    frequencies: [396],
    frequencyLabel: '396 hz',
    kind: 'soundscape',
    loop: true,
    remote: 'https://f005.backblazeb2.com/file/inner-audio/Soundscapes/grounding_field_hq_ios.m4a',
    remoteLow: 'https://f005.backblazeb2.com/file/inner-audio/Soundscapes/grounding_field_64k_ios.m4a',
    category: 'renewal',
    durationHintMs: 60 * 60 * 1000,
  },

  {
    id: 'dream_descent',
    title: 'Dream Descent',
    description: 'A mystical soundscape to accompany your journey into the dream state, enhancing vivid imagery and deep rest. Frequency Signature: 285 Hz for healing presence and subconscious connection.',
    frequencies: [174],
    frequencyLabel: '174 hz',
    kind: 'soundscape',
    loop: true,
    remote: 'https://f005.backblazeb2.com/file/inner-audio/Soundscapes/dream_descent_hq_ios.m4a',
    remoteLow: 'https://f005.backblazeb2.com/file/inner-audio/Soundscapes/dream_descent_64k_ios.m4a',
    category: DEEPER_CATEGORY,
    durationHintMs: 60 * 60 * 1000,
  },

  {
    id: 'liminal_space',
    title: 'Liminal Space',
    description: 'An ethereal soundscape to guide you through transitional states of consciousness, fostering openness and transformation. Frequency Signature: 741 Hz for awakening intuition and spiritual alignment.',
    frequencies: [963],
    frequencyLabel: '963 hz',
    kind: 'soundscape',
    loop: true,
    remote: 'https://f005.backblazeb2.com/file/inner-audio/Soundscapes/liminal_space_hq_ios.m4a',
    remoteLow: 'https://f005.backblazeb2.com/file/inner-audio/Soundscapes/liminal_space_64k_ios.m4a',
    category: DEEPER_CATEGORY,
    durationHintMs: 60 * 60 * 1000,
  },

  {
    id: 'luminous_dark',
    title: 'Luminous Dark',
    description: 'A radiant soundscape to illuminate the darkness and guide you through moments of uncertainty. Frequency Signature: 852 Hz for returning to spiritual order and inner harmony.',
    frequencies: [963],
    frequencyLabel: '963 hz',
    kind: 'soundscape',
    loop: true,
    remote: 'https://f005.backblazeb2.com/file/inner-audio/Soundscapes/Luminous_Dark_hq.m4a',
    remoteLow: 'https://f005.backblazeb2.com/file/inner-audio/Soundscapes/Luminous_Dark_64k.m4a',
    category: DEEPER_CATEGORY,
    durationHintMs: 60 * 60 * 1000,
  },

  {
    id: 'still_below_thought',
    title: 'Still Below Thought',
    description: 'A profound soundscape to explore the depths of stillness beneath the surface of thought, fostering deep meditation and insight. Frequency Signature: 888 Hz for abundance alignment and transcendent flow.',
    frequencies: [432],
    frequencyLabel: '432 hz',
    kind: 'soundscape',
    loop: true,
    remote: 'https://f005.backblazeb2.com/file/inner-audio/Soundscapes/Still_Below_Thought_hq.m4a',
    remoteLow: 'https://f005.backblazeb2.com/file/inner-audio/Soundscapes/Still_Below_Thought_64k.m4a',
    category: 'renewal',
    durationHintMs: 60 * 60 * 1000,
  },

  {
    id: 'subtle_body',
    title: 'Subtle Body',
    description: 'A delicate soundscape to attune you to the subtle energies of the body, enhancing self-awareness and energetic flow. Frequency Signature: 639 Hz for connecting relationships and heart-centered resonance.',
    frequencies: [285],
    frequencyLabel: '285 hz',
    kind: 'soundscape',
    loop: true,
    remote: 'https://f005.backblazeb2.com/file/inner-audio/Soundscapes/Subtle_Body_hq.m4a',
    remoteLow: 'https://f005.backblazeb2.com/file/inner-audio/Soundscapes/Subtle_Body_64k.m4a',
    category: 'stillness',
    durationHintMs: 60 * 60 * 1000,
  },

  {
    id: 'the_deep_corridor',
    title: 'The Deep Corridor',
    description: 'An immersive soundscape to guide you through a deep, resonant corridor of sound, fostering introspection and inner exploration. Frequency Signature: 852 Hz for returning to spiritual order and inner harmony.',
    frequencies: [396],
    frequencyLabel: '396 hz',
    kind: 'soundscape',
    loop: true,
    remote: 'https://f005.backblazeb2.com/file/inner-audio/Soundscapes/The_Deep_Corridor_hq.m4a',
    remoteLow: 'https://f005.backblazeb2.com/file/inner-audio/Soundscapes/The_Deep_Corridor_64k.m4a',
    category: 'clarity',
    durationHintMs: 60 * 60 * 1000,
  },

  {
    id: 'void_anchor',
    title: 'Void Anchor',
    description: 'A grounding soundscape to anchor you in the void, providing stability and presence amidst the unknown. Frequency Signature: 174 Hz for deep relaxation and rooted presence.',
    frequencies: [174],
    frequencyLabel: '174 hz',
    kind: 'soundscape',
    loop: true,
    remote: 'https://f005.backblazeb2.com/file/inner-audio/Soundscapes/Void_Anchor_hq.m4a',
    remoteLow: 'https://f005.backblazeb2.com/file/inner-audio/Soundscapes/Void_Anchor_64k.m4a',
    category: DEEPER_CATEGORY,
    durationHintMs: 60 * 60 * 1000,
  },
    
    // --- Chamber tracks ---

  {
    id: 'chamber_one',
    title: 'Chamber One: Outer Sanctum',
    kind: 'chamber',
    loop: false,
    remote: 'https://f005.backblazeb2.com/file/inner-audio/Chambers/chamber_1_hq_ios.m4a',
    remoteLow: 'https://f005.backblazeb2.com/file/inner-audio/Chambers/chamber_1_64k_ios.m4a',
    durationHintMs: 30 * 60 * 1000,
    meta: { envId: 'chamber_one' },
  },

  {
    id: 'chamber_two',
    title: 'Chamber Two: Inner Flame',
    kind: 'chamber',
    loop: false,
    durationHintMs: 30 * 60 * 1000,
    remote: 'https://f005.backblazeb2.com/file/inner-audio/Chambers/chamber_2_hq_ios.m4a',
    remoteLow: 'https://f005.backblazeb2.com/file/inner-audio/Chambers/chamber_2_64k_ios.m4a',
    meta: { envId: 'chamber_two' },
  },
  {
    id: 'chamber_three',
    title: 'Chamber Three: Horizon Gate',
    kind: 'chamber',
    loop: false,
    durationHintMs: 30 * 60 * 1000,
    remote: 'https://f005.backblazeb2.com/file/inner-audio/Chambers/chamber_3_hq_ios.m4a',
    remoteLow: 'https://f005.backblazeb2.com/file/inner-audio/Chambers/chamber_3_64k_ios.m4a',
    meta: { envId: 'chamber_three' },
  },
  {
    id: 'chamber_four',
    title: 'Chamber Four: Resonance Field',
    kind: 'chamber',
    loop: false,
    durationHintMs: 33 * 60 * 1000,
    remote: 'https://f005.backblazeb2.com/file/inner-audio/Chambers/chamber_4_hq_ios.m4a',
    remoteLow: 'https://f005.backblazeb2.com/file/inner-audio/Chambers/chamber_4_64k_ios.m4a',
    meta: { envId: 'chamber_four' },
  },
  {
    id: 'chamber_five',
    title: 'Chamber Five: Remembrance Code',
    kind: 'chamber',
    loop: false,
    durationHintMs: 33 * 60 * 1000,
    remote: 'https://f005.backblazeb2.com/file/inner-audio/Chambers/chamber_5_hq_ios.m4a',
    remoteLow: 'https://f005.backblazeb2.com/file/inner-audio/Chambers/chamber_5_64k_ios.m4a',
    meta: { envId: 'chamber_five' },
    isPremium: true,
    paywallKey: CONTINUING_PAYWALL_KEY,
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
    frequencies: [174],
    frequencyLabel: '174 Hz',
  },
  {
    id: 'tone_285',
    title: '285 Hz – Healing Presence',
    kind: 'soundscape',
    loop: true,
    local: require('../assets/audio/Tones/285hz.m4a'),
    category: 'tones',
    durationHintMs: 5 * 60 * 1000,
    frequencies: [285],
    frequencyLabel: '285 Hz',
  },
  {
    id: 'tone_396',
    title: '396 Hz – Liberating Guilt & Fear',
    kind: 'soundscape',
    loop: true,
    local: require('../assets/audio/Tones/396hz.m4a'),
    category: 'tones',
    durationHintMs: 5 * 60 * 1000,
    frequencies: [396],
    frequencyLabel: '396 Hz',
  },
  {
    id: 'tone_432',
    title: '432 Hz – Natural Tuning',
    kind: 'soundscape',
    loop: true,
    local: require('../assets/audio/Tones/432hz.m4a'),
    category: 'tones',
    durationHintMs: 5 * 60 * 1000,
    frequencies: [432],
    frequencyLabel: '432 Hz',
  },
  {
    id: 'tone_528',
    title: '528 Hz – Transformation & Miracles',
    kind: 'soundscape',
    loop: true,
    local: require('../assets/audio/Tones/528hz.m4a'),
    category: 'tones',
    durationHintMs: 5 * 60 * 1000,
    frequencies: [528],
    frequencyLabel: '528 Hz',
  },
  {
    id: 'tone_639',
    title: '639 Hz – Connecting Relationships',
    kind: 'soundscape',
    loop: true,
    local: require('../assets/audio/Tones/639hz.m4a'),
    category: 'tones',
    durationHintMs: 5 * 60 * 1000,
    frequencies: [639],
    frequencyLabel: '639 Hz',
  },
  {
    id: 'tone_741',
    title: '741 Hz – Awakening Intuition',
    kind: 'soundscape',
    loop: true,
    local: require('../assets/audio/Tones/741hz.m4a'),
    category: 'tones',
    durationHintMs: 5 * 60 * 1000,
    frequencies: [741],
    frequencyLabel: '741 Hz',
  },
  {
    id: 'tone_852',
    title: '852 Hz – Returning to Spiritual Order',
    kind: 'soundscape',
    loop: true,
    local: require('../assets/audio/Tones/852hz.m4a'),
    category: 'tones',
    durationHintMs: 5 * 60 * 1000,
    frequencies: [852],
    frequencyLabel: '852 Hz',
  },
  {
    id: 'tone_888',
    title: '888 Hz – Abundance Alignment',
    kind: 'soundscape',
    loop: true,
    local: require('../assets/audio/Tones/888hz.m4a'),
    category: 'tones',
    durationHintMs: 5 * 60 * 1000,
    frequencies: [888],
    frequencyLabel: '888 Hz',
  },
  {
    id: 'tone_963',
    title: '963 Hz – Pineal Activation',
    kind: 'soundscape',
    loop: true,
    local: require('../assets/audio/Tones/963hz.m4a'),
    category: 'tones',
    durationHintMs: 5 * 60 * 1000,
    frequencies: [963],
    frequencyLabel: '963 Hz',
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
  // Prefer explicit quality if available
  if (preferredQuality === 'lq' && t.remoteLow) {
    return { url: t.remoteLow, isRemote: true };
  }

  // Default to HQ remote if present
  if (t.remote) {
    return { url: t.remote, isRemote: true };
  }

  // Fallback to local bundled asset
  return { url: t.local, isRemote: false };
}