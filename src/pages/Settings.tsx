import React, { useEffect, useState } from 'react';
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
  Monitor,
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
  Youtube,
  Music,
  Smartphone,
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
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import IOSDiagnostics from '@/components/IOSDiagnostics';
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
  const { profile, updateApiKey, signOut, credentials } = useAuth();
  const { settings, updateSettings, t, audioSourceMode, setAudioSourceMode } = useSettings();
  const { toast } = useToast();

  const [isEditingApiKey, setIsEditingApiKey] = useState(false);
  const [apiKeyDraft, setApiKeyDraft] = useState('');
  const [isSavingApiKey, setIsSavingApiKey] = useState(false);
  
  // Cloud files state
  const [cloudFiles, setCloudFiles] = useState<CloudFile[]>([]);
  const [isLoadingCloud, setIsLoadingCloud] = useState(false);
  const [showCloudSection, setShowCloudSection] = useState(false);

  const hasRdApiKey = !!credentials?.realDebridApiKey;

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
      <h1 className="text-2xl md:text-4xl font-bold text-foreground mb-6 md:mb-8">{t('settings')}</h1>

      <div className="space-y-6 md:space-y-8">
        {/* Account Section */}
        <section className="space-y-3 md:space-y-4">
          <div className="flex items-center gap-2 md:gap-3 mb-3 md:mb-4">
            <User className="w-4 h-4 md:w-5 md:h-5 text-primary" />
            <h2 className="text-lg md:text-xl font-semibold text-foreground">{t('account')}</h2>
          </div>
          
          <div className="p-3 md:p-4 rounded-xl bg-card space-y-3 md:space-y-4">
            <div>
              <label className="text-xs md:text-sm text-muted-foreground block mb-2">{t('email')}</label>
              <Input
                value={profile?.email || ''}
                disabled
                className="bg-secondary text-sm md:text-base"
              />
            </div>
          </div>
        </section>

        {/* Audio Source Section - Combined with Real-Debrid */}
        <section className="space-y-3 md:space-y-4">
          <div className="flex items-center gap-2 md:gap-3 mb-3 md:mb-4">
            <Music className="w-4 h-4 md:w-5 md:h-5 text-primary" />
            <h2 className="text-lg md:text-xl font-semibold text-foreground">{t('audioSource')}</h2>
          </div>
          
          <div className="p-3 md:p-4 rounded-xl bg-card space-y-3">
            {/* YouTube Only Option */}
            <button
              onClick={() => setAudioSourceMode('youtube_only')}
              className={`w-full flex items-start gap-3 p-3 rounded-lg transition-colors text-left ${
                audioSourceMode === 'youtube_only' 
                  ? 'bg-red-500/20 border border-red-500/50' 
                  : 'bg-secondary hover:bg-secondary/80'
              }`}
            >
              <Youtube className={`w-5 h-5 mt-0.5 ${audioSourceMode === 'youtube_only' ? 'text-red-500' : 'text-muted-foreground'}`} />
              <div className="flex-1">
                <p className={`font-medium ${audioSourceMode === 'youtube_only' ? 'text-red-500' : 'text-foreground'}`}>
                  {t('youtubeOnly')}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">{t('youtubeOnlyDesc')}</p>
              </div>
              {audioSourceMode === 'youtube_only' && <Check className="w-5 h-5 text-red-500" />}
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

            {/* Real-Debrid API Key - shown below when rd_priority is selected or has key */}
            {(audioSourceMode === 'rd_priority' || hasRdApiKey) && (
              <div className="pt-3 border-t border-border">
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
        </section>

        {/* Cloud Files Section */}
        {hasRdApiKey && (
          <section className="space-y-3 md:space-y-4">
            <div className="flex items-center justify-between mb-3 md:mb-4">
              <div className="flex items-center gap-2 md:gap-3">
                <Cloud className="w-4 h-4 md:w-5 md:h-5 text-primary" />
                <h2 className="text-lg md:text-xl font-semibold text-foreground">{t('cloudFiles')}</h2>
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
              <div className="p-3 md:p-4 rounded-xl bg-card space-y-3">
                <div className="flex items-center justify-between mb-2">
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
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="w-6 h-6 animate-spin text-primary" />
                    <span className="ml-2 text-sm text-muted-foreground">{t('loadingCloudFiles')}</span>
                  </div>
                ) : cloudFiles.length === 0 ? (
                  <div className="text-center py-8">
                    <Cloud className="w-12 h-12 text-muted-foreground/30 mx-auto mb-3" />
                    <p className="text-sm text-muted-foreground">{t('noCloudFiles')}</p>
                  </div>
                ) : (
                  <div className="space-y-2 max-h-80 overflow-y-auto">
                    {cloudFiles.map((file) => (
                      <div
                        key={file.id}
                        className="flex items-center gap-3 p-2 rounded-lg bg-secondary/50 hover:bg-secondary transition-colors"
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
          </section>
        )}

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


        {/* Playback Section */}
        <section className="space-y-3 md:space-y-4">
          <div className="flex items-center gap-2 md:gap-3 mb-3 md:mb-4">
            <Volume2 className="w-4 h-4 md:w-5 md:h-5 text-primary" />
            <h2 className="text-lg md:text-xl font-semibold text-foreground">{t('playback')}</h2>
          </div>
          
          <div className="p-3 md:p-4 rounded-xl bg-card space-y-4">
            <div className="flex items-center justify-between">
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

            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm md:text-base font-medium text-foreground">{t('crossfade')}</p>
              </div>
              <select 
                className="bg-secondary text-foreground rounded-lg px-3 py-2 border border-border text-sm"
                value={settings.crossfade}
                onChange={(e) => updateSettings({ crossfade: parseInt(e.target.value) })}
              >
                <option value="0">{t('off')}</option>
                <option value="3">3 {t('seconds')}</option>
                <option value="5">5 {t('seconds')}</option>
                <option value="10">10 {t('seconds')}</option>
              </select>
            </div>
          </div>
        </section>

        {/* Display Section */}
        <section className="space-y-3 md:space-y-4">
          <div className="flex items-center gap-2 md:gap-3 mb-3 md:mb-4">
            <Monitor className="w-4 h-4 md:w-5 md:h-5 text-primary" />
            <h2 className="text-lg md:text-xl font-semibold text-foreground">{t('display')}</h2>
          </div>
          
          <div className="p-3 md:p-4 rounded-xl bg-card space-y-4">
            <div className="flex items-center justify-between">
              <div>
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
          </div>
        </section>

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

        {/* Logout */}
        <div className="pt-4">
          <Button 
            variant="destructive" 
            onClick={handleLogout}
            className="gap-2 w-full md:w-auto"
          >
            <LogOut className="w-4 h-4" />
            {t('logout')}
          </Button>
        </div>

        {/* App Version & Refresh */}
        <div className="pt-6 border-t border-border space-y-3">
          <Button
            variant="outline"
            className="w-full gap-2"
            onClick={() => window.location.reload()}
          >
            <RefreshCw className="w-4 h-4" />
            {settings.language === 'it' ? 'Aggiorna App' : 'Refresh App'}
          </Button>
          <p className="text-center text-xs text-muted-foreground">
            SoundFlow 0.7.7
          </p>
        </div>
      </div>
    </div>
  );
};

export default Settings;
