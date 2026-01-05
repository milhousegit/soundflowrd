import React from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { 
  User, 
  Key, 
  Volume2, 
  Monitor, 
  LogOut, 
  ExternalLink,
  Check
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

const Settings: React.FC = () => {
  const { credentials, logout } = useAuth();
  const { toast } = useToast();

  const handleLogout = () => {
    logout();
    toast({
      title: 'Disconnesso',
      description: 'Hai effettuato il logout con successo.',
    });
  };

  const maskApiKey = (key: string) => {
    if (key.length <= 8) return '••••••••';
    return key.slice(0, 4) + '••••••••' + key.slice(-4);
  };

  return (
    <div className="p-8 pb-32 max-w-2xl animate-fade-in">
      <h1 className="text-4xl font-bold text-foreground mb-8">Impostazioni</h1>

      <div className="space-y-8">
        {/* Account Section */}
        <section className="space-y-4">
          <div className="flex items-center gap-3 mb-4">
            <User className="w-5 h-5 text-primary" />
            <h2 className="text-xl font-semibold text-foreground">Account</h2>
          </div>
          
          <div className="p-4 rounded-xl bg-card space-y-4">
            <div>
              <label className="text-sm text-muted-foreground block mb-2">Email</label>
              <Input 
                value={credentials?.email || ''} 
                disabled 
                className="bg-secondary"
              />
            </div>
          </div>
        </section>

        {/* Real-Debrid Section */}
        <section className="space-y-4">
          <div className="flex items-center gap-3 mb-4">
            <Key className="w-5 h-5 text-primary" />
            <h2 className="text-xl font-semibold text-foreground">Real-Debrid</h2>
          </div>
          
          <div className="p-4 rounded-xl bg-card space-y-4">
            <div>
              <label className="text-sm text-muted-foreground block mb-2">API Key</label>
              <div className="flex gap-2">
                <Input 
                  value={credentials?.realDebridApiKey ? maskApiKey(credentials.realDebridApiKey) : ''} 
                  disabled 
                  className="bg-secondary font-mono"
                />
                <Button 
                  variant="outline"
                  onClick={() => window.open('https://real-debrid.com/apitoken', '_blank')}
                >
                  <ExternalLink className="w-4 h-4" />
                </Button>
              </div>
            </div>
            
            <div className="flex items-center gap-2 text-sm">
              <Check className="w-4 h-4 text-primary" />
              <span className="text-muted-foreground">Connesso a Real-Debrid</span>
            </div>
          </div>
        </section>

        {/* Playback Section */}
        <section className="space-y-4">
          <div className="flex items-center gap-3 mb-4">
            <Volume2 className="w-5 h-5 text-primary" />
            <h2 className="text-xl font-semibold text-foreground">Riproduzione</h2>
          </div>
          
          <div className="p-4 rounded-xl bg-card space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium text-foreground">Qualità audio</p>
                <p className="text-sm text-muted-foreground">Scegli la qualità dello streaming</p>
              </div>
              <select className="bg-secondary text-foreground rounded-lg px-4 py-2 border border-border">
                <option>Alta (320 kbps)</option>
                <option>Media (160 kbps)</option>
                <option>Bassa (96 kbps)</option>
              </select>
            </div>

            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium text-foreground">Crossfade</p>
                <p className="text-sm text-muted-foreground">Transizione fluida tra i brani</p>
              </div>
              <select className="bg-secondary text-foreground rounded-lg px-4 py-2 border border-border">
                <option>Off</option>
                <option>3 secondi</option>
                <option>5 secondi</option>
                <option>10 secondi</option>
              </select>
            </div>
          </div>
        </section>

        {/* Display Section */}
        <section className="space-y-4">
          <div className="flex items-center gap-3 mb-4">
            <Monitor className="w-5 h-5 text-primary" />
            <h2 className="text-xl font-semibold text-foreground">Display</h2>
          </div>
          
          <div className="p-4 rounded-xl bg-card space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium text-foreground">Lingua</p>
                <p className="text-sm text-muted-foreground">Lingua dell'interfaccia</p>
              </div>
              <select className="bg-secondary text-foreground rounded-lg px-4 py-2 border border-border">
                <option>Italiano</option>
                <option>English</option>
                <option>Español</option>
                <option>Français</option>
              </select>
            </div>
          </div>
        </section>

        {/* Logout */}
        <div className="pt-4">
          <Button 
            variant="destructive" 
            onClick={handleLogout}
            className="gap-2"
          >
            <LogOut className="w-4 h-4" />
            Esci
          </Button>
        </div>
      </div>
    </div>
  );
};

export default Settings;
