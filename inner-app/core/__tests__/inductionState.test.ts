import { beforeEach, describe, expect, it, jest } from '@jest/globals';

const mockStore = new Map<string, string>();
jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(async (key: string) => (mockStore.has(key) ? mockStore.get(key)! : null)),
    setItem: jest.fn(async (key: string, value: string) => { mockStore.set(key, value); }),
    removeItem: jest.fn(async (key: string) => { mockStore.delete(key); }),
  },
}));

import {
  advanceInductionStatus,
  EMPTY_INDUCTION_STATE,
  getInductionState,
  INDUCTION_STATE_KEY,
  inductionHoldsTour,
  inductionOffer,
  recordInductionEntry,
  type InductionState,
} from '../inductionState';

const state = (status: InductionState['status'], entry: InductionState['entry'] = null): InductionState => ({ status, entry });

describe('The Induction on Home', () => {
  beforeEach(() => mockStore.clear());

  describe('what is offered', () => {
    it('welcomes a new visitor over their first Home, and holds the tour for their answer', () => {
      expect(inductionOffer(state('none'), true)).toBe('welcome');
      expect(inductionHoldsTour(state('none'), true)).toBe(true);
    });

    it('offers someone who has been using Inner a card, and never involves the tour', () => {
      expect(inductionOffer(state('none'), false)).toBe('quiet');
      expect(inductionHoldsTour(state('none'), false)).toBe(false);
    });

    it('leaves the Induction waiting as a card after the welcome is skipped, and lets the tour run', () => {
      for (const tourUnseen of [true, false]) {
        expect(inductionOffer(state('skipped'), tourUnseen)).toBe('quiet');
        expect(inductionHoldsTour(state('skipped'), tourUnseen)).toBe(false);
      }
    });

    it('lets the tour run once they have begun, leaving the card until they finish it', () => {
      for (const tourUnseen of [true, false]) {
        expect(inductionOffer(state('started'), tourUnseen)).toBe('quiet');
        expect(inductionHoldsTour(state('started'), tourUnseen)).toBe(false);
      }
    });

    it('offers nothing once it is finished or let go, and the tour is free', () => {
      for (const status of ['completed', 'dismissed'] as const) {
        for (const tourUnseen of [true, false]) {
          expect(inductionOffer(state(status), tourUnseen)).toBe('none');
          expect(inductionHoldsTour(state(status), tourUnseen)).toBe(false);
        }
      }
    });
  });

  describe('what is kept', () => {
    it('starts empty, and treats a damaged value as empty', async () => {
      expect(await getInductionState()).toEqual(EMPTY_INDUCTION_STATE);
      mockStore.set(INDUCTION_STATE_KEY, '{not json');
      expect(await getInductionState()).toEqual(EMPTY_INDUCTION_STATE);
      mockStore.set(INDUCTION_STATE_KEY, JSON.stringify({ status: 'finished-ish', entry: 'whoever' }));
      expect(await getInductionState()).toEqual(EMPTY_INDUCTION_STATE);
    });

    it('only moves forward: skipped, begun, let go, then completed, and never back', async () => {
      expect((await advanceInductionStatus('skipped')).status).toBe('skipped');
      expect((await advanceInductionStatus('none')).status).toBe('skipped');
      expect((await advanceInductionStatus('started')).status).toBe('started');
      expect((await advanceInductionStatus('skipped')).status).toBe('started');
      expect((await advanceInductionStatus('dismissed')).status).toBe('dismissed');
      expect((await advanceInductionStatus('started')).status).toBe('dismissed');
      expect((await advanceInductionStatus('completed')).status).toBe('completed');
      expect((await advanceInductionStatus('dismissed')).status).toBe('completed');
      expect((await getInductionState()).status).toBe('completed');
    });

    it('remembers how it was first offered, and the first answer stands', async () => {
      await recordInductionEntry('new');
      await recordInductionEntry('returning');
      const afterAdvance = await advanceInductionStatus('started');
      expect(afterAdvance).toEqual({ status: 'started', entry: 'new' });
    });

    it('keeps nothing but a status and how it was offered', async () => {
      await recordInductionEntry('returning');
      await advanceInductionStatus('completed');
      expect(Object.keys(JSON.parse(mockStore.get(INDUCTION_STATE_KEY)!)).sort()).toEqual(['entry', 'status']);
    });
  });
});
