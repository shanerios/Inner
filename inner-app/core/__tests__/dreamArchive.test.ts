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
      schemaVersion: 4,
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

  describe('recollections and reflections', () => {
    const base = {
      ...entry('rec', now, 'A stone corridor toward a blue light, and stairs.'),
      baseline: { text: 'A stone corridor toward a blue light.', capturedAt: now - 2 * 60 * 60_000, source: 'original' as const, preservedAt: now - 2 * 60 * 60_000 },
      additions: [
        { id: 'b', kind: 'reflection' as const, text: 'Reminds me of <another> dream.', createdAt: now - 60_000 },
        { id: 'a', kind: 'recollection' as const, text: 'A staircase to the left.', createdAt: now - 3_600_000, editedAt: now - 3_000_000 },
      ],
    };

    it('includes unreadable stored additions in the JSON export so nothing is lost', () => {
      const withRejects = { ...base, unreadableAdditions: [{ id: 'x' }, 'junk'] };
      const parsed = JSON.parse(serializeDreamArchive(buildDreamArchiveExport([withRejects], 'all', now)));
      expect(parsed.entries[0].unreadableAdditions).toEqual([{ id: 'x' }, 'junk']);
      const html = buildDreamArchiveHtml(buildDreamArchiveExport([withRejects], 'all', now));
      expect(html).not.toContain('junk');
    });

    it('carries the baseline and additions through the JSON export', () => {
      const parsed = JSON.parse(serializeDreamArchive(buildDreamArchiveExport([base], 'all', now)));
      expect(parsed.entries[0].baseline.text).toBe('A stone corridor toward a blue light.');
      expect(parsed.entries[0].additions).toHaveLength(2);
    });

    it('labels the current account and shows the original separately, oldest addition first', () => {
      const html = buildDreamArchiveHtml(buildDreamArchiveExport([base], 'all', now));
      expect(html).toContain('Current account &middot; edited since');
      expect(html).toContain('Original recollection');
      expect(html).toContain('A stone corridor toward a blue light.</p>');
      expect(html.indexOf('Additional recollection')).toBeLessThan(html.indexOf('Reflection &middot;'));
      expect(html).toContain('&middot; Edited');
      expect(html).toContain('Reminds me of &lt;another&gt; dream.');
      expect(html).not.toContain('<another>');
    });

    it('calls an unchanged baseline the original and a legacy snapshot the first saved version', () => {
      const unchanged = { ...base, body: base.baseline.text, additions: undefined };
      const unchangedHtml = buildDreamArchiveHtml(buildDreamArchiveExport([unchanged], 'all', now));
      expect(unchangedHtml).toContain('Original recollection &middot;');
      expect(unchangedHtml).not.toContain('edited since');

      const legacy = { ...base, baseline: { ...base.baseline, source: 'legacy_snapshot' as const, preservedAt: now } };
      const legacyHtml = buildDreamArchiveHtml(buildDreamArchiveExport([legacy], 'all', now));
      expect(legacyHtml).toContain('First saved version');
      expect(legacyHtml).not.toContain('Original recollection');
      expect(legacyHtml).toContain('may have been edited before then');
    });

    it('leaves entries without a baseline exactly as they were', () => {
      const html = buildDreamArchiveHtml(buildDreamArchiveExport([entry('plain', now)], 'all', now));
      expect(html).not.toContain('account-label">');
      expect(html).not.toContain('class="addition');
    });
  });
});
