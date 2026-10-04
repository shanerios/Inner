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
    if (!pending || !canPresentMorningReturn(currentRouteName)) {
      if (!canPresentMorningReturn(currentRouteName)) setVisible(false);
      return;
    }
    if (offeredThisForegroundRef.current === pending.id) return;
    offeredThisForegroundRef.current = pending.id;
    setContinuationAvailable(false);
    setVisible(true);
  }, [currentRouteName, pending]);

  const continuation = useMemo(() => ({
    visible: Boolean(
      pending &&
      continuationAvailable &&
      !continuationHidden &&
      !visible &&
      canShowMorningReturnContinuation(currentRouteName)
    ),
    open: () => {
      setContinuationAvailable(false);
      setVisible(true);
    },
    dismiss: () => setContinuationHidden(true),
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
