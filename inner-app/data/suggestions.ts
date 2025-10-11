import { Suggestion } from '../types/suggestion';

// CHAMBERS (expo-av)
export const CHAMBERS: Suggestion[] = [
  { kind: 'chamber', id: 'chamber_one', title: 'Chamber One', subtitle: 'Settle, hum, and awaken your resonance.' },
];

// SOUNDSCAPES / NOISE (TrackPlayer)
export const SOUNDSCAPES: Suggestion[] = [
  { kind: 'soundscape', id: 'harmonic-resonance', title: 'Harmonic Resonance', subtitle: 'A gentle field for attunement.' },
  { kind: 'soundscape', id: 'noise_white', title: 'Celestial Drift (White Noise)', subtitle: 'A veil of light, calm, and clarity.' },
  { kind: 'soundscape', id: 'noise_brown', title: 'Earthen Pulse (Brown Noise)', subtitle: 'Deep grounding, steady and warm.' },
  { kind: 'soundscape', id: 'noise_grey', title: 'Equilibrium Veil (Grey Noise)', subtitle: 'Even, transparent balance for focus.' },
];

// LESSONS (from learn.ts ids)
export const LESSONS: Suggestion[] = [
  { kind: 'lesson', id: 'dream-recall-coding', title: 'Dream Recall & Dream Coding', subtitle: 'Remember deeper. Encode what matters.' },
  { kind: 'lesson', id: 'sanctum-sphere', title: 'Sanctum Sphere', subtitle: 'Hold your field. Move within safety.' },
  { kind: 'lesson', id: 'obe-energetic-locomotion', title: 'Energetic Locomotion (OBE)', subtitle: 'Move by intention. Travel by current.' },
];