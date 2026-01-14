import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { 
  getPersistedLogs,
  clearPersistedLogs,
  IOSAudioLog 
} from '@/hooks/useIOSAudioSession';
import { 
  Copy, 
  Trash2, 
  ChevronDown,
  ChevronUp,
  CheckCircle,
  XCircle,
  AlertCircle,
  Info,
  FileText
} from 'lucide-react';
import { toast } from 'sonner';

interface AppLogsProps {
  language: 'it' | 'en';
}

const MAX_DISPLAY_LOGS = 200;

const AppLogs: React.FC<AppLogsProps> = ({ language }) => {
  const [logs, setLogs] = useState<IOSAudioLog[]>([]);
  const [showLogs, setShowLogs] = useState(false);

  useEffect(() => {
    const loadLogs = () => {
      const allLogs = getPersistedLogs();
      // Only show last 200 logs
      setLogs(allLogs.slice(-MAX_DISPLAY_LOGS));
    };
    loadLogs();
    const interval = setInterval(loadLogs, 3000);
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
    
    const report = `=== SoundFlow Log Report ===
Timestamp: ${new Date().toISOString()}
User Agent: ${navigator.userAgent}
Total Logs: ${logs.length}

=== Logs ===
${logText || 'No logs available'}
`;
    
    navigator.clipboard.writeText(report).then(() => {
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

  const getLogIcon = (type: IOSAudioLog['type']) => {
    switch (type) {
      case 'success': return <CheckCircle className="w-3 h-3 text-green-500 flex-shrink-0" />;
      case 'error': return <XCircle className="w-3 h-3 text-red-500 flex-shrink-0" />;
      case 'warning': return <AlertCircle className="w-3 h-3 text-yellow-500 flex-shrink-0" />;
      default: return <Info className="w-3 h-3 text-blue-500 flex-shrink-0" />;
    }
  };

  return (
    <div className="space-y-3">
      {/* Toggle & Actions */}
      <div className="flex items-center gap-2">
        <Button 
          variant="ghost" 
          size="sm" 
          onClick={() => setShowLogs(!showLogs)}
          className="flex-1 justify-between h-9"
        >
          <span className="flex items-center gap-2">
            <FileText className="w-4 h-4" />
            {language === 'it' ? `Log (${logs.length})` : `Logs (${logs.length})`}
          </span>
          {showLogs ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </Button>
        
        <Button 
          variant="outline" 
          size="icon"
          className="h-9 w-9"
          onClick={handleCopyLogs}
          title={language === 'it' ? 'Copia Log' : 'Copy Logs'}
        >
          <Copy className="w-4 h-4" />
        </Button>
        
        <Button 
          variant="outline" 
          size="icon"
          className="h-9 w-9"
          onClick={handleClearLogs}
          title={language === 'it' ? 'Cancella Log' : 'Clear Logs'}
        >
          <Trash2 className="w-4 h-4" />
        </Button>
      </div>

      {/* Logs List */}
      {showLogs && (
        <div className="max-h-64 overflow-y-auto space-y-1 p-2 rounded-lg bg-secondary text-xs font-mono">
          {logs.length === 0 ? (
            <p className="text-muted-foreground text-center py-4">
              {language === 'it' ? 'Nessun log' : 'No logs'}
            </p>
          ) : (
            logs.slice().reverse().map((log, i) => (
              <div key={i} className="flex items-start gap-1.5 py-0.5">
                {getLogIcon(log.type)}
                <span className="text-muted-foreground whitespace-nowrap">
                  {log.timestamp.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                </span>
                <span className="text-foreground break-words">{log.message}</span>
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

export default AppLogs;
