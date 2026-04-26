import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../api/client.ts';
import { useUiCategoryStore } from '../../stores/uiCategoryStore.ts';
import { btnPrimary } from '../../shared/ui/buttonClasses.ts';
import { Spinner } from '../../shared/ui/feedback/Spinner.tsx';

import type { FieldContractAuditResult } from './types.ts';
import { FieldContractAudit } from './FieldContractAudit.tsx';

// ── Main Component ───────────────────────────────────────────────────

interface CachedAuditResponse {
  cached: boolean;
  run_at?: string;
  results?: FieldContractAuditResult['results'];
  phases?: FieldContractAuditResult['phases'];
  summary?: FieldContractAuditResult['summary'];
}

export function TestModePage() {
  const category = useUiCategoryStore((s) => s.category);
  const queryClient = useQueryClient();
  const auditQueryKey = ['field-contract-audit', category];

  // WHY: Load cached audit from DB on mount — survives page refreshes.
  const { data: cachedData } = useQuery({
    queryKey: ['field-audit-cache', category],
    queryFn: () => api.get<CachedAuditResponse>(`/test-mode/audit?category=${category}`),
    enabled: Boolean(category),
    staleTime: Infinity,
  });

  // WHY: Fresh audit result from POST — staleTime Infinity keeps it across tab switches.
  const { data: freshAudit, isFetching } = useQuery<FieldContractAuditResult>({
    queryKey: auditQueryKey,
    queryFn: () => api.post<FieldContractAuditResult>('/test-mode/validate', { category }),
    enabled: false,
    staleTime: Infinity,
  });

  // Use fresh result if available, otherwise fall back to DB cache
  const auditResult: FieldContractAuditResult | null = freshAudit
    ?? (cachedData?.cached && cachedData.results && cachedData.summary && cachedData.phases
      ? { results: cachedData.results, phases: cachedData.phases, summary: cachedData.summary }
      : null);

  const runAt = freshAudit ? null : cachedData?.run_at;

  const runAudit = () => {
    queryClient.fetchQuery({
      queryKey: auditQueryKey,
      queryFn: () => api.post<FieldContractAuditResult>('/test-mode/validate', { category }),
    });
  };

  return (
    <div className="p-6 space-y-5 max-w-[1440px] mx-auto">
      {/* Header */}
      <div className="sf-surface-card border sf-border-default rounded-lg p-4 flex items-center gap-4">
        <div>
          <h1 className="text-lg font-bold sf-text-primary tracking-tight">Field Contract Audit</h1>
          <p className="text-xs sf-text-muted">
            Per-key validation proof — every field, every failure point, every deterministic transform. Category: <span className="font-mono font-semibold">{category || 'none'}</span>
            {runAt && <span className="sf-text-subtle ml-2">(cached: {runAt})</span>}
          </p>
        </div>
        <div className="ml-auto">
          <button
            onClick={() => void runAudit()}
            disabled={isFetching || !category}
            className={btnPrimary}
          >
            {isFetching ? <Spinner className="h-4 w-4 inline mr-1" /> : null}
            {auditResult ? 'Re-run Audit' : 'Run Audit'}
          </button>
        </div>
      </div>

      {/* Field Contract Audit Results */}
      {auditResult && <FieldContractAudit audit={auditResult} />}
    </div>
  );
}
