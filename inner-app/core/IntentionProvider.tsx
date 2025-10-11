

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import {
  getIntentions,
  setIntentions as persistIntentions,
  clearIntentions as clearPersistedIntentions,
  formatIntentions,
  INTENTION_THEME,
} from './session';
import type { IntentionKey, Intentions } from './session';

// -----------------------------
// Context shape
// -----------------------------
export type IntentionContextValue = {
  /** Current selected intentions (0..2) */
  intentions: Intentions;
  /** Convenience: first intention if present */
  primary: IntentionKey | undefined;
  /** UI label, e.g., "Calm & Expansion" */
  label: string;
  /** Theme swatch derived from primary intention */
  theme: { tint: string; glow: string } | undefined;
  /** True when initial load from storage has completed */
  ready: boolean;
  /** Update selections (persists and updates context) */
  setIntentions: (keys: Intentions | string[]) => Promise<void>;
  /** Clear selections (persists and updates context) */
  clear: () => Promise<void>;
};

const IntentionCtx = createContext<IntentionContextValue | undefined>(undefined);

// -----------------------------
// Provider
// -----------------------------
export function IntentionProvider({ children }: { children: ReactNode }) {
  const [intentions, setIntentionsState] = useState<Intentions>([]);
  const [ready, setReady] = useState(false);

  // Initial load
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const stored = await getIntentions();
        if (mounted) setIntentionsState(stored);
      } finally {
        if (mounted) setReady(true);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const setIntentions = useCallback(async (keys: Intentions | string[]) => {
    await persistIntentions(keys as string[]);
    const next = await getIntentions();
    setIntentionsState(next);
  }, []);

  const clear = useCallback(async () => {
    await clearPersistedIntentions();
    setIntentionsState([]);
  }, []);

  const primary = intentions[0];
  const label = useMemo(() => formatIntentions(intentions), [intentions]);
  const theme = primary ? INTENTION_THEME[primary] : undefined;

  const value: IntentionContextValue = {
    intentions,
    primary,
    label,
    theme,
    ready,
    setIntentions,
    clear,
  };

  return <IntentionCtx.Provider value={value}>{children}</IntentionCtx.Provider>;
}

// -----------------------------
// Hook
// -----------------------------
export function useIntention() {
  const ctx = useContext(IntentionCtx);
  if (!ctx) {
    throw new Error('useIntention must be used within an IntentionProvider');
  }
  return ctx;
}