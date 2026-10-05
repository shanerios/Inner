import React, { createContext, useContext } from 'react';

export type MorningReturnContinuationValue = {
  visible: boolean;
  modalVisible: boolean;
  open: () => void;
  dismiss: () => void;
  setHomeEntryReady: (ready: boolean) => void;
};

const MorningReturnContext = createContext<MorningReturnContinuationValue>({
  visible: false,
  modalVisible: false,
  open: () => {},
  dismiss: () => {},
  setHomeEntryReady: () => {},
});

export const MorningReturnProvider = MorningReturnContext.Provider;

export function useMorningReturnContinuation() {
  return useContext(MorningReturnContext);
}
