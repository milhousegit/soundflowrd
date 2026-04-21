import React, { useEffect, useState, useCallback } from 'react';
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
import AdminCanvasManager from '@/components/AdminCanvasManager';

import KofiModal from '@/components/KofiModal';
import FundingGoalBar from '@/components/FundingGoalBar';
import ReferralShare from '@/components/ReferralShare';
import ReferralShareMinimal from '@/components/ReferralShareMinimal';
import { isPast } from 'date-fns';
import BackButton from '@/components/BackButton';
import { useLibrarySync } from '@/hooks/useLibrarySync';
import { PluginManager } from '@/components/plugins/PluginManager';

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
    bridgeUrl,
    setBridgeUrl,
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
  const [showPremiumModal, setShowPremiumModal] = useState(false); // kept for potential future use
  
  const [showBridgeUrlInput, setShowBridgeUrlInput] = useState(false);
  const [showRdSettings, setShowRdSettings] = useState(false);
  const [showHybridSettings, setShowHybridSettings] = useState(false);
  const [showKofiModal, setShowKofiModal] = useState(false);

  const { isSyncing: isSyncingLibrary, progress: syncProgress, startSync } = useLibrarySync();

  const syncLibrary = useCallback(() => {
    if (!credentials?.realDebridApiKey || !user?.id) return;
    startSync(user.id, credentials.realDebridApiKey);
  }, [credentials, user, startSync]);

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

            {/* Connect/Disconnect Telegram */}
            {profile?.telegram_chat_id ? (
              <div className="flex items-center justify-between w-full">
                <div className="flex items-center gap-2">
                  <Send className="w-3.5 h-3.5 text-muted-foreground" />
                  <span className="text-sm text-foreground">
                    {settings.language === 'it' ? 'Telegram connesso' : 'Telegram connected'}
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <Check className="w-3.5 h-3.5 text-green-500" />
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <button className="text-muted-foreground hover:text-destructive transition-colors">
                        <X className="w-3.5 h-3.5" />
                      </button>
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
              </div>
            ) : (
              <button
                onClick={() => window.open('https://t.me/soundflowrdbot', '_blank')}
                className="flex items-center justify-between w-full group"
              >
                <div className="flex items-center gap-2">
                  <Send className="w-3.5 h-3.5 text-muted-foreground" />
                  <span className="text-sm text-foreground">
                    {settings.language === 'it' ? 'Connetti Telegram' : 'Connect Telegram'}
                  </span>
                </div>
                <div className="flex items-center gap-1.5 text-muted-foreground">
                  <span className="text-xs">
                    {settings.language === 'it' ? 'Notifiche e supporto' : 'Notifications & support'}
                  </span>
                  <ChevronRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
                </div>
              </button>
            )}

            {/* Premium Section */}
            {isPremiumActive && profile?.premium_expires_at ? (
              <div className="p-4 rounded-xl bg-gradient-to-r from-[#8B5CF6]/10 to-[#3B82F6]/10 border border-[#8B5CF6]/20 space-y-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-gradient-to-r from-[#8B5CF6] to-[#3B82F6] flex items-center justify-center shrink-0">
                    <Crown className="w-5 h-5 text-white" />
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
                <p className="text-xs text-muted-foreground">
                  {settings.language === 'it' 
                    ? 'Dona di nuovo per estendere il Premium e aiutarci a pubblicare SoundFlow sugli store!' 
                    : 'Donate again to extend Premium and help us publish SoundFlow on the stores!'}
                </p>
                <FundingGoalBar 
                  language={settings.language as 'en' | 'it'} 
                  onContribute={() => setShowKofiModal(true)}
                  isPremium={true}
                  inline
                />
                <Button
                  onClick={() => setShowKofiModal(true)}
                  className="w-full h-9 text-sm font-semibold bg-gradient-to-r from-[#8B5CF6] to-[#3B82F6] hover:opacity-90 border-0 text-white"
                >
                  <Crown className="w-3.5 h-3.5 mr-1.5" />
                  {settings.language === 'it' ? 'Estendi Premium' : 'Extend Premium'}
                </Button>
              </div>
            ) : (
              <div className="p-4 rounded-xl bg-gradient-to-r from-[#8B5CF6]/10 to-[#3B82F6]/10 border border-[#8B5CF6]/20 space-y-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-gradient-to-r from-[#8B5CF6] to-[#3B82F6] flex items-center justify-center shrink-0">
                    <Crown className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-foreground text-sm">
                      {settings.language === 'it' ? 'Sblocca Premium' : 'Unlock Premium'}
                    </h3>
                    <p className="text-xs text-muted-foreground">
                      {settings.language === 'it' ? 'Supporta SoundFlow e ottieni funzioni esclusive' : 'Support SoundFlow and get exclusive features'}
                    </p>
                  </div>
                </div>
                <div className="space-y-1.5 pl-1">
                  {[
                    { icon: <Sparkles className="w-3.5 h-3.5" />, text: settings.language === 'it' ? 'Modalità ibrida multi-sorgente' : 'Hybrid multi-source mode' },
                    { icon: <Download className="w-3.5 h-3.5" />, text: settings.language === 'it' ? 'Download illimitati' : 'Unlimited downloads' },
                    { icon: <Smartphone className="w-3.5 h-3.5" />, text: settings.language === 'it' ? 'Collegamento con la TV' : 'TV connection' },
                    { icon: <Car className="w-3.5 h-3.5" />, text: settings.language === 'it' ? 'Modalità Auto' : 'Auto Mode' },
                  ].map((feature, i) => (
                    <button key={i} onClick={() => setShowKofiModal(true)} className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors w-full text-left cursor-pointer [&_svg]:pointer-events-none">
                      <span className="text-[#8B5CF6]">{feature.icon}</span>
                      {feature.text}
                    </button>
                  ))}
                </div>
                {/* Funding goal inline */}
                <FundingGoalBar 
                  language={settings.language as 'en' | 'it'} 
                  onContribute={() => setShowKofiModal(true)}
                  isPremium={false}
                  inline
                />
                <Button
                  onClick={() => setShowKofiModal(true)}
                  className="w-full h-9 text-sm font-semibold bg-gradient-to-r from-[#8B5CF6] to-[#3B82F6] hover:opacity-90 border-0 text-white"
                >
                  <Crown className="w-3.5 h-3.5 mr-1.5" />
                  {settings.language === 'it' ? 'Contribuisci su Ko-fi' : 'Contribute on Ko-fi'}
                </Button>
              </div>
            )}

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

        {/* Plugin Section (replaces legacy Playback) */}
        <section className="rounded-xl bg-card overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-3 border-b border-border bg-muted/30">
            <Volume2 className="w-4 h-4 text-primary" />
            <h2 className="text-sm font-semibold text-foreground">Plugin</h2>
          </div>
          <div className="p-4 space-y-4">
            <PluginManager onUpgrade={() => setShowPremiumModal(true)} />

            {/* Audio Quality (kept from legacy playback) */}
            <div className="flex items-center justify-between pt-3 border-t border-border">
              <span className="text-sm text-foreground">{t('audioQuality')}</span>
              <select
                className="bg-secondary text-foreground rounded-lg px-2.5 py-1.5 border border-border text-sm h-8"
                value={settings.audioQuality}
                onChange={e => updateSettings({ audioQuality: e.target.value as any })}
              >
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
        <button onClick={() => navigate('/app/info')} className="w-full flex items-center justify-between p-4 rounded-xl bg-card hover:bg-card/80 transition-colors">
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

              {/* Canvas Manager */}
              <details className="group">
                <summary className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-muted/30 transition-colors">
                  <div className="flex items-center gap-2">
                    <Play className="w-3.5 h-3.5 text-muted-foreground" />
                    <span className="text-sm text-foreground">
                      {settings.language === 'it' ? 'Canvas Video' : 'Canvas Videos'}
                    </span>
                  </div>
                  <ChevronDown className="w-4 h-4 text-muted-foreground transition-transform group-open:rotate-180" />
                </summary>
                <div className="px-4 pb-4">
                  <AdminCanvasManager language={settings.language} />
                </div>
              </details>
            </div>
          </section>
        )}
      </div>
      
      {/* Ko-fi Modal */}
      <KofiModal 
        isOpen={showKofiModal} 
        onClose={() => setShowKofiModal(false)} 
      />
    </div>
  );
};

export default Settings;
