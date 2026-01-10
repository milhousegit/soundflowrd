import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { AppSettings, defaultSettings, translations, TranslationKey, AudioSourceMode } from '@/types/settings';
import { useAuth } from './AuthContext';

interface SettingsContextType {
  settings: AppSettings;
  updateSettings: (updates: Partial<AppSettings>) => void;
  t: (key: TranslationKey) => string;
  audioSourceMode: AudioSourceMode;
  setAudioSourceMode: (mode: AudioSourceMode) => Promise<void>;
}

const SettingsContext = createContext<SettingsContextType | undefined>(undefined);

export const SettingsProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { profile, updateAudioSourceMode, isAuthenticated } = useAuth();
  const [settings, setSettings] = useState<AppSettings>(defaultSettings);

  // Derive audio source mode from profile (DB) or default
  const audioSourceMode: AudioSourceMode = (profile?.audio_source_mode as AudioSourceMode) || 'rd_priority';

  useEffect(() => {
    const stored = localStorage.getItem('appSettings');
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        // Remove deprecated fields
        delete parsed.streamingMode;
        delete parsed.audioSourceMode; // Remove from localStorage - now in DB
        setSettings({ ...defaultSettings, ...parsed });
      } catch {
        // Use defaults
      }
    }
  }, []);

  // Sync language from profile if available
  useEffect(() => {
    if (profile?.preferred_language) {
      setSettings(prev => ({
        ...prev,
        language: profile.preferred_language as 'en' | 'it',
      }));
    }
  }, [profile?.preferred_language]);

  const updateSettings = (updates: Partial<AppSettings>) => {
    setSettings(prev => {
      const newSettings = { ...prev, ...updates };
      // Don't save audioSourceMode to localStorage
      const { audioSourceMode: _, ...settingsToStore } = newSettings as any;
      localStorage.setItem('appSettings', JSON.stringify(settingsToStore));
      return newSettings;
    });
  };

  const setAudioSourceMode = async (mode: AudioSourceMode) => {
    if (isAuthenticated) {
      await updateAudioSourceMode(mode);
    }
  };

  const t = (key: TranslationKey): string => {
    return translations[settings.language][key] || key;
  };

  return (
    <SettingsContext.Provider value={{ settings, updateSettings, t, audioSourceMode, setAudioSourceMode }}>
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