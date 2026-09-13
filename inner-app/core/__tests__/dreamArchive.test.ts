import {
  buildDreamArchiveExport,
  buildDreamArchiveHtml,
  filterDreamArchiveEntries,
  serializeDreamArchive,
} from '../dreamArchive';
import type { JournalEntry } from '../journalRepo';
import { describe, expect, it } from '@jest/globals';

const entry = (id: string, createdAt: number, body = 'A quiet sea.'): JournalEntry => ({
  id,
  createdAt,
  updatedAt: createdAt,
  title: `Dream ${id}`,
  body,
  kind: 'dream',
  dreamSigns: ['water'],
});

describe('Dream Archive', () => {
  const now = new Date(2026, 8, 13, 12).getTime();

  it('filters and orders entries for the selected range', () => {
    const recent = entry('recent', now - 2 * 24 * 60 * 60_000);
    const older = entry('older', now - 40 * 24 * 60 * 60_000);
    expect(filterDreamArchiveEntries([older, recent], '30days', now)).toEqual([recent]);
    expect(filterDreamArchiveEntries([older, recent], 'all', now)).toEqual([recent, older]);
  });

  it('serializes a versioned, portable JSON document', () => {
    const archive = buildDreamArchiveExport([entry('one', now)], 'all', now);
    expect(JSON.parse(serializeDreamArchive(archive))).toEqual(expect.objectContaining({
      schemaVersion: 1,
      generatedAt: now,
      range: 'all',
      entryCount: 1,
    }));
  });

  it('escapes private text before placing it in HTML', () => {
    const archive = buildDreamArchiveExport([entry('one', now, '<script>alert("x")</script>')], 'all', now);
    const html = buildDreamArchiveHtml(archive);
    expect(html).toContain('&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;');
    expect(html).not.toContain('<script>alert');
  });
});
