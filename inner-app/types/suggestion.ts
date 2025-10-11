export type SuggestionKind = 'chamber' | 'soundscape' | 'lesson';

export type Suggestion = {
  kind: SuggestionKind;
  id: string;          // e.g., track/lesson id you already use
  title: string;       // display title
  subtitle?: string;   // 1-line poetic description
  artwork?: any;       // optional require(...) or uri
};