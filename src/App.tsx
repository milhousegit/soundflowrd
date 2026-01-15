// Main App component - Provider hierarchy and routing
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { PlayerProvider } from "@/contexts/PlayerContext";
import { SettingsProvider } from "@/contexts/SettingsContext";
import { AutoModeProvider, useAutoMode } from "@/components/auto/AutoModeContext";
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
import Library from "@/pages/Library";
import Profile from "@/pages/Profile";
import Info from "@/pages/Info";
import Artist from "@/pages/Artist";
import Album from "@/pages/Album";
import Playlist from "@/pages/Playlist";
import DeezerPlaylist from "@/pages/DeezerPlaylist";
import NotFound from "./pages/NotFound";
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
        <Route path="library" element={<Library />} />
        <Route path="profile" element={<Profile />} />
        <Route path="info" element={<Info />} />
        <Route path="artist/:id" element={<Artist />} />
        <Route path="album/:id" element={<Album />} />
        <Route path="playlist/:id" element={<Playlist />} />
        <Route path="deezer-playlist/:id" element={<DeezerPlaylist />} />
      </Route>
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
};

const AppContent = () => {
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
