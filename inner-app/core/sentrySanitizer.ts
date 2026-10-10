import type { Breadcrumb, ErrorEvent } from '@sentry/react-native';

const PRIVATE_TERMS = /journal|entry|dream|intention/gi;

export function sanitizeSentryEvent(event: ErrorEvent): ErrorEvent {
  try {
    if (!Array.isArray(event.breadcrumbs)) return event;

    event.breadcrumbs = event.breadcrumbs.map((breadcrumb) => {
      const safeLifecycleData =
        breadcrumb.category === 'media.lifecycle' || breadcrumb.category === 'navigation.lifecycle'
          ? breadcrumb.data
          : undefined;
      const safeMessage =
        typeof breadcrumb.message === 'string'
          ? breadcrumb.message.replace(PRIVATE_TERMS, '[redacted]')
          : undefined;

      return { ...breadcrumb, data: safeLifecycleData, message: safeMessage };
    });
  } catch {
    // Error reporting must never become a second source of errors.
  }

  return event;
}

/** Our own lifecycle breadcrumbs: screen names and counts only, so their data is kept. */
const LIFECYCLE_CATEGORIES = new Set(['media.lifecycle', 'navigation.lifecycle']);
/** Sentry's touch tracking labels a tap with the element's accessibility label, which can carry a dream sign. */
const TOUCH_CATEGORIES = new Set(['touch', 'ui.click', 'ui.tap', 'ui.touch', 'ui.multiClick']);
const NETWORK_CATEGORIES = new Set(['fetch', 'xhr', 'http']);

function safeText(value: unknown): string | undefined {
  return typeof value === 'string' ? value.replace(PRIVATE_TERMS, '[redacted]') : undefined;
}

/** Origin and path only: a query string or fragment can carry identifiers. */
function safeUrl(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  try {
    const url = new URL(value);
    return `${url.origin}${url.pathname}`;
  } catch {
    return undefined;
  }
}

/**
 * Decides, at the moment a breadcrumb is created, what of it may be stored and sent. An allowlist: a
 * breadcrumb is kept only if its kind is known to be free of anything the practitioner wrote or that
 * was derived from it, and even then only the fields that are. Everything else is dropped, including
 * console output. Running at the source means it applies to the native scope too, which native crash
 * reports read and the event sanitizer above never sees.
 */
export function scrubBreadcrumb(breadcrumb: Breadcrumb): Breadcrumb | null {
  try {
    const category = typeof breadcrumb.category === 'string' ? breadcrumb.category : '';
    const base = { category, type: breadcrumb.type, level: breadcrumb.level, timestamp: breadcrumb.timestamp };

    if (LIFECYCLE_CATEGORIES.has(category)) {
      return { ...base, message: safeText(breadcrumb.message), data: breadcrumb.data };
    }
    if (TOUCH_CATEGORIES.has(category)) {
      // That a tap happened is useful; which element, and what it was labelled, is not worth the risk.
      return { ...base, message: 'Touch event' };
    }
    if (category === 'navigation') {
      const data = breadcrumb.data as { from?: unknown; to?: unknown } | undefined;
      const from = typeof data?.from === 'string' ? data.from : undefined;
      const to = typeof data?.to === 'string' ? data.to : undefined;
      return { ...base, data: from || to ? { from, to } : undefined };
    }
    if (NETWORK_CATEGORIES.has(category)) {
      const data = breadcrumb.data as { method?: unknown; status_code?: unknown; url?: unknown } | undefined;
      return {
        ...base,
        data: {
          method: typeof data?.method === 'string' ? data.method : undefined,
          status_code: typeof data?.status_code === 'number' ? data.status_code : undefined,
          url: safeUrl(data?.url),
        },
      };
    }
    if (category === 'app.lifecycle') {
      return { ...base, message: safeText(breadcrumb.message) };
    }
    return null;
  } catch {
    // A breadcrumb that cannot be checked is not kept.
    return null;
  }
}
