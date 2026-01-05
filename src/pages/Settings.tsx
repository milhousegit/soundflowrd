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
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

const Settings: React.FC = () => {
  const { profile, updateApiKey, signOut } = useAuth();
  const { settings, updateSettings, t } = useSettings();
  const { toast } = useToast();

  const [isEditingApiKey, setIsEditingApiKey] = useState(false);
  const [apiKeyDraft, setApiKeyDraft] = useState('');
  const [isSavingApiKey, setIsSavingApiKey] = useState(false);

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

        {/* Real-Debrid Section */}
        <section className="space-y-3 md:space-y-4">
          <div className="flex items-center gap-2 md:gap-3 mb-3 md:mb-4">
            <Key className="w-4 h-4 md:w-5 md:h-5 text-primary" />
            <h2 className="text-lg md:text-xl font-semibold text-foreground">{t('realDebrid')}</h2>
          </div>
          
          <div className="p-3 md:p-4 rounded-xl bg-card space-y-3 md:space-y-4">
            <div>
              <label className="text-xs md:text-sm text-muted-foreground block mb-2">{t('apiKey')}</label>

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
            </div>

            <div className="flex items-center gap-2 text-xs md:text-sm">
              <Check className="w-4 h-4 text-primary" />
              <span className="text-muted-foreground">{t('connected')} a Real-Debrid</span>
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
      </div>
    </div>
  );
};

export default Settings;
