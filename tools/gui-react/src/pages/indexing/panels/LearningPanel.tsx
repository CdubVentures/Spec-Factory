import { Tip } from '../../../components/common/Tip';
import type { LearningFeedResponse } from '../../../types/learning';

interface LearningPanelProps {
  collapsed: boolean;
  onToggle: () => void;
  selectedIndexLabRunId: string;
  learningFeedResp: LearningFeedResponse | null | undefined;
}

function confidenceFillColor(confidence: number): string {
  if (confidence >= 0.85) return 'var(--sf-state-success-fg)';
  if (confidence >= 0.6) return 'var(--sf-state-warning-fg)';
  return 'var(--sf-state-danger-fg)';
}

function reasonChipClass(reason: string): string {
  const token = reason.toLowerCase();
  if (token.includes('missing') || token.includes('insufficient') || token.includes('low')) return 'sf-chip-warning';
  if (token.includes('reject') || token.includes('error') || token.includes('invalid')) return 'sf-chip-danger';
  return 'sf-chip-neutral';
}

export function LearningPanel({
  collapsed,
  onToggle,
  selectedIndexLabRunId,
  learningFeedResp,
}: LearningPanelProps) {
  return (
    <div className="sf-surface-panel p-3 space-y-3" style={{ order: 55 }}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center text-sm font-semibold sf-text-primary">
          <button
            onClick={onToggle}
            className="inline-flex items-center justify-center w-5 h-5 mr-1 sf-text-caption sf-icon-button"
            title={collapsed ? 'Open panel' : 'Close panel'}
          >
            {collapsed ? '+' : '-'}
          </button>
          <span>Learning Feed</span>
          <Tip text="Acceptance-gated learning updates: which field values passed confidence, evidence, and tier gates for compounding into future runs." />
        </div>
        <div className="ml-auto flex items-center gap-2 sf-text-caption sf-text-muted">
          run {selectedIndexLabRunId || '-'} | {learningFeedResp?.gate_summary?.total ?? 0} evaluated | {learningFeedResp?.gate_summary?.accepted ?? 0} accepted
        </div>
      </div>
      {!collapsed ? (() => {
        const updates = learningFeedResp?.updates ?? [];
        const summary = learningFeedResp?.gate_summary;
        const rejReasons = summary?.rejection_reasons ?? {};
        if (!updates.length) {
          return (
            <div className="sf-text-caption sf-text-muted italic py-4 text-center">
              No learning gate results yet for this run.
            </div>
          );
        }
        return (
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2 sf-text-caption font-medium">
              <div className="px-2 py-1 sf-chip-neutral">Total: {summary?.total ?? 0}</div>
              <div className="px-2 py-1 sf-chip-success">Accepted: {summary?.accepted ?? 0}</div>
              <div className="px-2 py-1 sf-chip-danger">Rejected: {summary?.rejected ?? 0}</div>
              {Object.entries(rejReasons).map(([reason, count]) => (
                <div key={reason} className={`px-2 py-1 sf-text-caption ${reasonChipClass(reason)}`}>
                  {reason}: {count as number}
                </div>
              ))}
            </div>
            <div className="overflow-x-auto sf-table-shell">
              <table className="min-w-full sf-text-caption">
                <thead className="sf-table-head border-b sf-border-soft">
                  <tr>
                    <th className="py-1 pr-3 sf-table-head-cell">Field</th>
                    <th className="py-1 pr-3 sf-table-head-cell">Value</th>
                    <th className="py-1 pr-3 sf-table-head-cell">Confidence</th>
                    <th className="py-1 pr-3 sf-table-head-cell">Refs</th>
                    <th className="py-1 pr-3 sf-table-head-cell">Tiers</th>
                    <th className="py-1 pr-3 sf-table-head-cell">Status</th>
                    <th className="py-1 pr-3 sf-table-head-cell">Reason</th>
                  </tr>
                </thead>
                <tbody>
                  {updates.map((u, i) => {
                    const confidencePercent = Math.round(u.confidence * 100);
                    return (
                      <tr key={`${u.field}-${i}`} className="sf-table-row border-b sf-border-soft">
                        <td className="py-1 pr-3 font-mono sf-text-primary">{u.field}</td>
                        <td className="py-1 pr-3 sf-text-subtle max-w-[200px] truncate" title={u.value}>{u.value}</td>
                        <td className="py-1 pr-3">
                          <div className="flex items-center gap-1">
                            <div
                              className="w-16 h-2 overflow-hidden"
                              style={{
                                borderRadius: 'var(--sf-radius-sm)',
                                backgroundColor: 'rgb(var(--sf-color-border-default-rgb) / 0.7)',
                              }}
                            >
                              <div
                                className="h-full"
                                style={{
                                  width: `${confidencePercent}%`,
                                  borderRadius: 'var(--sf-radius-sm)',
                                  backgroundColor: confidenceFillColor(u.confidence),
                                }}
                              />
                            </div>
                            <span className="sf-text-muted">{confidencePercent}%</span>
                          </div>
                        </td>
                        <td className="py-1 pr-3 sf-text-muted">{u.refs_found}</td>
                        <td className="py-1 pr-3 sf-text-muted">{(u.tier_history || []).join(', ') || '-'}</td>
                        <td className="py-1 pr-3">
                          <span className={`inline-block px-1.5 py-0.5 sf-text-caption font-medium ${u.accepted ? 'sf-chip-success' : 'sf-chip-danger'}`}>
                            {u.accepted ? 'accepted' : 'rejected'}
                          </span>
                        </td>
                        <td className="py-1 pr-3 sf-text-muted">{u.reason || '-'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        );
      })() : null}
    </div>
  );
}
