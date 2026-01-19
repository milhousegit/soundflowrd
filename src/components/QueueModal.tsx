import React, { useRef, useState, useCallback, useMemo } from 'react';
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
  const [isDragging, setIsDragging] = useState(false);
  const dragItem = useRef<number | null>(null);
  const dragOverItem = useRef<number | null>(null);
  const scrollAreaRef = useRef<HTMLDivElement | null>(null);

  const getScrollViewport = () => {
    const root = scrollAreaRef.current;
    if (!root) return null;
    return root.querySelector('[data-radix-scroll-area-viewport]') as HTMLElement | null;
  };

  if (!isOpen) return null;

  const upNext = queue.slice(currentIndex + 1);
  const currentTrack = queue[currentIndex];

  const upNextItems = useMemo(
    () =>
      upNext.map((track, upNextIndex) => ({
        track,
        upNextIndex,
        queueIndex: currentIndex + 1 + upNextIndex,
      })),
    [upNext, currentIndex]
  );

  const previewItems = useMemo(() => {
    if (!isDragging || draggedIndex === null || dragOverIndex === null) return upNextItems;
    if (draggedIndex === dragOverIndex) return upNextItems;

    const items = [...upNextItems];
    const from = items.findIndex((it) => it.upNextIndex === draggedIndex);
    const to = items.findIndex((it) => it.upNextIndex === dragOverIndex);
    if (from < 0 || to < 0) return upNextItems;

    const [moved] = items.splice(from, 1);
    items.splice(to, 0, moved);
    return items;
  }, [upNextItems, isDragging, draggedIndex, dragOverIndex]);

  // Desktop drag handlers
  const handleDragStart = (index: number, e: React.DragEvent) => {
    dragItem.current = index;
    setDraggedIndex(index);
    setIsDragging(true);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragEnter = (index: number) => {
    if (!isDragging) return;
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
    setIsDragging(false);
  };

  // Touch handlers - only on grip handle
  const handleGripTouchStart = (index: number, e: React.TouchEvent) => {
    e.stopPropagation();
    dragItem.current = index;
    setDraggedIndex(index);
    setIsDragging(true);
  };

  const handleGripTouchMove = (e: React.TouchEvent) => {
    if (!isDragging || dragItem.current === null) return;

    // While dragging we prevent native scrolling, so we auto-scroll the viewport
    e.preventDefault();

    const touch = e.touches[0];

    const viewport = getScrollViewport();
    if (viewport) {
      const rect = viewport.getBoundingClientRect();
      const edge = 56; // px from top/bottom to start auto-scroll
      const step = 14; // px per move event

      if (touch.clientY < rect.top + edge) {
        viewport.scrollTop -= step;
      } else if (touch.clientY > rect.bottom - edge) {
        viewport.scrollTop += step;
      }
    }

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

  const handleGripTouchEnd = () => {
    if (dragItem.current !== null && dragOverItem.current !== null && dragItem.current !== dragOverItem.current) {
      onReorderQueue?.(dragItem.current, dragOverItem.current);
    }
    dragItem.current = null;
    dragOverItem.current = null;
    setDraggedIndex(null);
    setDragOverIndex(null);
    setIsDragging(false);
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

        <ScrollArea ref={scrollAreaRef} className="flex-1 max-h-[60vh]">
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
              Prossime ({upNext.length}) {onReorderQueue && '• Trascina ⋮⋮ per riordinare'}
            </p>
            
            {upNext.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Music className="w-10 h-10 mx-auto mb-2 opacity-50" />
                <p className="text-sm">Nessuna traccia in coda</p>
              </div>
            ) : (
              <div className="space-y-1">
                {previewItems.map((item, position) => {
                  const { track, queueIndex, upNextIndex } = item;
                  const isItemDragging = draggedIndex === upNextIndex;
                  const isDropTarget = isDragging && dragOverIndex === upNextIndex && draggedIndex !== upNextIndex;

                  return (
                    <div key={`${track.id}-${queueIndex}`} className="relative">
                      {/* Drop preview marker */}
                      {isDropTarget && (
                        <div className="px-2">
                          <div className="h-0.5 rounded-full bg-primary/60" />
                        </div>
                      )}

                      <div
                        data-queue-index={upNextIndex}
                        onDragEnter={() => handleDragEnter(upNextIndex)}
                        onDragOver={(e) => e.preventDefault()}
                        className={cn(
                          "flex items-center gap-2 p-2 rounded-lg transition-all duration-200",
                          "hover:bg-secondary/50",
                          isItemDragging && "opacity-40 scale-[0.98] bg-secondary/30 shadow-lg",
                          isDropTarget && "bg-primary/5"
                        )}
                      >
                        {onReorderQueue && (
                          <div
                            draggable
                            onDragStart={(e) => handleDragStart(upNextIndex, e)}
                            onDragEnd={handleDragEnd}
                            onTouchStart={(e) => handleGripTouchStart(upNextIndex, e)}
                            onTouchMove={handleGripTouchMove}
                            onTouchEnd={handleGripTouchEnd}
                            className={cn(
                              "p-2 -ml-1 rounded cursor-grab active:cursor-grabbing",
                              "hover:bg-secondary/80 active:bg-secondary",
                              "transition-colors duration-150"
                            )}
                            style={{ touchAction: 'none' }}
                          >
                            <GripVertical className="w-5 h-5 text-muted-foreground pointer-events-none" />
                          </div>
                        )}

                        <TapArea
                          onTap={() => {
                            if (isDragging) return;
                            onPlayTrack(queueIndex);
                          }}
                          className={cn(
                            "flex items-center gap-3 flex-1 min-w-0",
                            isDragging && "pointer-events-none"
                          )}
                        >
                          <span className="w-5 text-center text-sm text-muted-foreground flex-shrink-0">
                            {position + 1}
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
