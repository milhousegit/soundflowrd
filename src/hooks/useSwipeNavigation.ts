import { useState, useRef, TouchEvent } from 'react';

interface UseSwipeNavigationProps<T> {
  items: T[];
  currentItem: T;
  onItemChange: (item: T) => void;
  threshold?: number;
}

interface SwipeState {
  startX: number;
  currentX: number;
  isDragging: boolean;
}

export function useSwipeNavigation<T>({
  items,
  currentItem,
  onItemChange,
  threshold = 50,
}: UseSwipeNavigationProps<T>) {
  const [swipeState, setSwipeState] = useState<SwipeState>({
    startX: 0,
    currentX: 0,
    isDragging: false,
  });
  const [isAnimating, setIsAnimating] = useState(false);
  const [animationDirection, setAnimationDirection] = useState<'left' | 'right' | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const currentIndex = items.indexOf(currentItem);

  const handleTouchStart = (e: TouchEvent) => {
    setSwipeState({
      startX: e.touches[0].clientX,
      currentX: e.touches[0].clientX,
      isDragging: true,
    });
  };

  const handleTouchMove = (e: TouchEvent) => {
    if (!swipeState.isDragging) return;
    setSwipeState(prev => ({
      ...prev,
      currentX: e.touches[0].clientX,
    }));
  };

  const handleTouchEnd = () => {
    if (!swipeState.isDragging) return;

    const diff = swipeState.startX - swipeState.currentX;
    const absDiff = Math.abs(diff);

    if (absDiff > threshold) {
      if (diff > 0 && currentIndex < items.length - 1) {
        // Swipe left -> go to next
        setAnimationDirection('left');
        setIsAnimating(true);
        setTimeout(() => {
          onItemChange(items[currentIndex + 1]);
          setIsAnimating(false);
          setAnimationDirection(null);
        }, 200);
      } else if (diff < 0 && currentIndex > 0) {
        // Swipe right -> go to previous
        setAnimationDirection('right');
        setIsAnimating(true);
        setTimeout(() => {
          onItemChange(items[currentIndex - 1]);
          setIsAnimating(false);
          setAnimationDirection(null);
        }, 200);
      }
    }

    setSwipeState({
      startX: 0,
      currentX: 0,
      isDragging: false,
    });
  };

  const swipeOffset = swipeState.isDragging 
    ? Math.max(-100, Math.min(100, swipeState.currentX - swipeState.startX)) 
    : 0;

  const getAnimationClass = () => {
    if (isAnimating) {
      return animationDirection === 'left' 
        ? 'animate-slide-out-left' 
        : 'animate-slide-out-right';
    }
    return '';
  };

  return {
    containerRef,
    handleTouchStart,
    handleTouchMove,
    handleTouchEnd,
    swipeOffset,
    isAnimating,
    animationDirection,
    getAnimationClass,
    currentIndex,
  };
}
