import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { UserCredentials } from '@/types/music';

interface Profile {
  id: string;
  email: string | null;
  real_debrid_api_key: string | null;
  preferred_language: string | null;
  audio_source_mode: string | null;
  is_premium: boolean | null;
  premium_expires_at: string | null;
  telegram_chat_id: string | null;
}

interface AuthContextType {
  isAuthenticated: boolean;
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  credentials: UserCredentials | null;
  isLoading: boolean;
  isAdmin: boolean;
  simulateFreeUser: boolean;
  setSimulateFreeUser: (value: boolean) => void;
  signUp: (email: string, password: string) => Promise<{ error: Error | null }>;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
  updateApiKey: (apiKey: string) => Promise<{ error: Error | null }>;
  updateAudioSourceMode: (mode: string) => Promise<{ error: Error | null }>;
  // Legacy support for existing code
  login: (credentials: UserCredentials) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const CACHE_KEY = 'soundflow_auth_cache';

interface CachedAuthData {
  isAdmin: boolean;
  profile: Profile | null;
  userId: string;
  timestamp: number;
}

const getCachedAuthData = (): CachedAuthData | null => {
  try {
    const cached = localStorage.getItem(CACHE_KEY);
    if (cached) {
      return JSON.parse(cached);
    }
  } catch (e) {
    console.error('Error reading auth cache:', e);
  }
  return null;
};

const setCachedAuthData = (data: CachedAuthData) => {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(data));
  } catch (e) {
    console.error('Error saving auth cache:', e);
  }
};

const clearCachedAuthData = () => {
  try {
    localStorage.removeItem(CACHE_KEY);
  } catch (e) {
    console.error('Error clearing auth cache:', e);
  }
};

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(() => {
    // Initialize from cache if offline
    const cached = getCachedAuthData();
    return cached?.profile ?? null;
  });
  const [isAdmin, setIsAdmin] = useState(() => {
    // Initialize from cache if offline
    const cached = getCachedAuthData();
    return cached?.isAdmin ?? false;
  });
  const [simulateFreeUser, setSimulateFreeUser] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const checkAdminRole = async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', userId)
        .eq('role', 'admin')
        .maybeSingle();
      
      const adminStatus = !error && !!data;
      setIsAdmin(adminStatus);
      return adminStatus;
    } catch (error) {
      console.error('Error checking admin role:', error);
      // If offline, keep cached value
      const cached = getCachedAuthData();
      if (cached?.userId === userId) {
        setIsAdmin(cached.isAdmin);
        return cached.isAdmin;
      }
      setIsAdmin(false);
      return false;
    }
  };

  const fetchProfile = async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .maybeSingle();

      if (!error && data) {
        setProfile(data);
        return data;
      }
      return null;
    } catch (error) {
      console.error('Error fetching profile:', error);
      // If offline, keep cached value
      const cached = getCachedAuthData();
      if (cached?.userId === userId && cached.profile) {
        setProfile(cached.profile);
        return cached.profile;
      }
      return null;
    }
  };

  // Update cache whenever profile or admin status changes
  useEffect(() => {
    if (user?.id && (profile || isAdmin)) {
      setCachedAuthData({
        isAdmin,
        profile,
        userId: user.id,
        timestamp: Date.now(),
      });
    }
  }, [profile, isAdmin, user?.id]);

  useEffect(() => {
    // Set up auth state listener FIRST
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        setSession(session);
        setUser(session?.user ?? null);
        
        if (session?.user) {
          // Defer profile fetch to avoid deadlock
          setTimeout(async () => {
            const [profileData, adminStatus] = await Promise.all([
              fetchProfile(session.user.id),
              checkAdminRole(session.user.id),
            ]);
            
            // Cache the data
            setCachedAuthData({
              isAdmin: adminStatus,
              profile: profileData,
              userId: session.user.id,
              timestamp: Date.now(),
            });
          }, 0);
        } else {
          setProfile(null);
          setIsAdmin(false);
          clearCachedAuthData();
        }
      }
    );

    // THEN check for existing session
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      
      if (session?.user) {
        const [profileData, adminStatus] = await Promise.all([
          fetchProfile(session.user.id),
          checkAdminRole(session.user.id),
        ]);
        
        // Cache the data
        setCachedAuthData({
          isAdmin: adminStatus,
          profile: profileData,
          userId: session.user.id,
          timestamp: Date.now(),
        });
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

  const updateAudioSourceMode = async (mode: string) => {
    const { data: { session } } = await supabase.auth.getSession();
    const userId = session?.user?.id ?? user?.id;

    if (!userId) return { error: new Error('Not authenticated') };

    const { error } = await supabase
      .from('profiles')
      .update({ audio_source_mode: mode })
      .eq('id', userId);

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

  // Effective admin status (disabled when simulating free user)
  const effectiveIsAdmin = isAdmin && !simulateFreeUser;

  return (
    <AuthContext.Provider value={{
      isAuthenticated,
      user,
      session,
      profile,
      credentials,
      isLoading,
      isAdmin: effectiveIsAdmin,
      simulateFreeUser,
      setSimulateFreeUser,
      signUp,
      signIn,
      signOut,
      updateApiKey,
      updateAudioSourceMode,
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
