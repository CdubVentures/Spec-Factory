import { useEffect, useRef, useState } from 'react';
import { api } from '../../../../api/client.ts';
import { formatMs } from '../../helpers.ts';

interface BrowserStreamProps {
  runId: string;
  workerId: string;
  workerState?: string;
  workerPool?: string;
  fetchMode?: string | null;
  lastError?: string | null;
  wsUrl?: string;
}

interface ScreencastFrameResponse {
  run_id: string;
  worker_id: string;
  frame: {
    run_id: string;
    worker_id: string;
    data: string;
    width: number;
    height: number;
    ts: string;
    mime_type?: string;
    synthetic?: boolean;
  };
}

export function isBrowserBackedFetchWorker(workerPool?: string, fetchMode?: string | null) {
  return workerPool === 'fetch' && (fetchMode === 'crawlee' || fetchMode === 'playwright');
}

export function describeBrowserStreamGap({
  workerPool,
  fetchMode,
  lastError,
}: {
  workerPool?: string;
  fetchMode?: string | null;
  lastError?: string | null;
}) {
  const browserBackedFetchWorker = isBrowserBackedFetchWorker(workerPool, fetchMode);
  const title = browserBackedFetchWorker
    ? 'No stream image was captured for this browser-backed fetch worker.'
    : workerPool && workerPool !== 'fetch'
      ? 'No browser image is expected for this worker pool.'
      : 'Stream ended';
  const detail = browserBackedFetchWorker
    ? (lastError
      ? `The fetch ended without a retained frame. Last error: ${lastError}`
      : 'The fetch ended before the runtime screencast captured a retained frame.')
    : workerPool && workerPool !== 'fetch'
      ? 'Search and LLM workers do not produce browser screenshots.'
      : 'No active browser-backed session for this worker.';
  return { title, detail };
}

export function browserStreamUnavailableDetail() {
  return 'The live browser view requires an active browser-backed fetch worker. Start an IndexLab run to see the browser stream.';
}

export function shouldHydrateRetainedBrowserFrame(workerState?: string) {
  return Boolean(workerState && workerState !== 'running' && workerState !== 'stuck');
}

