import { useEffect, useRef, useState } from 'react';
import { formatMs } from '../helpers';

interface BrowserStreamProps {
  workerId: string;
  wsUrl?: string;
}

export function BrowserStream({ workerId, wsUrl }: BrowserStreamProps) {
  const imgRef = useRef<HTMLImageElement>(null);
  const [status, setStatus] = useState<'connecting' | 'live' | 'ended'>('connecting');
  const [frameSize, setFrameSize] = useState({ width: 0, height: 0 });
  const [activeWorkerId, setActiveWorkerId] = useState('');
  const [elapsed, setElapsed] = useState(0);
  const startRef = useRef(Date.now());
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const id = setInterval(() => {
      setElapsed(Date.now() - startRef.current);
    }, 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (!wsUrl) return;

    let ws: WebSocket | null = null;

    try {
      ws = new WebSocket(wsUrl);
      ws.onopen = () => {
        setStatus('connecting');
        ws?.send(JSON.stringify({ screencast_subscribe: '*' }));
      };

      ws.onmessage = (msg) => {
        try {
          const envelope = JSON.parse(msg.data);
          if (!envelope.channel || !String(envelope.channel).startsWith('screencast-')) return;
          const frame = envelope.data && typeof envelope.data === 'object' ? envelope.data : envelope;
          const imageData = typeof frame.data === 'string' ? frame.data : '';
          if (!imageData) return;

          if (imgRef.current) {
            imgRef.current.src = `data:image/jpeg;base64,${imageData}`;
          }
          setStatus('live');
          setActiveWorkerId(String(frame.worker_id || ''));
          setFrameSize({ width: frame.width || 0, height: frame.height || 0 });

          if (timeoutRef.current) clearTimeout(timeoutRef.current);
          timeoutRef.current = setTimeout(() => setStatus('ended'), 5000);
        } catch { /* ignore non-JSON messages */ }
      };

      ws.onclose = () => setStatus('ended');
      ws.onerror = () => setStatus('ended');
    } catch {
      setStatus('ended');
    }

    return () => {
      if (ws && ws.readyState === WebSocket.OPEN) {
        try { ws.send(JSON.stringify({ screencast_unsubscribe: true })); } catch { /* ignore */ }
      }
      ws?.close();
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [wsUrl]);

  if (!wsUrl) {
    return (
      <div className="flex-1 flex items-center justify-center sf-surface-shell sf-text-subtle text-sm">
        <div className="text-center max-w-md px-4">
          <div className="text-3xl mb-3 opacity-30">{'\uD83C\uDFA5'}</div>
          <div className="mb-2">Browser stream not available</div>
          <div className="text-xs sf-text-muted">
            The live browser view requires an active run with Playwright fetching.
            Start an IndexLab run to see the browser stream.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 relative bg-black flex items-center justify-center overflow-hidden">
      {status === 'connecting' && (
        <div className="sf-text-subtle text-sm animate-pulse">Connecting to browser stream...</div>
      )}

      {status === 'ended' && (
        <div className="text-center sf-text-subtle text-sm px-4">
          <div className="mb-1">Stream ended</div>
          <div className="text-xs sf-text-muted">No active Playwright session for this worker.</div>
        </div>
      )}

      <img
        ref={imgRef}
        alt="Browser stream"
        className={`max-w-full max-h-full object-contain ${status !== 'live' ? 'hidden' : ''}`}
      />

      {status === 'live' && (
        <>
          <div className="absolute top-2 right-2 flex items-center gap-1.5 sf-chip-danger px-2 py-0.5 rounded sf-text-caption font-medium">
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
            LIVE
            {activeWorkerId && <span className="ml-1 opacity-80">{activeWorkerId}</span>}
          </div>
          <div className="absolute bottom-2 left-2 bg-black/70 text-white sf-text-caption px-2 py-0.5 rounded flex items-center gap-3">
            <span>{formatMs(elapsed)}</span>
            {frameSize.width > 0 && <span>{frameSize.width}x{frameSize.height}</span>}
          </div>
        </>
      )}
    </div>
  );
}
