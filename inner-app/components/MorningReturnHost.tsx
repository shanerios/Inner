import React, { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';
import MorningReturnModal from './MorningReturnModal';
import { MorningReturnProvider } from './MorningReturnContext';
import {
  canPresentMorningReturn,
  canShowMorningReturnContinuation,
  loadPendingMorningReturn,
  type PendingMorningReturn,
} from '../core/morningReturn';

type Props = {
  currentRouteName?: string;
  children: ReactNode;
};

export default function MorningReturnHost({ currentRouteName, children }: Props) {
  const [pending, setPending] = useState<PendingMorningReturn | null>(null);
  const [visible, setVisible] = useState(false);
  const [continuationAvailable, setContinuationAvailable] = useState(false);
  const [continuationHidden, setContinuationHidden] = useState(false);
  const [homeEntryReady, setHomeEntryReady] = useState(false);
  const offeredThisForegroundRef = useRef<string | null>(null);
  const mountedRef = useRef(true);

  const refresh = useCallback(async () => {
    try {
      const next = await loadPendingMorningReturn();
      if (mountedRef.current) setPending(next);
    } catch {
      // Morning Return can try again on the next foreground without blocking app entry.
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    void refresh();
    const subscription = AppState.addEventListener('change', state => {
      if (state === 'active') {
        offeredThisForegroundRef.current = null;
        setContinuationAvailable(false);
        setContinuationHidden(false);
        void refresh();
      } else {
        setVisible(false);
      }
    });
    return () => {
      mountedRef.current = false;
      subscription.remove();
    };
  }, [refresh]);

  useEffect(() => {
    const canPresent = canPresentMorningReturn(currentRouteName, homeEntryReady);
    if (!pending || !canPresent) {
      if (!canPresent) {
        // A higher-priority entry flow (such as Daily Arrival) may take over
        // after Home first appears. Keep this return eligible so it can open
        // once that flow has finished instead of losing it for the foreground.
        offeredThisForegroundRef.current = null;
        setVisible(false);
      }
      return;
    }
    if (offeredThisForegroundRef.current === pending.id) return;
    offeredThisForegroundRef.current = pending.id;
    setContinuationAvailable(false);
    setVisible(true);
  }, [currentRouteName, homeEntryReady, pending]);

  const continuation = useMemo(() => ({
    visible: Boolean(
      pending &&
      continuationAvailable &&
      !continuationHidden &&
      !visible &&
      canShowMorningReturnContinuation(currentRouteName)
    ),
    modalVisible: Boolean(pending && visible),
    open: () => {
      setContinuationAvailable(false);
      setVisible(true);
    },
    dismiss: () => setContinuationHidden(true),
    setHomeEntryReady,
  }), [continuationAvailable, continuationHidden, currentRouteName, pending, visible]);

  return (
    <MorningReturnProvider value={continuation}>
      {children}
      <MorningReturnModal
        pending={pending}
        visible={visible}
        onRequestClose={() => {
          setVisible(false);
          setContinuationAvailable(true);
        }}
        onResolved={() => {
          setVisible(false);
          setContinuationAvailable(false);
          setPending(null);
        }}
      />
    </MorningReturnProvider>
  );
}
