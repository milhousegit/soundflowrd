import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { AppSettings, defaultSettings, translations, TranslationKey } from '@/types/settings';

interface SettingsContextType {
  settings: AppSettings;
  updateSettings: (updates: Partial<AppSettings>) => void;
  t: (key: TranslationKey) => string;
}

const SettingsContext = createContext<SettingsContextType | undefined>(undefined);

export const SettingsProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [settings, setSettings] = useState<AppSettings>(defaultSettings);

  useEffect(() => {
    const stored = localStorage.getItem('appSettings');
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        // Remove deprecated streamingMode from stored settings
        delete parsed.streamingMode;
        setSettings({ ...defaultSettings, ...parsed });
      } catch {
        // Use defaults
      }
    }
  }, []);

  const updateSettings = (updates: Partial<AppSettings>) => {
    setSettings(prev => {
      const newSettings = { ...prev, ...updates };
      localStorage.setItem('appSettings', JSON.stringify(newSettings));
      return newSettings;
    });
  };

  const t = (key: TranslationKey): string => {
    return translations[settings.language][key] || key;
  };

  return (
    <SettingsContext.Provider value={{ settings, updateSettings, t }}>
      {children}
    </SettingsContext.Provider>
  );
};

export const useSettings = () => {
  const context = useContext(SettingsContext);
  if (!context) {
    throw new Error('useSettings must be used within a SettingsProvider');
  }
  return context;
};
