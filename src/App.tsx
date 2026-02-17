// Main App component - Provider hierarchy and routing
import React, { useEffect } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { PlayerProvider } from "@/contexts/PlayerContext";
import { SettingsProvider } from "@/contexts/SettingsContext";
import { AutoModeProvider, useAutoMode } from "@/components/auto/AutoModeContext";
import { supabase } from "@/integrations/supabase/client";
import Login from "@/components/Login";
import Layout from "@/components/Layout";
import InstallPrompt from "@/components/InstallPrompt";
import PremiumWelcomeBanner from "@/components/PremiumWelcomeBanner";
import PremiumExpiredBanner from "@/components/PremiumExpiredBanner";

import LandscapeBlocker from "@/components/LandscapeBlocker";
import AutoModePrompt from "@/components/auto/AutoModePrompt";
import AutoModeLayout from "@/components/auto/AutoModeLayout";
import Home from "@/pages/Home";
import Search from "@/pages/Search";
import Feed from "@/pages/Feed";
import Library from "@/pages/Library";
import Profile from "@/pages/Profile";
import Settings from "@/pages/Settings";
import UserProfile from "@/pages/UserProfile";
import Info from "@/pages/Info";
import Artist from "@/pages/Artist";
import Album from "@/pages/Album";
import Playlist from "@/pages/Playlist";
import DeezerPlaylist from "@/pages/DeezerPlaylist";
import NotFound from "./pages/NotFound";
import TV from "./pages/TV";
import { Loader2 } from "lucide-react";

const queryClient = new QueryClient();

const ProtectedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isAuthenticated, isLoading } = useAuth();
  
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }
  
  return isAuthenticated ? <>{children}</> : <Navigate to="/login" replace />;
};

const AppRoutes = () => {
  const { isAuthenticated, isLoading } = useAuth();
  const { isAutoMode } = useAutoMode();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  // Show Auto Mode layout when active
  if (isAutoMode && isAuthenticated) {
    return <AutoModeLayout />;
  }

  return (
    <Routes>
      <Route 
        path="/login" 
        element={isAuthenticated ? <Navigate to="/" replace /> : <Login />} 
      />
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route index element={<Home />} />
        <Route path="search" element={<Search />} />
        <Route path="feed" element={<Feed />} />
        <Route path="library" element={<Library />} />
        <Route path="profile" element={<Profile />} />
        <Route path="settings" element={<Settings />} />
        <Route path="profile/:id" element={<UserProfile />} />
        <Route path="info" element={<Info />} />
        <Route path="artist/:id" element={<Artist />} />
        <Route path="album/:id" element={<Album />} />
        <Route path="playlist/:id" element={<Playlist />} />
        <Route path="deezer-playlist/:id" element={<DeezerPlaylist />} />
      </Route>
      <Route path="/tv" element={<TV />} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
};

const AppContent = () => {
  const { user } = useAuth();

  // Update last_seen_at periodically when user is active
  useEffect(() => {
    if (!user?.id) return;

    const updateLastSeen = async () => {
      try {
        await supabase
          .from('profiles')
          .update({ last_seen_at: new Date().toISOString() })
          .eq('id', user.id);
      } catch (error) {
        // Silently fail - not critical
      }
    };

    // Update immediately on mount
    updateLastSeen();

    // Update every 2 minutes while active
    const interval = setInterval(updateLastSeen, 2 * 60 * 1000);

    // Update on visibility change (when user returns to tab)
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        updateLastSeen();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [user?.id]);

  return (
    <>
      <Toaster />
      <Sonner position="top-center" />
      <InstallPrompt />
      <PremiumWelcomeBanner />
      <PremiumExpiredBanner />
      <LandscapeBlocker />
      <AutoModePrompt />
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </>
  );
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <SettingsProvider>
        <PlayerProvider>
          <AutoModeProvider>
            <TooltipProvider>
              <AppContent />
            </TooltipProvider>
          </AutoModeProvider>
        </PlayerProvider>
      </SettingsProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
