import { useCallback, useRef } from 'react';

interface UseTapOptions {
  onTap: () => void;
  moveThresholdPx?: number;
}

// Prevent accidental activations while scrolling on mobile.
// It triggers only if the finger didn't move more than `moveThresholdPx`.
export function useTap({ onTap, moveThresholdPx = 10 }: UseTapOptions) {
  const start = useRef<{ x: number; y: number; moved: boolean } | null>(null);

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    const t = e.touches[0];
    if (!t) return;
    start.current = { x: t.clientX, y: t.clientY, moved: false };
  }, []);

  const onTouchMove = useCallback(
    (e: React.TouchEvent) => {
      if (!start.current) return;
      const t = e.touches[0];
      if (!t) return;

      const dx = Math.abs(t.clientX - start.current.x);
      const dy = Math.abs(t.clientY - start.current.y);
      if (dx > moveThresholdPx || dy > moveThresholdPx) {
        start.current.moved = true;
      }
    },
    [moveThresholdPx]
  );

  const onTouchEnd = useCallback(() => {
    if (!start.current) return;
    const shouldTap = !start.current.moved;
    start.current = null;
    if (shouldTap) onTap();
  }, [onTap]);

  // Keep desktop behavior.
  const onClick = useCallback(() => {
    onTap();
  }, [onTap]);

  return { onClick, onTouchStart, onTouchMove, onTouchEnd };
}
