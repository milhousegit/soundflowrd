import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { 
  isIOS, 
  isSafari, 
  isPWA, 
  supportsOrientationLock, 
  supportsWakeLock,
  getPersistedLogs,
  clearPersistedLogs,
  IOSAudioLog 
} from '@/hooks/useIOSAudioSession';
import { 
  Copy, 
  Trash2, 
  Play, 
  RotateCcw, 
  Info,
  CheckCircle,
  XCircle,
  AlertCircle,
  ChevronDown,
  ChevronUp,
  Smartphone,
  Bug
} from 'lucide-react';
import { toast } from 'sonner';

interface IOSDiagnosticsProps {
  language: 'it' | 'en';
}

const IOSDiagnostics: React.FC<IOSDiagnosticsProps> = ({ language }) => {
  const [logs, setLogs] = useState<IOSAudioLog[]>([]);
  const [showLogs, setShowLogs] = useState(false);
  const [testResult, setTestResult] = useState<'idle' | 'testing' | 'success' | 'error'>('idle');

  useEffect(() => {
    const loadLogs = () => {
      setLogs(getPersistedLogs());
    };
    loadLogs();
    // Refresh logs periodically
    const interval = setInterval(loadLogs, 2000);
    return () => clearInterval(interval);
  }, []);

  const handleCopyLogs = () => {
    const logText = logs.map(log => {
      const time = log.timestamp.toLocaleTimeString('it-IT', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      });
      return `[${time}] [${log.type.toUpperCase()}] ${log.message}${log.details ? ` - ${log.details}` : ''}`;
    }).join('\n');
    
    const systemInfo = `
=== System Info ===
iOS: ${isIOS()}
Safari: ${isSafari()}
PWA: ${isPWA()}
Orientation Lock: ${supportsOrientationLock()}
Wake Lock: ${supportsWakeLock()}
User Agent: ${navigator.userAgent}
Audio Unlocked: ${sessionStorage.getItem('audio_unlocked') === 'true'}
Timestamp: ${new Date().toISOString()}

=== Logs ===
${logText}
`;
    
    navigator.clipboard.writeText(systemInfo).then(() => {
      toast.success(language === 'it' ? 'Log copiati negli appunti' : 'Logs copied to clipboard');
    }).catch(() => {
      toast.error(language === 'it' ? 'Errore nella copia' : 'Copy failed');
    });
  };

  const handleClearLogs = () => {
    clearPersistedLogs();
    setLogs([]);
    toast.success(language === 'it' ? 'Log cancellati' : 'Logs cleared');
  };

  const handleResetUnlock = () => {
    sessionStorage.removeItem('audio_unlocked');
    toast.success(language === 'it' ? 'Stato audio resettato - ricarica la pagina' : 'Audio state reset - reload the page');
  };

  const handleTestAudio = async () => {
    setTestResult('testing');
    
    const testAudio = new Audio();
    testAudio.src = 'data:audio/mp3;base64,SUQzBAAAAAAAI1RTU0UAAAAPAAADTGF2ZjU4Ljc2LjEwMAAAAAAAAAAAAAAA//tQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWGluZwAAAA8AAAACAAABhgC7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7//////////////////////////////////////////////////////////////////8AAAAATGF2YzU4LjEzAAAAAAAAAAAAAAAAJAAAAAAAAAAAAYYNAAAAAAAAAAAAAAAAAAAA//tQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWGluZwAAAA8AAAACAAABhgC7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7//////////////////////////////////////////////////////////////////8AAAAATGF2YzU4LjEzAAAAAAAAAAAAAAAAJAAAAAAAAAAAAYYNAAAAAAAAAAAAAAAAAAAA';
    testAudio.volume = 0.5;
    
    try {
      await testAudio.play();
      testAudio.pause();
      setTestResult('success');
      toast.success(language === 'it' ? 'Test audio riuscito!' : 'Audio test passed!');
    } catch (e) {
      setTestResult('error');
      toast.error(language === 'it' ? 'Test audio fallito - tocca per sbloccare' : 'Audio test failed - tap to unlock');
    }
  };

  const StatusIcon: React.FC<{ supported: boolean }> = ({ supported }) => (
    supported 
      ? <CheckCircle className="w-4 h-4 text-green-500" /> 
      : <XCircle className="w-4 h-4 text-red-500" />
  );

  const getLogIcon = (type: IOSAudioLog['type']) => {
    switch (type) {
      case 'success': return <CheckCircle className="w-3 h-3 text-green-500 flex-shrink-0" />;
      case 'error': return <XCircle className="w-3 h-3 text-red-500 flex-shrink-0" />;
      case 'warning': return <AlertCircle className="w-3 h-3 text-yellow-500 flex-shrink-0" />;
      default: return <Info className="w-3 h-3 text-blue-500 flex-shrink-0" />;
    }
  };

  return (
    <div className="space-y-4">
      {/* System Status */}
      <div className="grid grid-cols-2 gap-2 text-sm">
        <div className="flex items-center gap-2 p-2 rounded bg-secondary">
          <StatusIcon supported={isIOS()} />
          <span>iOS</span>
        </div>
        <div className="flex items-center gap-2 p-2 rounded bg-secondary">
          <StatusIcon supported={isPWA()} />
          <span>PWA</span>
        </div>
        <div className="flex items-center gap-2 p-2 rounded bg-secondary">
          <StatusIcon supported={supportsOrientationLock()} />
          <span>{language === 'it' ? 'Blocco rotazione' : 'Orientation Lock'}</span>
        </div>
        <div className="flex items-center gap-2 p-2 rounded bg-secondary">
          <StatusIcon supported={supportsWakeLock()} />
          <span>Wake Lock</span>
        </div>
        <div className="flex items-center gap-2 p-2 rounded bg-secondary col-span-2">
          <StatusIcon supported={sessionStorage.getItem('audio_unlocked') === 'true'} />
          <span>{language === 'it' ? 'Audio sbloccato' : 'Audio Unlocked'}</span>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="grid grid-cols-2 gap-2">
        <Button 
          variant="outline" 
          size="sm" 
          onClick={handleTestAudio}
          disabled={testResult === 'testing'}
          className="gap-2"
        >
          <Play className="w-4 h-4" />
          {language === 'it' ? 'Test Audio' : 'Test Audio'}
        </Button>
        
        <Button 
          variant="outline" 
          size="sm" 
          onClick={handleResetUnlock}
          className="gap-2"
        >
          <RotateCcw className="w-4 h-4" />
          {language === 'it' ? 'Reset Sblocco' : 'Reset Unlock'}
        </Button>
        
        <Button 
          variant="outline" 
          size="sm" 
          onClick={handleCopyLogs}
          className="gap-2"
        >
          <Copy className="w-4 h-4" />
          {language === 'it' ? 'Copia Log' : 'Copy Logs'}
        </Button>
        
        <Button 
          variant="outline" 
          size="sm" 
          onClick={handleClearLogs}
          className="gap-2"
        >
          <Trash2 className="w-4 h-4" />
          {language === 'it' ? 'Cancella Log' : 'Clear Logs'}
        </Button>
      </div>

      {/* Logs Toggle */}
      <Button 
        variant="ghost" 
        size="sm" 
        onClick={() => setShowLogs(!showLogs)}
        className="w-full justify-between"
      >
        <span className="flex items-center gap-2">
          <Bug className="w-4 h-4" />
          {language === 'it' ? `Log (${logs.length})` : `Logs (${logs.length})`}
        </span>
        {showLogs ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
      </Button>

      {/* Logs List */}
      {showLogs && (
        <div className="max-h-64 overflow-y-auto space-y-1 p-2 rounded bg-secondary text-xs font-mono">
          {logs.length === 0 ? (
            <p className="text-muted-foreground text-center py-4">
              {language === 'it' ? 'Nessun log' : 'No logs'}
            </p>
          ) : (
            logs.slice().reverse().map((log, i) => (
              <div key={i} className="flex items-start gap-1.5 py-0.5">
                {getLogIcon(log.type)}
                <span className="text-muted-foreground">
                  {log.timestamp.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                </span>
                <span className="text-foreground">{log.message}</span>
                {log.details && (
                  <span className="text-muted-foreground truncate">{log.details}</span>
                )}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
};

export default IOSDiagnostics;
