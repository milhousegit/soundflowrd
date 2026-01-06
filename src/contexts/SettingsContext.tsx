import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { AppSettings, defaultSettings, translations, TranslationKey, StreamingMode } from '@/types/settings';

interface SettingsContextType {
  settings: AppSettings;
  updateSettings: (updates: Partial<AppSettings>) => void;
  t: (key: TranslationKey) => string;
  getEffectiveStreamingMode: () => StreamingMode;
}

const SettingsContext = createContext<SettingsContextType | undefined>(undefined);

export const SettingsProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [settings, setSettings] = useState<AppSettings>(defaultSettings);

  useEffect(() => {
    const stored = localStorage.getItem('appSettings');
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        // Migrate old settings without streamingMode
        if (!parsed.streamingMode) {
          parsed.streamingMode = 'direct';
        }
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

  // Get effective streaming mode - if no RD key, always use 'direct'
  const getEffectiveStreamingMode = (): StreamingMode => {
    // Check if RD API key is configured in profile (from AuthContext)
    // For now, just return the setting - the PlayerContext will handle the logic
    return settings.streamingMode;
  };

  return (
    <SettingsContext.Provider value={{ settings, updateSettings, t, getEffectiveStreamingMode }}>
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
