import { useEffect, useRef } from 'react';
import type { RuntimeOpsWorkerRow } from '../types';
import { BrowserStream } from './BrowserStream';
import {
  workerStateBadgeClass,
  poolBadgeClass,
  fetchModeBadgeClass,
  stageBadgeClass,
  stageLabel,
  formatMs,
  STAGE_ORDER,
} from '../helpers';

interface WorkerLivePanelProps {
  worker: RuntimeOpsWorkerRow;
  wsUrl?: string;
  isRunning?: boolean;
}

function ElapsedTimer({ startedAt, state }: { startedAt: string; state: string }) {
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (state !== 'running' && state !== 'stuck') return;
    const startMs = new Date(startedAt).getTime();
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

  return <span ref={ref} className="font-mono text-xs text-gray-700 dark:text-gray-300">--</span>;
}

function StageProgressStripInline({ currentStage }: { currentStage: string }) {
  const currentIdx = STAGE_ORDER.indexOf(currentStage as typeof STAGE_ORDER[number]);

  return (
    <div className="flex items-center gap-0.5">
      {STAGE_ORDER.map((s, i) => {
        const isCurrent = s === currentStage;
        const isCompleted = currentIdx > i;
        return (
          <div key={s} className="flex items-center gap-0.5">
            {i > 0 && (
              <div className={`w-2 h-px ${isCompleted ? 'bg-green-400' : 'bg-gray-300 dark:bg-gray-600'}`} />
            )}
            <span
              className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                isCurrent
                  ? `${stageBadgeClass(s)} ring-1 ring-blue-400`
                  : isCompleted
                    ? 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300'
                    : 'bg-gray-100 text-gray-400 dark:bg-gray-700 dark:text-gray-500'
              }`}
            >
              {stageLabel(s)}
            </span>
          </div>
        );
      })}
    </div>
  );
}

export function WorkerLivePanel({ worker, wsUrl, isRunning }: WorkerLivePanelProps) {
  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* Compact header — Row 1: worker ID, pool, state, URL */}
      <div className="px-3 py-1.5 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 flex items-center gap-2 min-h-[2rem]">
        <span className="font-mono text-xs font-semibold text-gray-800 dark:text-gray-200 bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded">
          {worker.worker_id}
        </span>
        <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${poolBadgeClass(worker.pool)}`}>
          {worker.pool}
        </span>
        <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${workerStateBadgeClass(worker.state)}`}>
          {worker.state}
        </span>
        {worker.current_url && (
          <span
            className="font-mono text-[10px] text-gray-500 dark:text-gray-400 truncate max-w-[32rem] cursor-pointer hover:text-gray-700 dark:hover:text-gray-200"
            onClick={() => navigator.clipboard?.writeText(worker.current_url)}
            title={worker.current_url}
          >
            {worker.current_url}
          </span>
        )}
      </div>

      {/* Compact header — Row 2: stage strip, elapsed, mode, retries, error */}
      <div className="px-3 py-1 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 flex items-center gap-3 min-h-[1.75rem]">
        <StageProgressStripInline currentStage={worker.stage} />
        <ElapsedTimer startedAt={worker.started_at} state={worker.state} />
        {worker.fetch_mode && (
          <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${fetchModeBadgeClass(worker.fetch_mode)}`}>
            {worker.fetch_mode}
          </span>
        )}
        <span className="text-[10px] text-gray-500 dark:text-gray-400">
          R:<span className="font-mono">{worker.retries}</span>
        </span>
        <span className="text-[10px] text-gray-500 dark:text-gray-400">
          docs:<span className="font-mono">{worker.docs_processed}</span>
        </span>
        <span className="text-[10px] text-gray-500 dark:text-gray-400">
          fields:<span className="font-mono">{worker.fields_extracted}</span>
        </span>
        {worker.last_error && (
          <span className="text-[10px] text-red-600 dark:text-red-400 truncate max-w-[20rem]" title={worker.last_error}>
            {worker.last_error}
          </span>
        )}
      </div>

      {/* Browser stream — fills remaining space */}
      <BrowserStream workerId={worker.worker_id} wsUrl={wsUrl} />

      {worker.state === 'stuck' && (
        <div className="px-3 py-1.5 border-t border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 text-[10px] text-red-700 dark:text-red-300">
          Worker stuck — may be waiting on a slow server or hung connection. Auto-recovery will trigger after timeout.
        </div>
      )}
    </div>
  );
}
