export type DreamRecall = 'none' | 'fragment' | 'dream';
export type DreamAwareness = 'no' | 'maybe' | 'yes';
export type DreamAgency = 'no' | 'a_little' | 'yes';
export type DreamControlAttempt = 'no' | 'yes';
export type DreamControlResult = 'did_not_work' | 'partly_worked' | 'worked';
export type DreamSleepImpact = 'none' | 'gentle' | 'woke';

export type DreamControlDomain =
  | 'body'
  | 'emotion'
  | 'movement'
  | 'character'
  | 'place'
  | 'story'
  | 'physics'
  | 'other';

export type InnerCueType =
  | 'sound'
  | 'symbol'
  | 'phrase'
  | 'guardian'
  | 'place'
  | 'feeling';

export type DreamDetails = {
  recall?: DreamRecall;
  awareness?: DreamAwareness;
  agency?: DreamAgency;
  control?: {
    attempted?: DreamControlAttempt;
    domains?: DreamControlDomain[];
    result?: DreamControlResult;
    otherText?: string;
  };
  innerCue?: {
    status?: 'none' | 'unsure' | 'recognized';
    types?: InnerCueType[];
  };
  sleepImpact?: DreamSleepImpact;
};

export const CONTROL_DOMAIN_OPTIONS: ReadonlyArray<{ value: DreamControlDomain; label: string }> = [
  { value: 'body', label: 'Body' },
  { value: 'emotion', label: 'Emotion' },
  { value: 'movement', label: 'Movement' },
  { value: 'character', label: 'Character' },
  { value: 'place', label: 'Place' },
  { value: 'story', label: 'Story' },
  { value: 'physics', label: 'Physics' },
  { value: 'other', label: 'Other' },
];

export const INNER_CUE_OPTIONS: ReadonlyArray<{ value: InnerCueType; label: string }> = [
  { value: 'sound', label: 'Sound' },
  { value: 'symbol', label: 'Symbol' },
  { value: 'phrase', label: 'Phrase' },
  { value: 'guardian', label: 'Guardian' },
  { value: 'place', label: 'Place' },
  { value: 'feeling', label: 'Feeling' },
];

const recallValues: DreamRecall[] = ['none', 'fragment', 'dream'];
const awarenessValues: DreamAwareness[] = ['no', 'maybe', 'yes'];
const agencyValues: DreamAgency[] = ['no', 'a_little', 'yes'];
const attemptValues: DreamControlAttempt[] = ['no', 'yes'];
const resultValues: DreamControlResult[] = ['did_not_work', 'partly_worked', 'worked'];
const sleepImpactValues: DreamSleepImpact[] = ['none', 'gentle', 'woke'];
const domainValues = CONTROL_DOMAIN_OPTIONS.map(option => option.value);
const cueValues = INNER_CUE_OPTIONS.map(option => option.value);

function enumValue<T extends string>(value: unknown, allowed: readonly T[]): T | undefined {
  return typeof value === 'string' && allowed.includes(value as T) ? value as T : undefined;
}

function enumArray<T extends string>(value: unknown, allowed: readonly T[]): T[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const filtered = [...new Set(value.filter((item): item is T => (
    typeof item === 'string' && allowed.includes(item as T)
  )))];
  return filtered.length ? filtered : undefined;
}

/**
 * Keeps old or malformed optional metadata from making a journal entry unreadable.
 * Dependent answers are retained only when their parent answer permits them.
 */
export function normalizeDreamDetails(value: unknown): DreamDetails | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const raw = value as Record<string, unknown>;
  const normalized: DreamDetails = {
    recall: enumValue(raw.recall, recallValues),
    awareness: enumValue(raw.awareness, awarenessValues),
    agency: enumValue(raw.agency, agencyValues),
    sleepImpact: enumValue(raw.sleepImpact, sleepImpactValues),
  };

  if (raw.control && typeof raw.control === 'object' && !Array.isArray(raw.control)) {
    const control = raw.control as Record<string, unknown>;
    const attempted = enumValue(control.attempted, attemptValues);
    if (attempted) {
      normalized.control = { attempted };
      if (attempted === 'yes') {
        normalized.control.domains = enumArray(control.domains, domainValues);
        normalized.control.result = enumValue(control.result, resultValues);
        if (typeof control.otherText === 'string' && control.otherText.trim()) {
          normalized.control.otherText = control.otherText;
        }
      }
    }
  }

  if (raw.innerCue && typeof raw.innerCue === 'object' && !Array.isArray(raw.innerCue)) {
    const cue = raw.innerCue as Record<string, unknown>;
    const status = enumValue(cue.status, ['none', 'unsure', 'recognized'] as const);
    if (status) {
      normalized.innerCue = { status };
      if (status === 'recognized') {
        normalized.innerCue.types = enumArray(cue.types, cueValues);
      }
    }
  }

  return hasDreamDetails(normalized) ? normalized : undefined;
}

export function hasDreamDetails(details?: DreamDetails): boolean {
  return Boolean(details && (
    details.recall
    || details.awareness
    || details.agency
    || details.control?.attempted
    || details.innerCue?.status
    || details.sleepImpact
  ));
}

const awarenessLabels: Record<DreamAwareness, string> = { no: 'No', maybe: 'Maybe', yes: 'Yes' };
const agencyLabels: Record<DreamAgency, string> = { no: 'No', a_little: 'A little', yes: 'Yes' };
const resultLabels: Record<DreamControlResult, string> = {
  did_not_work: 'did not work',
  partly_worked: 'partly worked',
  worked: 'worked',
};

function joinedLabels<T extends string>(
  values: T[] | undefined,
  options: ReadonlyArray<{ value: T; label: string }>,
): string {
  if (!values?.length) return '';
  return values
    .map(value => options.find(option => option.value === value)?.label)
    .filter((label): label is string => Boolean(label))
    .join(', ');
}

export function dreamDetailsSummary(details?: DreamDetails): string[] {
  if (!details) return [];
  const lines: string[] = [];
  if (details.awareness) lines.push(`Lucid awareness: ${awarenessLabels[details.awareness]}`);
  if (details.agency) lines.push(`Agency: ${agencyLabels[details.agency]}`);

  if (details.control?.attempted === 'no') {
    lines.push('Control: Not attempted');
  } else if (details.control?.attempted === 'yes') {
    const domains = joinedLabels(details.control.domains, CONTROL_DOMAIN_OPTIONS);
    const result = details.control.result ? resultLabels[details.control.result] : '';
    const description = [domains || 'Attempted', result].filter(Boolean).join(', ');
    lines.push(`Control: ${description}`);
  }

  if (details.innerCue?.status === 'none') lines.push('Inner cue: Nothing noticed');
  if (details.innerCue?.status === 'unsure') lines.push('Inner cue: Not sure');
  if (details.innerCue?.status === 'recognized') {
    const cues = joinedLabels(details.innerCue.types, INNER_CUE_OPTIONS);
    lines.push(`Inner cue: ${cues || 'Recognized'}`);
  }
  return lines;
}
