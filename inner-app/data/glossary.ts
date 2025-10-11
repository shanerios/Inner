// data/glossary.ts
export type GlossaryEntry = {
  id: string;            // "hypnagogia"
  term: string;          // "Hypnagogia"
  category: 'lucid' | 'obe' | 'shared';
  short: string;         // one-sentence tooltip
  long?: string;         // optional deeper dive (for full screen)
  aliases?: string[];    // ["sleep onset imagery"]
};

export const GLOSSARY: GlossaryEntry[] = [
  {
    id: 'hypnagogia',
    term: 'Hypnagogia',
    category: 'shared',
    short:
      'The transitional state between wakefulness and sleep; drifting imagery, sounds, and sensations can appear here.',
    long:
      'Hypnagogia is the threshold when the brain shifts into early sleep stages. Gentle observing—without chasing content—helps you carry awareness into dreams.',
    aliases: ['sleep onset imagery'],
  },
  {
    id: 'sanctum-sphere',
    term: 'Sanctum Sphere',
    category: 'shared',
    short:
      'Inner’s protective visualization—an expanding field around your body that signals safety and calm.',
  },
  // …add more
];

// quick lookup maps
export const GLOSSARY_BY_ID = Object.fromEntries(GLOSSARY.map(e => [e.id, e]));
export const GLOSSARY_BY_TERM = Object.fromEntries(
  GLOSSARY.flatMap(e => [[e.term.toLowerCase(), e], ...(e.aliases||[]).map(a => [a.toLowerCase(), e])])
);