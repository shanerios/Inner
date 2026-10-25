// core/journalMigration.ts
// One-time, resumable preservation of a baseline for entries saved before baselines existed.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { preserveBaseline, readIndexIds, type SealOutcome } from './journalRepo';

export const BASELINE_MIGRATION_KEY = 'journal:migration:baseline.v1';

export type BaselineMigrationResult = {
  /** True when a previous run already completed and nothing was scanned. */
  skipped: boolean;
  total: number;
  sealed: number;
  alreadyPreserved: number;
  stillDrafting: number;
  empty: number;
  /** Index entries with no stored record. They are left as they are. */
  missing: number;
  /** Records that could not be read or verified. Untouched, retried next launch. */
  failed: number;
  complete: boolean;
};

const BATCH_SIZE = 10;

const yieldToUi = () => new Promise<void>(resolve => setTimeout(resolve, 0));

function emptyResult(): BaselineMigrationResult {
  return {
    skipped: false, total: 0, sealed: 0, alreadyPreserved: 0, stillDrafting: 0,
    empty: 0, missing: 0, failed: 0, complete: false,
  };
}

/**
 * Safe to call on every launch. Each entry is its own unit of work, so an
 * interrupted run simply continues where it stopped. Records that cannot be read
 * or verified are left byte-for-byte as they were and counted as failed, which
 * keeps the run "incomplete" so it is retried next time.
 */
export async function migrateJournalBaselines(
  options: { batchSize?: number; force?: boolean; yieldFn?: () => Promise<void> } = {},
): Promise<BaselineMigrationResult> {
  const result = emptyResult();
  const batchSize = options.batchSize ?? BATCH_SIZE;
  const yieldFn = options.yieldFn ?? yieldToUi;

  if (!options.force) {
    try {
      const marker = await AsyncStorage.getItem(BASELINE_MIGRATION_KEY);
      if (marker && JSON.parse(marker)?.status === 'complete') {
        return { ...result, skipped: true, complete: true };
      }
    } catch {
      // an unreadable marker just means we scan again
    }
  }

  const ids = await readIndexIds();
  result.total = ids.length;

  for (let i = 0; i < ids.length; i += 1) {
    let outcome: SealOutcome;
    try {
      outcome = await preserveBaseline(ids[i], 'legacy_only');
    } catch {
      outcome = 'unreadable';
    }
    switch (outcome) {
      case 'sealed': result.sealed += 1; break;
      case 'already_preserved': result.alreadyPreserved += 1; break;
      case 'still_drafting': result.stillDrafting += 1; break;
      case 'empty': result.empty += 1; break;
      case 'missing': result.missing += 1; break;
      default: result.failed += 1; break;
    }
    if ((i + 1) % batchSize === 0) await yieldFn();
  }

  result.complete = result.failed === 0;
  try {
    // Counts only; no journal content or IDs.
    await AsyncStorage.setItem(BASELINE_MIGRATION_KEY, JSON.stringify({
      status: result.complete ? 'complete' : 'partial',
      updatedAt: Date.now(),
      failed: result.failed,
    }));
  } catch {
    // the per-entry state is what counts; the marker is only a shortcut
  }
  return result;
}
