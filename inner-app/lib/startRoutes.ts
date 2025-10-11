import { NavigationProp } from '@react-navigation/native';

export type Suggestion = {
  id: string;
  kind?: 'soundscape' | 'chamber' | 'lesson';
  title?: string;
};

// Start from a Suggestion: route to the right screen/params
export function startFromSuggestion(s: Suggestion, navigation: NavigationProp<any>) {
  const id = s?.id;
  const kind = s?.kind;
  if (!id) {
    console.warn('startFromSuggestion: missing id', s);
    return;
  }

  // Kind-aware routing
  if (kind === 'soundscape' || kind === 'chamber') {
    navigation.navigate('JourneyPlayer', { trackId: id });
    return;
  }
  if (kind === 'lesson') {
    navigation.navigate('LessonReader', { id });
    return;
  }

  // Infer by id when kind is absent (legacy suggestions)
  const looksLikeSound = /\b(\d{2,4}hz|noise|tone|sound|scape|harmonic|resonance)\b/i.test(id);
  if (looksLikeSound) {
    navigation.navigate('JourneyPlayer', { trackId: id });
    return;
  }

  // Fallback: treat as track id so JourneyPlayer resolves via tracks map
  navigation.navigate('JourneyPlayer', { trackId: id });
}

// Convenience helpers
export function startChamberById(id: string, navigation: NavigationProp<any>) {
  navigation.navigate('JourneyPlayer', { trackId: id });
}

export function startSoundById(id: string, navigation: NavigationProp<any>) {
  navigation.navigate('JourneyPlayer', { trackId: id });
}

export function openLessonById(id: string, navigation: NavigationProp<any>) {
  navigation.navigate('LessonReader', { id });
}

export default startFromSuggestion;