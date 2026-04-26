import { useCallback, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../../api/client.ts';
import { useUiStore } from '../../../stores/uiStore.ts';
import { useOperationsStore } from '../../operations/state/operationsStore.ts';
import { useDataChangeMutation } from '../../data-change/index.js';
import { Chip } from '../../../shared/ui/feedback/Chip.tsx';
import { selectActivePublisherReconcileOperation } from '../state/publisherReconcileOperations.ts';

interface ReconcilePreview {
  threshold: number;
  unpublished: number;
  published: number;
  locked: number;
  unaffected: number;
  total_fields: number;
}

interface ReconcileResult {
  operation_id: string | null;
  result: ReconcilePreview;
}

export default function PublisherReconcileSection() {
  const category = useUiStore((s) => s.category);
  const [lastResult, setLastResult] = useState<ReconcilePreview | null>(null);

  const { data: preview, isLoading, isError } = useQuery({
    queryKey: ['publisher', 'reconcile', category],
    queryFn: () => api.get<ReconcilePreview>(`/publisher/${category}/reconcile`),
    enabled: Boolean(category),
    staleTime: 5_000,
  });

  const reconcileMut = useDataChangeMutation<ReconcileResult>({
    event: 'publisher-reconcile',
    category,
    mutationFn: () => api.post<ReconcileResult>(`/publisher/${category}/reconcile`, {}),
    options: {
      onSuccess: (data) => {
        setLastResult(data.result);
      },
    },
  });

  const activeOp = useOperationsStore(
    useCallback(
      (s) => selectActivePublisherReconcileOperation(s.operations, category),
      [category],
    ),
  );

  const isReconciling = reconcileMut.isPending || Boolean(activeOp);
  const needsAction = preview && (preview.unpublished > 0 || preview.published > 0);

  if (!category) {
    return <p className="sf-text-muted text-sm">Select a category to preview reconciliation.</p>;
  }

  return (
    <div className="space-y-4">
      {/* Preview Card */}
      <div className="sf-surface-panel border sf-border-soft rounded-lg p-4 space-y-3">
        <div className="text-[11px] font-bold uppercase tracking-[0.06em] sf-text-muted">
          Threshold Impact Preview
        </div>

        {isLoading ? (
          <p className="sf-text-muted text-sm">Scanning...</p>
        ) : isError ? (
          <p className="sf-status-text-danger text-sm">Failed to load preview.</p>
        ) : preview ? (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <StatBox label="Would Unpublish" value={preview.unpublished} cls={preview.unpublished > 0 ? 'sf-status-text-danger' : 'sf-text-muted'} />
            <StatBox label="Would Publish" value={preview.published} cls={preview.published > 0 ? 'sf-status-text-success' : 'sf-text-muted'} />
            <StatBox label="Locked (Override)" value={preview.locked} cls="sf-text-muted" />
            <StatBox label="Unaffected" value={preview.unaffected} cls="sf-text-muted" />
          </div>
        ) : null}

        {preview && (
          <div className="flex items-center gap-2 text-[11px] sf-text-subtle">
            <span>Current threshold:</span>
            <Chip label={String(preview.threshold)} className="sf-chip-info" />
            <span className="sf-text-muted">
              {preview.total_fields} total field{preview.total_fields !== 1 ? 's' : ''} across all products
            </span>
          </div>
        )}
      </div>

      {/* Active Operation Progress */}
      {activeOp && (
        <div className="sf-surface-elevated border sf-border-soft rounded-lg p-4 flex items-center gap-3">
          <div className="w-3 h-3 rounded-full sf-dot-info animate-pulse" />
          <span className="sf-text-primary text-sm font-semibold">
            {activeOp.stages?.[activeOp.currentStageIndex] ?? 'Processing'}...
          </span>
          <span className="sf-text-muted text-xs">
            Stage {(activeOp.currentStageIndex ?? 0) + 1} of {activeOp.stages?.length ?? 3}
          </span>
        </div>
      )}

      {/* Last Result */}
      {lastResult && !isReconciling && (
        <div className="sf-surface-elevated border sf-border-soft rounded-lg p-4 space-y-1">
          <div className="text-[11px] font-bold uppercase tracking-[0.06em] sf-status-text-success">
            Reconciliation Complete
          </div>
          <div className="text-sm sf-text-primary">
            {lastResult.unpublished > 0 && <span>Unpublished {lastResult.unpublished} value{lastResult.unpublished !== 1 ? 's' : ''}. </span>}
            {lastResult.published > 0 && <span>Published {lastResult.published} value{lastResult.published !== 1 ? 's' : ''}. </span>}
            {lastResult.unpublished === 0 && lastResult.published === 0 && <span>No changes needed.</span>}
          </div>
        </div>
      )}

      {/* Reconcile Button */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => reconcileMut.mutate()}
          disabled={isReconciling || !needsAction}
          className="rounded sf-primary-button px-4 py-2 sf-text-label font-semibold transition-colors disabled:opacity-50"
        >
          {isReconciling ? 'Reconciling...' : 'Reconcile'}
        </button>
        {!needsAction && !isReconciling && preview && (
          <span className="sf-text-muted text-xs">No reconciliation needed — all values match current threshold.</span>
        )}
        {reconcileMut.isError && (
          <span className="sf-status-text-danger text-xs">
            {reconcileMut.error instanceof Error ? reconcileMut.error.message : 'Reconciliation failed.'}
          </span>
        )}
      </div>
    </div>
  );
}

function StatBox({ label, value, cls }: { label: string; value: number; cls: string }) {
  return (
    <div className="sf-surface-elevated rounded px-3 py-2 border sf-border-default">
      <div className={`text-lg font-bold font-mono ${cls}`}>{value}</div>
      <div className="text-[10px] font-semibold uppercase tracking-wider sf-text-muted">{label}</div>
    </div>
  );
}
