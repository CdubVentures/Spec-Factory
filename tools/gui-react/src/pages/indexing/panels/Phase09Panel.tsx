import { Tip } from '../../../components/common/Tip';
import { formatNumber } from '../helpers';
import type { RoundSummaryResponse } from '../types';

interface Phase09PanelProps {
  collapsed: boolean;
  onToggle: () => void;
  selectedIndexLabRunId: string;
  roundSummaryResp: RoundSummaryResponse | null | undefined;
}

export function Phase09Panel({
  collapsed,
  onToggle,
  selectedIndexLabRunId,
  roundSummaryResp,
}: Phase09PanelProps) {
  return (
    <div className="sf-surface-panel p-3 space-y-3" style={{ order: 54 }}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center text-sm font-semibold sf-text-primary">
          <button
            onClick={onToggle}
            className="inline-flex items-center justify-center w-5 h-5 mr-1 sf-text-caption sf-icon-button"
            title={collapsed ? 'Open panel' : 'Close panel'}
          >
            {collapsed ? '+' : '-'}
          </button>
          <span>Convergence Round Summary</span>
          <Tip text="Per-round convergence progress: NeedSet size, missing required fields, confidence progression, improvement tracking, and stop reason. Works with single-pass runs (synthesized round 0) and multi-round convergence loops." />
        </div>
        <div className="ml-auto flex items-center gap-2">
          <div className="sf-text-caption sf-text-muted">
            run {selectedIndexLabRunId || '-'} | {roundSummaryResp?.round_count ?? 0} round{(roundSummaryResp?.round_count ?? 0) !== 1 ? 's' : ''}
          </div>
        </div>
      </div>
      {!collapsed ? (() => {
        const rounds = roundSummaryResp?.rounds ?? [];
        const stopReason = roundSummaryResp?.stop_reason ?? null;
        return (
          <>
            <div className="flex flex-wrap items-center gap-2 sf-text-caption">
              <div className="sf-surface-elevated px-2 py-1">
                <div className="sf-text-muted">rounds</div>
                <div className="font-semibold sf-text-primary">{rounds.length}</div>
              </div>
              <div className="sf-surface-elevated px-2 py-1">
                <div className="sf-text-muted">stop reason</div>
                <div className="font-semibold">
                  {stopReason ? (
                    <span className={`px-1.5 py-0.5 rounded ${
                      stopReason === 'complete'
                        ? 'sf-chip-success'
                        : stopReason === 'max_rounds_reached'
                          ? 'sf-chip-warning'
                          : 'sf-chip-danger'
                    }`}>
                      {stopReason}
                    </span>
                  ) : (
                    <span className="sf-text-muted">-</span>
                  )}
                </div>
              </div>
              {rounds.length > 0 && (
                <>
                  <div className="sf-surface-elevated px-2 py-1">
                    <div className="sf-text-muted">final confidence</div>
                    <div className="font-semibold sf-text-primary">{(rounds[rounds.length - 1].confidence * 100).toFixed(1)}%</div>
                  </div>
                  <div className="sf-surface-elevated px-2 py-1">
                    <div className="sf-text-muted">validated</div>
                    <div className="font-semibold">
                      {rounds[rounds.length - 1].validated ? (
                        <span className="px-1.5 py-0.5 rounded sf-chip-success">yes</span>
                      ) : (
                        <span className="px-1.5 py-0.5 rounded sf-chip-neutral">no</span>
                      )}
                    </div>
                  </div>
                </>
              )}
            </div>
            <div className="sf-surface-elevated p-2 overflow-x-auto">
              <div className="sf-table-shell">
              <table className="min-w-full sf-text-caption">
                <thead className="sf-table-head border-b sf-border-soft">
                  <tr>
                    <th className="py-1 pr-3">round</th>
                    <th className="py-1 pr-3">NeedSet size</th>
                    <th className="py-1 pr-3">missing req</th>
                    <th className="py-1 pr-3">critical</th>
                    <th className="py-1 pr-3">confidence</th>
                    <th className="py-1 pr-3">improved</th>
                    <th className="py-1 pr-3">reasons</th>
                  </tr>
                </thead>
                <tbody>
                  {rounds.length === 0 ? (
                    <tr>
                      <td className="py-2 sf-text-muted" colSpan={7}>no round data yet</td>
                    </tr>
                  ) : (
                    rounds.map((row, idx) => {
                      const prevConf = idx > 0 ? rounds[idx - 1].confidence : null;
                      const confDelta = prevConf !== null ? row.confidence - prevConf : null;
                      const prevNeedset = idx > 0 ? rounds[idx - 1].needset_size : null;
                      const needsetDelta = prevNeedset !== null ? row.needset_size - prevNeedset : null;
                      return (
                        <tr key={`phase9-round:${row.round}`} className="sf-table-row border-b sf-border-soft">
                          <td className="py-1 pr-3 font-mono sf-text-primary">{row.round}</td>
                          <td className="py-1 pr-3">
                            {row.needset_size}
                            {needsetDelta !== null && needsetDelta !== 0 && (
                              <span className={`ml-1 ${needsetDelta < 0 ? 'sf-status-text-success' : 'sf-status-text-danger'}`}>
                                {needsetDelta > 0 ? '+' : ''}{needsetDelta}
                              </span>
                            )}
                          </td>
                          <td className="py-1 pr-3">{row.missing_required_count}</td>
                          <td className="py-1 pr-3">{row.critical_count}</td>
                          <td className="py-1 pr-3">
                            <div className="flex items-center gap-1">
                              <div
                                className="w-16 h-2 rounded overflow-hidden"
                                style={{ backgroundColor: 'rgb(var(--sf-color-border-default-rgb) / 0.7)' }}
                              >
                                <div
                                  className="h-full rounded"
                                  style={{
                                    width: `${Math.min(100, row.confidence * 100)}%`,
                                    backgroundColor: row.confidence >= 0.8
                                      ? 'var(--sf-state-success-fg)'
                                      : row.confidence >= 0.5
                                        ? 'var(--sf-state-warning-fg)'
                                        : 'var(--sf-state-danger-fg)',
                                  }}
                                />
                              </div>
                              <span className="sf-text-subtle">{(row.confidence * 100).toFixed(1)}%</span>
                              {confDelta !== null && confDelta !== 0 && (
                                <span className={`${confDelta > 0 ? 'sf-status-text-success' : 'sf-status-text-danger'}`}>
                                  {confDelta > 0 ? '+' : ''}{(confDelta * 100).toFixed(1)}
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="py-1 pr-3">
                            {row.improved ? (
                              <span className="px-1.5 py-0.5 rounded sf-chip-success">yes</span>
                            ) : (
                              <span className="px-1.5 py-0.5 rounded sf-chip-neutral">no</span>
                            )}
                          </td>
                          <td className="py-1 pr-3 font-mono sf-text-caption sf-text-muted">
                            {(row.improvement_reasons || []).join(', ') || '-'}
                          </td>
                        </tr>
                      );
                    })
                )}
              </tbody>
            </table>
            </div>
          </div>
          </>
        );
      })() : null}
    </div>
  );
}
