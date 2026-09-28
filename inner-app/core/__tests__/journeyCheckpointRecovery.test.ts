import { expect, it, jest } from '@jest/globals';
import { recoverJourneyCheckpoints, isLiveJourneyCheckpoint } from '../journeyCheckpointRecovery';
import type { NativeCheckpoint, NativeEngineDebugState } from '../audio/types';

const checkpoint = (sessionId: string): NativeCheckpoint => ({ sessionId, positionMs: 20_000,
  lastUpdatedAt: 123, firedSignalIds: [], pendingDiagnostics: [], processInstanceId: 'process-a' });
const live: NativeEngineDebugState = { playbackState: 'playing', engineRunning: true, timelineLoaded: true,
  renderedFrames: 960, sampleRate: 48_000, checkpointSessionId: 'live', processInstanceId: 'process-a' };

it('preserves a matching live or paused native session but reconciles older receipts', async () => {
  const records = [{ ...checkpoint('old'), terminalOutcome: 'completed' as const }, checkpoint('live')];
  const clearCheckpoint = jest.fn(async (_id?: string) => {});
  const reconcile = jest.fn(async (_record: NativeCheckpoint) => {});
  await recoverJourneyCheckpoints({ getCheckpoint: async () => records[1], getCheckpoints: async () => records,
    getDebugState: async () => live, clearCheckpoint }, reconcile);
  expect(reconcile.mock.calls.map(([record]) => record.sessionId)).toEqual(['old']);
  expect(clearCheckpoint.mock.calls).toEqual([['old']]);
  expect(isLiveJourneyCheckpoint(checkpoint('live'), { ...live, playbackState: 'paused' })).toBe(true);
  expect(isLiveJourneyCheckpoint(checkpoint('live'), { ...live, playbackState: 'paused', engineRunning: false })).toBe(true);
  expect(isLiveJourneyCheckpoint(checkpoint('live'), { ...live, processInstanceId: 'new-process' })).toBe(false);
});

it('does not acknowledge evidence when the history write fails', async () => {
  const clearCheckpoint = jest.fn(async (_id?: string) => {});
  await expect(recoverJourneyCheckpoints({ getCheckpoint: async () => checkpoint('old'), clearCheckpoint },
    async () => { throw new Error('disk full'); })).rejects.toThrow('disk full');
  expect(clearCheckpoint).not.toHaveBeenCalled();
});

it('acknowledges only after the durable write and keeps IDs separate', async () => {
  const order: string[] = [];
  await recoverJourneyCheckpoints({ getCheckpoint: async () => null,
    getCheckpoints: async () => [checkpoint('one'), checkpoint('two')],
    clearCheckpoint: async id => { order.push(`ack:${id}`); } },
  async record => { order.push(`write:${record.sessionId}`); });
  expect(order).toEqual(['write:one', 'ack:one', 'write:two', 'ack:two']);
});

it('does not reinterpret a legacy live service as a dead session', () => {
  expect(isLiveJourneyCheckpoint(checkpoint('legacy'), { ...live, checkpointSessionId: undefined })).toBe(true);
});

it('retains nonterminal evidence when live native state cannot be inspected', async () => {
  const clearCheckpoint = jest.fn(async (_id?: string) => {});
  const reconcile = jest.fn(async (_record: NativeCheckpoint) => {});
  await recoverJourneyCheckpoints({ getCheckpoint: async () => checkpoint('live'),
    getDebugState: async () => null, clearCheckpoint }, reconcile);
  expect(reconcile).not.toHaveBeenCalled();
  expect(clearCheckpoint).not.toHaveBeenCalled();
});
