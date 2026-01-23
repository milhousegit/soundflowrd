import React, { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import { Gift, Loader2, Save } from 'lucide-react';

interface AdminReferralSettingsProps {
  language: 'en' | 'it';
}

interface ReferralSettings {
  enabled: boolean;
  offer_description: string;
}

const AdminReferralSettings: React.FC<AdminReferralSettingsProps> = ({ language }) => {
  const { toast } = useToast();
  const [settings, setSettings] = useState<ReferralSettings>({
    enabled: true,
    offer_description: '1 mese Premium gratis per te e chi inviti!',
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  const t = {
    title: language === 'it' ? 'Impostazioni Referral' : 'Referral Settings',
    enabled: language === 'it' ? 'Sistema referral attivo' : 'Referral system enabled',
    offerDescription: language === 'it' ? 'Descrizione offerta' : 'Offer description',
    save: language === 'it' ? 'Salva' : 'Save',
    saved: language === 'it' ? 'Impostazioni salvate!' : 'Settings saved!',
    error: language === 'it' ? 'Errore' : 'Error',
    enabledDesc: language === 'it' 
      ? 'Quando disattivato, il link di condivisione non sarà visibile agli utenti' 
      : 'When disabled, the sharing link will not be visible to users',
  };

  useEffect(() => {
    const loadSettings = async () => {
      try {
        const { data, error } = await supabase
          .from('app_settings')
          .select('value')
          .eq('key', 'referral_system')
          .single();

        if (error && error.code !== 'PGRST116') throw error;
        
        if (data?.value) {
          const value = data.value as unknown as ReferralSettings;
          setSettings({
            enabled: value.enabled ?? true,
            offer_description: value.offer_description ?? '',
          });
        }
      } catch (error) {
        console.error('Error loading referral settings:', error);
      } finally {
        setIsLoading(false);
      }
    };

    loadSettings();
  }, []);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      // First check if setting exists
      const { data: existing } = await supabase
        .from('app_settings')
        .select('id')
        .eq('key', 'referral_system')
        .single();

      const jsonValue = JSON.parse(JSON.stringify(settings));

      if (existing) {
        // Update existing
        const { error } = await supabase
          .from('app_settings')
          .update({
            value: jsonValue,
            updated_at: new Date().toISOString(),
          })
          .eq('key', 'referral_system');
        
        if (error) throw error;
      } else {
        // Insert new
        const { error } = await supabase
          .from('app_settings')
          .insert([{
            key: 'referral_system',
            value: jsonValue,
          }]);
        
        if (error) throw error;
      }

      toast({ title: t.saved });
    } catch (error) {
      console.error('Error saving referral settings:', error);
      toast({
        title: t.error,
        description: String(error),
        variant: 'destructive',
      });
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="p-4 rounded-xl bg-card border border-border">
        <div className="flex items-center justify-center py-4">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 rounded-xl bg-card border border-border space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-full bg-gradient-to-r from-[#8B5CF6] to-[#3B82F6] flex items-center justify-center">
          <Gift className="w-5 h-5 text-white" />
        </div>
        <div>
          <h3 className="font-semibold text-foreground">{t.title}</h3>
        </div>
      </div>

      {/* Toggle enabled */}
      <div className="flex items-center justify-between p-3 rounded-lg bg-background/50">
        <div className="flex-1">
          <p className="text-sm font-medium text-foreground">{t.enabled}</p>
          <p className="text-xs text-muted-foreground">{t.enabledDesc}</p>
        </div>
        <Switch
          checked={settings.enabled}
          onCheckedChange={(checked) => setSettings({ ...settings, enabled: checked })}
        />
      </div>

      {/* Offer description */}
      <div className="space-y-2">
        <label className="text-sm font-medium text-foreground">{t.offerDescription}</label>
        <Input
          value={settings.offer_description}
          onChange={(e) => setSettings({ ...settings, offer_description: e.target.value })}
          placeholder={language === 'it' ? 'Es: 1 mese Premium gratis!' : 'E.g.: 1 month Premium free!'}
          className="bg-background/50"
        />
      </div>

      {/* Save button */}
      <Button
        onClick={handleSave}
        disabled={isSaving}
        className="w-full bg-gradient-to-r from-[#8B5CF6] to-[#3B82F6] hover:opacity-90"
      >
        {isSaving ? (
          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
        ) : (
          <Save className="w-4 h-4 mr-2" />
        )}
        {t.save}
      </Button>
    </div>
  );
};

export default AdminReferralSettings;
