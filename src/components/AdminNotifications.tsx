import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Bell, Send, Loader2, KeyRound, RefreshCw } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';

interface AdminNotificationsProps {
  language: 'en' | 'it';
}

const AdminNotifications: React.FC<AdminNotificationsProps> = ({ language }) => {
  const { toast } = useToast();
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [url, setUrl] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [isGeneratingKeys, setIsGeneratingKeys] = useState(false);
  const [generatedKeys, setGeneratedKeys] = useState<{ publicKey: string; privateKey: string } | null>(null);

  const handleSendNotification = async () => {
    if (!title.trim() || !body.trim()) {
      toast({
        title: language === 'it' ? 'Campi mancanti' : 'Missing fields',
        description: language === 'it' 
          ? 'Inserisci titolo e messaggio.' 
          : 'Please enter title and message.',
        variant: 'destructive',
      });
      return;
    }

    setIsSending(true);
    try {
      const { data, error } = await supabase.functions.invoke('send-broadcast-notification', {
        body: {
          title: title.trim(),
          body: body.trim(),
          url: url.trim() || undefined,
        },
      });

      if (error) throw error;

      if (data?.error) {
        toast({
          title: language === 'it' ? 'Attenzione' : 'Warning',
          description: data.error,
          variant: 'destructive',
        });
        return;
      }

      toast({
        title: language === 'it' ? 'Notifica inviata!' : 'Notification sent!',
        description: data?.message || (language === 'it' 
          ? `Inviata a ${data?.sentCount || 0} utenti.`
          : `Sent to ${data?.sentCount || 0} users.`),
      });

      // Reset form
      setTitle('');
      setBody('');
      setUrl('');
    } catch (error) {
      console.error('Failed to send notification:', error);
      toast({
        title: language === 'it' ? 'Errore' : 'Error',
        description: language === 'it' 
          ? 'Impossibile inviare la notifica.'
          : 'Failed to send notification.',
        variant: 'destructive',
      });
    } finally {
      setIsSending(false);
    }
  };

  const handleGenerateVapidKeys = async () => {
    setIsGeneratingKeys(true);
    try {
      const { data, error } = await supabase.functions.invoke('send-broadcast-notification', {
        body: {
          action: 'generate-vapid-keys',
        },
      });

      if (error) throw error;

      if (data?.publicKey && data?.privateKey) {
        setGeneratedKeys({
          publicKey: data.publicKey,
          privateKey: data.privateKey,
        });
        toast({
          title: language === 'it' ? 'Chiavi generate!' : 'Keys generated!',
          description: language === 'it' 
            ? 'Copia le chiavi nei secrets del progetto.'
            : 'Copy the keys to project secrets.',
        });
      }
    } catch (error) {
      console.error('Failed to generate VAPID keys:', error);
      toast({
        title: language === 'it' ? 'Errore' : 'Error',
        description: language === 'it' 
          ? 'Impossibile generare le chiavi VAPID.'
          : 'Failed to generate VAPID keys.',
        variant: 'destructive',
      });
    } finally {
      setIsGeneratingKeys(false);
    }
  };

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast({
      title: language === 'it' ? 'Copiato!' : 'Copied!',
      description: `${label} ${language === 'it' ? 'copiato negli appunti.' : 'copied to clipboard.'}`,
    });
  };

  return (
    <div className="space-y-4">
      <div>
        <label className="text-xs text-muted-foreground block mb-2">
          {language === 'it' ? 'Titolo notifica' : 'Notification title'} *
        </label>
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={language === 'it' ? 'Es: Nuovo aggiornamento!' : 'E.g.: New update!'}
          className="bg-secondary"
        />
      </div>

      <div>
        <label className="text-xs text-muted-foreground block mb-2">
          {language === 'it' ? 'Messaggio' : 'Message'} *
        </label>
        <Textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder={language === 'it' ? 'Scrivi il messaggio...' : 'Write your message...'}
          className="bg-secondary min-h-[80px]"
        />
      </div>

      <div>
        <label className="text-xs text-muted-foreground block mb-2">
          {language === 'it' ? 'URL (opzionale)' : 'URL (optional)'}
        </label>
        <Input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://..."
          className="bg-secondary"
        />
        <p className="text-xs text-muted-foreground mt-1">
          {language === 'it' 
            ? 'Link che si aprirà al tap sulla notifica'
            : 'Link that opens when tapping the notification'}
        </p>
      </div>

      <Button
        onClick={handleSendNotification}
        disabled={isSending || !title.trim() || !body.trim()}
        className="w-full gap-2"
      >
        {isSending ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          <Send className="w-4 h-4" />
        )}
        {language === 'it' ? 'Invia a tutti gli utenti' : 'Send to all users'}
      </Button>

      <div className="border-t border-border pt-4 mt-4">
        <p className="text-xs text-muted-foreground mb-3">
          {language === 'it' 
            ? 'Se le notifiche non funzionano, genera nuove chiavi VAPID:'
            : 'If notifications are not working, generate new VAPID keys:'}
        </p>
        
        <Button
          onClick={handleGenerateVapidKeys}
          disabled={isGeneratingKeys}
          variant="outline"
          className="w-full gap-2"
        >
          {isGeneratingKeys ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <KeyRound className="w-4 h-4" />
          )}
          {language === 'it' ? 'Genera chiavi VAPID' : 'Generate VAPID keys'}
        </Button>

        {generatedKeys && (
          <div className="mt-4 space-y-3 p-3 bg-secondary rounded-lg">
            <div>
              <p className="text-xs text-muted-foreground mb-1">VAPID_PUBLIC_KEY:</p>
              <div 
                className="text-xs font-mono bg-background p-2 rounded break-all cursor-pointer hover:bg-accent"
                onClick={() => copyToClipboard(generatedKeys.publicKey, 'Public Key')}
              >
                {generatedKeys.publicKey}
              </div>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1">VAPID_PRIVATE_KEY:</p>
              <div 
                className="text-xs font-mono bg-background p-2 rounded break-all cursor-pointer hover:bg-accent max-h-20 overflow-y-auto"
                onClick={() => copyToClipboard(generatedKeys.privateKey, 'Private Key')}
              >
                {generatedKeys.privateKey}
              </div>
            </div>
            <p className="text-xs text-amber-500">
              {language === 'it' 
                ? '⚠️ Copia queste chiavi nei secrets del progetto (VAPID_PUBLIC_KEY e VAPID_PRIVATE_KEY), poi riabilita le notifiche utente.'
                : '⚠️ Copy these keys to project secrets (VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY), then re-enable user notifications.'}
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default AdminNotifications;
