import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useSettings } from '@/contexts/SettingsContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { verifyApiKey } from '@/lib/realdebrid';
import { User, Key, Volume2, LogOut, ExternalLink, Check, Home, Pencil, X, Loader2, Save, Cloud, Play, RefreshCw, Trash2, Music, Smartphone, ChevronRight, ChevronDown, ChevronUp, Info, Globe, Crown, Download, Car, Sparkles, Shield, Users, Send, Eye, EyeOff, Link2, MessageSquare, Mic2, BadgeCheck, Gift, Copy, Share2, Plus, Minus, ArrowUp, ArrowDown, Settings2 } from 'lucide-react';
import { ALL_FALLBACK_SOURCES, type FallbackSourceId } from '@/types/settings';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import AppLogs from '@/components/AppLogs';
import AdminNotifications from '@/components/AdminNotifications';
import AdminUsersManagement from '@/components/AdminUsersManagement';
import AdminBannerTester from '@/components/AdminBannerTester';
import AdminArtistMerge from '@/components/AdminArtistMerge';
import AdminReferralSettings from '@/components/AdminReferralSettings';
import AdminChartConfig from '@/components/AdminChartConfig';
import PaymentPendingBanner from '@/components/PaymentPendingBanner';
import KofiModal from '@/components/KofiModal';
import ReferralShare from '@/components/ReferralShare';
import ReferralShareMinimal from '@/components/ReferralShareMinimal';
import { isPast } from 'date-fns';
import BackButton from '@/components/BackButton';

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
  const {
    profile,
    updateApiKey,
    signOut,
    credentials,
    user,
    isAdmin: contextIsAdmin,
    simulateFreeUser,
    setSimulateFreeUser
  } = useAuth();
  const {
    settings,
    updateSettings,
    t,
    audioSourceMode,
    setAudioSourceMode,
    selectedScrapingSource,
    setSelectedScrapingSource,
    hybridFallbackChain,
    setHybridFallbackChain,
  } = useSettings();
  const { toast } = useToast();
  
  const [isEditingApiKey, setIsEditingApiKey] = useState(false);
  const [apiKeyDraft, setApiKeyDraft] = useState('');
  const [isSavingApiKey, setIsSavingApiKey] = useState(false);
  const [isActualAdmin, setIsActualAdmin] = useState(false);
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isSavingPassword, setIsSavingPassword] = useState(false);

  // Cloud files state
  const [cloudFiles, setCloudFiles] = useState<CloudFile[]>([]);
  const [isLoadingCloud, setIsLoadingCloud] = useState(false);
  const [showCloudSection, setShowCloudSection] = useState(false);
  const [showPremiumModal, setShowPremiumModal] = useState(false);
  const [showPaymentPendingBanner, setShowPaymentPendingBanner] = useState(false);
  const [showBridgeUrlInput, setShowBridgeUrlInput] = useState(false);
  const [showKofiModal, setShowKofiModal] = useState(false);

  // Check if user has active premium (respect simulation mode)
  const isPremiumActive = !simulateFreeUser && profile?.is_premium && (!profile?.premium_expires_at || !isPast(new Date(profile.premium_expires_at)));
  const hasRdApiKey = !!credentials?.realDebridApiKey;

  // Use context isAdmin for most UI, but track actual admin for showing admin section
  const isAdmin = contextIsAdmin;

  // Check if user is actually admin (for showing admin section even in simulation)
  useEffect(() => {
    const checkAdminRole = async () => {
      if (!user?.id) return;
      const { data } = await supabase.from('user_roles').select('role').eq('user_id', user.id).eq('role', 'admin').maybeSingle();
      setIsActualAdmin(!!data);
    };
    checkAdminRole();
  }, [user?.id]);

  // Check if user has pending payment and show banner
  useEffect(() => {
    if (profile?.payment_pending_since && !profile?.is_premium) {
      setShowPaymentPendingBanner(true);
    }
  }, [profile?.payment_pending_since, profile?.is_premium]);

  useEffect(() => {
    if (isEditingApiKey) {
      setApiKeyDraft(profile?.real_debrid_api_key ?? '');
    }
  }, [isEditingApiKey, profile?.real_debrid_api_key]);

  const handleLogout = async () => {
    await signOut();
    toast({
      title: settings.language === 'it' ? 'Disconnesso' : 'Logged out',
      description: settings.language === 'it' ? 'Hai effettuato il logout con successo.' : 'You have been logged out successfully.'
    });
  };

  const handlePasswordChange = async () => {
    if (newPassword.length < 6) {
      toast({
        title: settings.language === 'it' ? 'Password troppo corta' : 'Password too short',
        description: settings.language === 'it' ? 'La password deve avere almeno 6 caratteri.' : 'Password must be at least 6 characters.',
        variant: 'destructive'
      });
      return;
    }
    if (newPassword !== confirmPassword) {
      toast({
        title: settings.language === 'it' ? 'Password non corrispondono' : 'Passwords do not match',
        description: settings.language === 'it' ? 'Le password inserite non corrispondono.' : 'The passwords you entered do not match.',
        variant: 'destructive'
      });
      return;
    }
    setIsSavingPassword(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
      toast({
        title: settings.language === 'it' ? 'Password aggiornata' : 'Password updated',
        description: settings.language === 'it' ? 'La tua password è stata cambiata con successo.' : 'Your password has been changed successfully.'
      });
      setIsChangingPassword(false);
      setNewPassword('');
      setConfirmPassword('');
    } catch (error: any) {
      toast({
        title: settings.language === 'it' ? 'Errore' : 'Error',
        description: error.message,
        variant: 'destructive'
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
        [key]: !settings.homeDisplayOptions[key]
      }
    });
  };

  const toggleFeedOption = (key: keyof typeof settings.feedDisplayOptions) => {
    updateSettings({
      feedDisplayOptions: {
        ...settings.feedDisplayOptions,
        [key]: !settings.feedDisplayOptions[key]
      }
    });
  };

  const loadCloudFiles = async () => {
    if (!credentials?.realDebridApiKey) return;
    setIsLoadingCloud(true);
    try {
      const { data, error } = await supabase.functions.invoke('real-debrid', {
        body: {
          action: 'getDownloads',
          apiKey: credentials.realDebridApiKey
        }
      });
      if (error) throw error;
      setCloudFiles(data?.downloads || []);
    } catch (error) {
      console.error('Failed to load cloud files:', error);
      toast({
        title: settings.language === 'it' ? 'Errore' : 'Error',
        description: settings.language === 'it' ? 'Impossibile caricare i file cloud.' : 'Failed to load cloud files.',
        variant: 'destructive'
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
      minute: '2-digit'
    });
  };

  return (
    <div className="p-4 md:p-6 pb-32 max-w-xl md:max-w-3xl lg:max-w-4xl mx-auto animate-fade-in">
      <div className="flex items-center gap-3 mb-6">
        <BackButton />
        <h1 className="text-2xl font-bold text-foreground">
          {settings.language === 'it' ? 'Impostazioni' : 'Settings'}
        </h1>
      </div>

      <div className="space-y-4">
        {/* Version & Update Section - Prominent */}
        <section className="rounded-xl overflow-hidden bg-gradient-to-r from-primary/10 via-primary/5 to-transparent border border-primary/20">
          <div className="p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-primary/20 flex items-center justify-center">
                  <RefreshCw className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <p className="text-base font-semibold text-foreground">SoundFlow v1.7</p>
                  <p className="text-xs text-muted-foreground">
                    {settings.language === 'it' ? 'Verifica aggiornamenti' : 'Check for updates'}
                  </p>
                </div>
              </div>
              <Button variant="default" size="lg" className="gap-2 px-5" onClick={async () => {
                try {
                  const cacheNames = await caches.keys();
                  await Promise.all(cacheNames.map(name => caches.delete(name)));
                  const registrations = await navigator.serviceWorker.getRegistrations();
                  await Promise.all(registrations.map(reg => reg.unregister()));
                  window.location.reload();
                } catch (error) {
                  console.error('Failed to clear cache:', error);
                  window.location.reload();
                }
              }}>
                <RefreshCw className="w-4 h-4" />
                {settings.language === 'it' ? 'Aggiorna' : 'Update'}
              </Button>
            </div>
          </div>
        </section>

        {/* Account Section */}
        <section className="rounded-xl bg-card overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-3 border-b border-border bg-muted/30">
            <User className="w-4 h-4 text-primary" />
            <h2 className="text-sm font-semibold text-foreground">{t('account')}</h2>
          </div>
          
          <div className="p-4 space-y-4">
            {/* Email */}
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">{t('email')}</span>
              <span className="text-sm text-foreground truncate max-w-[180px]">{profile?.email || '—'}</span>
            </div>

            {/* Password */}
            {!isChangingPassword ? (
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Password</span>
                <Button variant="ghost" size="sm" onClick={() => setIsChangingPassword(true)} className="h-8 text-sm">
                  <Pencil className="w-3.5 h-3.5 mr-1.5" />
                  {settings.language === 'it' ? 'Cambia' : 'Change'}
                </Button>
              </div>
            ) : (
              <div className="space-y-3 pt-1">
                <Input type="password" placeholder={settings.language === 'it' ? 'Nuova password' : 'New password'} value={newPassword} onChange={e => setNewPassword(e.target.value)} className="h-9 text-sm" />
                <Input type="password" placeholder={settings.language === 'it' ? 'Conferma password' : 'Confirm password'} value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} className="h-9 text-sm" />
                <div className="flex gap-2">
                  <Button onClick={handlePasswordChange} disabled={isSavingPassword} size="sm" className="flex-1 h-9">
                    {isSavingPassword ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5 mr-1.5" />}
                    {settings.language === 'it' ? 'Salva' : 'Save'}
                  </Button>
                  <Button variant="outline" size="sm" className="h-9" onClick={() => {
                    setIsChangingPassword(false);
                    setNewPassword('');
                    setConfirmPassword('');
                  }} disabled={isSavingPassword}>
                    <X className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>
            )}

            {/* Language */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Globe className="w-3.5 h-3.5 text-muted-foreground" />
                <span className="text-sm text-foreground">{t('language')}</span>
              </div>
              <select className="bg-secondary text-foreground rounded-lg px-2.5 py-1.5 border border-border text-sm h-8" value={settings.language} onChange={e => updateSettings({ language: e.target.value as 'en' | 'it' })}>
                <option value="en">English</option>
                <option value="it">Italiano</option>
              </select>
            </div>

            {/* Invite a friend - minimal */}
            <ReferralShareMinimal language={settings.language as 'en' | 'it'} onCopied={() => toast({ title: settings.language === 'it' ? 'Link copiato!' : 'Link copied!' })} />

            {/* Premium Status */}
            {isPremiumActive && profile?.premium_expires_at ? (
              <div className="p-3 rounded-lg bg-gradient-to-r from-[#8B5CF6]/20 via-[#6366F1]/15 to-[#3B82F6]/10 border border-[#8B5CF6]/30">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-gradient-to-r from-[#8B5CF6] to-[#3B82F6] flex items-center justify-center shrink-0">
                    <Crown className="w-4 h-4 text-white" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold bg-gradient-to-r from-[#8B5CF6] to-[#3B82F6] bg-clip-text text-transparent">Premium</p>
                    <p className="text-xs text-muted-foreground">
                      {settings.language === 'it' ? 'Scade il' : 'Expires'} {new Date(profile.premium_expires_at).toLocaleDateString(settings.language === 'it' ? 'it-IT' : 'en-US', {
                        day: 'numeric',
                        month: 'long',
                        year: 'numeric'
                      })}
                    </p>
                  </div>
                  <Check className="w-5 h-5 text-green-500" />
                </div>
              </div>
            ) : !isActualAdmin && (
              <Dialog open={showPremiumModal} onOpenChange={setShowPremiumModal}>
                <DialogTrigger asChild>
                  <button className="w-full p-3 rounded-lg bg-gradient-to-r from-[#8B5CF6] via-[#6366F1] to-[#3B82F6] hover:opacity-90 transition-opacity shadow-lg">
                    <div className="flex items-center justify-center gap-2">
                      <Crown className="w-4 h-4 text-white" />
                      <span className="text-sm font-semibold text-white">{settings.language === 'it' ? 'Sblocca Premium' : 'Unlock Premium'}</span>
                      <Sparkles className="w-3.5 h-3.5 text-white/80" />
                    </div>
                  </button>
                </DialogTrigger>
                <DialogContent className="max-w-sm">
                  <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                      <Crown className="w-5 h-5 text-[#8B5CF6]" />
                      <span className="bg-gradient-to-r from-[#8B5CF6] to-[#3B82F6] bg-clip-text text-transparent">Premium</span>
                    </DialogTitle>
                  </DialogHeader>
                  
                  <div className="space-y-3 py-2">
                    {[{
                      icon: Download,
                      label: settings.language === 'it' ? 'Download Offline' : 'Offline Downloads',
                      desc: settings.language === 'it' ? 'Scarica brani in locale' : 'Download tracks locally'
                    }, {
                      icon: Car,
                      label: settings.language === 'it' ? 'Modalità Auto' : 'Auto Mode',
                      desc: settings.language === 'it' ? 'UI ottimizzata per guida' : 'Driving-optimized UI'
                    }, {
                      icon: Crown,
                      label: settings.language === 'it' ? 'Riproduzione Ibrida' : 'Hybrid Playback',
                      desc: settings.language === 'it' ? 'Mai interrompere la musica' : 'Never interrupt music'
                    }, {
                      icon: Mic2,
                      label: settings.language === 'it' ? 'Testi Sincronizzati' : 'Synced Lyrics',
                      desc: settings.language === 'it' ? 'Karaoke automatico' : 'Automatic karaoke'
                    }, {
                      icon: BadgeCheck,
                      label: settings.language === 'it' ? 'Profilo Verificato' : 'Verified Profile',
                      desc: settings.language === 'it' ? 'Coroncina esclusiva' : 'Exclusive crown badge'
                    }, {
                      icon: Sparkles,
                      label: settings.language === 'it' ? 'Accesso Anticipato' : 'Early Access',
                      desc: settings.language === 'it' ? 'Novità in anteprima' : 'New features first'
                    }].map(({ icon: Icon, label, desc }) => (
                      <div key={label} className="flex items-center gap-3 p-2.5 rounded-lg bg-muted/50">
                        <Icon className="w-4 h-4 text-[#8B5CF6] shrink-0" />
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-foreground">{label}</p>
                          <p className="text-xs text-muted-foreground truncate">{desc}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                  
                  <Button className="w-full h-11 font-semibold bg-gradient-to-r from-[#8B5CF6] to-[#3B82F6] hover:opacity-90 border-0" onClick={() => {
                    setShowPremiumModal(false);
                    setShowKofiModal(true);
                  }}>
                    <Crown className="w-4 h-4 mr-2" />
                    {settings.language === 'it' ? 'Supportaci su Ko-fi' : 'Support us on Ko-fi'}
                  </Button>
                </DialogContent>
              </Dialog>
            )}

            {/* Connect/Disconnect Telegram */}
            <div>
              {profile?.telegram_chat_id ? (
                <div className="flex items-center gap-2">
                <div className="flex-1 flex items-center gap-2">
                    <Send className="w-3.5 h-3.5 text-muted-foreground" />
                    <span className="text-sm text-foreground">
                      {settings.language === 'it' ? 'Telegram connesso' : 'Telegram connected'}
                    </span>
                    <Check className="w-3.5 h-3.5 text-green-500 ml-auto" />
                  </div>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="outline" size="icon" className="h-9 w-9 shrink-0 border-destructive/30 hover:bg-destructive/10">
                        <X className="w-3.5 h-3.5 text-destructive" />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>
                          {settings.language === 'it' ? 'Scollega Telegram' : 'Disconnect Telegram'}
                        </AlertDialogTitle>
                        <AlertDialogDescription>
                          {settings.language === 'it' ? 'Sei sicuro di voler scollegare Telegram? Non riceverai più notifiche sul bot.' : 'Are you sure you want to disconnect Telegram? You will no longer receive notifications on the bot.'}
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>
                          {settings.language === 'it' ? 'Annulla' : 'Cancel'}
                        </AlertDialogCancel>
                        <AlertDialogAction onClick={async () => {
                          try {
                            const { error } = await supabase.from('profiles').update({ telegram_chat_id: null }).eq('id', user?.id);
                            if (error) throw error;
                            toast({
                              title: settings.language === 'it' ? 'Telegram scollegato' : 'Telegram disconnected',
                              description: settings.language === 'it' ? 'Il tuo account Telegram è stato scollegato.' : 'Your Telegram account has been disconnected.'
                            });
                            window.location.reload();
                          } catch (error: any) {
                            toast({
                              title: settings.language === 'it' ? 'Errore' : 'Error',
                              description: error.message,
                              variant: 'destructive'
                            });
                          }
                        }} className="bg-destructive hover:bg-destructive/90">
                          {settings.language === 'it' ? 'Scollega' : 'Disconnect'}
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              ) : (
                <Button variant="outline" className="w-full h-9 text-sm gap-2 border-[#0088cc]/30 hover:bg-[#0088cc]/10" onClick={() => {
                  window.open('https://t.me/soundflowrdbot', '_blank');
                }}>
                  <Send className="w-3.5 h-3.5 text-[#0088cc]" />
                  <span className="text-[#0088cc]">{settings.language === 'it' ? 'Connetti Telegram' : 'Connect Telegram'}</span>
                </Button>
              )}
            </div>

            {/* Logout */}
            <div className="pt-2">
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="destructive" className="w-full h-9 text-sm gap-2">
                    <LogOut className="w-3.5 h-3.5" />
                    {settings.language === 'it' ? 'Esci' : 'Log out'}
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>
                      {settings.language === 'it' ? 'Conferma logout' : 'Confirm logout'}
                    </AlertDialogTitle>
                    <AlertDialogDescription>
                      {settings.language === 'it' ? 'Sei sicuro di voler uscire dal tuo account?' : 'Are you sure you want to log out?'}
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>
                      {settings.language === 'it' ? 'Annulla' : 'Cancel'}
                    </AlertDialogCancel>
                    <AlertDialogAction onClick={handleLogout}>
                      {settings.language === 'it' ? 'Esci' : 'Log out'}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>

          </div>
        </section>

        {/* Playback Section */}
        <section className="rounded-xl bg-card overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-3 border-b border-border bg-muted/30">
            <Volume2 className="w-4 h-4 text-primary" />
            <h2 className="text-sm font-semibold text-foreground">{t('playback')}</h2>
          </div>
          
          <div className="p-4 space-y-4">
            {/* Audio Source */}
            <div className="space-y-2">
              <span className="text-xs text-muted-foreground uppercase tracking-wide">{t('audioSource')}</span>
              
              {/* Scraping Ponte */}
              <div className="flex items-center gap-1">
                <button onClick={() => setAudioSourceMode('deezer_priority')} className={`flex-1 flex items-center gap-3 p-3 rounded-lg transition-colors text-left ${audioSourceMode === 'deezer_priority' ? 'bg-purple-500/15 ring-1 ring-purple-500/40' : 'bg-secondary/50 hover:bg-secondary'}`}>
                  <Music className={`w-4 h-4 ${audioSourceMode === 'deezer_priority' ? 'text-purple-500' : 'text-muted-foreground'}`} />
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-medium ${audioSourceMode === 'deezer_priority' ? 'text-purple-500' : 'text-foreground'}`}>
                      {t('deezerPriority')}
                    </p>
                    <p className="text-xs text-muted-foreground truncate">{t('deezerPriorityDesc')}</p>
                  </div>
                  {audioSourceMode === 'deezer_priority' && (
                    <div className="flex items-center gap-1 shrink-0">
                      <Check className="w-4 h-4 text-purple-500" />
                    </div>
                  )}
                </button>
                {audioSourceMode === 'deezer_priority' && (
                  <button
                    onClick={(e) => { e.stopPropagation(); setShowBridgeUrlInput(prev => !prev); }}
                    className="p-3 rounded-lg hover:bg-secondary/80 transition-colors shrink-0"
                    title={settings.language === 'it' ? 'Configura indirizzo' : 'Configure address'}
                  >
                    <Settings2 className="w-4 h-4 text-muted-foreground" />
                  </button>
                )}
              </div>

              {/* Bridge URL Input - shown when gear icon is clicked */}
              {audioSourceMode === 'deezer_priority' && showBridgeUrlInput && (
                <div className="ml-7 space-y-2 animate-fade-in">
                  <span className="text-xs text-muted-foreground">
                    {settings.language === 'it' ? 'Indirizzo sito ponte' : 'Bridge site address'}
                  </span>
                  <Input
                    value={settings.bridgeUrl}
                    onChange={(e) => {
                      const val = e.target.value;
                      updateSettings({ bridgeUrl: val });
                      // Validate on blur or when it looks like a full URL
                      if (val && val.startsWith('http') && val.includes('.')) {
                        const isCompatible = val.startsWith('https://tidal.squid.wtf') || val.startsWith('https://monochrome.tf');
                        if (!isCompatible) {
                          toast({
                            title: settings.language === 'it' ? 'Ponte non compatibile' : 'Incompatible bridge',
                            variant: 'destructive',
                          });
                        }
                      }
                    }}
                    placeholder="https://tidal.squid.wtf o https://monochrome.tf/"
                    className="h-9 text-sm"
                  />
                </div>
              )}

              {/* Real-Debrid */}
              <button onClick={() => hasRdApiKey ? setAudioSourceMode('rd_priority') : null} disabled={!hasRdApiKey} className={`w-full flex items-center gap-3 p-3 rounded-lg transition-colors text-left ${!hasRdApiKey ? 'opacity-50 cursor-not-allowed bg-secondary/30' : audioSourceMode === 'rd_priority' ? 'bg-primary/15 ring-1 ring-primary/40' : 'bg-secondary/50 hover:bg-secondary'}`}>
                <Cloud className={`w-4 h-4 ${audioSourceMode === 'rd_priority' && hasRdApiKey ? 'text-primary' : 'text-muted-foreground'}`} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <p className={`text-sm font-medium ${audioSourceMode === 'rd_priority' && hasRdApiKey ? 'text-primary' : 'text-foreground'}`}>
                      {t('rdPriority')}
                    </p>
                    {!hasRdApiKey && (
                      <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground font-medium">
                        {settings.language === 'it' ? 'Richiede API' : 'Requires API'}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground truncate">{t('rdPriorityDesc')}</p>
                </div>
                {audioSourceMode === 'rd_priority' && hasRdApiKey && <Check className="w-4 h-4 text-primary shrink-0" />}
              </button>

              {/* Hybrid (Premium) */}
              <button onClick={() => {
                if (!hasRdApiKey) return;
                isAdmin || isPremiumActive ? setAudioSourceMode('hybrid_priority') : setShowPremiumModal(true);
              }} disabled={!hasRdApiKey} className={`w-full flex items-center gap-3 p-3 rounded-lg transition-colors text-left ${!hasRdApiKey ? 'opacity-50 cursor-not-allowed bg-secondary/30' : audioSourceMode === 'hybrid_priority' ? 'bg-gradient-to-r from-[#8B5CF6]/15 to-[#3B82F6]/15 ring-1 ring-[#8B5CF6]/40' : 'bg-secondary/50 hover:bg-secondary'}`}>
                <Crown className={`w-4 h-4 ${audioSourceMode === 'hybrid_priority' && hasRdApiKey ? 'text-[#8B5CF6]' : 'text-muted-foreground'}`} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <p className={`text-sm font-medium ${audioSourceMode === 'hybrid_priority' && hasRdApiKey ? 'text-[#8B5CF6]' : 'text-foreground'}`}>
                      {t('hybridPriority')}
                    </p>
                    {!hasRdApiKey ? (
                      <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground font-medium">
                        {settings.language === 'it' ? 'Richiede API' : 'Requires API'}
                      </span>
                    ) : !isAdmin && !isPremiumActive && (
                      <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-gradient-to-r from-[#8B5CF6] to-[#3B82F6] text-white font-semibold">
                        PRO
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground truncate">{t('hybridPriorityDesc')}</p>
                </div>
                {audioSourceMode === 'hybrid_priority' && hasRdApiKey && <Check className="w-4 h-4 text-[#8B5CF6] shrink-0" />}
              </button>

              {/* Hybrid Fallback Chain - shown when Hybrid is active */}
              {audioSourceMode === 'hybrid_priority' && (isAdmin || isPremiumActive) && (
                <div className="ml-7 space-y-2 animate-fade-in">
                  <span className="text-xs text-muted-foreground">{t('fallbackChain')}</span>
                  <div className="space-y-1.5">
                    {hybridFallbackChain.map((sourceId, index) => {
                      const source = ALL_FALLBACK_SOURCES.find(s => s.id === sourceId);
                      if (!source) return null;
                      return (
                        <div key={sourceId} className="flex items-center gap-2 p-2 rounded-lg bg-secondary/50">
                          <span className="text-xs text-muted-foreground w-5 text-center font-mono">{index + 1}</span>
                          <span className="text-sm text-foreground flex-1">{source.name}</span>
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => {
                                if (index === 0) return;
                                const newChain = [...hybridFallbackChain];
                                [newChain[index - 1], newChain[index]] = [newChain[index], newChain[index - 1]];
                                setHybridFallbackChain(newChain);
                              }}
                              disabled={index === 0}
                              className="p-1 rounded hover:bg-secondary disabled:opacity-30"
                            >
                              <ArrowUp className="w-3.5 h-3.5 text-muted-foreground" />
                            </button>
                            <button
                              onClick={() => {
                                if (index === hybridFallbackChain.length - 1) return;
                                const newChain = [...hybridFallbackChain];
                                [newChain[index], newChain[index + 1]] = [newChain[index + 1], newChain[index]];
                                setHybridFallbackChain(newChain);
                              }}
                              disabled={index === hybridFallbackChain.length - 1}
                              className="p-1 rounded hover:bg-secondary disabled:opacity-30"
                            >
                              <ArrowDown className="w-3.5 h-3.5 text-muted-foreground" />
                            </button>
                            {hybridFallbackChain.length > 1 && (
                              <button
                                onClick={() => setHybridFallbackChain(hybridFallbackChain.filter(s => s !== sourceId))}
                                className="p-1 rounded hover:bg-destructive/20"
                              >
                                <X className="w-3.5 h-3.5 text-destructive" />
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  {/* Add source button */}
                  {hybridFallbackChain.length < ALL_FALLBACK_SOURCES.length && (
                    <div className="flex gap-2 flex-wrap">
                      {ALL_FALLBACK_SOURCES.filter(s => !hybridFallbackChain.includes(s.id)).map(source => (
                        <button
                          key={source.id}
                          onClick={() => setHybridFallbackChain([...hybridFallbackChain, source.id])}
                          className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-secondary/50 hover:bg-secondary text-xs text-muted-foreground transition-colors"
                        >
                          <Plus className="w-3 h-3" />
                          {source.name}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Real-Debrid API Key */}
            <div className="pt-3 border-t border-border space-y-3">
              <div className="pt-3 border-t border-border space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Key className="w-3.5 h-3.5 text-muted-foreground" />
                    <span className="text-sm text-foreground">Real-Debrid API</span>
                  </div>
                  {hasRdApiKey && <span className="text-xs text-primary flex items-center gap-1"><Check className="w-3 h-3" /> {t('connected')}</span>}
                </div>

                {!isEditingApiKey ? (
                  <div className="flex gap-2">
                    <Input value={profile?.real_debrid_api_key ? maskApiKey(profile.real_debrid_api_key) : ''} disabled className="h-9 text-sm font-mono flex-1" placeholder="—" />
                    <Button variant="outline" size="icon" className="h-9 w-9 shrink-0" onClick={() => setIsEditingApiKey(true)}>
                      <Pencil className="w-3.5 h-3.5" />
                    </Button>
                    <Button variant="outline" size="icon" className="h-9 w-9 shrink-0" onClick={() => window.open('https://real-debrid.com/apitoken', '_blank')}>
                      <ExternalLink className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <Input value={apiKeyDraft} onChange={e => setApiKeyDraft(e.target.value)} type="password" className="h-9 text-sm font-mono flex-1" placeholder="API Key" />
                    <Button size="icon" className="h-9 w-9 shrink-0" disabled={isSavingApiKey} onClick={async () => {
                      setIsSavingApiKey(true);
                      try {
                        const trimmed = apiKeyDraft.trim();
                        if (!trimmed) {
                          toast({ title: 'API Key mancante', variant: 'destructive' });
                          return;
                        }
                        const verification = await verifyApiKey(trimmed);
                        if (!verification.valid) {
                          toast({ title: 'API Key non valida', variant: 'destructive' });
                          return;
                        }
                        const { error } = await updateApiKey(trimmed);
                        if (error) {
                          toast({ title: 'Errore', description: error.message, variant: 'destructive' });
                          return;
                        }
                        setIsEditingApiKey(false);
                        toast({ title: settings.language === 'it' ? 'Salvata!' : 'Saved!' });
                      } finally {
                        setIsSavingApiKey(false);
                      }
                    }}>
                      {isSavingApiKey ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                    </Button>
                    <Button variant="outline" size="icon" className="h-9 w-9 shrink-0" onClick={() => setIsEditingApiKey(false)} disabled={isSavingApiKey}>
                      <X className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                )}

                {hasRdApiKey && (
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" className="flex-1 h-9" onClick={() => {
                      setShowCloudSection(!showCloudSection);
                      if (!showCloudSection && cloudFiles.length === 0) loadCloudFiles();
                    }}>
                      <Cloud className="w-3.5 h-3.5 mr-1.5" />
                      {t('cloudFiles')}
                    </Button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="outline" size="sm" className="h-9 text-destructive hover:text-destructive">
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>{settings.language === 'it' ? 'Rimuovere Real-Debrid?' : 'Remove Real-Debrid?'}</AlertDialogTitle>
                          <AlertDialogDescription>
                            {settings.language === 'it' ? 'La tua API Key verrà eliminata.' : 'Your API Key will be deleted.'}
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>{settings.language === 'it' ? 'Annulla' : 'Cancel'}</AlertDialogCancel>
                          <AlertDialogAction onClick={async () => {
                            await updateApiKey('');
                            toast({ title: settings.language === 'it' ? 'Rimosso' : 'Removed' });
                          }}>
                            {settings.language === 'it' ? 'Rimuovi' : 'Remove'}
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                )}

                {/* Cloud Files Expandable */}
                {showCloudSection && hasRdApiKey && (
                  <div className="rounded-lg bg-secondary/50 p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">{settings.language === 'it' ? 'Ultimi 30 giorni' : 'Last 30 days'}</span>
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={loadCloudFiles} disabled={isLoadingCloud}>
                        <RefreshCw className={`w-3.5 h-3.5 ${isLoadingCloud ? 'animate-spin' : ''}`} />
                      </Button>
                    </div>
                    {isLoadingCloud ? (
                      <div className="flex items-center justify-center py-4">
                        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                      </div>
                    ) : cloudFiles.length === 0 ? (
                      <p className="text-xs text-muted-foreground text-center py-4">{t('noCloudFiles')}</p>
                    ) : (
                      <div className="space-y-1 max-h-48 overflow-y-auto">
                        {cloudFiles.map(file => (
                          <div key={file.id} className="flex items-center gap-2 p-2 rounded bg-background/50 hover:bg-background transition-colors">
                            <Play className="w-3 h-3 text-primary shrink-0" />
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-medium text-foreground truncate">{file.filename}</p>
                              <p className="text-[10px] text-muted-foreground">{formatFileSize(file.filesize)}</p>
                            </div>
                            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => window.open(file.link, '_blank')}>
                              <ExternalLink className="w-3 h-3" />
                            </Button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Audio Quality */}
            <div className="flex items-center justify-between pt-3 border-t border-border">
              <span className="text-sm text-foreground">{t('audioQuality')}</span>
              <select className="bg-secondary text-foreground rounded-lg px-2.5 py-1.5 border border-border text-sm h-8" value={settings.audioQuality} onChange={e => updateSettings({ audioQuality: e.target.value as any })}>
                <option value="high">{t('high')}</option>
                <option value="medium">{t('medium')}</option>
                <option value="low">{t('low')}</option>
              </select>
            </div>
          </div>
        </section>

        {/* Home Display Section */}
        <section className="rounded-xl bg-card overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-3 border-b border-border bg-muted/30">
            <Home className="w-4 h-4 text-primary" />
            <h2 className="text-sm font-semibold text-foreground">{t('homeDisplay')}</h2>
          </div>
          
          <div className="divide-y divide-border">
            {[{
              key: 'showRecentlyPlayed',
              label: t('recentlyPlayed')
            }, {
              key: 'showPopularArtists',
              label: t('popularArtists')
            }, {
              key: 'showNewReleases',
              label: t('newReleases')
            }, {
              key: 'showTopCharts',
              label: t('topCharts')
            }].map(({ key, label }) => (
              <div key={key} className="flex items-center justify-between px-4 py-3">
                <span className="text-sm text-foreground">{label}</span>
                <Switch checked={settings.homeDisplayOptions[key as keyof typeof settings.homeDisplayOptions]} onCheckedChange={() => toggleHomeOption(key as keyof typeof settings.homeDisplayOptions)} />
              </div>
            ))}
          </div>
        </section>

        {/* Feed Display Section */}
        <section className="rounded-xl bg-card overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-3 border-b border-border bg-muted/30">
            <MessageSquare className="w-4 h-4 text-primary" />
            <h2 className="text-sm font-semibold text-foreground">
              {settings.language === 'it' ? 'Display Feed' : 'Feed Display'}
            </h2>
          </div>
          
          <div className="divide-y divide-border">
            {[{
              key: 'showArtistReleases',
              label: settings.language === 'it' ? 'Novità Artisti che mi piacciono' : 'New releases from liked artists'
            }, {
              key: 'showFollowingPosts',
              label: settings.language === 'it' ? 'Post degli utenti che seguo' : 'Posts from users I follow'
            }, {
              key: 'showAlbumComments',
              label: settings.language === 'it' ? 'Commenti agli album che mi piacciono' : 'Comments on albums I like'
            }, {
              key: 'showFollowingPlaylists',
              label: settings.language === 'it' ? 'Playlist degli utenti che seguo' : 'Playlists from users I follow'
            }].map(({ key, label }) => (
              <div key={key} className="flex items-center justify-between px-4 py-3">
                <span className="text-sm text-foreground">{label}</span>
                <Switch checked={settings.feedDisplayOptions[key as keyof typeof settings.feedDisplayOptions]} onCheckedChange={() => toggleFeedOption(key as keyof typeof settings.feedDisplayOptions)} />
              </div>
            ))}
          </div>
        </section>

        {/* App Logs */}
        <section className="rounded-xl bg-card overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-3 border-b border-border bg-muted/30">
            <Smartphone className="w-4 h-4 text-primary" />
            <h2 className="text-sm font-semibold text-foreground">
              {settings.language === 'it' ? 'Log App' : 'App Logs'}
            </h2>
          </div>
          <div className="p-4">
            <AppLogs language={settings.language} />
          </div>
        </section>

        {/* Info Link */}
        <button onClick={() => navigate('/info')} className="w-full flex items-center justify-between p-4 rounded-xl bg-card hover:bg-card/80 transition-colors">
          <div className="flex items-center gap-2">
            <Info className="w-4 h-4 text-primary" />
            <span className="text-sm font-medium text-foreground">
              {settings.language === 'it' ? 'Informazioni' : 'Information'}
            </span>
          </div>
          <ChevronRight className="w-4 h-4 text-muted-foreground" />
        </button>

        {/* Admin Section */}
        {isActualAdmin && (
          <section className="rounded-xl bg-card overflow-hidden">
            <div className="flex items-center gap-2 px-4 py-3 border-b border-border bg-gradient-to-r from-[#8B5CF6]/10 to-[#3B82F6]/10">
              <Shield className="w-4 h-4 text-[#8B5CF6]" />
              <h2 className="text-sm font-semibold text-foreground">Admin</h2>
            </div>
            
            <div className="divide-y divide-border">
              {/* Simulate Free User Toggle */}
              <div className="flex items-center justify-between px-4 py-3">
                <div className="flex items-center gap-2">
                  {simulateFreeUser ? <EyeOff className="w-3.5 h-3.5 text-amber-500" /> : <Eye className="w-3.5 h-3.5 text-muted-foreground" />}
                  <div>
                    <span className="text-sm text-foreground">
                      {settings.language === 'it' ? 'Simula Utente Free' : 'Simulate Free User'}
                    </span>
                    {simulateFreeUser && (
                      <p className="text-xs text-amber-500">
                        {settings.language === 'it' ? 'Modalità attiva' : 'Mode active'}
                      </p>
                    )}
                  </div>
                </div>
                <Switch checked={simulateFreeUser} onCheckedChange={setSimulateFreeUser} />
              </div>

              {/* Users Management */}
              <details className="group">
                <summary className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-muted/30 transition-colors">
                  <div className="flex items-center gap-2">
                    <Users className="w-3.5 h-3.5 text-muted-foreground" />
                    <span className="text-sm text-foreground">
                      {settings.language === 'it' ? 'Gestione Utenti Premium' : 'Premium Users Management'}
                    </span>
                  </div>
                  <ChevronDown className="w-4 h-4 text-muted-foreground transition-transform group-open:rotate-180" />
                </summary>
                <div className="px-4 pb-4">
                  <AdminUsersManagement language={settings.language} />
                </div>
              </details>

              {/* Send Notifications */}
              <details className="group">
                <summary className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-muted/30 transition-colors">
                  <div className="flex items-center gap-2">
                    <Send className="w-3.5 h-3.5 text-muted-foreground" />
                    <span className="text-sm text-foreground">
                      {settings.language === 'it' ? 'Invia Notifiche' : 'Send Notifications'}
                    </span>
                  </div>
                  <ChevronDown className="w-4 h-4 text-muted-foreground transition-transform group-open:rotate-180" />
                </summary>
                <div className="px-4 pb-4">
                  <AdminNotifications language={settings.language} />
                </div>
              </details>

              {/* Test Banners */}
              <AdminBannerTester language={settings.language} />

              {/* Artist Merge */}
              <details className="group">
                <summary className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-muted/30 transition-colors">
                  <div className="flex items-center gap-2">
                    <Link2 className="w-3.5 h-3.5 text-muted-foreground" />
                    <span className="text-sm text-foreground">
                      {settings.language === 'it' ? 'Unisci Metadati' : 'Merge Metadata'}
                    </span>
                  </div>
                  <ChevronDown className="w-4 h-4 text-muted-foreground transition-transform group-open:rotate-180" />
                </summary>
                <div className="px-4 pb-4">
                  <AdminArtistMerge language={settings.language} />
                </div>
              </details>

              {/* Referral Settings */}
              <details className="group">
                <summary className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-muted/30 transition-colors">
                  <div className="flex items-center gap-2">
                    <Link2 className="w-3.5 h-3.5 text-muted-foreground" />
                    <span className="text-sm text-foreground">
                      {settings.language === 'it' ? 'Sistema Referral' : 'Referral System'}
                    </span>
                  </div>
                  <ChevronDown className="w-4 h-4 text-muted-foreground transition-transform group-open:rotate-180" />
                </summary>
                <div className="px-4 pb-4">
                  <AdminReferralSettings language={settings.language} />
                </div>
              </details>

              {/* Chart Configurations */}
              <details className="group">
                <summary className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-muted/30 transition-colors">
                  <div className="flex items-center gap-2">
                    <Music className="w-3.5 h-3.5 text-muted-foreground" />
                    <span className="text-sm text-foreground">
                      {settings.language === 'it' ? 'Classifiche Nazionali' : 'Country Charts'}
                    </span>
                  </div>
                  <ChevronDown className="w-4 h-4 text-muted-foreground transition-transform group-open:rotate-180" />
                </summary>
                <div className="px-4 pb-4">
                  <AdminChartConfig language={settings.language} />
                </div>
              </details>
            </div>
          </section>
        )}
      </div>
      
      {/* Payment Pending Banner */}
      {showPaymentPendingBanner && (
        <PaymentPendingBanner onClose={() => setShowPaymentPendingBanner(false)} />
      )}

      {/* Ko-fi Modal */}
      <KofiModal 
        isOpen={showKofiModal} 
        onClose={async () => {
          setShowKofiModal(false);
          if (user?.id) {
            await supabase
              .from('profiles')
              .update({ payment_pending_since: new Date().toISOString() })
              .eq('id', user.id);
          }
          setTimeout(() => {
            setShowPaymentPendingBanner(true);
          }, 1500);
        }} 
      />
    </div>
  );
};

export default Settings;
