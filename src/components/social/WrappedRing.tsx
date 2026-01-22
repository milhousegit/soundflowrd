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
        {/* Outer animated gradient ring */}
        <div className="absolute -inset-2 rounded-full animate-spin-slow">
          <svg 
            className="w-full h-full"
            viewBox="0 0 120 120"
          >
            <defs>
              <linearGradient id="wrappedGradient1" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="hsl(174, 72%, 50%)">
                  <animate attributeName="stop-color" 
                    values="hsl(174, 72%, 50%);hsl(280, 80%, 60%);hsl(340, 80%, 60%);hsl(174, 72%, 50%)" 
                    dur="4s" repeatCount="indefinite" />
                </stop>
                <stop offset="50%" stopColor="hsl(280, 80%, 60%)">
                  <animate attributeName="stop-color" 
                    values="hsl(280, 80%, 60%);hsl(340, 80%, 60%);hsl(174, 72%, 50%);hsl(280, 80%, 60%)" 
                    dur="4s" repeatCount="indefinite" />
                </stop>
                <stop offset="100%" stopColor="hsl(340, 80%, 60%)">
                  <animate attributeName="stop-color" 
                    values="hsl(340, 80%, 60%);hsl(174, 72%, 50%);hsl(280, 80%, 60%);hsl(340, 80%, 60%)" 
                    dur="4s" repeatCount="indefinite" />
                </stop>
              </linearGradient>
            </defs>
            <circle
              cx="60"
              cy="60"
              r="56"
              fill="none"
              stroke="url(#wrappedGradient1)"
              strokeWidth="4"
              strokeLinecap="round"
              strokeDasharray="30 15 60 15"
            />
          </svg>
        </div>

        {/* Secondary pulsing ring */}
        <div className="absolute -inset-3 rounded-full animate-pulse-glow opacity-60">
          <svg className="w-full h-full" viewBox="0 0 130 130">
            <circle
              cx="65"
              cy="65"
              r="62"
              fill="none"
              stroke="hsl(174, 72%, 50%)"
              strokeWidth="1"
              strokeDasharray="8 8"
              className="animate-spin-reverse-slow"
            />
          </svg>
        </div>

        {/* Wrapped 2026 text rotating in opposite direction */}
        <div className="absolute -inset-6 rounded-full animate-spin-reverse-slow">
          <svg viewBox="0 0 160 160" className="w-full h-full">
            <defs>
              <linearGradient id="textGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="hsl(174, 72%, 50%)">
                  <animate attributeName="stop-color" 
                    values="hsl(174, 72%, 50%);hsl(280, 80%, 60%);hsl(340, 80%, 60%);hsl(174, 72%, 50%)" 
                    dur="3s" repeatCount="indefinite" />
                </stop>
                <stop offset="100%" stopColor="hsl(280, 80%, 60%)">
                  <animate attributeName="stop-color" 
                    values="hsl(280, 80%, 60%);hsl(340, 80%, 60%);hsl(174, 72%, 50%);hsl(280, 80%, 60%)" 
                    dur="3s" repeatCount="indefinite" />
                </stop>
              </linearGradient>
              <path
                id="wrappedTextPath"
                d="M 80,80 m -68,0 a 68,68 0 1,1 136,0 a 68,68 0 1,1 -136,0"
              />
            </defs>
            <text fill="url(#textGradient)" className="text-[9px] font-bold uppercase tracking-[0.25em]">
              <textPath href="#wrappedTextPath" startOffset="0%">
                ✦ WRAPPED 2026 ✦ WRAPPED 2026 ✦ WRAPPED 2026 ✦
              </textPath>
            </text>
          </svg>
        </div>

        {/* Avatar container */}
        <div className="relative w-24 h-24 rounded-full bg-muted overflow-hidden ring-2 ring-primary/50 group-hover:ring-primary transition-all duration-300">
          {avatarUrl ? (
            <img src={avatarUrl} alt="" className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <User className="w-10 h-10 text-muted-foreground" />
            </div>
          )}
          
          {/* Shimmer overlay */}
          <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-white/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 animate-shimmer" />
        </div>

        {/* Glow effect - multicolor */}
        <div className="absolute -inset-2 rounded-full blur-xl opacity-40 group-hover:opacity-70 transition-opacity duration-300 -z-10 bg-gradient-to-r from-primary via-purple-500 to-pink-500 animate-pulse-glow" />
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
