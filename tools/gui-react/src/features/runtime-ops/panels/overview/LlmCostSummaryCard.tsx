import type { LlmWorkerSummary } from '../../types.ts';
import { fmtCost, fmtCompact, computeDonutSegments, ctMeta } from '../workers/llmDashboardHelpers.ts';
import { ModelDonut } from '../../components/ModelDonut.tsx';

interface LlmCostSummaryCardProps {
  summary: LlmWorkerSummary | undefined;
}

function CostBar({ callType, costUsd, maxCost }: { callType: string; costUsd: number; maxCost: number }) {
  const meta = ctMeta(callType);
  const w = Math.max(2, Math.round((costUsd / maxCost) * 100));
  return (
    <div className="flex items-center gap-2">
      <span className="text-[10px] sf-text-muted w-[72px] truncate shrink-0" title={meta.label}>
        {meta.label}
      </span>
      <div className="flex-1 h-1.5 sf-meter-track rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${meta.barClass}`} style={{ width: `${w}%` }} />
      </div>
      <span className="text-[10px] font-mono sf-text-muted w-[48px] text-right shrink-0">
        {fmtCost(costUsd)}
      </span>
    </div>
  );
}

export function LlmCostSummaryCard({ summary }: LlmCostSummaryCardProps) {
  const cost = summary?.total_cost_usd ?? 0;
  const segments = computeDonutSegments(summary?.by_model ?? []);
  const byType = summary?.by_call_type ?? [];
  const maxCost = byType[0]?.cost_usd || 1;

  return (
    <div className="sf-surface-card rounded-lg p-4 flex flex-col gap-4">
      <div>
        <h3 className="text-[10px] font-extrabold uppercase tracking-[0.07em] sf-text-subtle mb-2">
          LLM Spend
        </h3>
        <div className="flex items-baseline gap-2">
          <span className="text-2xl font-extrabold font-mono sf-text-primary leading-none">
            {fmtCost(cost)}
          </span>
          <span className="text-[10px] sf-text-muted">
            {fmtCompact(summary?.total_tokens ?? 0)} tokens
          </span>
        </div>
      </div>

      <ModelDonut
        segments={segments}
        centerLabel={summary?.by_model.length ?? 0}
        centerCaption="models"
      />

      {byType.length > 0 && (
        <div>
          <div className="text-[9px] font-bold uppercase tracking-[0.08em] sf-text-muted mb-2">
            Cost by Type
          </div>
          <div className="space-y-1.5">
            {byType.slice(0, 5).map((ct) => (
              <CostBar key={ct.call_type} callType={ct.call_type} costUsd={ct.cost_usd} maxCost={maxCost} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
