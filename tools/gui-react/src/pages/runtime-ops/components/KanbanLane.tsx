import type { ReactNode } from 'react';

interface KanbanLaneProps {
  title: string;
  count: number;
  badgeClass: string;
  children: ReactNode;
}

export function KanbanLane({ title, count, badgeClass, children }: KanbanLaneProps) {
  return (
    <div className="flex flex-col flex-1 min-w-[14rem] max-w-[24rem]">
      <div className="flex items-center gap-2 mb-2">
        <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase ${badgeClass}`}>{title}</span>
        <span className="text-[10px] font-mono text-gray-400 dark:text-gray-500">{count}</span>
      </div>
      <div className="flex flex-col gap-1.5 overflow-y-auto max-h-[28rem]">
        {children}
      </div>
    </div>
  );
}

interface KanbanCardProps {
  title: string;
  domain: string;
  snippet?: string;
  score?: number;
  rationale?: string;
  children?: ReactNode;
  onClick?: () => void;
}

export function KanbanCard({ title, domain, snippet, score, rationale, children, onClick }: KanbanCardProps) {
  return (
    <div
      className={`border border-gray-200 dark:border-gray-700 rounded p-2 bg-white dark:bg-gray-800 text-xs ${onClick ? 'cursor-pointer hover:border-blue-400 dark:hover:border-blue-500' : ''}`}
      onClick={onClick}
    >
      <div className="font-medium text-gray-900 dark:text-gray-100 truncate">{title}</div>
      <div className="text-[10px] text-gray-500 dark:text-gray-400 truncate">{domain}</div>
      {snippet && (
        <div className="text-[10px] text-gray-400 dark:text-gray-500 mt-1 line-clamp-2">{snippet}</div>
      )}
      {score !== undefined && (
        <div className="flex items-center gap-2 mt-1">
          <div className="flex-1 h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full ${score >= 0.7 ? 'bg-emerald-500' : score >= 0.4 ? 'bg-yellow-500' : 'bg-red-400'}`}
              style={{ width: `${Math.min(100, Math.max(0, score * 100))}%` }}
            />
          </div>
          <span className="text-[9px] font-mono text-gray-400">{(score * 100).toFixed(0)}</span>
        </div>
      )}
      {rationale && (
        <div className="text-[10px] text-gray-400 dark:text-gray-500 italic mt-1 truncate">{rationale}</div>
      )}
      {children}
    </div>
  );
}
