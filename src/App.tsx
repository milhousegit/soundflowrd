import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { PlayerProvider } from "@/contexts/PlayerContext";
import { SettingsProvider } from "@/contexts/SettingsContext";
import Login from "@/components/Login";
import Layout from "@/components/Layout";
import InstallPrompt from "@/components/InstallPrompt";
import NewReleasesNotificationPopup from "@/components/NewReleasesNotificationPopup";
import SilentAudioKeepAlive from "@/components/SilentAudioKeepAlive";
import LandscapeBlocker from "@/components/LandscapeBlocker";
import Home from "@/pages/Home";
import Search from "@/pages/Search";
import Library from "@/pages/Library";
import Settings from "@/pages/Settings";
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

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
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
        <Route path="settings" element={<Settings />} />
        <Route path="artist/:id" element={<Artist />} />
        <Route path="album/:id" element={<Album />} />
        <Route path="playlist/:id" element={<Playlist />} />
        <Route path="deezer-playlist/:id" element={<DeezerPlaylist />} />
      </Route>
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <SettingsProvider>
        <PlayerProvider>
          <TooltipProvider>
            <Toaster />
            <Sonner position="top-center" />
            <InstallPrompt />
            <NewReleasesNotificationPopup />
            <LandscapeBlocker />
            <BrowserRouter>
              <SilentAudioKeepAlive />
              <AppRoutes />
            </BrowserRouter>
          </TooltipProvider>
        </PlayerProvider>
      </SettingsProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
