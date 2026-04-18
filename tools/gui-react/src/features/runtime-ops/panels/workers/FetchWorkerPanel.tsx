import { useEffect, useRef } from 'react';
import type { RuntimeOpsWorkerRow } from '../../types.ts';
import { BrowserStream } from '../overview/BrowserStream.tsx';
import { parseBackendMs } from '../../../../utils/dateTime.ts';

interface FetchWorkerPanelProps {
  worker: RuntimeOpsWorkerRow;
  runId: string;
  wsUrl?: string;
  isRunning?: boolean;
}

export function buildBrowserStreamProps(worker: RuntimeOpsWorkerRow, runId: string, wsUrl?: string) {
  return {
    runId,
    workerId: worker.worker_id,
    workerState: worker.state,
    workerPool: worker.pool,
    fetchMode: worker.fetch_mode,
    lastError: worker.last_error,
    wsUrl,
  };
}

function ElapsedTimer({ startedAt, state }: { startedAt: string; state: string }) {
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (state !== 'running' && state !== 'stuck' && state !== 'crawling' && state !== 'retrying') return;
    const startMs = parseBackendMs(startedAt);
    if (!Number.isFinite(startMs) || startMs <= 0) return;

    const tick = () => {
      if (!ref.current) return;
      const elapsed = Date.now() - startMs;
      const sec = Math.floor(elapsed / 1000);
      const min = Math.floor(sec / 60);
      const hrs = Math.floor(min / 60);
      ref.current.textContent = hrs > 0
        ? `${hrs}h ${min % 60}m ${sec % 60}s`
        : min > 0
          ? `${min}m ${sec % 60}s`
          : `${sec}s`;
    };

    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [startedAt, state]);

  return <span ref={ref} className="font-mono sf-text-caption sf-text-primary">--</span>;
}

export function FetchWorkerPanel({ worker, runId, wsUrl }: FetchWorkerPanelProps) {
  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* WHY: Compact header — worker ID, URL link, elapsed time. */}
      <div className="px-3 py-1.5 border-b sf-border-default sf-surface-shell flex items-center gap-2 min-h-[2rem]">
        <span className="font-mono sf-text-caption font-semibold sf-text-primary sf-chip-neutral px-1.5 py-0.5 rounded shrink-0">
          {worker.worker_id}
        </span>
        {worker.current_url && (
          <a
            href={worker.current_url}
            target="_blank"
            rel="noopener noreferrer"
            className="font-mono sf-text-caption sf-link-accent truncate flex-1 min-w-0 hover:underline"
            title={worker.current_url}
          >
            {worker.current_url}
          </a>
        )}
        <ElapsedTimer startedAt={worker.started_at} state={worker.state} />
      </div>

      <BrowserStream {...buildBrowserStreamProps(worker, runId, wsUrl)} />

      {worker.state === 'stuck' && (
        <div className="px-3 py-1.5 border-t sf-callout sf-callout-danger sf-text-caption">
          Worker stuck - may be waiting on a slow server or hung connection. Auto-recovery will trigger after timeout.
        </div>
      )}
    </div>
  );
}
