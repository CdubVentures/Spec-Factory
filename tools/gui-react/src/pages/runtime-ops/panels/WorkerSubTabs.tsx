import { useMemo } from 'react';
import type { RuntimeOpsWorkerRow } from '../types';
import { poolDotClass, poolSelectedTabClass, poolOutlineTabClass } from '../helpers';

interface WorkerSubTabsProps {
  workers: RuntimeOpsWorkerRow[];
  selectedWorkerId: string | null;
  onSelectWorker: (workerId: string) => void;
  poolFilter: string;
}

export function WorkerSubTabs({ workers, selectedWorkerId, onSelectWorker, poolFilter }: WorkerSubTabsProps) {
  const filtered = useMemo(() => {
    const list = poolFilter === 'all' ? workers : workers.filter((w) => w.pool === poolFilter);
    return [...list].sort((a, b) => {
      if (a.state === 'stuck' && b.state !== 'stuck') return -1;
      if (b.state === 'stuck' && a.state !== 'stuck') return 1;
      if (a.state === 'running' && b.state !== 'running') return -1;
      if (b.state === 'running' && a.state !== 'running') return 1;
      return b.elapsed_ms - a.elapsed_ms;
    });
  }, [workers, poolFilter]);

  return (
    <div className="flex items-center gap-1 px-3 py-2 border-b sf-border-default overflow-x-auto">
      {filtered.map((w) => {
        const isSelected = w.worker_id === selectedWorkerId;
        return (
          <button
            key={w.worker_id}
            type="button"
            onClick={() => onSelectWorker(w.worker_id)}
            className={`sf-prefetch-tab-button flex items-center gap-1.5 px-2.5 py-1.5 rounded text-xs font-mono whitespace-nowrap border transition-colors ${
              isSelected
                ? `sf-prefetch-tab-selected ${poolSelectedTabClass(w.pool)} sf-text-primary`
                : `${poolOutlineTabClass(w.pool)} sf-text-primary`
            }`}
            title={`${w.worker_id} - ${w.state}`}
          >
            <span className={`inline-block w-2 h-2 rounded-full shrink-0 ${poolDotClass(w.pool)}`} />
            <span className={isSelected ? 'sf-text-primary' : ''}>{w.worker_id}</span>
          </button>
        );
      })}
      <span className="ml-auto sf-text-caption sf-text-subtle shrink-0 pl-2">
        {filtered.length} workers
      </span>
    </div>
  );
}
