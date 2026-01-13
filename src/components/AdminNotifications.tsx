import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Send, Loader2 } from 'lucide-react';
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
          title: language === 'it' ? 'Errore' : 'Error',
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
          className="bg-secondary h-9 text-sm"
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
          className="bg-secondary min-h-[80px] text-sm"
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
          className="bg-secondary h-9 text-sm"
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
        className="w-full gap-2 h-9"
      >
        {isSending ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          <Send className="w-4 h-4" />
        )}
        {language === 'it' ? 'Invia a tutti gli utenti' : 'Send to all users'}
      </Button>
    </div>
  );
};

export default AdminNotifications;
