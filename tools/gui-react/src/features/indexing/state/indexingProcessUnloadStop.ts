import { useEffect } from 'react';

export function useIndexingProcessUnloadStop(processRunning: boolean): void {
  useEffect(() => {
    const stopUrl = '/api/v1/process/stop';
    const stopPayload = JSON.stringify({ force: true });
    const sendStop = () => {
      if (!processRunning) return;
      try {
        const payload = new Blob([stopPayload], { type: 'application/json' });
        if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
          navigator.sendBeacon(stopUrl, payload);
          return;
        }
      } catch {
        // Fall through to fetch keepalive.
      }
      try {
        void fetch(stopUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: stopPayload,
          keepalive: true,
        });
      } catch {
        // Best-effort only.
      }
    };
    const onBeforeUnload = () => sendStop();
    const onPageHide = () => sendStop();
    window.addEventListener('beforeunload', onBeforeUnload);
    window.addEventListener('pagehide', onPageHide);
    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload);
      window.removeEventListener('pagehide', onPageHide);
    };
  }, [processRunning]);
}
