import * as Sentry from '@sentry/react-native';

type SafeMetadata = Record<string, string | number | boolean | null | undefined>;

export function debugLog(message: string, metadata?: SafeMetadata) {
  if (__DEV__) console.log(message, metadata ?? '');
}

/** Report operational failures without accepting user-authored text or payloads. */
export function reportError(error: unknown, context: string, metadata?: SafeMetadata) {
  if (__DEV__) console.warn(`[${context}]`, error);
  Sentry.withScope(scope => {
    scope.setTag('error.context', context);
    if (metadata) scope.setContext('safe_metadata', metadata);
    Sentry.captureException(error instanceof Error ? error : new Error(`${context} failed`));
  });
}
