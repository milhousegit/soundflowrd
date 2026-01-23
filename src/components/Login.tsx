import React, { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { verifyApiKey } from '@/lib/realdebrid';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Music2, Mail, Lock, Key, Loader2, AlertCircle, UserPlus, LogIn, ArrowLeft, Gift } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { z } from 'zod';
import appLogo from '@/assets/logo.png';

const loginSchema = z.object({
  email: z.string().email('Email non valida'),
  password: z.string().min(6, 'La password deve avere almeno 6 caratteri'),
});

const signupSchema = z.object({
  email: z.string().email('Email non valida'),
  password: z.string().min(6, 'La password deve avere almeno 6 caratteri'),
  apiKey: z.string().optional(),
});

const resetSchema = z.object({
  email: z.string().email('Email non valida'),
});

const Login: React.FC = () => {
  const { signIn, signUp, updateApiKey, profile } = useAuth();
  const { toast } = useToast();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [mode, setMode] = useState<'login' | 'signup' | 'reset'>('login');
  const [resetSent, setResetSent] = useState(false);
  const [referralCode, setReferralCode] = useState<string | null>(null);

  // Check for referral code in URL on mount
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const ref = urlParams.get('ref');
    if (ref) {
      setReferralCode(ref.toUpperCase());
      setMode('signup'); // Auto switch to signup mode
    }
  }, []);

  // Clear API key field when switching to login mode (not needed for login)
  useEffect(() => {
    if (mode === 'login') {
      setApiKey('');
    }
    setError('');
    setResetSent(false);
  }, [mode]);

  const handlePasswordReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    try {
      const validation = resetSchema.safeParse({ email });
      if (!validation.success) {
        setError(validation.error.errors[0].message);
        setIsLoading(false);
        return;
      }

      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/profile`,
      });

      if (resetError) {
        setError(resetError.message);
        setIsLoading(false);
        return;
      }

      setResetSent(true);
      toast({
        title: 'Email inviata!',
        description: 'Controlla la tua casella di posta per reimpostare la password.',
      });
    } catch (err) {
      setError('Errore durante l\'invio. Riprova.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    try {
      if (mode === 'signup') {
        // Validate signup input (API key is optional)
        const validation = signupSchema.safeParse({ email, password, apiKey: apiKey || undefined });
        if (!validation.success) {
          setError(validation.error.errors[0].message);
          setIsLoading(false);
          return;
        }

        // Verify Real-Debrid API key only if provided
        let verifiedUsername = '';
        if (apiKey && apiKey.trim().length > 0) {
          const verification = await verifyApiKey(apiKey);
          
          if (!verification.valid) {
            setError('API Key Real-Debrid non valida. Controlla e riprova.');
            setIsLoading(false);
            return;
          }
          verifiedUsername = verification.username || '';
        }

        const { error: signUpError } = await signUp(email, password);
        
        if (signUpError) {
          if (signUpError.message.includes('already registered')) {
            setError('Email già registrata. Prova ad accedere.');
          } else {
            setError(signUpError.message);
          }
          setIsLoading(false);
          return;
        }

        // Ensure we have an authenticated session, then save the API key if provided
        const { error: signInAfterSignUpError } = await signIn(email, password);
        if (signInAfterSignUpError) {
          setError(signInAfterSignUpError.message);
          setIsLoading(false);
          return;
        }

        // Get the new user ID
        const { data: sessionData } = await supabase.auth.getSession();
        const newUserId = sessionData.session?.user?.id;

        // Only save API key if provided
        if (apiKey && apiKey.trim().length > 0) {
          const { error: apiKeyError } = await updateApiKey(apiKey);
          if (apiKeyError) {
            setError('Account creato, ma non sono riuscito a salvare la API Key. Riprova dalle Impostazioni.');
            setIsLoading(false);
            return;
          }
        }

        // Process referral if there's a code
        if (referralCode && newUserId) {
          try {
            const response = await fetch(
              `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/process-referral`,
              {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'Authorization': `Bearer ${sessionData.session?.access_token}`,
                },
                body: JSON.stringify({ referralCode, newUserId }),
              }
            );
            
            if (response.ok) {
              toast({
                title: '🎉 Bonus Referral!',
                description: 'Hai ricevuto 1 mese di Premium gratis!',
              });
            }
          } catch (refError) {
            console.error('Referral processing error:', refError);
          }
        }
        
        toast({
          title: 'Account creato!',
          description: `Benvenuto ${verifiedUsername || email}`,
        });
      } else {
        // Login mode - only email and password required
        const validation = loginSchema.safeParse({ email, password });
        if (!validation.success) {
          setError(validation.error.errors[0].message);
          setIsLoading(false);
          return;
        }

        const { error: signInError } = await signIn(email, password);
        
        if (signInError) {
          if (signInError.message.includes('Invalid login')) {
            setError('Email o password non corretti.');
          } else {
            setError(signInError.message);
          }
          setIsLoading(false);
          return;
        }
        
        toast({
          title: 'Bentornato!',
          description: `Accesso effettuato`,
        });
      }
    } catch (err) {
      setError('Errore durante la verifica. Riprova.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4 md:p-6 relative overflow-hidden">
      {/* Background effects */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute top-1/4 left-1/4 w-64 md:w-96 h-64 md:h-96 bg-primary/10 rounded-full blur-3xl animate-pulse-slow" />
        <div className="absolute bottom-1/4 right-1/4 w-56 md:w-80 h-56 md:h-80 bg-accent/10 rounded-full blur-3xl animate-pulse-slow" style={{ animationDelay: '1s' }} />
      </div>

      <div className="w-full max-w-md relative z-10">
        {/* Logo */}
        <div className="text-center mb-6 md:mb-8 animate-fade-in">
          <img 
            src={appLogo} 
            alt="SoundFlow Logo" 
            className="w-20 h-20 md:w-24 md:h-24 mx-auto mb-4 md:mb-6 rounded-2xl shadow-glow"
          />
          <h1 className="text-3xl md:text-4xl font-bold text-foreground mb-2">SoundFlow</h1>
          <p className="text-sm md:text-base text-muted-foreground">Il tuo player musicale personale</p>
        </div>

        {/* Password Reset Mode */}
        {mode === 'reset' ? (
          <div className="glass rounded-2xl p-6 md:p-8 space-y-5 md:space-y-6 animate-scale-in">
            <button
              type="button"
              onClick={() => setMode('login')}
              className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              Torna al login
            </button>

            <div className="text-center">
              <h2 className="text-xl font-semibold text-foreground mb-2">Recupera Password</h2>
              <p className="text-sm text-muted-foreground">
                Inserisci la tua email per ricevere il link di recupero
              </p>
            </div>

            {error && (
              <div className="flex items-center gap-2 p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {resetSent ? (
              <div className="text-center p-4 rounded-lg bg-primary/10 text-primary">
                <Mail className="w-12 h-12 mx-auto mb-3 opacity-80" />
                <p className="font-medium">Email inviata!</p>
                <p className="text-sm opacity-80 mt-1">
                  Controlla la tua casella di posta e segui le istruzioni.
                </p>
              </div>
            ) : (
              <form onSubmit={handlePasswordReset} className="space-y-4">
                <div className="relative">
                  <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                  <Input
                    type="email"
                    placeholder="Email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="pl-12"
                    required
                  />
                </div>

                <Button
                  type="submit"
                  className="w-full h-12 text-base font-semibold"
                  disabled={isLoading}
                >
                  {isLoading ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    <>
                      <Mail className="w-5 h-5" />
                      Invia link di recupero
                    </>
                  )}
                </Button>
              </form>
            )}
          </div>
        ) : (
          <>
            {/* Mode Toggle */}
            <div className="flex gap-2 mb-4 justify-center">
              <Button
                type="button"
                variant={mode === 'login' ? 'default' : 'ghost'}
                onClick={() => setMode('login')}
                className="gap-2"
              >
                <LogIn className="w-4 h-4" />
                Accedi
              </Button>
              <Button
                type="button"
                variant={mode === 'signup' ? 'default' : 'ghost'}
                onClick={() => setMode('signup')}
                className="gap-2"
              >
                <UserPlus className="w-4 h-4" />
                Registrati
              </Button>
            </div>

            {/* Referral badge */}
            {referralCode && mode === 'signup' && (
              <div className="flex items-center justify-center gap-2 p-3 rounded-lg bg-gradient-to-r from-[#8B5CF6]/20 to-[#3B82F6]/20 border border-[#8B5CF6]/30 mb-4">
                <Gift className="w-5 h-5 text-[#8B5CF6]" />
                <span className="text-sm font-medium text-foreground">
                  🎁 Registrati e ricevi <span className="text-[#8B5CF6]">1 mese di Premium gratis!</span>
                </span>
              </div>
            )}

            {/* Login/Signup Form */}
            <form onSubmit={handleSubmit} className="glass rounded-2xl p-6 md:p-8 space-y-5 md:space-y-6 animate-scale-in">
              {error && (
                <div className="flex items-center gap-2 p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  <span>{error}</span>
                </div>
              )}
              
              <div className="space-y-3 md:space-y-4">
                <div className="relative">
                  <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                  <Input
                    type="email"
                    placeholder="Email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="pl-12"
                    required
                  />
                </div>

                <div className="relative">
                  <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                  <Input
                    type="password"
                    placeholder="Password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="pl-12"
                    required
                    minLength={6}
                  />
                </div>

                {/* API Key only shown for signup */}
                {mode === 'signup' && (
                  <div className="relative">
                    <Key className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                    <Input
                      type="password"
                      placeholder="Real-Debrid API Key (opzionale)"
                      value={apiKey}
                      onChange={(e) => setApiKey(e.target.value)}
                      className="pl-12"
                    />
                  </div>
                )}
              </div>

              {/* Forgot password link - only in login mode */}
              {mode === 'login' && (
                <div className="text-center">
                  <button
                    type="button"
                    onClick={() => setMode('reset')}
                    className="text-sm text-primary hover:underline"
                  >
                    Password dimenticata?
                  </button>
                </div>
              )}

              <Button
                type="submit"
                className="w-full h-12 text-base font-semibold"
                disabled={isLoading}
              >
                {isLoading ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <>
                    <Music2 className="w-5 h-5" />
                    {mode === 'login' ? 'Accedi' : 'Registrati'}
                  </>
                )}
              </Button>

              {mode === 'signup' && (
                <p className="text-center text-xs md:text-sm text-muted-foreground">
                  Puoi aggiungere la tua API Key da{' '}
                  <a
                    href="https://real-debrid.com/apitoken"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary hover:underline"
                  >
                    Real-Debrid
                  </a>
                  {' '}in seguito dalle impostazioni
                </p>
              )}
            </form>
          </>
        )}
      </div>
    </div>
  );
};

export default Login;
