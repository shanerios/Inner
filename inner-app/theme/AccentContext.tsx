import React, { createContext, useContext, useMemo } from 'react';

type Accent = { color: string };
const AccentContext = createContext<Accent>({ color: '#8E7CFF' });

export const AccentProvider: React.FC<{ color?: string; children: React.ReactNode }> = ({ color = '#8E7CFF', children }) => {
  const v = useMemo(() => ({ color }), [color]);
  return <AccentContext.Provider value={v}>{children}</AccentContext.Provider>;
};

export const useAccent = () => useContext(AccentContext);