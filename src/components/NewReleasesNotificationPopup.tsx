import React, { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useSettings } from '@/contexts/SettingsContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Bell, X } from 'lucide-react';

const POPUP_DISMISSED_KEY = 'newReleasesNotificationDismissed';
const VAPID_PUBLIC_KEY = 'BNbxGYNMhEIi9zrneh7mqBH0Hc-g5Y2hLGYC4HPb5uDz1RJdwMNgPpY-4O4wQ9y9LcWPb4IjK6O8YHu7o6FJfhM';

export const NewReleasesNotificationPopup: React.FC = () => {
  const { isAuthenticated, user } = useAuth();
  const { t } = useSettings();
  const [showPopup, setShowPopup] = useState(false);
  const [isRequesting, setIsRequesting] = useState(false);

  useEffect(() => {
    if (!isAuthenticated || !user) return;
    
    // Check if already dismissed or notifications already enabled
    const dismissed = localStorage.getItem(POPUP_DISMISSED_KEY);
    if (dismissed === 'true') return;

    // Check if push notifications are supported
    if (!('Notification' in window) || !('serviceWorker' in navigator) || !('PushManager' in window)) {
      return;
    }

    // Check if already subscribed
    if (Notification.permission === 'granted') {
      checkExistingSubscription();
      return;
    }

    // Show popup after a short delay
    const timeout = setTimeout(() => {
      setShowPopup(true);
    }, 2000);

    return () => clearTimeout(timeout);
  }, [isAuthenticated, user]);

  const checkExistingSubscription = async () => {
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      if (subscription) {
        // Already subscribed, don't show popup
        localStorage.setItem(POPUP_DISMISSED_KEY, 'true');
      }
    } catch (error) {
      console.error('Error checking subscription:', error);
    }
  };

  const handleEnableNotifications = async () => {
    setIsRequesting(true);
    try {
      const permission = await Notification.requestPermission();
      
      if (permission === 'granted') {
        // Register service worker if not already registered
        const registration = await navigator.serviceWorker.register('/sw.js');
        await navigator.serviceWorker.ready;

        // Subscribe to push notifications
        const subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: VAPID_PUBLIC_KEY,
        });

        const subscriptionJson = subscription.toJSON();
        
        // Save subscription to database
        await supabase.from('notification_subscriptions').upsert({
          user_id: user!.id,
          endpoint: subscriptionJson.endpoint!,
          p256dh: subscriptionJson.keys!.p256dh,
          auth: subscriptionJson.keys!.auth,
          enabled: true,
        }, { onConflict: 'user_id,endpoint' });

        console.log('Push notification subscription saved');
      }
      
      localStorage.setItem(POPUP_DISMISSED_KEY, 'true');
      setShowPopup(false);
    } catch (error) {
      console.error('Error enabling notifications:', error);
    } finally {
      setIsRequesting(false);
    }
  };

  const handleDismiss = () => {
    localStorage.setItem(POPUP_DISMISSED_KEY, 'true');
    setShowPopup(false);
  };

  if (!showPopup) return null;

  const isItalian = t('language') === 'it';

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-background/80 backdrop-blur-sm p-4">
      <div className="bg-card border border-border rounded-2xl shadow-2xl max-w-sm w-full p-6 animate-in fade-in zoom-in duration-300">
        <div className="flex justify-end">
          <Button variant="ghost" size="icon" onClick={handleDismiss} className="h-8 w-8">
            <X className="w-4 h-4" />
          </Button>
        </div>
        
        <div className="flex flex-col items-center text-center -mt-2">
          <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-4">
            <Bell className="w-8 h-8 text-primary" />
          </div>
          
          <h2 className="text-xl font-bold text-foreground mb-2">
            {isItalian ? 'Nuove uscite dei tuoi artisti preferiti' : 'New releases from your favorite artists'}
          </h2>
          
          <p className="text-muted-foreground text-sm mb-6">
            {isItalian 
              ? 'Quando aggiungi un artista ai preferiti ti vorremmo inviare una notifica quando pubblicano nuova musica. Per farlo devi consentire le notifiche.'
              : 'When you add an artist to your favorites, we\'d like to send you a notification when they release new music. To do this, you need to allow notifications.'}
          </p>
          
          <Button 
            onClick={handleEnableNotifications}
            disabled={isRequesting}
            className="w-full"
          >
            {isRequesting 
              ? (isItalian ? 'Attendere...' : 'Please wait...')
              : 'OK'}
          </Button>
        </div>
      </div>
    </div>
  );
};

export default NewReleasesNotificationPopup;
