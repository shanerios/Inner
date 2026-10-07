export const DREAM_SIGNS = [
  'Flying',
  'Falling',
  'Water',
  'Chased',
  'Lost',
  'Mirror',
  'Teeth',
  'Familiar Person',
  'Unknown Place',
  'Shadow Presence',
] as const;

export type DreamSign = typeof DREAM_SIGNS[number];

const DREAM_SIGN_PATTERNS: Record<DreamSign, RegExp[]> = {
  Flying: [
    /\b(?:fly|flies|flying|flew|float|floated|floating|levitate|levitated|levitating)\b/i,
  ],
  Falling: [
    /\b(?:fall|falls|falling|fell|plummet|plummeted|plummeting)\b/i,
  ],
  Water: [
    /\b(?:water|ocean|sea|lake|river|pond|pool|wave|waves|rain|raining|underwater|swim|swam|swimming)\b/i,
  ],
  Chased: [
    /\b(?:chase|chased|chasing|pursue|pursued|pursuing)\b/i,
    /\brunn?ing away\b/i,
  ],
  Lost: [
    /\b(?:lost|wandering)\b/i,
    /\b(?:could not|couldn't|couldnt) find\b/i,
    /\b(?:could not|couldn't|couldnt) get back\b/i,
  ],
  Mirror: [
    /\bmirrors?\b/i,
    /\bmy reflection\b/i,
  ],
  Teeth: [
    /\b(?:tooth|teeth)\b/i,
  ],
  'Familiar Person': [
    /\b(?:someone|somebody|person) i (?:knew|know|recognized|recognised)\b/i,
    /\b(?:familiar person|my friend|my partner|my spouse|my husband|my wife|my boyfriend|my girlfriend)\b/i,
    /\b(?:my )?(?:mom|mother|dad|father|sister|brother|grandmother|grandfather|grandma|grandpa|daughter|son)\b/i,
  ],
  'Unknown Place': [
    /\b(?:unknown|unfamiliar|strange) (?:place|house|building|room|city|town|landscape)\b/i,
    /\bsomewhere i (?:did not|didn't|didnt) recogni[sz]e\b/i,
  ],
  'Shadow Presence': [
    /\b(?:shadow|shadows|shadowy figure|dark figure|silhouette|presence)\b/i,
  ],
};

/** Suggests only known, reviewable signs. The caller must ask for confirmation before saving them. */
export function suggestDreamSigns(text: string): DreamSign[] {
  const normalized = text.replace(/[’‘]/g, "'");
  return DREAM_SIGNS.filter(sign => DREAM_SIGN_PATTERNS[sign].some(pattern => pattern.test(normalized)));
}
