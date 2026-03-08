import { useState, useEffect } from 'react';

type Language = 'en' | 'it';

export const useGeoLanguage = (): { language: Language; country: string; isLoading: boolean } => {
  const [language, setLanguage] = useState<Language>('en');
  const [country, setCountry] = useState<string>('');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const detectLanguage = async () => {
      try {
        const response = await fetch('https://ipapi.co/json/', {
          signal: AbortSignal.timeout(3000),
        });
        
        if (response.ok) {
          const data = await response.json();
          const countryCode = data.country_code || '';
          setCountry(countryCode);
          if (countryCode === 'IT') {
            setLanguage('it');
          }
        }
      } catch (error) {
        console.log('Geo detection failed, using default language');
      } finally {
        setIsLoading(false);
      }
    };

    detectLanguage();
  }, []);

  return { language, country, isLoading };
};
