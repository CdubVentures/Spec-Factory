import { Tip } from '../../../components/common/Tip';
import { ActivityGauge, formatNumber } from '../helpers';
import type { IndexLabPhase08BatchRow, IndexLabPhase08FieldContextRow, IndexLabPhase08PrimeRow } from '../types';

interface Phase08PanelProps {
  collapsed: boolean;
  onToggle: () => void;
  selectedIndexLabRunId: string;
  phase8StatusLabel: string;
  phase8Activity: { currentPerMin: number; peakPerMin: number };
  processRunning: boolean;
  phase8Summary: {
    batchCount: number;
    batchErrorCount: number;
    schemaFailRate: number;
    rawCandidateCount: number;
    acceptedCandidateCount: number;
    danglingRefCount: number;
    danglingRefRate: number;
    policyViolationCount: number;
    policyViolationRate: number;
    minRefsSatisfied: number;
    minRefsTotal: number;
    minRefsSatisfiedRate: number;
    validatorContextFields: number;
    validatorPrimeRows: number;
  };
  phase8Batches: IndexLabPhase08BatchRow[];
  phase8FieldContextRows: IndexLabPhase08FieldContextRow[];
  phase8PrimeRows: IndexLabPhase08PrimeRow[];
}

export function Phase08Panel({
  collapsed,
  onToggle,
  selectedIndexLabRunId,
  phase8StatusLabel,
  phase8Activity,
  processRunning,
  phase8Summary,
  phase8Batches,
  phase8FieldContextRows,
  phase8PrimeRows,
}: Phase08PanelProps) {
  return (
    <div className="sf-surface-panel p-3 space-y-3" style={{ order: 53 }}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center text-sm font-semibold sf-text-primary">
          <button
            onClick={onToggle}
            className="inline-flex items-center justify-center w-5 h-5 mr-1 sf-text-caption sf-icon-button"
            title={collapsed ? 'Open panel' : 'Close panel'}
          >
            {collapsed ? '+' : '-'}
          </button>
          <span>Extraction Context Matrix</span>
          <Tip text="Batch-level extraction context wiring proof: policy-aware prompt assembly, snippet reference integrity, and min-refs compliance rates." />
        </div>
        <div className="ml-auto flex items-center gap-2">
          <div className="sf-text-caption sf-text-muted">
            run {selectedIndexLabRunId || '-'} | {phase8StatusLabel}
          </div>
          <ActivityGauge
            label="phase 08 activity"
            currentPerMin={phase8Activity.currentPerMin}
            peakPerMin={phase8Activity.peakPerMin}
            active={processRunning}
          />
        </div>
      </div>
      {!collapsed ? (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-8 gap-2 sf-text-caption">
            <div className="sf-surface-elevated px-2 py-1">
              <div className="sf-text-muted flex items-center">batches<Tip text="Total extraction batches executed or skipped in this run." /></div>
              <div className="font-semibold sf-text-primary">{formatNumber(phase8Summary.batchCount)}</div>
            </div>
            <div className="sf-surface-elevated px-2 py-1">
              <div className="sf-text-muted flex items-center">batch errors<Tip text="Batches that failed before producing valid structured extraction output." /></div>
              <div className="font-semibold sf-text-primary">{formatNumber(phase8Summary.batchErrorCount)}</div>
            </div>
            <div className="sf-surface-elevated px-2 py-1">
              <div className="sf-text-muted flex items-center">schema fail rate<Tip text="Failed batch ratio across all Phase 08 extraction batches." /></div>
              <div className="font-semibold sf-text-primary">{formatNumber(phase8Summary.schemaFailRate * 100, 2)}%</div>
            </div>
            <div className="sf-surface-elevated px-2 py-1">
              <div className="sf-text-muted flex items-center">raw candidates<Tip text="Candidate rows returned before evidence/policy filtering." /></div>
              <div className="font-semibold sf-text-primary">{formatNumber(phase8Summary.rawCandidateCount)}</div>
            </div>
            <div className="sf-surface-elevated px-2 py-1">
              <div className="sf-text-muted flex items-center">accepted<Tip text="Candidate rows accepted after schema and evidence reference checks." /></div>
              <div className="font-semibold sf-text-primary">{formatNumber(phase8Summary.acceptedCandidateCount)}</div>
            </div>
            <div className="sf-surface-elevated px-2 py-1">
              <div className="sf-text-muted flex items-center">dangling refs<Tip text="Candidates dropped because evidence refs did not resolve to provided snippet ids." /></div>
              <div className="font-semibold sf-text-primary">{formatNumber(phase8Summary.danglingRefCount)}</div>
            </div>
            <div className="sf-surface-elevated px-2 py-1">
              <div className="sf-text-muted flex items-center">policy violations<Tip text="Rows dropped by missing refs, dangling refs, or evidence verifier failures." /></div>
              <div className="font-semibold sf-text-primary">{formatNumber(phase8Summary.policyViolationCount)}</div>
            </div>
            <div className="sf-surface-elevated px-2 py-1">
              <div className="sf-text-muted flex items-center">min refs satisfied<Tip text="Accepted candidate rows meeting field-level min_evidence_refs thresholds." /></div>
              <div className="font-semibold sf-text-primary">
                {formatNumber(phase8Summary.minRefsSatisfied)}/{formatNumber(phase8Summary.minRefsTotal)}
              </div>
            </div>
          </div>
          <div className="sf-surface-elevated p-2 overflow-x-auto">
            <div className="sf-text-caption font-semibold sf-text-primary flex items-center">
              Extraction Batches ({formatNumber(phase8Batches.length)} rows)
              <Tip text="Batch-by-batch extraction outcomes showing context usage, candidate filtering, and policy pass counters." />
            </div>
            <div className="mt-2 sf-table-shell">
            <table className="min-w-full sf-text-caption">
              <thead className="sf-table-head border-b sf-border-soft">
                <tr>
                  <th className="py-1 pr-3">batch</th>
                  <th className="py-1 pr-3">status</th>
                  <th className="py-1 pr-3">model</th>
                  <th className="py-1 pr-3">counts</th>
                  <th className="py-1 pr-3">drops</th>
                  <th className="py-1 pr-3">min refs</th>
                  <th className="py-1 pr-3">ms</th>
                  <th className="py-1 pr-3">source</th>
                </tr>
              </thead>
              <tbody>
                {phase8Batches.length === 0 ? (
                  <tr>
                    <td className="py-2 sf-text-muted" colSpan={8}>no phase 08 batch rows yet</td>
                  </tr>
                ) : (
                  phase8Batches.slice(0, 80).map((row, idx) => (
                    <tr key={`phase8-batch:${row.batch_id || idx}:${idx}`} className="sf-table-row border-b sf-border-soft">
                      <td className="py-1 pr-3 font-mono sf-text-primary">{row.batch_id || '-'}</td>
                      <td className="py-1 pr-3">
                        <span className={`px-1.5 py-0.5 rounded ${
                          String(row.status || '').includes('failed')
                            ? 'sf-chip-danger'
                            : (String(row.status || '').includes('completed')
                              ? 'sf-chip-success'
                              : 'sf-chip-neutral')
                        }`}>
                          {row.status || '-'}
                        </span>
                      </td>
                      <td className="py-1 pr-3 font-mono sf-text-primary truncate max-w-[12rem]" title={row.model || ''}>{row.model || '-'}</td>
                      <td className="py-1 pr-3 sf-text-subtle">
                        f:{formatNumber(Number(row.target_field_count || 0))}
                        {' '}s:{formatNumber(Number(row.snippet_count || 0))}
                        {' '}a:{formatNumber(Number(row.accepted_candidate_count || 0))}
                      </td>
                      <td className="py-1 pr-3 sf-text-subtle">
                        miss:{formatNumber(Number(row.dropped_missing_refs || 0))}
                        {' '}dang:{formatNumber(Number(row.dropped_invalid_refs || 0))}
                      </td>
                      <td className="py-1 pr-3 sf-text-subtle">
                        {formatNumber(Number(row.min_refs_satisfied_count || 0))}/{formatNumber(Number(row.min_refs_total || 0))}
                      </td>
                      <td className="py-1 pr-3 sf-text-subtle">{formatNumber(Number(row.elapsed_ms || 0))}</td>
                      <td className="py-1 pr-3 font-mono sf-text-primary truncate max-w-[14rem]" title={row.source_url || row.source_host || ''}>{row.source_host || '-'}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
            </div>
          </div>
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-2">
            <div className="sf-surface-elevated p-2 overflow-x-auto">
              <div className="sf-text-caption font-semibold sf-text-primary flex items-center">
                Field Contexts ({formatNumber(phase8FieldContextRows.length)} rows)
                <Tip text="Prompt-time field context matrix: required level, parse template intent, and evidence policy per field." />
              </div>
              <div className="mt-2 sf-table-shell">
              <table className="min-w-full sf-text-caption">
                <thead className="sf-table-head border-b sf-border-soft">
                  <tr>
                    <th className="py-1 pr-3">field</th>
                    <th className="py-1 pr-3">level</th>
                    <th className="py-1 pr-3">difficulty</th>
                    <th className="py-1 pr-3">ai</th>
                    <th className="py-1 pr-3">parse</th>
                    <th className="py-1 pr-3">policy</th>
                  </tr>
                </thead>
                <tbody>
                  {phase8FieldContextRows.length === 0 ? (
                    <tr>
                      <td className="py-2 sf-text-muted" colSpan={6}>no field context rows yet</td>
                    </tr>
                  ) : (
                    phase8FieldContextRows.slice(0, 60).map((row) => (
                      <tr key={`phase8-fieldctx:${row.field_key || '-'}`} className="sf-table-row border-b sf-border-soft">
                        <td className="py-1 pr-3 font-mono sf-text-primary">{row.field_key || '-'}</td>
                        <td className="py-1 pr-3 sf-text-subtle">{row.required_level || '-'}</td>
                        <td className="py-1 pr-3 sf-text-subtle">{row.difficulty || '-'}</td>
                        <td className="py-1 pr-3 sf-text-subtle">{row.ai_mode || '-'}</td>
                        <td className="py-1 pr-3 font-mono sf-text-primary">{row.parse_template_intent?.template_id || '-'}</td>
                        <td className="py-1 pr-3 sf-text-subtle">
                          min:{formatNumber(Number(row.evidence_policy?.min_evidence_refs || 1))}
                          {row.evidence_policy?.distinct_sources_required ? ' | distinct' : ''}
                        </td>
                      </tr>
                    ))
                )}
              </tbody>
            </table>
            </div>
            </div>
            <div className="sf-surface-elevated p-2 overflow-x-auto">
              <div className="sf-text-caption font-semibold sf-text-primary flex items-center">
                Prime Snippet Pack ({formatNumber(phase8PrimeRows.length)} rows)
                <Tip text="Prime snippet rows attached through Phase 08 context for extraction and validator review." />
              </div>
              <div className="mt-2 sf-table-shell">
              <table className="min-w-full sf-text-caption">
                <thead className="sf-table-head border-b sf-border-soft">
                  <tr>
                    <th className="py-1 pr-3">field</th>
                    <th className="py-1 pr-3">snippet</th>
                    <th className="py-1 pr-3">source</th>
                    <th className="py-1 pr-3">quote</th>
                  </tr>
                </thead>
                <tbody>
                  {phase8PrimeRows.length === 0 ? (
                    <tr>
                      <td className="py-2 sf-text-muted" colSpan={4}>no prime snippet rows yet</td>
                    </tr>
                  ) : (
                    phase8PrimeRows.slice(0, 60).map((row, idx) => (
                      <tr key={`phase8-prime:${row.field_key || ''}:${row.snippet_id || idx}`} className="sf-table-row border-b sf-border-soft">
                        <td className="py-1 pr-3 font-mono sf-text-primary">{row.field_key || '-'}</td>
                        <td className="py-1 pr-3 font-mono sf-text-primary">{row.snippet_id || '-'}</td>
                        <td className="py-1 pr-3 font-mono sf-text-primary truncate max-w-[14rem]" title={row.url || row.source_id || ''}>
                          {row.source_id || row.url || '-'}
                        </td>
                        <td className="py-1 pr-3 sf-text-subtle">
                          <div className="truncate max-w-[24rem]" title={row.quote_preview || ''}>
                            {row.quote_preview || '-'}
                          </div>
                        </td>
                      </tr>
                    ))
                )}
              </tbody>
            </table>
            </div>
            </div>
          </div>
          <div className="sf-text-caption sf-text-muted">
            validator context fields: {formatNumber(phase8Summary.validatorContextFields)} | validator prime rows: {formatNumber(phase8Summary.validatorPrimeRows)}
          </div>
        </>
      ) : null}
    </div>
  );
}
