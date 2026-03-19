
-- FIX in_app_notifications: restrict INSERT to service_role only
DROP POLICY IF EXISTS "Service role can insert notifications" ON public.in_app_notifications;

CREATE POLICY "Service role can insert notifications"
ON public.in_app_notifications FOR INSERT
WITH CHECK (auth.role() = 'service_role');
