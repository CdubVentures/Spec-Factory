import { Tip } from '../../../components/common/Tip';
import { formatNumber, formatDateTime } from '../helpers';
import type { IndexLabSerpExplorerResponse, IndexLabSerpQueryRow } from '../types';

interface SerpExplorerPanelProps {
  collapsed: boolean;
  onToggle: () => void;
  indexlabSerpExplorer: IndexLabSerpExplorerResponse | null;
  indexlabSerpRows: IndexLabSerpQueryRow[];
  phase3StatusLabel: string;
}

export function SerpExplorerPanel({
  collapsed,
  onToggle,
  indexlabSerpExplorer,
  indexlabSerpRows,
  phase3StatusLabel,
}: SerpExplorerPanelProps) {
  return (
    <div className="sf-surface-panel p-3 space-y-3" style={{ order: 47 }}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center text-sm font-semibold sf-text-primary">
          <button
            onClick={onToggle}
            className="inline-flex items-center justify-center w-5 h-5 mr-1 sf-text-caption sf-icon-button"
            title={collapsed ? 'Open panel' : 'Close panel'}
          >
            {collapsed ? '+' : '-'}
          </button>
          <span>SERP Explorer</span>
          <Tip text="Per-query candidate URLs with tier/doc_kind tags and triage decision proof." />
        </div>
        <div className="sf-text-caption sf-text-muted">
          {indexlabSerpExplorer
            ? `${indexlabSerpExplorer.provider || 'unknown'}${indexlabSerpExplorer.summary_only ? ' | summary fallback' : ''}`
            : 'not generated'}
        </div>
      </div>
      {!collapsed && indexlabSerpExplorer ? (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 sf-text-caption">
            <div className="sf-surface-elevated px-2 py-1">
              <div className="sf-text-muted">candidates checked</div>
              <div className="font-semibold">{formatNumber(Number(indexlabSerpExplorer.candidates_checked || 0))}</div>
            </div>
            <div className="sf-surface-elevated px-2 py-1">
              <div className="sf-text-muted">urls triaged</div>
              <div className="font-semibold">{formatNumber(Number(indexlabSerpExplorer.urls_triaged || 0))}</div>
            </div>
            <div className="sf-surface-elevated px-2 py-1">
              <div className="sf-text-muted">urls selected</div>
              <div className="font-semibold">{formatNumber(Number(indexlabSerpExplorer.urls_selected || 0))}</div>
            </div>
            <div className="sf-surface-elevated px-2 py-1">
              <div className="sf-text-muted">duplicates removed</div>
              <div className="font-semibold">{formatNumber(Number(indexlabSerpExplorer.duplicates_removed || 0))}</div>
            </div>
          </div>
          <div className="sf-text-caption sf-text-muted">
            generated {formatDateTime(indexlabSerpExplorer.generated_at || null)}
            {' '}| queries {formatNumber(indexlabSerpRows.length)}
            {' '}| llm triage {indexlabSerpExplorer.llm_triage_enabled ? 'enabled' : 'off'}
            {indexlabSerpExplorer.llm_triage_model ? ` (${indexlabSerpExplorer.llm_triage_model})` : ''}
          </div>
          <div className="space-y-2">
            {indexlabSerpRows.length === 0 ? (
              <div className="sf-text-caption sf-text-muted">no SERP rows yet</div>
            ) : (
              indexlabSerpRows.slice(0, 16).map((row) => (
                <div key={row.query} className="sf-surface-elevated p-2 overflow-x-auto">
                  <div className="sf-text-caption font-semibold sf-text-primary font-mono truncate" title={row.query}>
                    {row.query}
                  </div>
                  <div className="mt-1 sf-text-label sf-text-muted">
                    hint {row.hint_source || '-'} | doc {row.doc_hint || '-'} | targets {(row.target_fields || []).join(', ') || '-'} | selected {formatNumber(Number(row.selected_count || 0))}/{formatNumber(Number(row.candidate_count || 0))}
                  </div>
                  <div className="mt-2 sf-table-shell">
                  <table className="min-w-full sf-text-caption">
                    <thead className="sf-table-head border-b sf-border-soft">
                      <tr>
                        <th className="py-1 pr-3">url</th>
                        <th className="py-1 pr-3">tier</th>
                        <th className="py-1 pr-3">doc kind</th>
                        <th className="py-1 pr-3">score</th>
                        <th className="py-1 pr-3">decision</th>
                        <th className="py-1 pr-3">reasons</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(row.candidates || []).length === 0 ? (
                        <tr>
                          <td className="py-2 sf-text-muted" colSpan={6}>no candidates</td>
                        </tr>
                      ) : (
                        (row.candidates || []).slice(0, 12).map((candidate) => (
                          <tr key={`${row.query}:${candidate.url}`} className="sf-table-row border-b sf-border-soft">
                            <td className="py-1 pr-3 font-mono truncate max-w-[32rem]" title={candidate.url}>
                              {candidate.url}
                            </td>
                            <td className="py-1 pr-3">
                              {candidate.tier_name || (Number.isFinite(Number(candidate.tier)) ? `tier ${candidate.tier}` : '-')}
                            </td>
                            <td className="py-1 pr-3">{candidate.doc_kind || '-'}</td>
                            <td className="py-1 pr-3">{formatNumber(Number(candidate.triage_score || 0), 3)}</td>
                            <td className="py-1 pr-3">
                              <span className={`px-1.5 py-0.5 rounded ${
                                candidate.decision === 'selected'
                                  ? 'sf-chip-success'
                                  : candidate.decision === 'rejected'
                                    ? 'sf-chip-danger'
                                    : 'sf-chip-neutral'
                              }`}>
                                {candidate.decision || 'pending'}
                              </span>
                            </td>
                            <td className="py-1 pr-3">
                              <div className="flex flex-wrap gap-1">
                                {(candidate.reason_codes || []).slice(0, 4).map((reason) => (
                                  <span key={`${candidate.url}:${reason}`} className="px-1.5 py-0.5 rounded sf-chip-neutral">
                                    {reason}
                                  </span>
                                ))}
                              </div>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                  </div>
                </div>
              ))
            )}
          </div>
        </>
      ) : !collapsed ? (
        <div className="sf-text-caption sf-text-muted">
          no SERP payload yet for this run ({phase3StatusLabel}).
        </div>
      ) : null}
    </div>
  );
}
