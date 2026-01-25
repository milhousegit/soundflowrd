import { useState, useEffect } from 'react';

type Language = 'en' | 'it';

export const useGeoLanguage = (): { language: Language; isLoading: boolean } => {
  const [language, setLanguage] = useState<Language>('en');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const detectLanguage = async () => {
      try {
        // Try to detect country using a free geo-IP service
        const response = await fetch('https://ipapi.co/json/', {
          signal: AbortSignal.timeout(3000), // 3 second timeout
        });
        
        if (response.ok) {
          const data = await response.json();
          if (data.country_code === 'IT' || data.country === 'Italy') {
            setLanguage('it');
          }
        }
      } catch (error) {
        // On error, keep default English
        console.log('Geo detection failed, using default language');
      } finally {
        setIsLoading(false);
      }
    };

    detectLanguage();
  }, []);

  return { language, isLoading };
};
