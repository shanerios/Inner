import * as fs from 'fs';
import * as path from 'path';
import { sanitizeSentryEvent, scrubBreadcrumb } from '../sentrySanitizer';
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

describe('scrubBreadcrumb', () => {
  const SIGN = 'Flying';

  it('keeps nothing a touch was labelled with, only that a tap happened', () => {
    const scrubbed = scrubBreadcrumb({
      category: 'touch',
      type: 'user',
      level: 'info',
      message: `Touch event within element: Do not use ${SIGN} as tonight's recognition focus`,
      data: { path: [{ name: 'Pressable', label: `Practice recognizing ${SIGN} as a dream sign` }] },
    } as any);
    expect(scrubbed).toMatchObject({ category: 'touch', message: 'Touch event' });
    expect(scrubbed).not.toHaveProperty('data');
    expect(JSON.stringify(scrubbed)).not.toContain(SIGN);
  });

  it('treats every touch category the same way', () => {
    for (const category of ['touch', 'ui.click', 'ui.tap', 'ui.touch', 'ui.multiClick']) {
      const scrubbed = scrubBreadcrumb({ category, message: `${SIGN} dream sign`, data: { label: SIGN } } as any);
      expect(JSON.stringify(scrubbed)).not.toContain(SIGN);
      expect(scrubbed?.message).toBe('Touch event');
    }
  });

  it('drops console output and any kind of breadcrumb it does not know', () => {
    for (const category of ['console', 'custom', 'device.event', 'device.orientation', 'sentry.event', 'user', '', undefined]) {
      expect(scrubBreadcrumb({ category, message: `${SIGN} appeared in 4 dreams` } as any)).toBeNull();
    }
  });

  it('keeps our lifecycle breadcrumbs with their data, redacting private words in the message', () => {
    const kept = scrubBreadcrumb({
      category: 'media.lifecycle', level: 'info', message: 'video active in dream journal', data: { screen: 'Splash', activeVideoSources: 2 },
    });
    expect(kept).toMatchObject({ category: 'media.lifecycle', message: 'video active in [redacted] [redacted]', data: { screen: 'Splash', activeVideoSources: 2 } });
    expect(scrubBreadcrumb({ category: 'navigation.lifecycle', message: 'screen changed', data: { from: 'Home', to: 'Overnight' } })?.data).toEqual({ from: 'Home', to: 'Overnight' });
  });

  it('keeps only the screen names of a navigation breadcrumb, never route params', () => {
    const scrubbed = scrubBreadcrumb({ category: 'navigation', data: { from: 'Home', to: 'Overnight', params: { sign: SIGN }, route: { sign: SIGN } } } as any);
    expect(scrubbed?.data).toEqual({ from: 'Home', to: 'Overnight' });
    expect(JSON.stringify(scrubbed)).not.toContain(SIGN);
    expect(scrubBreadcrumb({ category: 'navigation', data: { from: 1, to: { sign: SIGN } } } as any)?.data).toBeUndefined();
  });

  it('keeps a network breadcrumb\'s method and status but strips the query and fragment from its url', () => {
    const scrubbed = scrubBreadcrumb({
      category: 'fetch', type: 'http',
      data: { method: 'GET', status_code: 200, url: `https://example.com/api/x?sign=${SIGN}&user=7#frag`, request_body_size: 10, headers: { a: SIGN } },
    } as any);
    expect(scrubbed?.data).toEqual({ method: 'GET', status_code: 200, url: 'https://example.com/api/x' });
    expect(JSON.stringify(scrubbed)).not.toContain(SIGN);
    expect(scrubBreadcrumb({ category: 'xhr', data: { url: 'not a url', status_code: '200' } } as any)?.data).toEqual({ method: undefined, status_code: undefined, url: undefined });
  });

  it('keeps an app foreground/background breadcrumb\'s message and nothing else', () => {
    expect(scrubBreadcrumb({ category: 'app.lifecycle', message: 'background', data: { sign: SIGN } } as any)).toMatchObject({ message: 'background' });
    expect(scrubBreadcrumb({ category: 'app.lifecycle', message: 'background', data: { sign: SIGN } } as any)).not.toHaveProperty('data');
  });

  it('never lets a sign through, whatever the category or field it is placed in', () => {
    const categories = ['touch', 'ui.click', 'console', 'navigation', 'fetch', 'xhr', 'app.lifecycle', 'device.event', 'custom', 'media.lifecycle'];
    for (const category of categories) {
      const scrubbed = scrubBreadcrumb({
        category, type: 'user', level: 'info', message: SIGN,
        data: category === 'media.lifecycle' ? { screen: 'Splash' } : { sign: SIGN, label: SIGN, url: `https://x.test/?s=${SIGN}`, from: 'A', to: 'B' },
      } as any);
      expect(JSON.stringify(scrubbed ?? {}).includes(SIGN)).toBe(category === 'media.lifecycle' || category === 'app.lifecycle');
    }
  });

  it('drops a breadcrumb it cannot check instead of throwing', () => {
    expect(() => scrubBreadcrumb(null as any)).not.toThrow();
    expect(scrubBreadcrumb(null as any)).toBeNull();
    const hostile = { get category(): string { throw new Error('no'); } };
    expect(scrubBreadcrumb(hostile as any)).toBeNull();
  });

  it('is wired in at the source, alongside the event sanitizer, and Sentry stays enabled', () => {
    const app = fs.readFileSync(path.resolve(__dirname, '../../App.tsx'), 'utf8');
    expect(app).toContain('beforeBreadcrumb: scrubBreadcrumb,');
    expect(app).toContain('beforeSend: sanitizeSentryEvent,');
    expect(app).toContain('enableNative: true,');
  });
});
