#!/usr/bin/env python3
"""
Prepares The Induction's spoken clips from the recordings, into assets/voice/.

    python3 scripts/prepare-induction-voice.py "<folder with the recordings>"

Each clip gets 50 ms of silence in front and 100 ms behind, because the engine fades a clip in over 40 ms and out over
80 ms and the first and last sounds should stay whole. The cue lines are first trimmed to their speech (20 ms before,
50 ms after), since they were recorded with over a second of room tone at the end. The first opening clip rises from
OPEN_1_START_DB to full level over OPEN_1_RISE_SECONDS, because it came in abruptly against the drone.

The recordings are the source of truth and stay where they were made; nothing here edits them.
"""
import sys
import wave
import numpy as np

SOURCES = {
    'induction-open-1': 'induction-open-1.wav',
    'induction-open-2': 'induction-open-2b.wav',
    'induction-cue-1': 'induction-cue-1.wav',
    'induction-cue-2': 'induction-cue-2.wav',
    'induction-close': 'induction-close.wav',
}
TRIM = {'induction-cue-1', 'induction-cue-2'}
OPEN_1_START_DB = -3.0
OPEN_1_RISE_SECONDS = 5.0


def prepare(folder: str, target: str) -> None:
    for name, source in SOURCES.items():
        reader = wave.open(f'{folder}/{source}')
        params = reader.getparams()
        samples = np.frombuffer(reader.readframes(reader.getnframes()), dtype='<i2')
        reader.close()
        assert params.nchannels == 1 and params.sampwidth == 2, f'{source} must be mono 16-bit'
        rate = params.framerate
        if name in TRIM:
            loud = np.nonzero(np.abs(samples) > int(32768 * 10 ** (-45 / 20)))[0]
            samples = samples[max(0, loud[0] - int(rate * 0.02)):min(len(samples), loud[-1] + int(rate * 0.05))]
        if name == 'induction-open-1':
            rise = int(rate * OPEN_1_RISE_SECONDS)
            gain_db = np.ones(len(samples)) * 0.0
            gain_db[:rise] = np.linspace(OPEN_1_START_DB, 0.0, rise)
            samples = np.round(samples * 10 ** (gain_db / 20)).astype('<i2')
        padded = np.concatenate([np.zeros(int(rate * 0.05), dtype='<i2'), samples, np.zeros(int(rate * 0.10), dtype='<i2')])
        writer = wave.open(f'{target}/{name}.wav', 'wb')
        writer.setparams(params)
        writer.writeframes(padded.astype('<i2').tobytes())
        writer.close()
        print(f'{name}: {len(padded) / rate:.2f} s')


if __name__ == '__main__':
    prepare(sys.argv[1], 'assets/voice')
