import type { JournalEntry } from './journalRepo';
import { dreamDetailsSummary } from './dreamDetails';
import { practiceContextSummary } from './practiceContext';
import type { NightRecord } from './nightRecords';
import {
  additionHeading,
  baselineHeading,
  bodyDiffersFromBaseline,
  buildDreamTimeline,
} from './dreamRecollections';

export type DreamArchiveRange = 'all' | 'year' | '30days';

export type DreamArchiveExport = {
  /** v4 adds per-entry baseline and additions (all optional). v3 readers can ignore them. */
  schemaVersion: 4;
  generatedAt: number;
  range: DreamArchiveRange;
  entryCount: number;
  entries: JournalEntry[];
  nightRecordCount: number;
  nightRecords: NightRecord[];
};

export const DREAM_ARCHIVE_RANGE_LABELS: Record<DreamArchiveRange, string> = {
  all: 'All entries',
  year: 'This year',
  '30days': 'Last 30 days',
};

function rangeStart(range: DreamArchiveRange, now: number): number {
  if (range === '30days') return now - 30 * 24 * 60 * 60_000;
  if (range === 'year') return new Date(new Date(now).getFullYear(), 0, 1).getTime();
  return Number.NEGATIVE_INFINITY;
}

export function filterDreamArchiveEntries(
  entries: JournalEntry[],
  range: DreamArchiveRange,
  now = Date.now(),
): JournalEntry[] {
  const start = rangeStart(range, now);
  return entries
    .filter(entry => !entry.testSession && entry.createdAt >= start)
    .sort((a, b) => b.createdAt - a.createdAt);
}

export function filterDreamArchiveNightRecords(
  records: NightRecord[],
  range: DreamArchiveRange,
  now = Date.now(),
): NightRecord[] {
  const start = rangeStart(range, now);
  return records
    .filter(record => !record.testSession && record.reflectedAt >= start)
    .sort((a, b) => b.reflectedAt - a.reflectedAt);
}

export function buildDreamArchiveExport(
  entries: JournalEntry[],
  range: DreamArchiveRange,
  generatedAt = Date.now(),
  nightRecords: NightRecord[] = [],
): DreamArchiveExport {
  return {
    schemaVersion: 4,
    generatedAt,
    range,
    entryCount: entries.length,
    entries,
    nightRecordCount: nightRecords.length,
    nightRecords,
  };
}

