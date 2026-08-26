import { sanitizeSentryEvent } from '../sentrySanitizer';
import { describe, expect, it } from '@jest/globals';

describe('sanitizeSentryEvent', () => {
  it('redacts private terms and removes non-lifecycle breadcrumb data', () => {
    const event = {
      breadcrumbs: [{ category: 'ui.click', message: 'Open dream journal entry', data: { private: true } }],
    } as any;

    expect(sanitizeSentryEvent(event).breadcrumbs).toEqual([
      { category: 'ui.click', message: 'Open [redacted] [redacted] [redacted]', data: undefined },
    ]);
  });

  it('does not call replace on malformed non-string messages', () => {
    const event = {
      breadcrumbs: [{ category: 'custom', message: { unexpected: true }, data: { private: true } }],
    } as any;

    expect(() => sanitizeSentryEvent(event)).not.toThrow();
    expect(sanitizeSentryEvent(event).breadcrumbs?.[0].message).toBeUndefined();
  });

  it('preserves allowlisted lifecycle data', () => {
    const event = {
      breadcrumbs: [{ category: 'media.lifecycle', message: 'video active', data: { screen: 'Splash' } }],
    } as any;

    expect(sanitizeSentryEvent(event).breadcrumbs?.[0].data).toEqual({ screen: 'Splash' });
  });
});
