import React from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

interface KofiModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const KofiModal: React.FC<KofiModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  return createPortal(
    <div className="fixed inset-0 z-[300] flex items-center justify-center p-4 animate-fade-in">
      {/* Blurred backdrop */}
      <div 
        className="absolute inset-0 bg-background/60 backdrop-blur-md"
        onClick={onClose}
      />
      
      {/* Modal */}
      <div className="relative z-10 w-full max-w-md">
        {/* Close button */}
        <button 
          onClick={onClose}
          className="absolute -top-2 -right-2 z-20 p-2 rounded-full bg-card border border-border shadow-lg hover:bg-muted transition-colors"
        >
          <X className="w-4 h-4 text-foreground" />
        </button>

        {/* Ko-fi iframe */}
        <div className="rounded-2xl overflow-hidden">
          <iframe
            id="kofiframe"
            src="https://ko-fi.com/milhousedhl/?hidefeed=true&widget=true&embed=true&preview=true"
            className="w-full border-none"
            style={{ background: 'transparent', padding: '4px' }}
            height="712"
            title="milhousedhl"
          />
        </div>
      </div>
    </div>,
    document.body
  );
};

export default KofiModal;