export function serializeDreamArchive(archive: DreamArchiveExport): string {
  return `${JSON.stringify(archive, null, 2)}\n`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function formatDate(timestamp: number): string {
  return new Date(timestamp).toLocaleString(undefined, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function entryMeta(entry: JournalEntry): string[] {
  const metadata: string[] = [];
  if (entry.kind) metadata.push(entry.kind === 'dream' ? 'Dream' : entry.kind.charAt(0).toUpperCase() + entry.kind.slice(1));
  if (typeof entry.mood === 'number') metadata.push(`Mood ${entry.mood}/5`);
  if (entry.chamberTitle) metadata.push(entry.chamberTitle);
  return metadata;
}

function bodyHtml(body: string): string {
  if (!body.trim()) return '<p class="empty">No written memory.</p>';
  return body
    .split(/\n{2,}/)
    .map(paragraph => `<p>${escapeHtml(paragraph).replace(/\n/g, '<br />')}</p>`)
    .join('');
}

// What the account text is, so revised text is never presented as the untouched original.
function accountLabelHtml(entry: JournalEntry): string {
  const baseline = entry.baseline;
  if (!baseline) return '';
  const label = bodyDiffersFromBaseline(baseline, entry.body)
    ? 'Current account &middot; edited since'
    : `${escapeHtml(baselineHeading(baseline))} &middot; ${escapeHtml(formatDate(baseline.capturedAt))}`;
  return `<div class="account-label">${label}</div>`;
}

// Preserved original (when it differs from the current account) and dated additions.
function recollectionsHtml(entry: JournalEntry): string {
  const baseline = entry.baseline;
  const timeline = buildDreamTimeline(baseline, entry.additions);
  const blocks: string[] = [];
  for (const item of timeline) {
    if (item.kind === 'baseline') {
      if (!baseline || !bodyDiffersFromBaseline(baseline, entry.body)) continue;
      const note = baseline.source === 'legacy_snapshot'
        ? `<div class="note">Preserved ${escapeHtml(formatDate(baseline.preservedAt))}; it may have been edited before then.</div>`
        : '';
      blocks.push(`<section class="addition preserved"><div class="addition-label">${escapeHtml(item.heading)} &middot; ${escapeHtml(formatDate(item.timestamp))}</div>${note}${bodyHtml(item.text)}</section>`);
      continue;
    }
    const kind = additionHeading(item.kind);
    blocks.push(`<section class="addition"><div class="addition-label">${escapeHtml(kind)} &middot; ${escapeHtml(formatDate(item.timestamp))}${item.edited ? ' &middot; Edited' : ''}</div>${bodyHtml(item.text)}</section>`);
  }
  return blocks.join('');
}

export function buildDreamArchiveHtml(archive: DreamArchiveExport): string {
  const entries = archive.entries.map((entry, index) => {
    const title = entry.title?.trim() || 'Untitled memory';
    const metadata = entryMeta(entry);
    const signs = entry.dreamSigns?.filter(Boolean) ?? [];
    const intentions = entry.intentionTags?.filter(Boolean) ?? [];
    const details = dreamDetailsSummary(entry.dreamDetails);
    const practice = practiceContextSummary(entry.practiceContext);
    return `
      <article class="entry${index > 0 ? ' continued' : ''}">
        <div class="entry-date">${escapeHtml(formatDate(entry.createdAt))}</div>
        <h2>${escapeHtml(title)}</h2>
        ${metadata.length ? `<div class="metadata">${metadata.map(escapeHtml).join(' &middot; ')}</div>` : ''}
        ${accountLabelHtml(entry)}
        <div class="body">${bodyHtml(entry.body)}</div>
        ${recollectionsHtml(entry)}
        ${practice.length ? `<div class="details"><strong>The night before this dream</strong>${practice.map(line => `<div>${escapeHtml(line)}</div>`).join('')}</div>` : ''}
        ${details.length ? `<div class="details"><strong>Dream details</strong>${details.map(line => `<div>${escapeHtml(line)}</div>`).join('')}</div>` : ''}
        ${signs.length ? `<div class="tags"><strong>Dream signs</strong>${signs.map(sign => `<span>${escapeHtml(sign)}</span>`).join('')}</div>` : ''}
        ${intentions.length ? `<div class="tags"><strong>Intentions</strong>${intentions.map(tag => `<span>${escapeHtml(tag)}</span>`).join('')}</div>` : ''}
      </article>`;
  }).join('');

  const rangeLabel = DREAM_ARCHIVE_RANGE_LABELS[archive.range];
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <style>
    @page { margin: 58px 54px 54px; }
    * { box-sizing: border-box; }
    body { margin: 0; color: #292532; font-family: Georgia, 'Times New Roman', serif; font-size: 12px; line-height: 1.62; }
    header { padding: 18px 0 30px; border-bottom: 1px solid #d8d1e2; margin-bottom: 26px; }
    .eyebrow { color: #796a92; font-family: Arial, sans-serif; font-size: 8px; font-weight: 700; letter-spacing: 2.4px; text-transform: uppercase; }
    h1 { margin: 8px 0 4px; color: #27222f; font-size: 30px; font-weight: 400; letter-spacing: 0.2px; }
    .archive-meta { color: #746d7d; font-family: Arial, sans-serif; font-size: 9px; }
    .entry { break-inside: auto; padding: 0 0 28px; margin: 0 0 28px; border-bottom: 1px solid #e6e0ea; }
    .entry.continued { break-before: auto; }
    .entry-date { break-after: avoid; color: #86799a; font-family: Arial, sans-serif; font-size: 8px; font-weight: 700; letter-spacing: 1.1px; text-transform: uppercase; }
    h2 { break-after: avoid; margin: 6px 0 2px; color: #332c3d; font-size: 20px; font-weight: 400; line-height: 1.25; }
    .metadata { break-after: avoid; color: #827989; font-family: Arial, sans-serif; font-size: 9px; margin-bottom: 13px; }
    .body p { margin: 0 0 10px; white-space: normal; }
    .body p:last-child { margin-bottom: 0; }
    .empty { color: #918a96; font-style: italic; }
    .account-label { break-after: avoid; color: #86799a; font-family: Arial, sans-serif; font-size: 8px; font-weight: 700; letter-spacing: 1.1px; text-transform: uppercase; margin-bottom: 6px; }
    .addition { margin-top: 16px; padding-left: 11px; border-left: 2px solid #ddd5e6; }
    .addition.preserved { border-left-color: #b7a9cc; }
    .addition-label { break-after: avoid; color: #86799a; font-family: Arial, sans-serif; font-size: 8px; font-weight: 700; letter-spacing: 1.1px; text-transform: uppercase; margin-bottom: 4px; }
    .addition .note { color: #918a96; font-family: Arial, sans-serif; font-size: 8px; margin-bottom: 6px; }
    .details { margin-top: 14px; color: #5f5668; background: #f6f3f8; border-radius: 8px; padding: 9px 11px; font-family: Arial, sans-serif; font-size: 8px; line-height: 1.7; }
    .details strong { display: block; color: #6f637e; letter-spacing: 0.5px; margin-bottom: 2px; }
    .tags { display: flex; flex-wrap: wrap; align-items: center; gap: 5px; margin-top: 14px; font-family: Arial, sans-serif; font-size: 8px; }
    .tags strong { color: #6f637e; letter-spacing: 0.5px; margin-right: 3px; }
    .tags span { color: #5f5668; background: #f0ecf3; border: 1px solid #ded6e4; border-radius: 10px; padding: 3px 7px; }
    .empty-archive { padding: 52px 0; color: #7e7685; font-style: italic; text-align: center; }
    footer { color: #958c9c; font-family: Arial, sans-serif; font-size: 8px; text-align: center; margin-top: 24px; }
  </style>
</head>
<body>
  <header>
    <div class="eyebrow">Inner</div>
    <h1>Dream Archive</h1>
    <div class="archive-meta">${escapeHtml(rangeLabel)} &middot; ${archive.entryCount} ${archive.entryCount === 1 ? 'entry' : 'entries'} &middot; Exported ${escapeHtml(formatDate(archive.generatedAt))}</div>
  </header>
  <main>${entries || '<div class="empty-archive">No entries were recorded in this range.</div>'}</main>
  <footer>Your memories, carried with you.</footer>
</body>
</html>`;
}
