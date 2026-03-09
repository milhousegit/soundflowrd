import React, { useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';

interface CanvasBackgroundProps {
  canvasUrl: string | null;
  isPlaying: boolean;
  className?: string;
}

const CanvasBackground: React.FC<CanvasBackgroundProps> = ({
  canvasUrl,
  isPlaying,
  className
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (videoRef.current) {
      if (isPlaying) {
        videoRef.current.play().catch((e) => console.log('Canvas autoplay prevented:', e));
      } else {
        videoRef.current.pause();
      }
    }
  }, [isPlaying, canvasUrl]);

  if (!canvasUrl) return null;

  return (
    <div className={cn('fixed inset-0 z-[0] pointer-events-none overflow-hidden', className)}>
      <video
        ref={videoRef}
        src={canvasUrl}
        className="w-full h-full object-cover opacity-90"
        loop
        muted
        playsInline
        crossOrigin="anonymous"
      />
      {/* Dark gradient overlay for text readability */}
      <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-transparent to-transparent" />
      <div className="absolute bottom-0 left-0 right-0 h-[40%] bg-gradient-to-t from-black to-transparent" />
      <div className="absolute inset-0 bg-black/20 backdrop-blur-[2px]" />
    </div>
  );
};

export default CanvasBackground;
