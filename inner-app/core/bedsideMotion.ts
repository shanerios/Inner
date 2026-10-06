import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Record-only bedside motion. Summarises the phone's accelerometer into one-minute
 * buckets so a later pass can judge whether it tracks anything real. Nothing in
 * playback or learning reads it. Numbers only; no audio, text, or location.
 */
export const BEDSIDE_MOTION_KEY = 'inner.bedsideMotion.v1';
export const BEDSIDE_MOTION_BUCKET_MS = 60_000;
const SCHEMA_VERSION = 1 as const;
const MAX_RECORDED_NIGHTS = 14;
const MAX_BUCKETS = 14 * 60;

type Storage = Pick<typeof AsyncStorage, 'getItem' | 'setItem'>;

export type BedsideMotionRecord = {
  schemaVersion: typeof SCHEMA_VERSION;
  sessionId: string;
  startedAt: number;
  updatedAt: number;
  /** Requested time between readings, not a guarantee. `samples` shows what really arrived. */
  sampleIntervalMs: number;
  bucketMs: typeof BEDSIDE_MOTION_BUCKET_MS;
  /** Per minute: average change between consecutive readings, in thousandths of g. */
  mean: number[];
  /** Per minute: the largest change between consecutive readings, in thousandths of g. */
  peak: number[];
  /** Per minute: how many readings arrived. Gaps expose a throttled or suspended sensor. */
  samples: number[];
};

type Bucket = { sum: number; peak: number; count: number };

/**
 * Uses the change between consecutive readings, which removes gravity and the phone's
 * orientation, so a still phone reads near zero wherever it lies.
 */
export class BedsideMotionRecorder {
  private readonly buckets: Bucket[] = [];
  private last: { at: number; x: number; y: number; z: number } | null = null;

  constructor(
    private readonly sessionId: string,
    private readonly startedAt: number,
    private readonly sampleIntervalMs: number,
  ) {}

  addSample(atMs: number, x: number, y: number, z: number): void {
    if (![atMs, x, y, z].every(Number.isFinite)) return;
    const index = Math.floor((atMs - this.startedAt) / BEDSIDE_MOTION_BUCKET_MS);
    if (index < 0 || index >= MAX_BUCKETS) return;
    const previous = this.last;
    this.last = { at: atMs, x, y, z };
    // A change measured across a long gap is not motion, so it starts afresh instead.
    if (!previous || atMs - previous.at > this.sampleIntervalMs * 3) return;
    const change = Math.sqrt((x - previous.x) ** 2 + (y - previous.y) ** 2 + (z - previous.z) ** 2) * 1_000;
    while (this.buckets.length <= index) this.buckets.push({ sum: 0, peak: 0, count: 0 });
    const bucket = this.buckets[index];
    bucket.sum += change;
    bucket.count += 1;
    if (change > bucket.peak) bucket.peak = change;
  }

  snapshot(now: number): BedsideMotionRecord {
    return {
      schemaVersion: SCHEMA_VERSION,
      sessionId: this.sessionId,
      startedAt: this.startedAt,
      updatedAt: now,
      sampleIntervalMs: this.sampleIntervalMs,
      bucketMs: BEDSIDE_MOTION_BUCKET_MS,
      mean: this.buckets.map(bucket => (bucket.count ? Math.round(bucket.sum / bucket.count * 10) / 10 : 0)),
      peak: this.buckets.map(bucket => Math.round(bucket.peak * 10) / 10),
      samples: this.buckets.map(bucket => bucket.count),
    };
  }
}

function validRecord(value: unknown): value is BedsideMotionRecord {
  if (!value || typeof value !== 'object') return false;
  const record = value as Partial<BedsideMotionRecord>;
  return record.schemaVersion === SCHEMA_VERSION
    && typeof record.sessionId === 'string'
    && typeof record.startedAt === 'number'
    && Array.isArray(record.mean) && Array.isArray(record.peak) && Array.isArray(record.samples);
}

export async function loadBedsideMotion(storage: Storage = AsyncStorage): Promise<BedsideMotionRecord[]> {
  try {
    const raw = await storage.getItem(BEDSIDE_MOTION_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    return Array.isArray(parsed?.records) ? parsed.records.filter(validRecord) : [];
  } catch {
    return [];
  }
}

/** Replaces the night's earlier snapshot, keeping the most recent nights only. */
export async function saveBedsideMotion(record: BedsideMotionRecord, storage: Storage = AsyncStorage): Promise<void> {
  const existing = await loadBedsideMotion(storage);
  const records = [record, ...existing.filter(item => item.sessionId !== record.sessionId)]
    .sort((left, right) => right.startedAt - left.startedAt)
    .slice(0, MAX_RECORDED_NIGHTS);
  await storage.setItem(BEDSIDE_MOTION_KEY, JSON.stringify({ schemaVersion: SCHEMA_VERSION, records }));
}

export type BedsideMotionSummary = {
  minutesRecorded: number;
  minutesWithReadings: number;
  meanOfMeans: number;
  peak: number;
};

export function summarizeBedsideMotion(record: BedsideMotionRecord): BedsideMotionSummary {
  const withReadings = record.samples.filter(count => count > 0).length;
  const sum = record.mean.reduce((total, value, index) => total + (record.samples[index] ? value : 0), 0);
  return {
    minutesRecorded: record.samples.length,
    minutesWithReadings: withReadings,
    meanOfMeans: withReadings ? Math.round(sum / withReadings * 10) / 10 : 0,
    peak: record.peak.reduce((max, value) => Math.max(max, value), 0),
  };
}
