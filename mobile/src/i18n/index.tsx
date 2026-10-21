import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SupportedLanguage, SUPPORTED_LANGUAGES, translations } from './translations';

const STORAGE_KEY_LANGUAGE = '@speedmonitor_language';

interface LanguageContextType {
  language: SupportedLanguage;
  setLanguage: (lang: SupportedLanguage) => Promise<void>;
  t: (key: string, fallback?: string) => string;
}

const LanguageContext = createContext<LanguageContextType>({
  language: 'en',
  setLanguage: async () => {},
  t: (key: string, fallback?: string) => fallback || key,
});

export const LanguageProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [language, setLanguageState] = useState<SupportedLanguage>('en');

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY_LANGUAGE).then(saved => {
      if (saved && translations[saved as SupportedLanguage]) {
        setLanguageState(saved as SupportedLanguage);
      }
    });
  }, []);

  const setLanguage = async (newLang: SupportedLanguage) => {
    if (translations[newLang]) {
      setLanguageState(newLang);
      try {
        await AsyncStorage.setItem(STORAGE_KEY_LANGUAGE, newLang);
      } catch (e) {
        console.warn('Failed to persist language', e);
      }
    }
  };

  const t = (key: string, fallback?: string): string => {
    const langDict = translations[language];
    if (langDict && langDict[key]) {
      return langDict[key];
    }
    const defaultDict = translations.en;
    if (defaultDict && defaultDict[key]) {
      return defaultDict[key];
    }
    return fallback || key;
  };

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  );
};

export const useTranslation = () => useContext(LanguageContext);

export type { SupportedLanguage };
export { SUPPORTED_LANGUAGES };
