import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';

interface ServiceStatusContextType {
  isServiceDown: boolean;
  reportFailure: (source: string) => void;
  reportSuccess: (source: string) => void;
}

const ServiceStatusContext = createContext<ServiceStatusContextType | undefined>(undefined);

const FAILURE_THRESHOLD = 3;

export const ServiceStatusProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [failureCounts, setFailureCounts] = useState<Record<string, number>>({});
  const [isServiceDown, setIsServiceDown] = useState(false);

  const reportFailure = useCallback((source: string) => {
    setFailureCounts(prev => {
      const updated = { ...prev, [source]: (prev[source] || 0) + 1 };
      // Check if ALL scraping sources have hit threshold
      const scrapingSources = ['squidwtf', 'monochrome', 'hifi'];
      const allDown = scrapingSources.every(s => (updated[s] || 0) >= FAILURE_THRESHOLD);
      if (allDown) setIsServiceDown(true);
      return updated;
    });
  }, []);

  const reportSuccess = useCallback((source: string) => {
    setFailureCounts(prev => ({ ...prev, [source]: 0 }));
    setIsServiceDown(false);
  }, []);

  return (
    <ServiceStatusContext.Provider value={{ isServiceDown, reportFailure, reportSuccess }}>
      {children}
    </ServiceStatusContext.Provider>
  );
};

export const useServiceStatus = () => {
  const context = useContext(ServiceStatusContext);
  if (!context) {
    throw new Error('useServiceStatus must be used within a ServiceStatusProvider');
  }
  return context;
};
