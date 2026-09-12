import { beforeEach, afterEach, describe, expect, it, jest } from '@jest/globals';

jest.mock('expo-file-system', () => ({
  cacheDirectory: 'file:///cache/',
  makeDirectoryAsync: jest.fn(), getInfoAsync: jest.fn(),
  deleteAsync: jest.fn(), moveAsync: jest.fn(), createDownloadResumable: jest.fn(),
}));

import * as FileSystem from 'expo-file-system';
import { getRitualAudioUri, RITUAL_AUDIO } from '../ritualAudio';
const fs = FileSystem as jest.Mocked<typeof FileSystem>;
const asset = RITUAL_AUDIO.clean_slate_pre;
const destination = 'file:///cache/ritual-audio-v1/clean_slate_pre.m4a';
let files: Map<string, { size: number; md5: string }>;

beforeEach(() => {
  jest.clearAllMocks();
  files = new Map();
  fs.makeDirectoryAsync.mockResolvedValue(undefined);
  fs.getInfoAsync.mockImplementation(async uri => files.has(uri)
    ? { exists: true, isDirectory: false, uri, modificationTime: 0, ...files.get(uri)! }
    : { exists: false, isDirectory: false, uri });
  fs.deleteAsync.mockImplementation(async uri => { files.delete(uri); });
  fs.moveAsync.mockImplementation(async ({ from, to }) => {
    files.set(to, files.get(from)!); files.delete(from);
  });
  fs.createDownloadResumable.mockImplementation((_url, path) => ({
    downloadAsync: async () => {
      files.set(path, { size: asset.bytes, md5: asset.md5 });
      return { status: 200, uri: path, headers: {} };
    },
    cancelAsync: async () => {},
  }) as any);
});
afterEach(() => { jest.useRealTimers(); });

describe('ritual audio cache', () => {
  it('reuses a verified file offline without a network request', async () => {
    files.set(destination, { size: asset.bytes, md5: asset.md5 });
    await expect(getRitualAudioUri('clean_slate_pre')).resolves.toBe(destination);
    expect(fs.createDownloadResumable).not.toHaveBeenCalled();
  });

  it('shares simultaneous requests and only publishes a verified download', async () => {
    await expect(Promise.all([getRitualAudioUri('clean_slate_pre'), getRitualAudioUri('clean_slate_pre')]))
      .resolves.toEqual([destination, destination]);
    expect(fs.createDownloadResumable).toHaveBeenCalledTimes(1);
    expect(fs.moveAsync).toHaveBeenCalledTimes(1);
    expect(files.get(destination)).toEqual({ size: asset.bytes, md5: asset.md5 });
  });

  it('replaces a corrupt cache entry', async () => {
    files.set(destination, { size: asset.bytes, md5: 'wrong' });
    await expect(getRitualAudioUri('clean_slate_pre')).resolves.toBe(destination);
    expect(fs.createDownloadResumable).toHaveBeenCalledTimes(1);
  });

  it.each([404, 500])('rejects HTTP %s and lets the next attempt retry', async status => {
    fs.createDownloadResumable.mockImplementationOnce((_url, path) => ({
      downloadAsync: async () => ({ status, uri: path, headers: {} }),
      cancelAsync: async () => {},
    }) as any);
    await expect(getRitualAudioUri('clean_slate_pre')).rejects.toThrow('download failed');
    expect(fs.moveAsync).not.toHaveBeenCalled();
    await expect(getRitualAudioUri('clean_slate_pre')).resolves.toBe(destination);
  });

  it.each([
    { size: 12, md5: asset.md5 },
    { size: asset.bytes, md5: 'wrong' },
  ])('rejects incomplete or incorrect audio %j', async info => {
    fs.createDownloadResumable.mockImplementationOnce((_url, path) => ({
      downloadAsync: async () => {
        files.set(path, info); return { status: 200, uri: path, headers: {} };
      },
      cancelAsync: async () => {},
    }) as any);
    await expect(getRitualAudioUri('clean_slate_pre')).rejects.toThrow('incomplete');
    expect(fs.moveAsync).not.toHaveBeenCalled();
    expect(files.has(destination)).toBe(false);
  });

  it('cancels a stalled download and allows retry', async () => {
    jest.useFakeTimers();
    const cancel = jest.fn(async () => {});
    fs.createDownloadResumable.mockImplementationOnce(() => ({
      downloadAsync: () => new Promise(() => {}), cancelAsync: cancel,
    }) as any);
    const result = expect(getRitualAudioUri('clean_slate_pre')).rejects.toThrow('timed out');
    await jest.advanceTimersByTimeAsync(30_000);
    await result;
    expect(cancel).toHaveBeenCalledTimes(1);
    await expect(getRitualAudioUri('clean_slate_pre')).resolves.toBe(destination);
  });
});
