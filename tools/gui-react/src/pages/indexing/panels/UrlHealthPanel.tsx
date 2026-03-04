import { Tip } from '../../../components/common/Tip';
import { ActivityGauge, formatNumber, formatDuration, formatDateTime, hostBudgetStateBadgeClasses } from '../helpers';
import type {
  IndexingDomainChecklistRow,
  IndexingDomainChecklistRepairRow,
  IndexingDomainChecklistBadPatternRow,
} from '../types';

interface Phase4SummaryShape {
  domains: number;
  err404: number;
  blocked: number;
  dedupeHits: number;
  cooldownsActive: number;
  repeat404Domains: number;
  repeatBlockedDomains: number;
  blockedHosts: number;
  backoffHosts: number;
  avgHostBudget: number;
  repairQueries: number;
  badPatterns: number;
}

interface UrlHealthPanelProps {
  collapsed: boolean;
  onToggle: () => void;
  selectedIndexLabRunId: string;
  phase4StatusLabel: string;
  phase4Activity: { currentPerMin: number; peakPerMin: number };
  processRunning: boolean;
  phase4Summary: Phase4SummaryShape;
  phase4Rows: IndexingDomainChecklistRow[];
  phase4RepairRows: IndexingDomainChecklistRepairRow[];
  phase4BadPatternRows: IndexingDomainChecklistBadPatternRow[];
  activityNowMs: number;
}

