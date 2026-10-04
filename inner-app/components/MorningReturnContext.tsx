import React, { createContext, useContext } from 'react';

export type MorningReturnContinuationValue = {
  visible: boolean;
  open: () => void;
  dismiss: () => void;
};

const MorningReturnContext = createContext<MorningReturnContinuationValue>({
  visible: false,
  open: () => {},
  dismiss: () => {},
});

export const MorningReturnProvider = MorningReturnContext.Provider;

export function useMorningReturnContinuation() {
  return useContext(MorningReturnContext);
}
