import { useQuery } from '@tanstack/react-query';
import { api } from '../../../api/client';
import { stageBadgeClass, stageLabel, getRefetchInterval, STAGE_ORDER } from '../helpers';
import type { PipelineFlowResponse } from '../types';

interface PipelineFlowStripProps {
  runId: string;
  isRunning: boolean;
  onStageClick?: (stage: string) => void;
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
    <div className="rounded-lg border border-gray-200 dark:border-gray-600 p-3">
      <div className="text-xs text-gray-500 dark:text-gray-400 mb-2">Pipeline Flow</div>
      <div className="flex items-center justify-between gap-2">
        {stages.map((s, i) => (
          <div key={s.name} className="flex items-center gap-2 flex-1">
            {i > 0 && (
              <div className="flex items-center">
                <svg width="24" height="12" viewBox="0 0 24 12" className="text-gray-300 dark:text-gray-600">
                  <path d="M0 6h20M16 2l4 4-4 4" fill="none" stroke="currentColor" strokeWidth="1.5" />
                </svg>
              </div>
            )}
            <button
              type="button"
              onClick={() => onStageClick?.(s.name)}
              className="flex-1 rounded-lg border border-gray-200 dark:border-gray-600 p-2 text-center hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
            >
              <div className={`text-xs font-medium px-2 py-0.5 rounded inline-block mb-1 ${stageBadgeClass(s.name)}`}>
                {stageLabel(s.name)}
              </div>
              <div className={`text-xl font-bold ${s.active > 0 ? 'text-blue-600 dark:text-blue-400 animate-pulse' : 'text-gray-400 dark:text-gray-500'}`}>
                {s.active}
              </div>
              <div className="flex justify-center gap-2 text-[10px] text-gray-500 dark:text-gray-400 mt-0.5">
                <span>{s.completed} done</span>
                {s.failed > 0 && <span className="text-red-500">{s.failed} fail</span>}
              </div>
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
