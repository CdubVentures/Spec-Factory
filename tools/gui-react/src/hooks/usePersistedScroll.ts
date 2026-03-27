import { useCallback, useEffect, useRef } from 'react';
import { resolveScrollPosition, useScrollStore } from '../stores/scrollStore';

const DEBOUNCE_MS = 200;

/**
 * Returns a ref callback that persists scroll position for any scrollable element.
 * Restores on mount, saves on scroll (debounced), saves on unmount.
 */
export function usePersistedScroll(key: string): React.RefCallback<HTMLElement> {
  const cleanupRef = useRef<(() => void) | null>(null);

  /* Safety net: flush on unmount in case React skips the null ref call */
  useEffect(() => {
    return () => {
      cleanupRef.current?.();
      cleanupRef.current = null;
    };
  }, []);

  return useCallback((node: HTMLElement | null) => {
    /* Cleanup previous attachment */
    cleanupRef.current?.();
    cleanupRef.current = null;

    if (!node) return;

    /* Restore scroll position */
    const stored = resolveScrollPosition(useScrollStore.getState().values[key]);
    if (stored) {
      requestAnimationFrame(() => {
        node.scrollTop = stored.top;
        node.scrollLeft = stored.left;
      });
    }

    /* Debounced save on scroll */
    let timer: ReturnType<typeof setTimeout> | undefined;
    const onScroll = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        useScrollStore.getState().set(key, { top: node.scrollTop, left: node.scrollLeft });
      }, DEBOUNCE_MS);
    };

    node.addEventListener('scroll', onScroll, { passive: true });

    cleanupRef.current = () => {
      clearTimeout(timer);
      /* Save final position on detach */
      useScrollStore.getState().set(key, { top: node.scrollTop, left: node.scrollLeft });
      node.removeEventListener('scroll', onScroll);
    };
  }, [key]);
}