export function UrlHealthPanel({
  collapsed,
  onToggle,
  selectedIndexLabRunId,
  phase4StatusLabel,
  phase4Activity,
  processRunning,
  phase4Summary,
  phase4Rows,
  phase4RepairRows,
  phase4BadPatternRows,
  activityNowMs,
}: UrlHealthPanelProps) {
  return (
    <div className="sf-surface-panel p-3 space-y-3" style={{ order: 48 }}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center text-sm font-semibold sf-text-primary">
          <button
            onClick={onToggle}
            className="inline-flex items-center justify-center w-5 h-5 mr-1 sf-text-caption sf-icon-button"
            title={collapsed ? 'Open panel' : 'Close panel'}
          >
            {collapsed ? '+' : '-'}
          </button>
          <span>URL Health & Repair</span>
          <Tip text="404/410/403/429 outcomes, cooldowns, repeat dead patterns, and emitted repair queries." />
        </div>
        <div className="ml-auto flex items-center gap-2">
          <div className="sf-text-caption sf-text-muted">
            run {selectedIndexLabRunId || '-'} | {phase4StatusLabel}
          </div>
          <ActivityGauge
            label="phase 04 activity"
            currentPerMin={phase4Activity.currentPerMin}
            peakPerMin={phase4Activity.peakPerMin}
            active={processRunning}
          />
        </div>
      </div>
      {!collapsed ? (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-10 gap-2 sf-text-caption">
            <div className="sf-surface-elevated px-2 py-1">
              <div className="sf-text-muted flex items-center">domains<Tip text="Distinct domains represented in URL health rows for this run." /></div>
              <div className="font-semibold sf-text-primary">{formatNumber(phase4Summary.domains)}</div>
            </div>
            <div className="sf-surface-elevated px-2 py-1">
              <div className="sf-text-muted flex items-center">404 / 410<Tip text="Not-found outcomes contributing to repair/cooldown logic." /></div>
              <div className="font-semibold sf-text-primary">{formatNumber(phase4Summary.err404)}</div>
            </div>
            <div className="sf-surface-elevated px-2 py-1">
              <div className="sf-text-muted flex items-center">blocked<Tip text="Blocked/forbidden outcomes (for example 403/429/bot blocks)." /></div>
              <div className="font-semibold sf-text-primary">{formatNumber(phase4Summary.blocked)}</div>
            </div>
            <div className="sf-surface-elevated px-2 py-1">
              <div className="sf-text-muted flex items-center">cooldowns active<Tip text="Domains currently under retry cooldown window." /></div>
              <div className="font-semibold sf-text-primary">{formatNumber(phase4Summary.cooldownsActive)}</div>
            </div>
            <div className="sf-surface-elevated px-2 py-1">
              <div className="sf-text-muted flex items-center">avg host budget<Tip text="Average host_budget_score across domain rows (higher is healthier)." /></div>
              <div className="font-semibold sf-text-primary">{phase4Summary.avgHostBudget.toFixed(1)}</div>
            </div>
            <div className="sf-surface-elevated px-2 py-1">
              <div className="sf-text-muted flex items-center">hosts blocked/backoff<Tip text="Count of hosts in blocked state versus backoff state." /></div>
              <div className="font-semibold sf-text-primary">
                {formatNumber(phase4Summary.blockedHosts)} / {formatNumber(phase4Summary.backoffHosts)}
              </div>
            </div>
            <div className="sf-surface-elevated px-2 py-1">
              <div className="sf-text-muted flex items-center">repeat 404 domains<Tip text="Domains repeatedly returning 404/410 for selected URLs." /></div>
              <div className="font-semibold sf-text-primary">{formatNumber(phase4Summary.repeat404Domains)}</div>
            </div>
            <div className="sf-surface-elevated px-2 py-1">
              <div className="sf-text-muted flex items-center">repeat blocked domains<Tip text="Domains repeatedly returning blocked outcomes." /></div>
              <div className="font-semibold sf-text-primary">{formatNumber(phase4Summary.repeatBlockedDomains)}</div>
            </div>
            <div className="sf-surface-elevated px-2 py-1">
              <div className="sf-text-muted flex items-center">repair queries<Tip text="Repair-search queries emitted due to repeated failures or cooldown triggers." /></div>
              <div className="font-semibold sf-text-primary">{formatNumber(phase4Summary.repairQueries)}</div>
            </div>
            <div className="sf-surface-elevated px-2 py-1">
              <div className="sf-text-muted flex items-center">bad url patterns<Tip text="Repeated dead-path patterns captured for future URL rejection/cleanup." /></div>
              <div className="font-semibold sf-text-primary">{formatNumber(phase4Summary.badPatterns)}</div>
            </div>
          </div>
          <div className="sf-surface-elevated p-2 overflow-x-auto">
            <div className="sf-text-caption font-semibold sf-text-primary flex items-center">
              Domain Health ({formatNumber(phase4Rows.length)} rows)
              <Tip text="Per-domain error, dedupe, budget, and cooldown proof rows for Phase 04 logic." />
            </div>
            <div className="mt-2 sf-table-shell">
            <table className="min-w-full sf-text-caption">
              <thead className="sf-table-head border-b sf-border-soft">
                <tr>
                  <th className="py-1 pr-3">domain</th>
                  <th className="py-1 pr-3">kind</th>
                  <th className="py-1 pr-3">status</th>
                  <th className="py-1 pr-3">404</th>
                  <th className="py-1 pr-3">blocked</th>
                  <th className="py-1 pr-3">dedupe</th>
                  <th className="py-1 pr-3">repeat 404</th>
                  <th className="py-1 pr-3">repeat blocked</th>
                  <th className="py-1 pr-3">budget</th>
                  <th className="py-1 pr-3">budget state</th>
                  <th className="py-1 pr-3">cooldown</th>
                  <th className="py-1 pr-3">next retry</th>
                </tr>
              </thead>
              <tbody>
                {phase4Rows.length === 0 && (
                  <tr>
                    <td className="py-2 sf-text-muted" colSpan={12}>no URL health rows yet</td>
                  </tr>
                )}
                {phase4Rows.slice(0, 40).map((row) => (
                  <tr key={`phase4-domain:${row.domain}`} className="sf-table-row border-b sf-border-soft">
                    <td className="py-1 pr-3 font-mono sf-text-primary">{row.domain}</td>
                    <td className="py-1 pr-3 sf-text-subtle">{row.site_kind || '-'}</td>
                    <td className="py-1 pr-3 sf-text-subtle">{row.status || '-'}</td>
                    <td className="py-1 pr-3 sf-text-subtle">{formatNumber(Number(row.err_404 || 0))}</td>
                    <td className="py-1 pr-3 sf-text-subtle">{formatNumber(Number(row.blocked_count || 0))}</td>
                    <td className="py-1 pr-3 sf-text-subtle">{formatNumber(Number(row.dedupe_hits || 0))}</td>
                    <td className="py-1 pr-3 sf-text-subtle">{formatNumber(Number(row.repeat_404_urls || 0))}</td>
                    <td className="py-1 pr-3 sf-text-subtle">{formatNumber(Number(row.repeat_blocked_urls || 0))}</td>
                    <td className="py-1 pr-3 sf-text-subtle">{Number(row.host_budget_score || 0).toFixed(1)}</td>
                    <td className="py-1 pr-3">
                      <span className={`inline-flex items-center rounded px-1.5 py-0.5 ${hostBudgetStateBadgeClasses(String(row.host_budget_state || ''))}`}>
                        {String(row.host_budget_state || '-')}
                      </span>
                    </td>
                    <td className="py-1 pr-3">
                      {(() => {
                        const retryMs = Date.parse(String(row.next_retry_at || ''));
                        const liveSeconds = Number.isFinite(retryMs)
                          ? Math.max(0, Math.ceil((retryMs - activityNowMs) / 1000))
                          : Math.max(0, Number(row.cooldown_seconds_remaining || 0));
                        return liveSeconds > 0 ? formatDuration(liveSeconds * 1000) : '-';
                      })()}
                    </td>
                    <td className="py-1 pr-3">{formatDateTime(row.next_retry_at || null)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          </div>
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-2">
            <div className="sf-surface-elevated p-2 overflow-x-auto">
              <div className="sf-text-caption font-semibold sf-text-primary flex items-center">
                Repair Queries Fired
                <Tip text="Recent repair-search emissions triggered by repeated URL failures." />
              </div>
              <div className="mt-2 sf-table-shell">
              <table className="min-w-full sf-text-caption">
                <thead className="sf-table-head border-b sf-border-soft">
                  <tr>
                    <th className="py-1 pr-3">time</th>
                    <th className="py-1 pr-3">domain</th>
                    <th className="py-1 pr-3">status</th>
                    <th className="py-1 pr-3">reason</th>
                    <th className="py-1 pr-3">query</th>
                  </tr>
                </thead>
                <tbody>
                  {phase4RepairRows.length === 0 && (
                    <tr>
                      <td className="py-2 sf-text-muted" colSpan={5}>no repair queries fired yet</td>
                    </tr>
                  )}
                  {phase4RepairRows.slice(0, 30).map((row, idx) => (
                    <tr key={`phase4-repair:${row.domain}:${row.query}:${idx}`} className="sf-table-row border-b sf-border-soft">
                      <td className="py-1 pr-3 sf-text-subtle">{formatDateTime(row.ts || null)}</td>
                      <td className="py-1 pr-3 font-mono sf-text-primary">{row.domain}</td>
                      <td className="py-1 pr-3 sf-text-subtle">{row.status ? formatNumber(Number(row.status)) : '-'}</td>
                      <td className="py-1 pr-3 sf-text-subtle">{row.reason || '-'}</td>
                      <td className="py-1 pr-3 font-mono sf-text-primary">{row.query}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
            </div>
            <div className="sf-surface-elevated p-2 overflow-x-auto">
              <div className="sf-text-caption font-semibold sf-text-primary flex items-center">
                Bad URL Patterns
                <Tip text="Dead URL patterns detected repeatedly and tracked for future prevention." />
              </div>
              <div className="mt-2 sf-table-shell">
              <table className="min-w-full sf-text-caption">
                <thead className="sf-table-head border-b sf-border-soft">
                  <tr>
                    <th className="py-1 pr-3">domain</th>
                    <th className="py-1 pr-3">path</th>
                    <th className="py-1 pr-3">reason</th>
                    <th className="py-1 pr-3">count</th>
                    <th className="py-1 pr-3">last seen</th>
                  </tr>
                </thead>
                <tbody>
                  {phase4BadPatternRows.length === 0 && (
                    <tr>
                      <td className="py-2 sf-text-muted" colSpan={5}>no repeated dead patterns yet</td>
                    </tr>
                  )}
                  {phase4BadPatternRows.slice(0, 30).map((row) => (
                    <tr key={`phase4-bad-pattern:${row.domain}:${row.path}`} className="sf-table-row border-b sf-border-soft">
                      <td className="py-1 pr-3 font-mono sf-text-primary">{row.domain}</td>
                      <td className="py-1 pr-3 font-mono sf-text-primary">{row.path}</td>
                      <td className="py-1 pr-3 sf-text-subtle">{row.reason || '-'}</td>
                      <td className="py-1 pr-3 sf-text-subtle">{formatNumber(Number(row.count || 0))}</td>
                      <td className="py-1 pr-3 sf-text-subtle">{formatDateTime(row.last_ts || null)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
