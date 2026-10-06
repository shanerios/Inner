import { describe, expect, it, jest } from '@jest/globals';
import * as fs from 'fs';
import * as path from 'path';
import {
  BEDSIDE_MOTION_BUCKET_MS,
  BedsideMotionRecorder,
  loadBedsideMotion,
  saveBedsideMotion,
  summarizeBedsideMotion,
} from '../bedsideMotion';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    getItem: jest.fn(async (key: string) => values.get(key) ?? null),
    setItem: jest.fn(async (key: string, value: string) => { values.set(key, value); }),
  };
}

describe('bedside motion', () => {
  it('reads a still phone as zero whatever way it is lying', () => {
    const recorder = new BedsideMotionRecorder('s', 0, 250);
    for (let i = 0; i < 20; i++) recorder.addSample(i * 250, 0.02, -0.98, 0.1);
    const record = recorder.snapshot(5_000);
    expect(record.mean).toEqual([0]);
    expect(record.peak).toEqual([0]);
    expect(record.samples).toEqual([19]);
  });

  it('measures the change between readings in thousandths of g, per minute', () => {
    const recorder = new BedsideMotionRecorder('s', 1_000, 250);
    recorder.addSample(1_000, 0, 0, 1);
    recorder.addSample(1_250, 0, 0, 1.01);
    recorder.addSample(1_500, 0, 0, 1.01);
    recorder.addSample(1_000 + BEDSIDE_MOTION_BUCKET_MS + 10, 0, 0, 1.01);
    recorder.addSample(1_000 + BEDSIDE_MOTION_BUCKET_MS + 260, 0.03, 0.04, 1.01);
    const record = recorder.snapshot(0);
    expect(record.peak[0]).toBeCloseTo(10, 5);
    expect(record.mean[0]).toBeCloseTo(10 / 2, 1);
    expect(record.peak[1]).toBeCloseTo(50, 5);
    expect(record.samples).toEqual([2, 1]);
  });

  it('shows a gap in readings as empty minutes instead of hiding it', () => {
    const recorder = new BedsideMotionRecorder('s', 0, 250);
    recorder.addSample(0, 0, 0, 1);
    recorder.addSample(100, 0, 0, 1.02);
    recorder.addSample(3 * BEDSIDE_MOTION_BUCKET_MS + 100, 0, 0, 1.05);
    recorder.addSample(3 * BEDSIDE_MOTION_BUCKET_MS + 300, 0, 0, 1.04);
    const record = recorder.snapshot(0);
    expect(record.samples).toEqual([1, 0, 0, 1]);
    expect(summarizeBedsideMotion(record)).toEqual(expect.objectContaining({ minutesRecorded: 4, minutesWithReadings: 2 }));
  });

  it('ignores invalid readings and readings before the night began', () => {
    const recorder = new BedsideMotionRecorder('s', 10_000, 250);
    recorder.addSample(9_000, 0, 0, 1);
    recorder.addSample(10_000, 0, 0, 1);
    recorder.addSample(10_250, Number.NaN, 0, 1);
    expect(recorder.snapshot(0).samples).toEqual([]);
  });

  it('keeps one snapshot per night and only the most recent nights', async () => {
    const storage = memoryStorage();
    for (let night = 0; night < 16; night++) {
      const recorder = new BedsideMotionRecorder(`night-${night}`, night * 1_000, 250);
      await saveBedsideMotion(recorder.snapshot(night), storage as any);
    }
    const first = new BedsideMotionRecorder('night-15', 15_000, 250);
    first.addSample(15_000, 0, 0, 1);
    first.addSample(15_250, 0, 0, 1.1);
    await saveBedsideMotion(first.snapshot(99), storage as any);
    const records = await loadBedsideMotion(storage as any);
    expect(records).toHaveLength(14);
    expect(records[0].sessionId).toBe('night-15');
    expect(records.filter(record => record.sessionId === 'night-15')).toHaveLength(1);
    expect(records[0].peak[0]).toBeGreaterThan(0);
    expect(records.some(record => record.sessionId === 'night-0')).toBe(false);
  });

  it('returns nothing when stored data is unreadable', async () => {
    const storage = { getItem: jest.fn(async () => '{not json'), setItem: jest.fn(async () => {}) };
    await expect(loadBedsideMotion(storage as any)).resolves.toEqual([]);
  });

  it('can only start recording in Inner Lab builds, for overnight journeys', () => {
    const screen = fs.readFileSync(path.resolve(__dirname, '../../screens/LucidJourneyPlayerScreen.tsx'), 'utf8');
    const starts = screen.match(/startBedsideMotionRecording\(/g) ?? [];
    expect(starts).toHaveLength(1);
    expect(screen).toContain('if (INNER_LAB_BUILD && journey.overnight && !stopMotionRef.current) {');
    expect(screen.indexOf('INNER_LAB_BUILD && journey.overnight')).toBeLessThan(screen.indexOf('startBedsideMotionRecording('));
  });
});
