import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';

interface AutoModeContextType {
  isAutoMode: boolean;
  setAutoMode: (value: boolean) => void;
  showAutoModePrompt: boolean;
  setShowAutoModePrompt: (value: boolean) => void;
  pendingOrientation: 'landscape' | 'portrait' | null;
  setPendingOrientation: (value: 'landscape' | 'portrait' | null) => void;
}

const AutoModeContext = createContext<AutoModeContextType | undefined>(undefined);

export const useAutoMode = () => {
  const context = useContext(AutoModeContext);
  if (!context) {
    throw new Error('useAutoMode must be used within an AutoModeProvider');
  }
  return context;
};

interface AutoModeProviderProps {
  children: ReactNode;
}

export const AutoModeProvider: React.FC<AutoModeProviderProps> = ({ children }) => {
  const [isAutoMode, setAutoMode] = useState(false);
  const [showAutoModePrompt, setShowAutoModePrompt] = useState(false);
  const [pendingOrientation, setPendingOrientation] = useState<'landscape' | 'portrait' | null>(null);

  return (
    <AutoModeContext.Provider value={{
      isAutoMode,
      setAutoMode,
      showAutoModePrompt,
      setShowAutoModePrompt,
      pendingOrientation,
      setPendingOrientation,
    }}>
      {children}
    </AutoModeContext.Provider>
  );
};
