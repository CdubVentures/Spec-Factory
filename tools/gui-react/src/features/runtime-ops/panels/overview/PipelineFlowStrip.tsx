import { useQuery } from '@tanstack/react-query';
import { api } from '../../../../api/client';
import { stageBadgeClass, stageLabel, getRefetchInterval, STAGE_ORDER } from '../../helpers';
import type { PipelineFlowResponse } from '../../types';

interface PipelineFlowStripProps {
  runId: string;
  isRunning: boolean;
  onStageClick?: (stage: string) => void;
}

function stageActiveCountClass(stage: string): string {
  switch (stage) {
    case 'search':
      return 'sf-link-accent';
    case 'fetch':
    case 'index':
      return 'sf-status-text-success';
    case 'parse':
      return 'sf-status-text-info';
    case 'llm':
      return 'sf-status-text-warning';
    default:
      return 'sf-text-subtle';
  }
}

export function PipelineFlowStrip({ runId, isRunning, onStageClick }: PipelineFlowStripProps) {
  const { data } = useQuery({
    queryKey: ['runtime-ops', runId, 'pipeline'],
    queryFn: () => api.get<PipelineFlowResponse>(`/indexlab/run/${runId}/runtime/pipeline`),
    enabled: Boolean(runId),
    refetchInterval: getRefetchInterval(isRunning, false, 2000, 10000),
  });

  const stages = data?.stages ?? STAGE_ORDER.map((name) => ({ name, active: 0, completed: 0, failed: 0 }));

  return (
    <div className="rounded-lg sf-surface-card p-3">
      <div className="sf-text-caption sf-text-muted mb-2">Pipeline Flow</div>
      <div className="flex items-center justify-between gap-2">
        {stages.map((s, i) => (
          <div key={s.name} className="flex items-center gap-2 flex-1">
            {i > 0 && (
              <div className="flex items-center">
                <svg width="24" height="12" viewBox="0 0 24 12" className="sf-text-subtle">
                  <path d="M0 6h20M16 2l4 4-4 4" fill="none" stroke="currentColor" strokeWidth="1.5" />
                </svg>
              </div>
            )}
            <button
              type="button"
              onClick={() => onStageClick?.(s.name)}
              className="flex-1 rounded-lg sf-surface-elevated p-2 text-center sf-row-hoverable transition-colors"
            >
              <div className={`text-xs font-medium px-2 py-0.5 rounded inline-block mb-1 ${stageBadgeClass(s.name)}`}>
                {stageLabel(s.name)}
              </div>
              <div className={`text-xl font-bold ${s.active > 0 ? `${stageActiveCountClass(s.name)} animate-pulse` : 'sf-text-subtle'}`}>
                {s.active}
              </div>
              <div className="flex justify-center gap-2 sf-text-caption sf-text-muted mt-0.5">
                <span>{s.completed} done</span>
                {s.failed > 0 && <span className="sf-status-text-danger">{s.failed} fail</span>}
              </div>
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
