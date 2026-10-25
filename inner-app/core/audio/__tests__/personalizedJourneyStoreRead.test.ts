import { describe, expect, it } from '@jest/globals';
import { FACTORY_AUDIO_JOURNEYS } from '../factoryJourneys';
import { readPersonalizedJourneys, savePersonalizedJourney } from '../personalizedJourneyStore';

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: { getItem: jest.fn(), setItem: jest.fn() },
}));

function memory(initial: string | null = null) {
  let value = initial;
  return {
    getItem: async () => value,
    setItem: async (_key: string, next: string) => { value = next; },
  };
}

describe('readPersonalizedJourneys', () => {
  it('reads an empty store as ok, not unreadable', async () => {
    expect(await readPersonalizedJourneys(memory() as any)).toEqual({ status: 'ok', value: [] });
  });

  it('returns saved journeys', async () => {
    const storage = memory();
    await savePersonalizedJourney('Mine', FACTORY_AUDIO_JOURNEYS[0], storage as any);
    const result = await readPersonalizedJourneys(storage as any);
    expect(result.status).toBe('ok');
    expect(result.status === 'ok' && result.value.map(item => item.title)).toEqual(['Mine']);
  });

  it('reports a storage failure as unreadable', async () => {
    const failing = { getItem: async () => { throw new Error('disk'); }, setItem: async () => {} };
    expect(await readPersonalizedJourneys(failing as any)).toEqual({ status: 'unreadable' });
  });

  it('reports unparseable or malformed data as unreadable', async () => {
    expect(await readPersonalizedJourneys(memory('{not json') as any)).toEqual({ status: 'unreadable' });
    expect(await readPersonalizedJourneys(memory('{"a":1}') as any)).toEqual({ status: 'unreadable' });
  });

  it('skips an invalid entry without calling the store unreadable', async () => {
    expect(await readPersonalizedJourneys(memory('[{"id":1}]') as any)).toEqual({ status: 'ok', value: [] });
  });
});
