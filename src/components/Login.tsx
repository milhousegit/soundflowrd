import React, { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { verifyApiKey } from '@/lib/realdebrid';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Music2, Mail, Lock, Key, Loader2, AlertCircle, UserPlus, LogIn, ArrowLeft, Gift, CheckCircle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { z } from 'zod';
import appLogo from '@/assets/logo.png';
import { useGeoLanguage } from '@/hooks/useGeoLanguage';

// Translation strings
const translations = {
  en: {
    tagline: 'Your personal music player',
    login: 'Login',
    signup: 'Sign Up',
    backToLogin: 'Back to login',
    forgotPassword: 'Forgot password?',
    resetPassword: 'Reset Password',
    resetPasswordDesc: 'Enter your email to receive a recovery link',
    sendResetLink: 'Send recovery link',
    emailSent: 'Email sent!',
    checkInbox: 'Check your inbox and follow the instructions.',
    checkEmail: 'Check your email!',
    verificationSent: 'We sent you a verification link to',
    checkSpam: '⚠️ Check your SPAM folder too!',
    spamNote: 'Sometimes verification emails end up there.',
    email: 'Email',
    password: 'Password',
    apiKeyOptional: 'Real-Debrid API Key (optional)',
    apiKeyNote: 'You can add your API Key from',
    apiKeyNoteLater: 'later in settings',
    referralBonus: '🎁 Sign up and get',
    freePremium: '1 month of Premium free!',
    // Error messages
    invalidEmail: 'Invalid email',
    passwordMinLength: 'Password must be at least 6 characters',
    invalidApiKey: 'Invalid Real-Debrid API Key. Please check and try again.',
    emailAlreadyRegistered: 'Email already registered. Try logging in.',
    invalidCredentials: 'Invalid email or password.',
    verificationError: 'Error during verification. Please try again.',
    resetError: 'Error sending email. Please try again.',
    // Success messages
    accountCreated: 'Account created!',
    welcomeBack: 'Welcome back!',
    loggedIn: 'Logged in successfully',
    welcome: 'Welcome',
    referralBonusToast: '🎉 Referral Bonus!',
    referralBonusDesc: 'You received 1 month of Premium for free!',
  },
  it: {
    tagline: 'Il tuo player musicale personale',
    login: 'Accedi',
    signup: 'Registrati',
    backToLogin: 'Torna al login',
    forgotPassword: 'Password dimenticata?',
    resetPassword: 'Recupera Password',
    resetPasswordDesc: 'Inserisci la tua email per ricevere il link di recupero',
    sendResetLink: 'Invia link di recupero',
    emailSent: 'Email inviata!',
    checkInbox: 'Controlla la tua casella di posta e segui le istruzioni.',
    checkEmail: 'Controlla la tua email!',
    verificationSent: 'Ti abbiamo inviato un link di verifica a',
    checkSpam: '⚠️ Controlla anche la cartella SPAM!',
    spamNote: 'A volte le email di verifica finiscono lì.',
    email: 'Email',
    password: 'Password',
    apiKeyOptional: 'Real-Debrid API Key (opzionale)',
    apiKeyNote: 'Puoi aggiungere la tua API Key da',
    apiKeyNoteLater: 'in seguito dalle impostazioni',
    referralBonus: '🎁 Registrati e ricevi',
    freePremium: '1 mese di Premium gratis!',
    // Error messages
    invalidEmail: 'Email non valida',
    passwordMinLength: 'La password deve avere almeno 6 caratteri',
    invalidApiKey: 'API Key Real-Debrid non valida. Controlla e riprova.',
    emailAlreadyRegistered: 'Email già registrata. Prova ad accedere.',
    invalidCredentials: 'Email o password non corretti.',
    verificationError: 'Errore durante la verifica. Riprova.',
    resetError: 'Errore durante l\'invio. Riprova.',
    // Success messages
    accountCreated: 'Account creato!',
    welcomeBack: 'Bentornato!',
    loggedIn: 'Accesso effettuato',
    welcome: 'Benvenuto',
    referralBonusToast: '🎉 Bonus Referral!',
    referralBonusDesc: 'Hai ricevuto 1 mese di Premium gratis!',
  },
};

const Login: React.FC = () => {
  const { signIn, signUp, updateApiKey, profile } = useAuth();
  const { toast } = useToast();
  const { language, isLoading: geoLoading } = useGeoLanguage();
  
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [mode, setMode] = useState<'login' | 'signup' | 'reset'>('login');
  const [resetSent, setResetSent] = useState(false);
  const [referralCode, setReferralCode] = useState<string | null>(null);
  const [verificationSent, setVerificationSent] = useState(false);

  const t = translations[language];

  // Dynamic validation schemas based on language
  const loginSchema = z.object({
    email: z.string().email(t.invalidEmail),
    password: z.string().min(6, t.passwordMinLength),
  });

  const signupSchema = z.object({
    email: z.string().email(t.invalidEmail),
    password: z.string().min(6, t.passwordMinLength),
    apiKey: z.string().optional(),
  });

  const resetSchema = z.object({
    email: z.string().email(t.invalidEmail),
  });

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
    setVerificationSent(false);
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
        title: t.emailSent,
        description: t.checkInbox,
      });
    } catch (err) {
      setError(t.resetError);
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
            setError(t.invalidApiKey);
            setIsLoading(false);
            return;
          }
          verifiedUsername = verification.username || '';
        }

        const { error: signUpError } = await signUp(email, password);
        
        if (signUpError) {
          if (signUpError.message.includes('already registered')) {
            setError(t.emailAlreadyRegistered);
          } else {
            setError(signUpError.message);
          }
          setIsLoading(false);
          return;
        }

        // Persist referral code and API key for after email verification
        if (referralCode) {
          localStorage.setItem('soundflow_pending_referral', referralCode);
        }
        if (apiKey && apiKey.trim().length > 0) {
          localStorage.setItem('soundflow_pending_apikey', apiKey);
        }

        // Show verification email sent message
        setVerificationSent(true);
        setIsLoading(false);
        return;

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
            setError(language === 'it' 
              ? 'Account creato, ma non sono riuscito a salvare la API Key. Riprova dalle Impostazioni.'
              : 'Account created, but failed to save API Key. Try again in Settings.');
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
                title: t.referralBonusToast,
                description: t.referralBonusDesc,
              });
            }
          } catch (refError) {
            console.error('Referral processing error:', refError);
          }
        }
        
        toast({
          title: t.accountCreated,
          description: `${t.welcome} ${verifiedUsername || email}`,
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
            setError(t.invalidCredentials);
          } else {
            setError(signInError.message);
          }
          setIsLoading(false);
          return;
        }
        
        toast({
          title: t.welcomeBack,
          description: t.loggedIn,
        });
      }
    } catch (err) {
      setError(t.verificationError);
    } finally {
      setIsLoading(false);
    }
  };

  // Show loading state while detecting geo location
  if (geoLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

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
          <p className="text-sm md:text-base text-muted-foreground">{t.tagline}</p>
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
              {t.backToLogin}
            </button>

            <div className="text-center">
              <h2 className="text-xl font-semibold text-foreground mb-2">{t.resetPassword}</h2>
              <p className="text-sm text-muted-foreground">
                {t.resetPasswordDesc}
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
                <p className="font-medium">{t.emailSent}</p>
                <p className="text-sm opacity-80 mt-1">
                  {t.checkInbox}
                </p>
              </div>
            ) : (
              <form onSubmit={handlePasswordReset} className="space-y-4">
                <div className="relative">
                  <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                  <Input
                    type="email"
                    placeholder={t.email}
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
                      {t.sendResetLink}
                    </>
                  )}
                </Button>
              </form>
            )}
          </div>
        ) : verificationSent ? (
          /* Email Verification Sent Message */
          <div className="glass rounded-2xl p-6 md:p-8 space-y-5 md:space-y-6 animate-scale-in text-center">
            <div className="flex justify-center">
              <div className="w-16 h-16 rounded-full bg-primary/20 flex items-center justify-center">
                <CheckCircle className="w-8 h-8 text-primary" />
              </div>
            </div>
            <div>
              <h2 className="text-xl font-semibold text-foreground mb-2">{t.checkEmail}</h2>
              <p className="text-sm text-muted-foreground mb-4">
                {t.verificationSent} <span className="font-medium text-foreground">{email}</span>
              </p>
              <div className="p-3 rounded-lg bg-orange-500/10 border border-orange-500/30 text-sm">
                <p className="text-orange-500 font-medium">{t.checkSpam}</p>
                <p className="text-muted-foreground text-xs mt-1">
                  {t.spamNote}
                </p>
              </div>
            </div>
            <div className="pt-2">
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  setVerificationSent(false);
                  setMode('login');
                }}
                className="gap-2"
              >
                <ArrowLeft className="w-4 h-4" />
                {t.backToLogin}
              </Button>
            </div>
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
                {t.login}
              </Button>
              <Button
                type="button"
                variant={mode === 'signup' ? 'default' : 'ghost'}
                onClick={() => setMode('signup')}
                className="gap-2"
              >
                <UserPlus className="w-4 h-4" />
                {t.signup}
              </Button>
            </div>

            {/* Referral badge */}
            {referralCode && mode === 'signup' && (
              <div className="flex items-center justify-center gap-2 p-3 rounded-lg bg-gradient-to-r from-[#8B5CF6]/20 to-[#3B82F6]/20 border border-[#8B5CF6]/30 mb-4">
                <Gift className="w-5 h-5 text-[#8B5CF6]" />
                <span className="text-sm font-medium text-foreground">
                  {t.referralBonus} <span className="text-[#8B5CF6]">{t.freePremium}</span>
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
                    placeholder={t.email}
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
                    placeholder={t.password}
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
                      placeholder={t.apiKeyOptional}
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
                    {t.forgotPassword}
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
                    {mode === 'login' ? t.login : t.signup}
                  </>
                )}
              </Button>

              {mode === 'signup' && (
                <p className="text-center text-xs md:text-sm text-muted-foreground">
                  {t.apiKeyNote}{' '}
                  <a
                    href="https://real-debrid.com/apitoken"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary hover:underline"
                  >
                    Real-Debrid
                  </a>
                  {' '}{t.apiKeyNoteLater}
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
