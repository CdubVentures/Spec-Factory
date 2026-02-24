import { useMemo } from 'react';
import type { RuntimeOpsWorkerRow } from '../types';
import { poolBadgeClass } from '../helpers';

interface WorkerSubTabsProps {
  workers: RuntimeOpsWorkerRow[];
  selectedWorkerId: string | null;
  onSelectWorker: (workerId: string) => void;
  poolFilter: string;
}

function stateDot(state: string): string {
  if (state === 'stuck') return 'bg-red-500 animate-pulse';
  if (state === 'running') return 'bg-green-500 animate-pulse';
  return 'bg-gray-400';
}

function poolAccent(pool: string): string {
  switch (pool) {
    case 'search': return 'border-purple-500';
    case 'fetch': return 'border-blue-500';
    case 'parse': return 'border-teal-500';
    case 'llm': return 'border-amber-500';
    default: return 'border-gray-400';
  }
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
    <div className="flex items-center gap-1 px-3 py-2 border-b border-gray-200 dark:border-gray-700 overflow-x-auto">
      {filtered.map((w) => {
        const isSelected = w.worker_id === selectedWorkerId;
        return (
          <button
            key={w.worker_id}
            type="button"
            onClick={() => onSelectWorker(w.worker_id)}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-t text-xs font-mono whitespace-nowrap border-b-2 transition-colors ${
              isSelected
                ? `bg-white dark:bg-gray-800 ${poolAccent(w.pool)} shadow-sm`
                : 'border-transparent hover:bg-gray-100 dark:hover:bg-gray-700/50 text-gray-500 dark:text-gray-400'
            }`}
            title={`${w.worker_id} — ${w.state}`}
          >
            <span className={`inline-block w-2 h-2 rounded-full shrink-0 ${stateDot(w.state)}`} />
            <span className={isSelected ? 'text-gray-900 dark:text-gray-100' : ''}>{w.worker_id}</span>
          </button>
        );
      })}
      <span className="ml-auto text-xs text-gray-400 dark:text-gray-500 shrink-0 pl-2">
        {filtered.length} workers
      </span>
    </div>
  );
}
