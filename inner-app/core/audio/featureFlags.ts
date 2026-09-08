// Disabled by default. This may be enabled in development builds to exercise
// routing once a native procedural engine is registered. Legacy playback remains
// the fallback whenever the engine or track is unsupported.
export const PROCEDURAL_AUDIO_ENABLED =
  __DEV__ && process.env.EXPO_PUBLIC_PROCEDURAL_AUDIO_ENABLED === 'true';
