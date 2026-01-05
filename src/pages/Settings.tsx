import React from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useSettings } from '@/contexts/SettingsContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { 
  User, 
  Key, 
  Volume2, 
  Monitor, 
  LogOut, 
  ExternalLink,
  Check,
  Home
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

const Settings: React.FC = () => {
  const { credentials, logout } = useAuth();
  const { settings, updateSettings, t } = useSettings();
  const { toast } = useToast();

  const handleLogout = () => {
    logout();
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
                value={credentials?.email || ''} 
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
              <div className="flex gap-2">
                <Input 
                  value={credentials?.realDebridApiKey ? maskApiKey(credentials.realDebridApiKey) : ''} 
                  disabled 
                  className="bg-secondary font-mono text-sm"
                />
                <Button 
                  variant="outline"
                  size="icon"
                  onClick={() => window.open('https://real-debrid.com/apitoken', '_blank')}
                >
                  <ExternalLink className="w-4 h-4" />
                </Button>
              </div>
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
