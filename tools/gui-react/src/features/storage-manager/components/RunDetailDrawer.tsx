import { useState } from 'react';
import { SectionHeader } from '@/shared/ui/data-display/SectionHeader';
import { Spinner } from '@/shared/ui/feedback/Spinner';
import { useRunDetail } from '../state/useRunDetail.ts';
import { useDeleteRun } from '../state/useStorageActions.ts';
import { DeleteConfirmModal } from './DeleteConfirmModal.tsx';
import type { StorageArtifactBreakdown, StageTimestamp } from '../types.ts';

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** i;
  return `${value < 10 ? value.toFixed(1) : Math.round(value)} ${units[i]}`;
}

function formatStageDuration(stage: StageTimestamp | undefined): string {
  if (!stage?.started_at || !stage?.ended_at) return '--';
  const ms = new Date(stage.ended_at).getTime() - new Date(stage.started_at).getTime();
  if (!Number.isFinite(ms) || ms < 0) return '--';
  const sec = Math.round(ms / 1000);
  return sec >= 60 ? `${Math.floor(sec / 60)}m ${sec % 60}s` : `${sec}s`;
}

function ArtifactRow({ artifact }: { artifact: StorageArtifactBreakdown }) {
  return (
    <tr>
      <td className="py-1 pr-4 font-mono text-xs">{artifact.type}</td>
      <td className="py-1 pr-4 text-xs text-right">{artifact.count} files</td>
      <td className="py-1 text-xs text-right">{formatBytes(artifact.size_bytes)}</td>
    </tr>
  );
}

interface RunDetailDrawerProps {
  runId: string;
}

export function RunDetailDrawer({ runId }: RunDetailDrawerProps) {
  const { data, isLoading, error } = useRunDetail(runId);
  const deleteRun = useDeleteRun();
  const [showDeleteModal, setShowDeleteModal] = useState(false);

  if (isLoading) {
    return (
      <div className="px-6 py-4 flex items-center gap-2 sf-text-muted">
        <Spinner className="h-4 w-4" />
        <span className="text-sm">Loading run details...</span>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="px-6 py-4 text-sm sf-status-text-danger">
        Failed to load run details.
      </div>
    );
  }

  const metrics = data.storage_metrics;
  const counters = data.counters;
  const stages = data.stages;

  return (
    <div className="px-6 py-4 space-y-4 sf-surface-base">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div>
          <SectionHeader>Run Info</SectionHeader>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-xs mt-2">
            <dt className="sf-text-muted">Run ID</dt>
            <dd className="font-mono">{data.run_id}</dd>
            <dt className="sf-text-muted">Category</dt>
            <dd>{data.category}</dd>
            <dt className="sf-text-muted">Product</dt>
            <dd>{data.product_id}</dd>
            <dt className="sf-text-muted">Status</dt>
            <dd>{data.status}</dd>
            <dt className="sf-text-muted">Started</dt>
            <dd>{data.started_at}</dd>
            <dt className="sf-text-muted">Ended</dt>
            <dd>{data.ended_at}</dd>
            {data.dedupe_mode && (
              <>
                <dt className="sf-text-muted">Dedupe</dt>
                <dd className="font-mono">{data.dedupe_mode}</dd>
              </>
            )}
            {data.phase_cursor && (
              <>
                <dt className="sf-text-muted">Phase</dt>
                <dd className="font-mono">{data.phase_cursor}</dd>
              </>
            )}
          </dl>
        </div>

        <div>
          <SectionHeader>Counters</SectionHeader>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-xs mt-2">
            <dt className="sf-text-muted">Pages Checked</dt>
            <dd>{counters?.pages_checked ?? '--'}</dd>
            <dt className="sf-text-muted">Fetched OK</dt>
            <dd>{counters?.fetched_ok ?? '--'}</dd>
            <dt className="sf-text-muted">Parse Completed</dt>
            <dd>{counters?.parse_completed ?? '--'}</dd>
            <dt className="sf-text-muted">Indexed Docs</dt>
            <dd>{counters?.indexed_docs ?? '--'}</dd>
            <dt className="sf-text-muted">Fields Filled</dt>
            <dd>{counters?.fields_filled ?? '--'}</dd>
          </dl>
        </div>

        <div>
          <SectionHeader>Stage Timing</SectionHeader>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-xs mt-2">
            <dt className="sf-text-muted">Search</dt>
            <dd>{formatStageDuration(stages?.search)}</dd>
            <dt className="sf-text-muted">Fetch</dt>
            <dd>{formatStageDuration(stages?.fetch)}</dd>
            <dt className="sf-text-muted">Parse</dt>
            <dd>{formatStageDuration(stages?.parse)}</dd>
            <dt className="sf-text-muted">Index</dt>
            <dd>{formatStageDuration(stages?.index)}</dd>
          </dl>
        </div>
      </div>

      {metrics && metrics.artifact_breakdown.length > 0 && (
        <div>
          <SectionHeader>Storage Breakdown</SectionHeader>
          <table className="w-full mt-2">
            <thead>
              <tr className="text-[10px] uppercase tracking-wider sf-text-muted">
                <th className="text-left py-1 pr-4">Type</th>
                <th className="text-right py-1 pr-4">Files</th>
                <th className="text-right py-1">Size</th>
              </tr>
            </thead>
            <tbody>
              {metrics.artifact_breakdown.map((artifact) => (
                <ArtifactRow key={artifact.type} artifact={artifact} />
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t sf-border-soft font-semibold text-xs">
                <td className="py-1 pr-4">Total</td>
                <td className="py-1 pr-4 text-right">
                  {metrics.artifact_breakdown.reduce((s, a) => s + a.count, 0)} files
                </td>
                <td className="py-1 text-right">{formatBytes(metrics.total_size_bytes)}</td>
              </tr>
            </tfoot>
          </table>
          <p className="text-[10px] sf-text-muted mt-1">
            Computed at: {metrics.computed_at}
          </p>
        </div>
      )}

      {!metrics && (
        <p className="text-xs sf-text-muted">
          No storage metrics available. Click Recalculate to compute.
        </p>
      )}

      <div className="flex items-center gap-2 pt-2 border-t sf-border-soft">
        <button
          type="button"
          className="rounded bg-red-600 text-white px-3 py-1.5 text-xs font-semibold hover:bg-red-700 disabled:opacity-50"
          disabled={deleteRun.isPending}
          onClick={() => setShowDeleteModal(true)}
        >
          Delete This Run
        </button>
      </div>

      {showDeleteModal && (
        <DeleteConfirmModal
          runIds={[runId]}
          onConfirm={() => {
            deleteRun.mutate(runId, {
              onSuccess: () => setShowDeleteModal(false),
            });
          }}
          onCancel={() => setShowDeleteModal(false)}
          isPending={deleteRun.isPending}
        />
      )}
    </div>
  );
}
