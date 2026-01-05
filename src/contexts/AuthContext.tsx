import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { UserCredentials } from '@/types/music';

interface Profile {
  id: string;
  email: string | null;
  real_debrid_api_key: string | null;
  preferred_language: string | null;
}

interface AuthContextType {
  isAuthenticated: boolean;
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  credentials: UserCredentials | null;
  isLoading: boolean;
  signUp: (email: string, password: string) => Promise<{ error: Error | null }>;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
  updateApiKey: (apiKey: string) => Promise<{ error: Error | null }>;
  // Legacy support for existing code
  login: (credentials: UserCredentials) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const fetchProfile = async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .maybeSingle();

      if (!error && data) {
        setProfile(data);
      }
    } catch (error) {
      console.error('Error fetching profile:', error);
    }
  };

  useEffect(() => {
    // Set up auth state listener FIRST
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        setSession(session);
        setUser(session?.user ?? null);
        
        if (session?.user) {
          // Defer profile fetch to avoid deadlock
          setTimeout(() => {
            fetchProfile(session.user.id);
          }, 0);
        } else {
          setProfile(null);
        }
      }
    );

    // THEN check for existing session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      
      if (session?.user) {
        fetchProfile(session.user.id);
      }
      
      setIsLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const signUp = async (email: string, password: string) => {
    const redirectUrl = `${window.location.origin}/`;
    
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: redirectUrl
      }
    });
    
    return { error: error as Error | null };
  };

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    
    return { error: error as Error | null };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setProfile(null);
  };

  const updateApiKey = async (apiKey: string) => {
    const { data: { session } } = await supabase.auth.getSession();
    const userId = session?.user?.id ?? user?.id;

    if (!userId) return { error: new Error('Not authenticated') };

    // Ensure profile exists and persist the key in one call
    const { error } = await supabase
      .from('profiles')
      .upsert(
        {
          id: userId,
          email: session?.user?.email ?? profile?.email ?? null,
          real_debrid_api_key: apiKey,
        },
        { onConflict: 'id' }
      );

    if (!error) {
      await fetchProfile(userId);
    }

    return { error: error as Error | null };
  };

  // Build credentials from profile for compatibility
  const credentials: UserCredentials | null = profile?.real_debrid_api_key
    ? {
        email: profile.email || '',
        password: '',
        realDebridApiKey: profile.real_debrid_api_key,
      }
    : null;

  // Legacy support functions
  const login = async (creds: UserCredentials) => {
    // For legacy support, try to sign in or create account
    const { error: signInError } = await signIn(creds.email, creds.password);
    
    if (signInError) {
      // Try to sign up
      const { error: signUpError } = await signUp(creds.email, creds.password);
      if (signUpError) {
        console.error('Auth error:', signUpError);
        return;
      }
      // Wait a moment for profile to be created
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    // Save API key
    if (creds.realDebridApiKey) {
      await updateApiKey(creds.realDebridApiKey);
    }
  };

  const logout = async () => {
    await signOut();
  };

  const isAuthenticated = !!user;

  return (
    <AuthContext.Provider value={{
      isAuthenticated,
      user,
      session,
      profile,
      credentials,
      isLoading,
      signUp,
      signIn,
      signOut,
      updateApiKey,
      login,
      logout,
    }}>
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
