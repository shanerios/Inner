// core/dreamRecollections.ts
// Preserved baseline recollections and dated additions for a journal entry.
// Pure types and helpers; persistence lives in journalRepo.ts.

export const MAX_RECOLLECTION_LENGTH = 12_000;

export type DreamAdditionKind = 'recollection' | 'reflection';

/** A detail remembered later, or a personal reflection. Never merged into the baseline. */
export type DreamAddition = {
  id: string;
  kind: DreamAdditionKind;
  text: string;
  createdAt: number;
  editedAt?: number;
};

/**
 * 'original'        — the account preserved when the user finished capturing it.
 * 'legacy_snapshot' — the text found at migration time for an entry saved before
 *                     baselines existed. It may already have been edited.
 */
export type DreamBaselineSource = 'original' | 'legacy_snapshot';

export type DreamBaseline = {
  text: string;
  title?: string;
  /** When the account was first captured (best known). */
  capturedAt: number;
  source: DreamBaselineSource;
  /** When this snapshot was written. */
  preservedAt: number;
};

const additionKinds: DreamAdditionKind[] = ['recollection', 'reflection'];
const baselineSources: DreamBaselineSource[] = ['original', 'legacy_snapshot'];

function finiteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

export function normalizeBaseline(value: unknown): DreamBaseline | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const raw = value as Record<string, unknown>;
  if (typeof raw.text !== 'string' || !finiteNumber(raw.capturedAt) || !finiteNumber(raw.preservedAt)) {
    return undefined;
  }
  const source = baselineSources.find(item => item === raw.source);
  if (!source) return undefined;
  const baseline: DreamBaseline = {
    text: raw.text,
    capturedAt: raw.capturedAt,
    source,
    preservedAt: raw.preservedAt,
  };
  if (typeof raw.title === 'string' && raw.title) baseline.title = raw.title;
  return baseline;
}

/** Drops malformed items and duplicate IDs; keeps stored order. */
export function normalizeAdditions(value: unknown): DreamAddition[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const seen = new Set<string>();
  const out: DreamAddition[] = [];
  for (const item of value) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
    const raw = item as Record<string, unknown>;
    const kind = additionKinds.find(k => k === raw.kind);
    if (
      typeof raw.id !== 'string' || !raw.id || seen.has(raw.id)
      || !kind
      || typeof raw.text !== 'string' || !raw.text.trim()
      || !finiteNumber(raw.createdAt)
    ) continue;
    seen.add(raw.id);
    const addition: DreamAddition = { id: raw.id, kind, text: raw.text, createdAt: raw.createdAt };
    if (finiteNumber(raw.editedAt)) addition.editedAt = raw.editedAt;
    out.push(addition);
  }
  return out.length ? out : undefined;
}

function comparable(text: string): string {
  return text.replace(/\r\n/g, '\n').trim();
}

/** True when the current body no longer matches the preserved baseline text. */
export function bodyDiffersFromBaseline(baseline: DreamBaseline | undefined, body: string): boolean {
  if (!baseline) return false;
  return comparable(baseline.text) !== comparable(body);
}

export function baselineHeading(baseline: DreamBaseline): string {
  return baseline.source === 'original' ? 'Original recollection' : 'First saved version';
}

export function additionHeading(kind: DreamAdditionKind): string {
  return kind === 'reflection' ? 'Reflection' : 'Additional recollection';
}

export type DreamTimelineItem = {
  id: string;
  kind: 'baseline' | DreamAdditionKind;
  heading: string;
  timestamp: number;
  text: string;
  edited: boolean;
};

/**
 * Oldest first: the baseline (always first), then additions by time.
 * Used by the history view and exports.
 */
export function buildDreamTimeline(
  baseline: DreamBaseline | undefined,
  additions: DreamAddition[] | undefined,
): DreamTimelineItem[] {
  const items: DreamTimelineItem[] = [];
  if (baseline) {
    items.push({
      id: 'baseline',
      kind: 'baseline',
      heading: baselineHeading(baseline),
      timestamp: baseline.capturedAt,
      text: baseline.text,
      edited: false,
    });
  }
  const sorted = [...(additions ?? [])].sort((a, b) => (
    a.createdAt - b.createdAt || a.id.localeCompare(b.id)
  ));
  for (const addition of sorted) {
    items.push({
      id: addition.id,
      kind: addition.kind,
      heading: additionHeading(addition.kind),
      timestamp: addition.createdAt,
      text: addition.text,
      edited: typeof addition.editedAt === 'number',
    });
  }
  return items;
}
