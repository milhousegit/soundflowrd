import React, { useState } from 'react';
import { User } from 'lucide-react';
import WrappedStoryModal from './WrappedStoryModal';

interface WrappedRingProps {
  avatarUrl?: string | null;
  displayName?: string;
  isPremium?: boolean;
  className?: string;
}

const WrappedRing: React.FC<WrappedRingProps> = ({ 
  avatarUrl, 
  displayName,
  isPremium,
  className = ''
}) => {
  const [showWrappedModal, setShowWrappedModal] = useState(false);

  return (
    <>
      <button
        onClick={() => setShowWrappedModal(true)}
        className={`relative group cursor-pointer ${className}`}
        aria-label="View Wrapped 2026"
      >
        {/* Outer animated ring */}
        <div className="absolute -inset-2 rounded-full">
          <svg 
            className="w-full h-full animate-spin-slow"
            viewBox="0 0 120 120"
          >
            <defs>
              <linearGradient id="wrappedGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="hsl(174, 72%, 50%)" />
                <stop offset="50%" stopColor="hsl(187, 85%, 43%)" />
                <stop offset="100%" stopColor="hsl(174, 72%, 50%)" />
              </linearGradient>
            </defs>
            <circle
              cx="60"
              cy="60"
              r="56"
              fill="none"
              stroke="url(#wrappedGradient)"
              strokeWidth="3"
              strokeLinecap="round"
              strokeDasharray="40 20 80 20"
            />
          </svg>
        </div>

        {/* Wrapped 2026 text rotating in opposite direction */}
        <div className="absolute -inset-4 rounded-full animate-spin-reverse-slow">
          <svg viewBox="0 0 140 140" className="w-full h-full">
            <defs>
              <path
                id="wrappedTextPath"
                d="M 70,70 m -58,0 a 58,58 0 1,1 116,0 a 58,58 0 1,1 -116,0"
              />
            </defs>
            <text className="fill-primary text-[9px] font-semibold uppercase tracking-[0.3em]">
              <textPath href="#wrappedTextPath" startOffset="0%">
                WRAPPED 2026 • WRAPPED 2026 • WRAPPED 2026 •
              </textPath>
            </text>
          </svg>
        </div>

        {/* Avatar container */}
        <div className="relative w-24 h-24 rounded-full bg-muted overflow-hidden ring-4 ring-background group-hover:ring-primary/30 transition-all duration-300">
          {avatarUrl ? (
            <img src={avatarUrl} alt="" className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <User className="w-10 h-10 text-muted-foreground" />
            </div>
          )}
          
          {/* Hover overlay */}
          <div className="absolute inset-0 bg-primary/20 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-center justify-center">
            <span className="text-[10px] font-bold text-white uppercase tracking-wider">Wrapped</span>
          </div>
        </div>

        {/* Glow effect */}
        <div className="absolute -inset-1 rounded-full bg-primary/20 blur-md opacity-0 group-hover:opacity-100 transition-opacity duration-300 -z-10" />
      </button>

      <WrappedStoryModal 
        open={showWrappedModal} 
        onOpenChange={setShowWrappedModal}
        displayName={displayName}
      />
    </>
  );
};

export default WrappedRing;
