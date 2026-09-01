import { useCallback, useEffect, useRef, useState } from 'react';

// Press and hold anywhere in a panel for this long to blow it up to fill the
// window; hold again (or hit Escape) to put it back. There is no button —
// the hold is the whole gesture.
export const FULLSCREEN_HOLD_MS = 2500;

// A hold that wanders further than this is a drag or a scroll, not a hold.
const HOLD_SLOP_PX = 12;

// Presses that land on something you can actually operate are that control's
// business, so they never start a hold.
const INTERACTIVE = 'button, a, input, select, textarea, label, [role="button"], [data-no-fullscreen]';

export function useHoldToFullscreen() {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const timerRef = useRef(null);
  const originRef = useRef(null);

  const cancelHold = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    originRef.current = null;
  }, []);

  const startHold = useCallback((event) => {
    if (event.button !== undefined && event.button !== 0) return; // left click only
    if (event.target.closest && event.target.closest(INTERACTIVE)) return;
    const point = event.touches ? event.touches[0] : event;
    if (!point) return;
    originRef.current = { x: point.clientX, y: point.clientY };
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      originRef.current = null;
      setIsFullscreen((on) => !on);
    }, FULLSCREEN_HOLD_MS);
  }, []);

  const moveHold = useCallback((event) => {
    if (!originRef.current) return;
    const point = event.touches ? event.touches[0] : event;
    if (!point) return;
    const dx = point.clientX - originRef.current.x;
    const dy = point.clientY - originRef.current.y;
    if (Math.hypot(dx, dy) > HOLD_SLOP_PX) cancelHold();
  }, [cancelHold]);

  useEffect(() => () => cancelHold(), [cancelHold]);

  useEffect(() => {
    if (!isFullscreen) return undefined;
    const onKeyDown = (e) => { if (e.key === 'Escape') setIsFullscreen(false); };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isFullscreen]);

  const holdProps = {
    onMouseDown: startHold,
    onMouseMove: moveHold,
    onMouseUp: cancelHold,
    onMouseLeave: cancelHold,
    onTouchStart: startHold,
    onTouchMove: moveHold,
    onTouchEnd: cancelHold,
    onTouchCancel: cancelHold,
  };

  return { isFullscreen, setIsFullscreen, holdProps };
}
