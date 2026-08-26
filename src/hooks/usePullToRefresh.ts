import { useEffect, useRef, useState } from 'react';

const THRESHOLD = 70;
const MAX_PULL = 110;

export function usePullToRefresh(onRefresh: () => void) {
  const [pullDistance, setPullDistance] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const startY = useRef<number | null>(null);
  const pulling = useRef(false);

  useEffect(() => {
    function onTouchStart(e: TouchEvent) {
      if (window.scrollY === 0 && !refreshing) {
        startY.current = e.touches[0].clientY;
        pulling.current = true;
      }
    }

    function onTouchMove(e: TouchEvent) {
      if (!pulling.current || startY.current == null) return;
      const delta = e.touches[0].clientY - startY.current;
      if (delta > 0 && window.scrollY === 0) {
        // Suppress iOS's native rubber-band bounce so it doesn't fight our own indicator.
        if (e.cancelable) e.preventDefault();
        setPullDistance(Math.min(delta * 0.5, MAX_PULL));
      } else {
        pulling.current = false;
        setPullDistance(0);
      }
    }

    function onTouchEnd() {
      if (!pulling.current) return;
      pulling.current = false;
      startY.current = null;
      setPullDistance((current) => {
        if (current >= THRESHOLD) {
          setRefreshing(true);
          onRefresh();
        }
        return 0;
      });
    }

    window.addEventListener('touchstart', onTouchStart, { passive: true });
    window.addEventListener('touchmove', onTouchMove, { passive: false });
    window.addEventListener('touchend', onTouchEnd, { passive: true });
    return () => {
      window.removeEventListener('touchstart', onTouchStart);
      window.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('touchend', onTouchEnd);
    };
  }, [onRefresh, refreshing]);

  return { pullDistance, refreshing, threshold: THRESHOLD };
}
