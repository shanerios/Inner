import {
  buildDreamArchiveExport,
  buildDreamArchiveHtml,
  filterDreamArchiveEntries,
  serializeDreamArchive,
} from '../dreamArchive';
import type { JournalEntry } from '../journalRepo';
import { describe, expect, it } from '@jest/globals';

const entry = (id: string, createdAt: number, body = 'A quiet sea.'): JournalEntry => ({
  schemaVersion: 2,
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

  it('excludes development QA entries from user exports', () => {
    const qa = { ...entry('qa', now), testSession: true };
    expect(filterDreamArchiveEntries([qa], 'all', now)).toEqual([]);
  });

  it('serializes a versioned, portable JSON document', () => {
    const archive = buildDreamArchiveExport([entry('one', now)], 'all', now);
    expect(JSON.parse(serializeDreamArchive(archive))).toEqual(expect.objectContaining({
      schemaVersion: 3,
      generatedAt: now,
      range: 'all',
      entryCount: 1,
      nightRecordCount: 0,
    }));
  });

  it('includes no-recall Night Records in the portable archive', () => {
    const nightRecord = {
      schemaVersion: 1 as const,
      id: 'overnight:night-1',
      source: 'overnight_journey' as const,
      sourceSessionId: 'night-1',
      scheduledAt: now - 9 * 60 * 60_000,
      sleepOnsetAt: now - 8 * 60 * 60_000,
      reviewAt: now,
      reflectedAt: now,
      outcome: { recall: 'none' as const },
    };
    const archive = buildDreamArchiveExport([], 'all', now, [nightRecord]);
    expect(JSON.parse(serializeDreamArchive(archive))).toEqual(expect.objectContaining({
      nightRecordCount: 1,
      nightRecords: [expect.objectContaining({ outcome: { recall: 'none' } })],
    }));
  });

  it('escapes private text before placing it in HTML', () => {
    const archive = buildDreamArchiveExport([entry('one', now, '<script>alert("x")</script>')], 'all', now);
    const html = buildDreamArchiveHtml(archive);
    expect(html).toContain('&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;');
    expect(html).not.toContain('<script>alert');
  });

  it('includes structured dream details in portable and readable exports', () => {
    const detailed = {
      ...entry('lucid', now),
      dreamDetails: {
        awareness: 'yes' as const,
        agency: 'a_little' as const,
        control: {
          attempted: 'yes' as const,
          domains: ['place' as const],
          result: 'partly_worked' as const,
        },
        innerCue: { status: 'recognized' as const, types: ['sound' as const, 'feeling' as const] },
      },
    };
    const archive = buildDreamArchiveExport([detailed], 'all', now);
    expect(archive.entries[0].dreamDetails?.awareness).toBe('yes');
    const html = buildDreamArchiveHtml(archive);
    expect(html).toContain('Lucid awareness: Yes');
    expect(html).toContain('Control: Place, partly worked');
    expect(html).toContain('Inner cue: Sound, Feeling');
  });

  it('includes the linked night in the readable archive', () => {
    const linked = {
      ...entry('linked', now),
      practiceContext: {
        linkedAt: now,
        links: [{
          sessionId: 'night-1',
          type: 'overnight_journey' as const,
          contentTitle: 'Ocean Night',
          startedAt: now - 8 * 60 * 60_000,
          endedAt: now - 5 * 60_000,
          minutesBeforeCapture: 5,
          linkReason: 'exact_overnight_session' as const,
          environment: 'ocean',
          signalId: 'droplets',
        }],
      },
    };
    const html = buildDreamArchiveHtml(buildDreamArchiveExport([linked], 'all', now));
    expect(html).toContain('The night before this dream');
    expect(html).toContain('Ocean Night');
    expect(html).toContain('Recognition signal: Droplets');
  });
});
