import { useEffect, useRef } from 'react';
import type { RuntimeOpsWorkerRow } from '../types';
import { BrowserStream } from './BrowserStream';
import {
  workerStateBadgeClass,
  poolBadgeClass,
  fetchModeBadgeClass,
  stageBadgeClass,
  stageMeterFillClass,
  stageLabel,
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

  return <span ref={ref} className="font-mono sf-text-caption sf-text-primary">--</span>;
}

function StageProgressStripInline({ currentStage }: { currentStage: string }) {
  const currentIdx = STAGE_ORDER.indexOf(currentStage as typeof STAGE_ORDER[number]);

  return (
    <div className="flex items-center gap-0.5">
      {STAGE_ORDER.map((s, i) => {
        const isCurrent = s === currentStage;
        const isCompleted = currentIdx > i;
        const connectorStage = i > 0 ? STAGE_ORDER[i - 1] : s;
        return (
          <div key={s} className="flex items-center gap-0.5">
            {i > 0 && (
              <div className={`w-2 h-px ${isCompleted ? stageMeterFillClass(connectorStage) : 'sf-meter-track'}`} />
            )}
            <span
              className={`px-1.5 py-0.5 rounded sf-text-caption font-medium border ${
                isCurrent
                  ? `${stageBadgeClass(s)} sf-border-default`
                  : isCompleted
                    ? `${stageBadgeClass(s)} sf-border-default`
                    : 'sf-chip-neutral sf-border-default'
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

export function WorkerLivePanel({ worker, wsUrl }: WorkerLivePanelProps) {
  return (
    <div className="flex flex-col flex-1 min-h-0">
      <div className="px-3 py-1.5 border-b sf-border-default sf-surface-shell flex items-center gap-2 min-h-[2rem]">
        <span className="font-mono sf-text-caption font-semibold sf-text-primary sf-chip-neutral px-1.5 py-0.5 rounded">
          {worker.worker_id}
        </span>
        <span className={`px-1.5 py-0.5 rounded sf-text-caption font-medium ${poolBadgeClass(worker.pool)}`}>
          {worker.pool}
        </span>
        <span className={`px-1.5 py-0.5 rounded sf-text-caption font-medium ${workerStateBadgeClass(worker.state)}`}>
          {worker.state}
        </span>
        {worker.current_url && (
          <span
            className="font-mono sf-text-caption sf-text-muted truncate max-w-[32rem] cursor-pointer hover:sf-text-primary"
            onClick={() => navigator.clipboard?.writeText(worker.current_url)}
            title={worker.current_url}
          >
            {worker.current_url}
          </span>
        )}
      </div>

      <div className="px-3 py-1 border-b sf-border-default sf-surface-elevated flex items-center gap-3 min-h-[1.75rem]">
        <StageProgressStripInline currentStage={worker.stage} />
        <ElapsedTimer startedAt={worker.started_at} state={worker.state} />
        {worker.fetch_mode && (
          <span className={`px-1.5 py-0.5 rounded sf-text-caption font-medium ${fetchModeBadgeClass(worker.fetch_mode)}`}>
            {worker.fetch_mode}
          </span>
        )}
        <span className="sf-text-caption sf-text-muted">
          R:<span className="font-mono">{worker.retries}</span>
        </span>
        <span className="sf-text-caption sf-text-muted">
          docs:<span className="font-mono">{worker.docs_processed}</span>
        </span>
        <span className="sf-text-caption sf-text-muted">
          fields:<span className="font-mono">{worker.fields_extracted}</span>
        </span>
        {worker.last_error && (
          <span className="sf-text-caption sf-status-text-danger truncate max-w-[20rem]" title={worker.last_error}>
            {worker.last_error}
          </span>
        )}
      </div>

      <BrowserStream workerId={worker.worker_id} wsUrl={wsUrl} />

      {worker.state === 'stuck' && (
        <div className="px-3 py-1.5 border-t sf-callout sf-callout-danger sf-text-caption">
          Worker stuck - may be waiting on a slow server or hung connection. Auto-recovery will trigger after timeout.
        </div>
      )}
    </div>
  );
}
