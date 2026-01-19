import React, { useRef, useState } from 'react';
import { X, Music, Play, Trash2, GripVertical } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Track } from '@/types/music';
import { cn } from '@/lib/utils';
import TapArea from './TapArea';

interface QueueModalProps {
  isOpen: boolean;
  onClose: () => void;
  queue: Track[];
  currentIndex: number;
  onPlayTrack: (index: number) => void;
  onClearQueue: () => void;
  onReorderQueue?: (fromIndex: number, toIndex: number) => void;
}

const QueueModal: React.FC<QueueModalProps> = ({
  isOpen,
  onClose,
  queue,
  currentIndex,
  onPlayTrack,
  onClearQueue,
  onReorderQueue,
}) => {
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const dragItem = useRef<number | null>(null);
  const dragOverItem = useRef<number | null>(null);

  if (!isOpen) return null;

  const upNext = queue.slice(currentIndex + 1);
  const currentTrack = queue[currentIndex];

  const handleDragStart = (index: number) => {
    dragItem.current = index;
    setDraggedIndex(index);
  };

  const handleDragEnter = (index: number) => {
    dragOverItem.current = index;
    setDragOverIndex(index);
  };

  const handleDragEnd = () => {
    if (dragItem.current !== null && dragOverItem.current !== null && dragItem.current !== dragOverItem.current) {
      onReorderQueue?.(dragItem.current, dragOverItem.current);
    }
    dragItem.current = null;
    dragOverItem.current = null;
    setDraggedIndex(null);
    setDragOverIndex(null);
  };

  const handleTouchStart = (index: number, e: React.TouchEvent) => {
    dragItem.current = index;
    setDraggedIndex(index);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    const touch = e.touches[0];
    const element = document.elementFromPoint(touch.clientX, touch.clientY);
    const trackItem = element?.closest('[data-queue-index]');
    if (trackItem) {
      const index = parseInt(trackItem.getAttribute('data-queue-index') || '-1', 10);
      if (index >= 0 && index !== dragOverItem.current) {
        dragOverItem.current = index;
        setDragOverIndex(index);
      }
    }
  };

  const handleTouchEnd = () => {
    if (dragItem.current !== null && dragOverItem.current !== null && dragItem.current !== dragOverItem.current) {
      onReorderQueue?.(dragItem.current, dragOverItem.current);
    }
    dragItem.current = null;
    dragOverItem.current = null;
    setDraggedIndex(null);
    setDragOverIndex(null);
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-end md:items-center justify-center">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />
      
      {/* Modal */}
      <div className="relative w-full md:w-[480px] max-h-[85vh] bg-card rounded-t-2xl md:rounded-2xl shadow-xl flex flex-col overflow-hidden animate-in slide-in-from-bottom duration-300">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h2 className="text-lg font-semibold text-foreground">Coda di riproduzione</h2>
          <div className="flex items-center gap-2">
            {upNext.length > 0 && (
              <Button 
                variant="ghost" 
                size="sm"
                onClick={onClearQueue}
                className="text-muted-foreground hover:text-destructive"
              >
                <Trash2 className="w-4 h-4 mr-1" />
                Svuota
              </Button>
            )}
            <Button variant="ghost" size="icon" onClick={onClose}>
              <X className="w-5 h-5" />
            </Button>
          </div>
        </div>

        <ScrollArea className="flex-1 max-h-[60vh]">
          {/* Now Playing */}
          {currentTrack && (
            <div className="p-4 border-b border-border">
              <p className="text-xs font-medium text-primary mb-2 uppercase tracking-wide">In riproduzione</p>
              <div className="flex items-center gap-3 p-2 rounded-lg bg-primary/10">
                <div className="w-12 h-12 rounded-lg bg-secondary overflow-hidden flex-shrink-0">
                  {currentTrack.coverUrl ? (
                    <img 
                      src={currentTrack.coverUrl} 
                      alt={currentTrack.album}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <Music className="w-5 h-5 text-muted-foreground" />
                    </div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-foreground truncate">{currentTrack.title}</p>
                  <p className="text-sm text-muted-foreground truncate">{currentTrack.artist}</p>
                </div>
                <Play className="w-5 h-5 text-primary" />
              </div>
            </div>
          )}

          {/* Up Next */}
          <div className="p-4">
            <p className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wide">
              Prossime ({upNext.length}) {onReorderQueue && '• Trascina per riordinare'}
            </p>
            
            {upNext.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Music className="w-10 h-10 mx-auto mb-2 opacity-50" />
                <p className="text-sm">Nessuna traccia in coda</p>
              </div>
            ) : (
              <div className="space-y-1">
                {upNext.map((track, idx) => {
                  const actualIndex = currentIndex + 1 + idx;
                  const isDragging = draggedIndex === idx;
                  const isDragOver = dragOverIndex === idx;
                  
                  return (
                    <div
                      key={`${track.id}-${actualIndex}`}
                      data-queue-index={idx}
                      draggable={!!onReorderQueue}
                      onDragStart={() => handleDragStart(idx)}
                      onDragEnter={() => handleDragEnter(idx)}
                      onDragEnd={handleDragEnd}
                      onDragOver={(e) => e.preventDefault()}
                      onTouchStart={(e) => handleTouchStart(idx, e)}
                      onTouchMove={handleTouchMove}
                      onTouchEnd={handleTouchEnd}
                      className={cn(
                        "flex items-center gap-2 p-2 rounded-lg transition-all",
                        "hover:bg-secondary/50 active:bg-secondary",
                        isDragging && "opacity-50 scale-95",
                        isDragOver && !isDragging && "border-t-2 border-primary",
                        onReorderQueue ? "cursor-grab active:cursor-grabbing" : ""
                      )}
                    >
                      {onReorderQueue && (
                        <GripVertical className="w-4 h-4 text-muted-foreground flex-shrink-0 touch-none" />
                      )}
                      <TapArea
                        onTap={() => onPlayTrack(actualIndex)}
                        className="flex items-center gap-3 flex-1 min-w-0"
                      >
                        <span className="w-5 text-center text-sm text-muted-foreground flex-shrink-0">
                          {idx + 1}
                        </span>
                        <div className="w-10 h-10 rounded bg-secondary overflow-hidden flex-shrink-0">
                          {track.coverUrl ? (
                            <img 
                              src={track.coverUrl} 
                              alt={track.album}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center">
                              <Music className="w-4 h-4 text-muted-foreground" />
                            </div>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-foreground truncate">{track.title}</p>
                          <p className="text-xs text-muted-foreground truncate">{track.artist}</p>
                        </div>
                      </TapArea>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </ScrollArea>
      </div>
    </div>
  );
};

export default QueueModal;