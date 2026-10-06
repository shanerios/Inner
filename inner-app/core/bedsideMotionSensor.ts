import { Accelerometer } from 'expo-sensors';
import { BedsideMotionRecorder, saveBedsideMotion } from './bedsideMotion';

const SAMPLE_INTERVAL_MS = 250;
const FLUSH_INTERVAL_MS = 5 * 60_000;

/**
 * Starts record-only accelerometer capture for one overnight session. Returns a stop
 * function that writes the final summary. Failures are swallowed: this must never
 * affect playback.
 */
export function startBedsideMotionRecording(sessionId: string, startedAt: number): () => Promise<void> {
  const recorder = new BedsideMotionRecorder(sessionId, startedAt, SAMPLE_INTERVAL_MS);
  let stopped = false;
  const flush = () => saveBedsideMotion(recorder.snapshot(Date.now())).catch(() => {});

  Accelerometer.setUpdateInterval(SAMPLE_INTERVAL_MS);
  const subscription = Accelerometer.addListener(({ x, y, z }) => recorder.addSample(Date.now(), x, y, z));
  const timer = setInterval(() => { void flush(); }, FLUSH_INTERVAL_MS);

  return async () => {
    if (stopped) return;
    stopped = true;
    clearInterval(timer);
    subscription.remove();
    await flush();
  };
}
