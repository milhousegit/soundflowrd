import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { UserCredentials } from '@/types/music';

interface AuthContextType {
  isAuthenticated: boolean;
  credentials: UserCredentials | null;
  login: (credentials: UserCredentials) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [credentials, setCredentials] = useState<UserCredentials | null>(null);

  useEffect(() => {
    const stored = localStorage.getItem('musicPlayerCredentials');
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        setCredentials(parsed);
        setIsAuthenticated(true);
      } catch {
        localStorage.removeItem('musicPlayerCredentials');
      }
    }
  }, []);

  const login = (creds: UserCredentials) => {
    localStorage.setItem('musicPlayerCredentials', JSON.stringify(creds));
    setCredentials(creds);
    setIsAuthenticated(true);
  };

  const logout = () => {
    localStorage.removeItem('musicPlayerCredentials');
    setCredentials(null);
    setIsAuthenticated(false);
  };

  return (
    <AuthContext.Provider value={{ isAuthenticated, credentials, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
