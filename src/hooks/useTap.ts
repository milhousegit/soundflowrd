import { useCallback, useRef } from 'react';

interface UseTapOptions {
  onTap: () => void;
  moveThresholdPx?: number;
  longPressThresholdMs?: number;
}

// Prevent accidental activations while scrolling on mobile.
// It triggers only if the finger didn't move more than `moveThresholdPx`
// AND the touch duration was less than `longPressThresholdMs` (to avoid triggering on long press).
export function useTap({ onTap, moveThresholdPx = 10, longPressThresholdMs = 400 }: UseTapOptions) {
  const start = useRef<{ x: number; y: number; moved: boolean; time: number } | null>(null);

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    const t = e.touches[0];
    if (!t) return;
    start.current = { x: t.clientX, y: t.clientY, moved: false, time: Date.now() };
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
    const elapsed = Date.now() - start.current.time;
    const shouldTap = !start.current.moved && elapsed < longPressThresholdMs;
    start.current = null;
    if (shouldTap) onTap();
  }, [onTap, longPressThresholdMs]);

  // Keep desktop behavior - but prevent if context menu was triggered
  const onClick = useCallback((e: React.MouseEvent) => {
    // Don't trigger on right-click (context menu)
    if (e.button !== 0) return;
    onTap();
  }, [onTap]);

  return { onClick, onTouchStart, onTouchMove, onTouchEnd };
}