export function BrowserStream({ runId, workerId, workerState, workerPool, fetchMode, lastError, wsUrl }: BrowserStreamProps) {
  const imgRef = useRef<HTMLImageElement>(null);
  const hasFrameRef = useRef(false);
  const [status, setStatus] = useState<'connecting' | 'live' | 'ended'>('connecting');
  const [hasFrame, setHasFrame] = useState(false);
  const [frameSize, setFrameSize] = useState({ width: 0, height: 0 });
  const [activeWorkerId, setActiveWorkerId] = useState('');
  const [elapsed, setElapsed] = useState(0);
  const [videoUrl, setVideoUrl] = useState<string>('');
  const startRef = useRef(Date.now());
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { title: noImageTitle, detail: noImageDetail } = describeBrowserStreamGap({
    workerPool,
    fetchMode,
    lastError,
  });

  useEffect(() => {
    const id = setInterval(() => {
      setElapsed(Date.now() - startRef.current);
    }, 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    let ws: WebSocket | null = null;
    let cancelled = false;
    startRef.current = Date.now();
    setStatus('connecting');
    setHasFrame(false);
    hasFrameRef.current = false;
    setActiveWorkerId('');
    setFrameSize({ width: 0, height: 0 });
    setVideoUrl('');
    const applyFrame = (frame: { worker_id?: string; data?: string; width?: number; height?: number; mime_type?: string }) => {
      const imageData = typeof frame.data === 'string' ? frame.data : '';
      if (!imageData) return false;
      const imageMimeType = frame.mime_type || 'image/jpeg';
      if (imgRef.current) {
        imgRef.current.src = `data:${imageMimeType};base64,${imageData}`;
      }
      hasFrameRef.current = true;
      setHasFrame(true);
      setActiveWorkerId(String(frame.worker_id || ''));
      setFrameSize({ width: frame.width || 0, height: frame.height || 0 });
      return true;
    };
    const hydrateLastFrame = async () => {
      if (!runId || !workerId) return;
      try {
        const response = await api.get<ScreencastFrameResponse>(
          `/indexlab/run/${encodeURIComponent(runId)}/runtime/screencast/${encodeURIComponent(workerId)}/last`,
        );
        if (cancelled || hasFrameRef.current) return;
        if (applyFrame(response.frame)) {
          setStatus('ended');
        }
      } catch {
        // ignore missing cached frame
      }
    };
    const armStreamTimeout = () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(() => {
        setStatus('ended');
        void hydrateLastFrame();
      }, 5000);
    };

    if (shouldHydrateRetainedBrowserFrame(workerState)) {
      setStatus('ended');
      // WHY: Try loading a crawl video first. If the video endpoint returns 200,
      // display the looping video instead of a static retained frame. The video
      // URL is set as a direct src for the <video> element (browser handles range
      // requests). If 404/error, fall through to the existing static frame.
      const tryVideoUrl = `/api/v1/indexlab/run/${encodeURIComponent(runId)}/runtime/video/${encodeURIComponent(workerId)}`;
      void (async () => {
        if (cancelled || !isBrowserBackedFetchWorker(workerPool, fetchMode)) {
          void hydrateLastFrame();
          return;
        }
        try {
          const res = await fetch(tryVideoUrl, { method: 'HEAD' });
          if (!cancelled && res.ok) {
            setVideoUrl(tryVideoUrl);
            return;
          }
        } catch { /* ignore — fall through to static frame */ }
        if (!cancelled) void hydrateLastFrame();
      })();
      return () => {
        cancelled = true;
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
      };
    }

    if (!wsUrl) {
      setStatus('ended');
      return () => {
        cancelled = true;
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
      };
    }

    try {
      ws = new WebSocket(wsUrl);
      ws.onopen = () => {
        setStatus('connecting');
        ws?.send(JSON.stringify({ screencast_subscribe: workerId || '*' }));
        armStreamTimeout();
      };

      ws.onmessage = (msg) => {
        try {
          const envelope = JSON.parse(msg.data);
          if (!envelope.channel || !String(envelope.channel).startsWith('screencast-')) return;
          const frame = envelope.data && typeof envelope.data === 'object' ? envelope.data : envelope;
          if (workerId && String(frame.worker_id || '') !== workerId) return;
          if (!applyFrame(frame)) return;
          setStatus('live');
          armStreamTimeout();
        } catch { /* ignore non-JSON messages */ }
      };

      ws.onclose = () => {
        setStatus('ended');
        void hydrateLastFrame();
      };
      ws.onerror = () => {
        setStatus('ended');
        void hydrateLastFrame();
      };
    } catch {
      setStatus('ended');
      void hydrateLastFrame();
    }

    return () => {
      cancelled = true;
      if (ws && ws.readyState === WebSocket.OPEN) {
        try { ws.send(JSON.stringify({ screencast_unsubscribe: true })); } catch { /* ignore */ }
      }
      ws?.close();
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [runId, workerId, workerState, workerPool, fetchMode, wsUrl]);

  if (!wsUrl && !hasFrame && !videoUrl) {
    return (
      <div className="flex-1 flex items-center justify-center sf-surface-shell sf-text-subtle text-sm">
        <div className="text-center max-w-md px-4">
          <div className="text-3xl mb-3 opacity-30">{'\uD83C\uDFA5'}</div>
          <div className="mb-2">Browser stream not available</div>
          <div className="text-xs sf-text-muted">
            {browserStreamUnavailableDetail()}
          </div>
        </div>
      </div>
    );
  }

  if (videoUrl) {
    return (
      <div className="flex-1 min-h-0 relative bg-black flex items-center justify-center overflow-hidden">
        <video
          src={videoUrl}
          autoPlay
          loop
          muted
          playsInline
          className="w-full h-full object-contain"
        />
        <div className="absolute top-2 right-2 flex items-center gap-1.5 sf-chip-neutral px-2 py-0.5 rounded sf-text-caption font-medium">
          Crawl Recording
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 min-h-0 relative bg-black flex items-center justify-center overflow-hidden">
      {status === 'connecting' && (
        <div className="sf-text-subtle text-sm animate-pulse">Connecting to browser stream...</div>
      )}

      {status === 'ended' && !hasFrame && (
        <div className="text-center sf-text-subtle text-sm px-4">
          <div className="mb-1">{noImageTitle}</div>
          <div className="text-xs sf-text-muted">{noImageDetail}</div>
        </div>
      )}

      {status === 'ended' && hasFrame && (
        <div className="absolute inset-x-0 top-0 z-10 flex justify-center p-3 pointer-events-none">
          <div className="bg-black/75 text-white sf-text-caption px-3 py-1.5 rounded border border-white/20">
            Stream ended. Last captured frame retained.
          </div>
        </div>
      )}

      <img
        ref={imgRef}
        alt="Browser stream"
        className={`w-full h-full object-contain ${status === 'connecting' || (status === 'ended' && !hasFrame) ? 'hidden' : ''}`}
      />

      {(status === 'live' || (status === 'ended' && hasFrame)) && (
        <>
          {status === 'live' && (
            <div className="absolute top-2 right-2 flex items-center gap-1.5 sf-chip-danger px-2 py-0.5 rounded sf-text-caption font-medium">
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
              LIVE
              {activeWorkerId && <span className="ml-1 opacity-80">{activeWorkerId}</span>}
            </div>
          )}
          <div className="absolute bottom-2 left-2 bg-black/70 text-white sf-text-caption px-2 py-0.5 rounded flex items-center gap-3">
            <span>{formatMs(elapsed)}</span>
            {frameSize.width > 0 && <span>{frameSize.width}x{frameSize.height}</span>}
          </div>
        </>
      )}
    </div>
  );
}
