import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useSettings } from '@/contexts/SettingsContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { verifyApiKey } from '@/lib/realdebrid';
import {
  User,
  Key,
  Volume2,
  LogOut,
  ExternalLink,
  Check,
  Home,
  Pencil,
  X,
  Loader2,
  Save,
  Cloud,
  Play,
  RefreshCw,
  Trash2,
  Music,
  Smartphone,
  Bell,
  ChevronRight,
  Info,
  Globe,
  Lock,
  Crown,
  Download,
  Car,
  Share2,
  Gift,
  Sparkles,
} from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import IOSDiagnostics from '@/components/IOSDiagnostics';
import AdminNotifications from '@/components/AdminNotifications';
import { isIOS, isSafari, isPWA } from '@/hooks/useIOSAudioSession';

interface CloudFile {
  id: string;
  filename: string;
  filesize: number;
  host: string;
  link: string;
  generated: string;
}

const Settings: React.FC = () => {
  const navigate = useNavigate();
  const { profile, updateApiKey, signOut, credentials, user } = useAuth();
  const { settings, updateSettings, t, audioSourceMode, setAudioSourceMode } = useSettings();
  const { toast } = useToast();

  const [isEditingApiKey, setIsEditingApiKey] = useState(false);
  const [apiKeyDraft, setApiKeyDraft] = useState('');
  const [isSavingApiKey, setIsSavingApiKey] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isSavingPassword, setIsSavingPassword] = useState(false);
  
  // Cloud files state
  const [cloudFiles, setCloudFiles] = useState<CloudFile[]>([]);
  const [isLoadingCloud, setIsLoadingCloud] = useState(false);
  const [showCloudSection, setShowCloudSection] = useState(false);
  const [showPremiumModal, setShowPremiumModal] = useState(false);

  const hasRdApiKey = !!credentials?.realDebridApiKey;

  // Check if user is admin
  useEffect(() => {
    const checkAdminRole = async () => {
      if (!user?.id) return;
      
      const { data } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', user.id)
        .eq('role', 'admin')
        .maybeSingle();
      
      setIsAdmin(!!data);
    };
    
    checkAdminRole();
  }, [user?.id]);

  useEffect(() => {
    if (isEditingApiKey) {
      setApiKeyDraft(profile?.real_debrid_api_key ?? '');
    }
  }, [isEditingApiKey, profile?.real_debrid_api_key]);


  const handleLogout = async () => {
    await signOut();
    toast({
      title: settings.language === 'it' ? 'Disconnesso' : 'Logged out',
      description: settings.language === 'it' ? 'Hai effettuato il logout con successo.' : 'You have been logged out successfully.',
    });
  };

  const handlePasswordChange = async () => {
    if (newPassword.length < 6) {
      toast({
        title: settings.language === 'it' ? 'Password troppo corta' : 'Password too short',
        description: settings.language === 'it' ? 'La password deve avere almeno 6 caratteri.' : 'Password must be at least 6 characters.',
        variant: 'destructive',
      });
      return;
    }

    if (newPassword !== confirmPassword) {
      toast({
        title: settings.language === 'it' ? 'Password non corrispondono' : 'Passwords do not match',
        description: settings.language === 'it' ? 'Le password inserite non corrispondono.' : 'The passwords you entered do not match.',
        variant: 'destructive',
      });
      return;
    }

    setIsSavingPassword(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
      
      toast({
        title: settings.language === 'it' ? 'Password aggiornata' : 'Password updated',
        description: settings.language === 'it' ? 'La tua password è stata cambiata con successo.' : 'Your password has been changed successfully.',
      });
      setIsChangingPassword(false);
      setNewPassword('');
      setConfirmPassword('');
    } catch (error: any) {
      toast({
        title: settings.language === 'it' ? 'Errore' : 'Error',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setIsSavingPassword(false);
    }
  };

  const maskApiKey = (key: string) => {
    if (key.length <= 8) return '••••••••';
    return key.slice(0, 4) + '••••••••' + key.slice(-4);
  };

  const toggleHomeOption = (key: keyof typeof settings.homeDisplayOptions) => {
    updateSettings({
      homeDisplayOptions: {
        ...settings.homeDisplayOptions,
        [key]: !settings.homeDisplayOptions[key],
      },
    });
  };

  const loadCloudFiles = async () => {
    if (!credentials?.realDebridApiKey) return;
    
    setIsLoadingCloud(true);
    try {
      const { data, error } = await supabase.functions.invoke('real-debrid', {
        body: { 
          action: 'getDownloads',
          apiKey: credentials.realDebridApiKey,
        },
      });

      if (error) throw error;
      
      setCloudFiles(data?.downloads || []);
    } catch (error) {
      console.error('Failed to load cloud files:', error);
      toast({
        title: settings.language === 'it' ? 'Errore' : 'Error',
        description: settings.language === 'it' 
          ? 'Impossibile caricare i file cloud.' 
          : 'Failed to load cloud files.',
        variant: 'destructive',
      });
    } finally {
      setIsLoadingCloud(false);
    }
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${Math.round(bytes / 1024 / 1024)} MB`;
    return `${(bytes / 1024 / 1024 / 1024).toFixed(1)} GB`;
  };

  const formatDate = (dateStr: string): string => {
    const date = new Date(dateStr);
    return date.toLocaleDateString(settings.language === 'it' ? 'it-IT' : 'en-US', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div className="p-4 md:p-8 pb-32 max-w-2xl animate-fade-in">
      <h1 className="text-2xl md:text-4xl font-bold text-foreground mb-6 md:mb-8">{t('profile')}</h1>

      <div className="space-y-6 md:space-y-8">
        {/* Account Section */}
        <section className="space-y-3 md:space-y-4">
          <div className="flex items-center gap-2 md:gap-3 mb-3 md:mb-4">
            <User className="w-4 h-4 md:w-5 md:h-5 text-primary" />
            <h2 className="text-lg md:text-xl font-semibold text-foreground">{t('account')}</h2>
          </div>
          
          <div className="p-3 md:p-4 rounded-xl bg-card space-y-4">
            {/* Email */}
            <div>
              <label className="text-xs md:text-sm text-muted-foreground block mb-2">{t('email')}</label>
              <Input
                value={profile?.email || ''}
                disabled
                className="bg-secondary text-sm md:text-base"
              />
            </div>

            {/* Password Change */}
            <div>
              <label className="text-xs md:text-sm text-muted-foreground block mb-2">
                <Lock className="w-3 h-3 inline mr-1" />
                {settings.language === 'it' ? 'Password' : 'Password'}
              </label>
              
              {!isChangingPassword ? (
                <Button
                  variant="outline"
                  className="w-full gap-2"
                  onClick={() => setIsChangingPassword(true)}
                >
                  <Pencil className="w-4 h-4" />
                  {settings.language === 'it' ? 'Cambia Password' : 'Change Password'}
                </Button>
              ) : (
                <div className="space-y-3">
                  <Input
                    type="password"
                    placeholder={settings.language === 'it' ? 'Nuova password' : 'New password'}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="bg-secondary"
                  />
                  <Input
                    type="password"
                    placeholder={settings.language === 'it' ? 'Conferma password' : 'Confirm password'}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="bg-secondary"
                  />
                  <div className="flex gap-2">
                    <Button
                      onClick={handlePasswordChange}
                      disabled={isSavingPassword}
                      className="flex-1 gap-2"
                    >
                      {isSavingPassword ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                      {settings.language === 'it' ? 'Salva' : 'Save'}
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => {
                        setIsChangingPassword(false);
                        setNewPassword('');
                        setConfirmPassword('');
                      }}
                      disabled={isSavingPassword}
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              )}
            </div>

            {/* Language */}
            <div className="flex items-center justify-between pt-2 border-t border-border">
              <div className="flex items-center gap-2">
                <Globe className="w-4 h-4 text-muted-foreground" />
                <p className="text-sm md:text-base font-medium text-foreground">{t('language')}</p>
              </div>
              <select 
                className="bg-secondary text-foreground rounded-lg px-3 py-2 border border-border text-sm"
                value={settings.language}
                onChange={(e) => updateSettings({ language: e.target.value as 'en' | 'it' })}
              >
                <option value="en">English</option>
                <option value="it">Italiano</option>
              </select>
            </div>

            {/* Logout */}
            <div className="pt-2 border-t border-border">
              <Button 
                variant="destructive" 
                onClick={handleLogout}
                className="gap-2 w-full"
              >
                <LogOut className="w-4 h-4" />
                {t('logout')}
              </Button>
            </div>

            {/* Premium Button */}
            <Dialog open={showPremiumModal} onOpenChange={setShowPremiumModal}>
              <DialogTrigger asChild>
                <button className="w-full mt-3 p-4 rounded-xl bg-gradient-to-r from-[#8B5CF6] via-[#6366F1] to-[#3B82F6] hover:opacity-90 transition-opacity">
                  <div className="flex items-center justify-center gap-2">
                    <Crown className="w-5 h-5 text-white" />
                    <span className="font-semibold text-white">
                      {settings.language === 'it' ? 'Sblocca Premium' : 'Unlock Premium'}
                    </span>
                    <Sparkles className="w-4 h-4 text-white/80" />
                  </div>
                </button>
              </DialogTrigger>
              <DialogContent className="max-w-md bg-gradient-to-br from-background via-background to-[#8B5CF6]/10 border-[#8B5CF6]/30">
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2 text-xl">
                    <Crown className="w-6 h-6 text-[#8B5CF6]" />
                    <span className="bg-gradient-to-r from-[#8B5CF6] to-[#3B82F6] bg-clip-text text-transparent">
                      SoundFlow Premium
                    </span>
                  </DialogTitle>
                </DialogHeader>
                
                <div className="space-y-4 py-4">
                  <p className="text-sm text-muted-foreground">
                    {settings.language === 'it' 
                      ? 'Supporta lo sviluppo e sblocca funzionalità esclusive:'
                      : 'Support development and unlock exclusive features:'}
                  </p>
                  
                  <div className="space-y-3">
                    <div className="flex items-center gap-3 p-3 rounded-lg bg-[#8B5CF6]/10 border border-[#8B5CF6]/20">
                      <Download className="w-5 h-5 text-[#8B5CF6]" />
                      <div>
                        <p className="font-medium text-foreground">
                          {settings.language === 'it' ? 'Download Offline' : 'Offline Downloads'}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {settings.language === 'it' ? 'Scarica i brani in locale' : 'Download tracks locally'}
                        </p>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-3 p-3 rounded-lg bg-[#6366F1]/10 border border-[#6366F1]/20">
                      <Car className="w-5 h-5 text-[#6366F1]" />
                      <div>
                        <p className="font-medium text-foreground">
                          {settings.language === 'it' ? 'Modalità Auto' : 'Auto Mode'}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {settings.language === 'it' ? 'Interfaccia ottimizzata per la guida' : 'Driving-optimized interface'}
                        </p>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-3 p-3 rounded-lg bg-[#3B82F6]/10 border border-[#3B82F6]/20">
                      <Crown className="w-5 h-5 text-[#3B82F6]" />
                      <div>
                        <p className="font-medium text-foreground">
                          {settings.language === 'it' ? 'Riproduzione Ibrida RealDebrid + Scraping' : 'Hybrid RealDebrid + Scraping Playback'}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {settings.language === 'it' ? 'Non interrompere mai la tua musica' : 'Never interrupt your music'}
                        </p>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-3 p-3 rounded-lg bg-[#8B5CF6]/10 border border-[#8B5CF6]/20">
                      <Share2 className="w-5 h-5 text-[#8B5CF6]" />
                      <div>
                        <p className="font-medium text-foreground">
                          {settings.language === 'it' ? 'Condivisione Playlist' : 'Playlist Sharing'}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {settings.language === 'it' ? 'Condividi le tue playlist con gli amici' : 'Share playlists with friends'}
                        </p>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-3 p-3 rounded-lg bg-[#6366F1]/10 border border-[#6366F1]/20">
                      <Gift className="w-5 h-5 text-[#6366F1]" />
                      <div>
                        <p className="font-medium text-foreground">Wrapper</p>
                        <p className="text-xs text-muted-foreground">
                          {settings.language === 'it' ? 'Il tuo anno in musica' : 'Your year in music'}
                        </p>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-3 p-3 rounded-lg bg-[#3B82F6]/10 border border-[#3B82F6]/20">
                      <Sparkles className="w-5 h-5 text-[#3B82F6]" />
                      <div>
                        <p className="font-medium text-foreground">
                          {settings.language === 'it' ? 'Accesso Anticipato' : 'Early Access'}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {settings.language === 'it' ? 'Prova le novità in anteprima' : 'Try new features before anyone else'}
                        </p>
                      </div>
                    </div>
                  </div>
                  
                  <p className="text-xs text-center text-muted-foreground italic">
                    {settings.language === 'it' 
                      ? '...e tanto altro nella nostra roadmap!'
                      : '...and much more in our roadmap!'}
                  </p>
                </div>
                
                <div className="pt-2">
                  <Button 
                    className="w-full h-12 text-lg font-semibold bg-gradient-to-r from-[#8B5CF6] via-[#6366F1] to-[#3B82F6] hover:opacity-90 transition-opacity border-0"
                    onClick={() => {
                      toast({
                        title: settings.language === 'it' ? 'Prossimamente!' : 'Coming Soon!',
                        description: settings.language === 'it' 
                          ? 'Il Premium sarà disponibile a breve.'
                          : 'Premium will be available soon.',
                      });
                    }}
                  >
                    <Crown className="w-5 h-5 mr-2" />
                    {settings.language === 'it' ? 'Dona 9,90€/anno' : 'Donate €9.90/year'}
                  </Button>
                  <p className="text-xs text-center text-muted-foreground mt-2">
                    {settings.language === 'it' 
                      ? 'Una donazione per supportare lo sviluppo'
                      : 'A donation to support development'}
                  </p>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </section>



        {/* Playback Section - includes audio source and cloud files */}
        <section className="space-y-3 md:space-y-4">
          <div className="flex items-center gap-2 md:gap-3 mb-3 md:mb-4">
            <Volume2 className="w-4 h-4 md:w-5 md:h-5 text-primary" />
            <h2 className="text-lg md:text-xl font-semibold text-foreground">{t('playback')}</h2>
          </div>
          
          <div className="p-3 md:p-4 rounded-xl bg-card space-y-4">
            {/* Audio Source Options */}
            <div>
              <p className="text-xs text-muted-foreground mb-3">{t('audioSource')}</p>
              <div className="space-y-2">
                {/* Deezer Priority Option */}
                <button
                  onClick={() => setAudioSourceMode('deezer_priority')}
                  className={`w-full flex items-start gap-3 p-3 rounded-lg transition-colors text-left ${
                    audioSourceMode === 'deezer_priority' 
                      ? 'bg-purple-500/20 border border-purple-500/50' 
                      : 'bg-secondary hover:bg-secondary/80'
                  }`}
                >
                  <Music className={`w-5 h-5 mt-0.5 ${audioSourceMode === 'deezer_priority' ? 'text-purple-500' : 'text-muted-foreground'}`} />
                  <div className="flex-1">
                    <p className={`font-medium ${audioSourceMode === 'deezer_priority' ? 'text-purple-500' : 'text-foreground'}`}>
                      {t('deezerPriority')}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">{t('deezerPriorityDesc')}</p>
                  </div>
                  {audioSourceMode === 'deezer_priority' && <Check className="w-5 h-5 text-purple-500" />}
                </button>

                {/* Real-Debrid Priority Option */}
                <button
                  onClick={() => setAudioSourceMode('rd_priority')}
                  className={`w-full flex items-start gap-3 p-3 rounded-lg transition-colors text-left ${
                    audioSourceMode === 'rd_priority' 
                      ? 'bg-primary/20 border border-primary/50' 
                      : 'bg-secondary hover:bg-secondary/80'
                  }`}
                >
                  <Cloud className={`w-5 h-5 mt-0.5 ${audioSourceMode === 'rd_priority' ? 'text-primary' : 'text-muted-foreground'}`} />
                  <div className="flex-1">
                    <p className={`font-medium ${audioSourceMode === 'rd_priority' ? 'text-primary' : 'text-foreground'}`}>
                      {t('rdPriority')}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">{t('rdPriorityDesc')}</p>
                  </div>
                  {audioSourceMode === 'rd_priority' && <Check className="w-5 h-5 text-primary" />}
                </button>

                {/* Hybrid Priority Option (Premium) */}
                <button
                  onClick={() => {
                    if (isAdmin) {
                      setAudioSourceMode('hybrid_priority');
                    } else {
                      setShowPremiumModal(true);
                    }
                  }}
                  className={`w-full flex items-start gap-3 p-3 rounded-lg transition-colors text-left ${
                    audioSourceMode === 'hybrid_priority' 
                      ? 'bg-gradient-to-r from-[#8B5CF6]/20 to-[#3B82F6]/20 border border-[#8B5CF6]/50' 
                      : 'bg-secondary hover:bg-secondary/80'
                  }`}
                >
                  <Crown className={`w-5 h-5 mt-0.5 ${audioSourceMode === 'hybrid_priority' ? 'text-[#8B5CF6]' : 'text-muted-foreground'}`} />
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <p className={`font-medium ${audioSourceMode === 'hybrid_priority' ? 'text-[#8B5CF6]' : 'text-foreground'}`}>
                        {t('hybridPriority')}
                      </p>
                      {!isAdmin && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-gradient-to-r from-[#8B5CF6] to-[#3B82F6] text-white font-medium">
                          PREMIUM
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">{t('hybridPriorityDesc')}</p>
                  </div>
                  {audioSourceMode === 'hybrid_priority' && <Check className="w-5 h-5 text-[#8B5CF6]" />}
                </button>
              </div>

              {/* Real-Debrid API Key - shown when rd_priority is selected or has key */}
              {(audioSourceMode === 'rd_priority' || hasRdApiKey) && (
                <div className="pt-3 mt-3 border-t border-border">
                  <label className="text-xs md:text-sm text-muted-foreground block mb-2">
                    <Key className="w-3 h-3 inline mr-1" />
                    {t('apiKey')} Real-Debrid
                  </label>

                  {!isEditingApiKey ? (
                    <div className="flex gap-2">
                      <Input
                        value={profile?.real_debrid_api_key ? maskApiKey(profile.real_debrid_api_key) : ''}
                        disabled
                        className="bg-secondary font-mono text-sm"
                        placeholder="—"
                      />

                      <Button
                        variant="outline"
                        size="icon"
                        onClick={() => setIsEditingApiKey(true)}
                        title={settings.language === 'it' ? 'Modifica API Key' : 'Edit API Key'}
                      >
                        <Pencil className="w-4 h-4" />
                      </Button>

                      <Button
                        variant="outline"
                        size="icon"
                        onClick={() => window.open('https://real-debrid.com/apitoken', '_blank')}
                        title={settings.language === 'it' ? 'Apri Real-Debrid' : 'Open Real-Debrid'}
                      >
                        <ExternalLink className="w-4 h-4" />
                      </Button>
                    </div>
                  ) : (
                    <div className="flex gap-2">
                      <Input
                        value={apiKeyDraft}
                        onChange={(e) => setApiKeyDraft(e.target.value)}
                        type="password"
                        className="bg-secondary font-mono text-sm"
                        placeholder="Real-Debrid API Key"
                      />

                      <Button
                        variant="default"
                        size="icon"
                        disabled={isSavingApiKey}
                        onClick={async () => {
                          setIsSavingApiKey(true);
                          try {
                            const trimmed = apiKeyDraft.trim();
                            if (!trimmed) {
                              toast({
                                title: settings.language === 'it' ? 'API Key mancante' : 'Missing API Key',
                                description: settings.language === 'it' ? 'Inserisci una API Key valida.' : 'Please enter a valid API key.',
                                variant: 'destructive',
                              });
                              return;
                            }

                            const verification = await verifyApiKey(trimmed);
                            if (!verification.valid) {
                              toast({
                                title: settings.language === 'it' ? 'API Key non valida' : 'Invalid API Key',
                                description: settings.language === 'it' ? 'Controlla la key e riprova.' : 'Check your key and try again.',
                                variant: 'destructive',
                              });
                              return;
                            }

                            const { error } = await updateApiKey(trimmed);
                            if (error) {
                              toast({
                                title: settings.language === 'it' ? 'Errore salvataggio' : 'Save error',
                                description: error.message,
                                variant: 'destructive',
                              });
                              return;
                            }

                            setIsEditingApiKey(false);
                            toast({
                              title: settings.language === 'it' ? 'Salvata' : 'Saved',
                              description: settings.language === 'it' ? 'API Key aggiornata con successo.' : 'API key updated successfully.',
                            });
                          } finally {
                            setIsSavingApiKey(false);
                          }
                        }}
                        title={settings.language === 'it' ? 'Salva' : 'Save'}
                      >
                        {isSavingApiKey ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                      </Button>

                      <Button
                        variant="outline"
                        size="icon"
                        onClick={() => setIsEditingApiKey(false)}
                        disabled={isSavingApiKey}
                        title={settings.language === 'it' ? 'Annulla' : 'Cancel'}
                      >
                        <X className="w-4 h-4" />
                      </Button>
                    </div>
                  )}

                  {hasRdApiKey && (
                    <div className="flex items-center justify-between mt-3">
                      <div className="flex items-center gap-2 text-xs md:text-sm">
                        <Check className="w-4 h-4 text-primary" />
                        <span className="text-muted-foreground">{t('connected')} a Real-Debrid</span>
                      </div>
                      
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="destructive" size="sm">
                            <Trash2 className="w-4 h-4 mr-2" />
                            {settings.language === 'it' ? 'Rimuovi' : 'Remove'}
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>
                              {settings.language === 'it' ? 'Rimuovere Real-Debrid?' : 'Remove Real-Debrid?'}
                            </AlertDialogTitle>
                            <AlertDialogDescription>
                              {settings.language === 'it' 
                                ? 'La tua API Key verrà eliminata. Potrai sempre ricollegarti in futuro.'
                                : 'Your API Key will be deleted. You can reconnect anytime.'}
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>
                              {settings.language === 'it' ? 'Annulla' : 'Cancel'}
                            </AlertDialogCancel>
                            <AlertDialogAction
                              onClick={async () => {
                                const { error } = await updateApiKey('');
                                if (!error) {
                                  toast({
                                    title: settings.language === 'it' ? 'Disconnesso' : 'Disconnected',
                                    description: settings.language === 'it' 
                                      ? 'Real-Debrid rimosso.'
                                      : 'Real-Debrid removed.',
                                  });
                                }
                              }}
                            >
                              {settings.language === 'it' ? 'Rimuovi' : 'Remove'}
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Cloud Files - inside Playback section */}
            {hasRdApiKey && (
              <div className="pt-3 border-t border-border">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Cloud className="w-4 h-4 text-muted-foreground" />
                    <p className="text-sm font-medium text-foreground">{t('cloudFiles')}</p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setShowCloudSection(!showCloudSection);
                      if (!showCloudSection && cloudFiles.length === 0) {
                        loadCloudFiles();
                      }
                    }}
                  >
                    {showCloudSection ? (
                      <X className="w-4 h-4 mr-2" />
                    ) : (
                      <Cloud className="w-4 h-4 mr-2" />
                    )}
                    {showCloudSection ? (settings.language === 'it' ? 'Chiudi' : 'Close') : (settings.language === 'it' ? 'Mostra' : 'Show')}
                  </Button>
                </div>

                {showCloudSection && (
                  <div className="p-3 rounded-lg bg-secondary/50 space-y-3">
                    <div className="flex items-center justify-between">
                      <p className="text-xs text-muted-foreground">
                        {settings.language === 'it' 
                          ? 'File salvati su Real-Debrid (ultimi 30 giorni)'
                          : 'Files saved on Real-Debrid (last 30 days)'}
                      </p>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={loadCloudFiles}
                        disabled={isLoadingCloud}
                      >
                        <RefreshCw className={`w-4 h-4 ${isLoadingCloud ? 'animate-spin' : ''}`} />
                      </Button>
                    </div>

                    {isLoadingCloud ? (
                      <div className="flex items-center justify-center py-6">
                        <Loader2 className="w-6 h-6 animate-spin text-primary" />
                        <span className="ml-2 text-sm text-muted-foreground">{t('loadingCloudFiles')}</span>
                      </div>
                    ) : cloudFiles.length === 0 ? (
                      <div className="text-center py-6">
                        <Cloud className="w-10 h-10 text-muted-foreground/30 mx-auto mb-2" />
                        <p className="text-sm text-muted-foreground">{t('noCloudFiles')}</p>
                      </div>
                    ) : (
                      <div className="space-y-2 max-h-60 overflow-y-auto">
                        {cloudFiles.map((file) => (
                          <div
                            key={file.id}
                            className="flex items-center gap-3 p-2 rounded-lg bg-background/50 hover:bg-background transition-colors"
                          >
                            <Play className="w-4 h-4 text-primary shrink-0" />
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-foreground truncate">{file.filename}</p>
                              <p className="text-xs text-muted-foreground">
                                {formatFileSize(file.filesize)} • {formatDate(file.generated)}
                              </p>
                            </div>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => window.open(file.link, '_blank')}
                              title={t('playFromCloud')}
                            >
                              <ExternalLink className="w-4 h-4" />
                            </Button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Audio Quality */}
            <div className="flex items-center justify-between pt-3 border-t border-border">
              <div>
                <p className="text-sm md:text-base font-medium text-foreground">{t('audioQuality')}</p>
              </div>
              <select 
                className="bg-secondary text-foreground rounded-lg px-3 py-2 border border-border text-sm"
                value={settings.audioQuality}
                onChange={(e) => updateSettings({ audioQuality: e.target.value as any })}
              >
                <option value="high">{t('high')}</option>
                <option value="medium">{t('medium')}</option>
                <option value="low">{t('low')}</option>
              </select>
            </div>
          </div>
        </section>

        {/* Home Display Section */}
        <section className="space-y-3 md:space-y-4">
          <div className="flex items-center gap-2 md:gap-3 mb-3 md:mb-4">
            <Home className="w-4 h-4 md:w-5 md:h-5 text-primary" />
            <h2 className="text-lg md:text-xl font-semibold text-foreground">{t('homeDisplay')}</h2>
          </div>
          
          <div className="p-3 md:p-4 rounded-xl bg-card space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm md:text-base text-foreground">{t('recentlyPlayed')}</span>
              <Switch 
                checked={settings.homeDisplayOptions.showRecentlyPlayed}
                onCheckedChange={() => toggleHomeOption('showRecentlyPlayed')}
              />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm md:text-base text-foreground">{t('yourPlaylists')}</span>
              <Switch 
                checked={settings.homeDisplayOptions.showPlaylists}
                onCheckedChange={() => toggleHomeOption('showPlaylists')}
              />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm md:text-base text-foreground">{t('newReleases')}</span>
              <Switch 
                checked={settings.homeDisplayOptions.showNewReleases}
                onCheckedChange={() => toggleHomeOption('showNewReleases')}
              />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm md:text-base text-foreground">{t('popularArtists')}</span>
              <Switch 
                checked={settings.homeDisplayOptions.showPopularArtists}
                onCheckedChange={() => toggleHomeOption('showPopularArtists')}
              />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm md:text-base text-foreground">{t('topCharts')}</span>
              <Switch 
                checked={settings.homeDisplayOptions.showTopCharts}
                onCheckedChange={() => toggleHomeOption('showTopCharts')}
              />
            </div>
          </div>
        </section>

        {/* Admin Notifications Section - Only for admins */}
        {isAdmin && (
          <section className="space-y-3 md:space-y-4">
            <div className="flex items-center gap-2 md:gap-3 mb-3 md:mb-4">
              <Bell className="w-4 h-4 md:w-5 md:h-5 text-primary" />
              <h2 className="text-lg md:text-xl font-semibold text-foreground">
                {settings.language === 'it' ? 'Notifiche Admin' : 'Admin Notifications'}
              </h2>
            </div>
            
            <div className="p-3 md:p-4 rounded-xl bg-card">
              <p className="text-xs text-muted-foreground mb-4">
                {settings.language === 'it' 
                  ? 'Invia notifiche in-app a tutti gli utenti.'
                  : 'Send in-app notifications to all users.'}
              </p>
              <AdminNotifications language={settings.language} />
            </div>
          </section>
        )}

        {/* iOS Diagnostics - show on iOS/Safari or PWA */}
        {(isIOS() || isSafari() || isPWA()) && (
          <section className="space-y-3 md:space-y-4">
            <div className="flex items-center gap-2 md:gap-3 mb-3 md:mb-4">
              <Smartphone className="w-4 h-4 md:w-5 md:h-5 text-primary" />
              <h2 className="text-lg md:text-xl font-semibold text-foreground">
                {settings.language === 'it' ? 'Diagnostica iOS' : 'iOS Diagnostics'}
              </h2>
            </div>
            
            <div className="p-3 md:p-4 rounded-xl bg-card">
              <IOSDiagnostics language={settings.language} />
            </div>
          </section>
        )}

        {/* Information Link */}
        <div className="pt-4">
          <button
            onClick={() => navigate('/info')}
            className="w-full flex items-center justify-between p-4 rounded-xl bg-card hover:bg-card/80 transition-colors"
          >
            <div className="flex items-center gap-3">
              <Info className="w-5 h-5 text-primary" />
              <span className="font-medium text-foreground">
                {settings.language === 'it' ? 'Informazioni' : 'Information'}
              </span>
            </div>
            <ChevronRight className="w-5 h-5 text-muted-foreground" />
          </button>
        </div>
      </div>
    </div>
  );
};

export default Settings;
