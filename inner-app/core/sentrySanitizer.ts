import type { ErrorEvent } from '@sentry/react-native';

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
