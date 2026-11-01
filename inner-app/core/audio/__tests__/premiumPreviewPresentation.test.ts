import { describe, expect, it, jest } from '@jest/globals';

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: { getItem: async () => null, setItem: async () => undefined },
}));
jest.mock('../../../src/core/subscriptions/membership', () => ({
  resolveMembership: async () => 'unknown',
  clearMembershipCache: () => undefined,
}));

import { formatPreviewTime, noticeFor, presentPreview } from '../premiumPreviewRuntime';
import { PREVIEW_ALLOWANCE_MS } from '../premiumPreview';
import type { PreviewSnapshot } from '../premiumPreviewService';

function snapshot(overrides: Partial<PreviewSnapshot> = {}): PreviewSnapshot {
  return {
    loaded: true,
    malformed: false,
    membership: 'not_member',
    remainingMs: { temple: PREVIEW_ALLOWANCE_MS, abyssal: PREVIEW_ALLOWANCE_MS, cosmic: PREVIEW_ALLOWANCE_MS, fire: PREVIEW_ALLOWANCE_MS },
    usedMs: { temple: 0, abyssal: 0, cosmic: 0, fire: 0 },
    charging: [],
    ...overrides,
  };
}

describe('preview presentation', () => {
  it('labels an untouched premium world as a 5-minute preview and explains the fade before it starts', () => {
    const view = presentPreview(snapshot());
    expect(view.labelFor('cosmic')).toBe('Preview · 5 minutes');
    expect(view.note).toMatch(/5 minutes each/);
    expect(view.note).toMatch(/fades out when its time ends/);
  });

  it('shows the remaining time once a world has been used', () => {
    const view = presentPreview(snapshot({
      remainingMs: { temple: 0, abyssal: 0, cosmic: 90_000, fire: 0 },
      usedMs: { temple: 0, abyssal: 0, cosmic: 210_000, fire: 0 },
    }));
    expect(view.labelFor('cosmic')).toBe('Preview · 1:30 left');
    expect(view.labelFor('temple')).toBe('Inner: Deeper');
  });

  it('shows no preview labels to members', () => {
    const view = presentPreview(snapshot({ membership: 'member' }));
    expect(view.labelFor('cosmic')).toBeNull();
    expect(view.note).toBeNull();
  });

  it('shows no labels until stored usage has loaded', () => {
    expect(presentPreview(snapshot({ loaded: false })).labelFor('fire')).toBeNull();
  });

  it('formats remaining time as minutes and seconds, rounding up', () => {
    expect(formatPreviewTime(299_001)).toBe('5:00');
    expect(formatPreviewTime(61_000)).toBe('1:01');
    expect(formatPreviewTime(-5)).toBe('0:00');
  });
});

describe('preview notices', () => {
  it('offers a retry for a verification failure and never claims non-membership', () => {
    const notice = noticeFor({ patch: {}, denied: ['fire'], reason: 'verification_failed' });
    expect(notice?.action.kind).toBe('retry');
    expect(notice?.text).toMatch(/couldn't confirm your Inner: Deeper membership/);
    expect(notice?.text).not.toMatch(/not a member|not subscribed|no subscription/i);
  });

  it('offers Inner: Deeper when a preview has been used up', () => {
    const notice = noticeFor({ patch: {}, denied: ['cosmic'], reason: 'exhausted' });
    expect(notice?.action.kind).toBe('membership');
    expect(notice?.text).toMatch(/5-minute preview of Cosmic has ended/);
  });

  it('shows nothing when a change was allowed', () => {
    expect(noticeFor({ patch: {}, denied: [], reason: null })).toBeNull();
  });
});
