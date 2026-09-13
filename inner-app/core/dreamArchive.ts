import type { JournalEntry } from './journalRepo';

export type DreamArchiveRange = 'all' | 'year' | '30days';

export type DreamArchiveExport = {
  schemaVersion: 1;
  generatedAt: number;
  range: DreamArchiveRange;
  entryCount: number;
  entries: JournalEntry[];
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
    .filter(entry => entry.createdAt >= start)
    .sort((a, b) => b.createdAt - a.createdAt);
}

export function buildDreamArchiveExport(
  entries: JournalEntry[],
  range: DreamArchiveRange,
  generatedAt = Date.now(),
): DreamArchiveExport {
  return {
    schemaVersion: 1,
    generatedAt,
    range,
    entryCount: entries.length,
    entries,
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

export function buildDreamArchiveHtml(archive: DreamArchiveExport): string {
  const entries = archive.entries.map((entry, index) => {
    const title = entry.title?.trim() || 'Untitled memory';
    const metadata = entryMeta(entry);
    const signs = entry.dreamSigns?.filter(Boolean) ?? [];
    const intentions = entry.intentionTags?.filter(Boolean) ?? [];
    return `
      <article class="entry${index > 0 ? ' continued' : ''}">
        <div class="entry-date">${escapeHtml(formatDate(entry.createdAt))}</div>
        <h2>${escapeHtml(title)}</h2>
        ${metadata.length ? `<div class="metadata">${metadata.map(escapeHtml).join(' &middot; ')}</div>` : ''}
        <div class="body">${bodyHtml(entry.body)}</div>
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
