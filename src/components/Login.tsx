import React, { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { verifyApiKey } from '@/lib/realdebrid';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Music2, Mail, Lock, Key, Headphones, Loader2, AlertCircle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

const Login: React.FC = () => {
  const { login } = useAuth();
  const { toast } = useToast();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');
    
    try {
      // Verify Real-Debrid API key
      const verification = await verifyApiKey(apiKey);
      
      if (!verification.valid) {
        setError('Invalid Real-Debrid API key. Please check and try again.');
        setIsLoading(false);
        return;
      }

      login({ email, password, realDebridApiKey: apiKey });
      
      toast({
        title: 'Welcome!',
        description: `Logged in as ${verification.username || email}`,
      });
    } catch (err) {
      setError('Failed to verify API key. Please try again.');
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
          <div className="inline-flex items-center justify-center w-16 h-16 md:w-20 md:h-20 rounded-2xl gradient-primary shadow-glow mb-4 md:mb-6">
            <Headphones className="w-8 h-8 md:w-10 md:h-10 text-primary-foreground" />
          </div>
          <h1 className="text-3xl md:text-4xl font-bold text-foreground mb-2">SoundFlow</h1>
          <p className="text-sm md:text-base text-muted-foreground">Your personal music player</p>
        </div>

        {/* Login Form */}
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
              />
            </div>

            <div className="relative">
              <Key className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
              <Input
                type="password"
                placeholder="Real-Debrid API Key"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                className="pl-12"
                required
              />
            </div>
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
                <Music2 className="w-5 h-5" />
                Login
              </>
            )}
          </Button>

          <p className="text-center text-xs md:text-sm text-muted-foreground">
            Get your API Key from{' '}
            <a
              href="https://real-debrid.com/apitoken"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:underline"
            >
              Real-Debrid
            </a>
          </p>
        </form>
      </div>
    </div>
  );
};

export default Login;
