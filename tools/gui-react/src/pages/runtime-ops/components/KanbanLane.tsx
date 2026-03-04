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
        <span className={`px-2 py-0.5 rounded-full sf-text-nano font-semibold uppercase ${badgeClass}`}>{title}</span>
        <span className="sf-text-nano font-mono sf-text-subtle">{count}</span>
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
      className={`border sf-border-default rounded p-2 sf-surface-elevated text-xs ${onClick ? 'cursor-pointer sf-card-hover-accent' : ''}`}
      onClick={onClick}
    >
      <div className="font-medium sf-text-primary truncate">{title}</div>
      <div className="sf-text-nano sf-text-muted truncate">{domain}</div>
      {snippet && (
        <div className="sf-text-nano sf-text-subtle mt-1 line-clamp-2">{snippet}</div>
      )}
      {score !== undefined && (
        <div className="flex items-center gap-2 mt-1">
          <div className="flex-1 h-1.5 sf-meter-track rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full ${score >= 0.7 ? 'sf-meter-fill-success' : score >= 0.4 ? 'sf-meter-fill-warning' : 'sf-meter-fill-danger'}`}
              style={{ width: `${Math.min(100, Math.max(0, score * 100))}%` }}
            />
          </div>
          <span className="sf-text-nano font-mono sf-text-subtle">{(score * 100).toFixed(0)}</span>
        </div>
      )}
      {rationale && (
        <div className="sf-text-nano sf-text-subtle italic mt-1 truncate">{rationale}</div>
      )}
      {children}
    </div>
  );
}
