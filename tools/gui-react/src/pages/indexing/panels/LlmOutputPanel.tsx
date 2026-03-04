import { Tip } from '../../../components/common/Tip';
import {
  formatNumber,
  formatDateTime,
  llmPhaseLabel,
  llmPhaseBadgeClasses,
  panelStateChipClasses,
  prettyJsonText,
} from '../helpers';
import type {
  IndexLabSearchProfileResponse,
  IndexLabLlmTraceRow,
  IndexLabLlmTracesResponse,
} from '../types';

interface LlmOutputCandidateRow {
  query: string;
  url: string;
  doc_kind: string;
  tier_name?: string;
  score: number;
  reason_codes: string[];
}

interface DocHintRow {
  doc_hint: string;
  queries: string[];
}

interface FieldQueryRow {
  field: string;
  queries: string[];
  isFocus: boolean;
}

interface Phase3Status {
  state: string;
  label: string;
  message: string;
}

interface LlmOutputPanelProps {
  collapsed: boolean;
  onToggle: () => void;
  selectedIndexLabRunId: string;
  indexlabSearchProfile: IndexLabSearchProfileResponse | null;
  llmOutputSelectedCandidates: LlmOutputCandidateRow[];
  llmOutputRejectedCandidates: LlmOutputCandidateRow[];
  llmOutputDocHintRows: DocHintRow[];
  llmOutputFieldQueryRows: FieldQueryRow[];
  phase3Status: Phase3Status;
  indexlabLlmTracesResp: IndexLabLlmTracesResponse | null | undefined;
  llmTraceRows: IndexLabLlmTraceRow[];
  selectedLlmTrace: IndexLabLlmTraceRow | null;
  onTraceSelect: (id: string) => void;
}

export function LlmOutputPanel({
  collapsed,
  onToggle,
  selectedIndexLabRunId,
  indexlabSearchProfile,
  llmOutputSelectedCandidates,
  llmOutputRejectedCandidates,
  llmOutputDocHintRows,
  llmOutputFieldQueryRows,
  phase3Status,
  indexlabLlmTracesResp,
  llmTraceRows,
  selectedLlmTrace,
  onTraceSelect,
}: LlmOutputPanelProps) {
  return (
    <div className="sf-surface-panel p-3 space-y-3" style={{ order: 80 }}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center text-sm font-semibold sf-text-primary">
          <button
            onClick={onToggle}
            className="inline-flex items-center justify-center w-5 h-5 mr-1 sf-text-caption sf-icon-button"
            title={collapsed ? 'Open panel' : 'Close panel'}
          >
            {collapsed ? '+' : '-'}
          </button>
          <span>LLM Output Review (All Phases)</span>
          <Tip text="Readable review of SearchProfile + SERP triage + raw traced LLM calls across all phases." />
        </div>
        <div className="text-xs sf-text-muted">
          run {selectedIndexLabRunId || '-'}
        </div>
      </div>
      {!collapsed ? (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
            <div className="sf-surface-elevated px-2 py-1">
              <div className="sf-text-muted">aliases</div>
              <div className="font-semibold">{formatNumber((indexlabSearchProfile?.identity_aliases || []).length)}</div>
            </div>
            <div className="sf-surface-elevated px-2 py-1">
              <div className="sf-text-muted">negative terms</div>
              <div className="font-semibold">{formatNumber((indexlabSearchProfile?.negative_terms || []).length)}</div>
            </div>
            <div className="sf-surface-elevated px-2 py-1">
              <div className="sf-text-muted">top K selected</div>
              <div className="font-semibold">{formatNumber(llmOutputSelectedCandidates.length)}</div>
            </div>
            <div className="sf-surface-elevated px-2 py-1">
              <div className="sf-text-muted">junk/wrong-model skips</div>
              <div className="font-semibold">{formatNumber(llmOutputRejectedCandidates.length)}</div>
            </div>
          </div>

          <div className="sf-surface-elevated p-2 text-xs">
            <div className="font-semibold sf-text-primary">SearchProfile JSON</div>
            <div className="mt-1 sf-text-muted">
              Strict output review: identity aliases, negative terms, doc_hint templates, and field-target query variants.
            </div>
            <div className="mt-2">
              <div className="sf-text-muted">identity aliases</div>
              <div className="mt-1 flex flex-wrap gap-1">
                {(indexlabSearchProfile?.identity_aliases || []).length === 0 ? (
                  <span className="sf-text-muted">no aliases</span>
                ) : (
                  (indexlabSearchProfile?.identity_aliases || []).slice(0, 24).map((row) => (
                    <span key={`llm-out-alias:${row.alias}`} className="px-1.5 py-0.5 sf-chip-info">
                      {row.alias}
                      {row.source ? ` (${row.source})` : ''}
                    </span>
                  ))
                )}
              </div>
            </div>
            <div className="mt-2">
              <div className="sf-text-muted">negative terms</div>
              <div className="mt-1 flex flex-wrap gap-1">
                {(indexlabSearchProfile?.negative_terms || []).length === 0 ? (
                  <span className="sf-text-muted">no negative terms</span>
                ) : (
                  (indexlabSearchProfile?.negative_terms || []).slice(0, 24).map((token) => (
                    <span key={`llm-out-neg:${token}`} className="px-1.5 py-0.5 sf-chip-danger">
                      {token}
                    </span>
                  ))
                )}
              </div>
            </div>
            <div className="mt-2 grid grid-cols-1 xl:grid-cols-2 gap-2">
              <div className="sf-surface-elevated p-2 overflow-x-auto">
                <div className="font-semibold sf-text-primary">doc_hint query templates</div>
                <table className="mt-2 min-w-full text-xs sf-table-shell">
                  <thead>
                    <tr className="sf-table-head border-b sf-border-soft">
                      <th className="sf-table-head-cell">doc hint</th>
                      <th className="sf-table-head-cell">queries</th>
                    </tr>
                  </thead>
                  <tbody>
                    {llmOutputDocHintRows.length === 0 && (
                      <tr>
                        <td className="py-2 sf-table-empty-state" colSpan={2}>no doc_hint templates</td>
                      </tr>
                    )}
                    {llmOutputDocHintRows.slice(0, 20).map((row) => (
                      <tr key={`llm-out-doc:${row.doc_hint}`} className="sf-table-row border-b sf-border-soft">
                        <td className="py-1 pr-3">{row.doc_hint || '-'}</td>
                        <td className="py-1 pr-3">{(row.queries || []).slice(0, 3).join(' | ') || '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="sf-surface-elevated p-2 overflow-x-auto">
                <div className="font-semibold sf-text-primary">field-target query variants</div>
                <table className="mt-2 min-w-full text-xs sf-table-shell">
                  <thead>
                    <tr className="sf-table-head border-b sf-border-soft">
                      <th className="sf-table-head-cell">field</th>
                      <th className="sf-table-head-cell">queries</th>
                    </tr>
                  </thead>
                  <tbody>
                    {llmOutputFieldQueryRows.length === 0 && (
                      <tr>
                        <td className="py-2 sf-table-empty-state" colSpan={2}>no field-target query variants</td>
                      </tr>
                    )}
                    {llmOutputFieldQueryRows.slice(0, 24).map((row) => (
                      <tr key={`llm-out-field:${row.field}`} className="sf-table-row border-b sf-border-soft">
                        <td className="py-1 pr-3 font-mono">
                          {row.field}
                          {row.isFocus ? (
                            <span className="ml-1 px-1 py-0.5 sf-chip-warning">focus</span>
                          ) : null}
                        </td>
                        <td className="py-1 pr-3">{row.queries.slice(0, 3).join(' | ') || '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <div className="sf-surface-elevated p-2 text-xs space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="font-semibold sf-text-primary">Phase 03 output review</div>
              <span className={`px-1.5 py-0.5 text-xs ${panelStateChipClasses(
                phase3Status.state === 'live'
                  ? 'live'
                  : (phase3Status.state === 'ready' ? 'ready' : 'waiting')
              )}`}>
                {phase3Status.label}
              </span>
            </div>
            <div className="sf-text-muted">
              {phase3Status.message}
            </div>
            <div className="sf-surface-elevated p-2 overflow-x-auto">
              <div className="font-semibold sf-text-primary">Top K URLs to fetch</div>
              <table className="mt-2 min-w-full text-xs sf-table-shell">
                <thead>
                  <tr className="sf-table-head border-b sf-border-soft">
                    <th className="sf-table-head-cell">url</th>
                    <th className="sf-table-head-cell">query</th>
                    <th className="sf-table-head-cell">doc kind</th>
                    <th className="sf-table-head-cell">tier</th>
                    <th className="sf-table-head-cell">score</th>
                    <th className="sf-table-head-cell">reasons</th>
                  </tr>
                </thead>
                <tbody>
                  {llmOutputSelectedCandidates.length === 0 && (
                    <tr>
                      <td className="py-2 sf-table-empty-state" colSpan={6}>
                        no selected urls yet ({phase3Status.label})
                      </td>
                    </tr>
                  )}
                  {llmOutputSelectedCandidates.slice(0, 16).map((row) => (
                    <tr key={`llm-out-sel:${row.query}:${row.url}`} className="sf-table-row border-b sf-border-soft">
                      <td className="py-1 pr-3 font-mono truncate max-w-[28rem]" title={row.url}>{row.url}</td>
                      <td className="py-1 pr-3 font-mono truncate max-w-[20rem]" title={row.query}>{row.query}</td>
                      <td className="py-1 pr-3">{row.doc_kind || '-'}</td>
                      <td className="py-1 pr-3">{row.tier_name || '-'}</td>
                      <td className="py-1 pr-3">{formatNumber(row.score, 3)}</td>
                      <td className="py-1 pr-3">
                        <div className="flex flex-wrap gap-1">
                          {row.reason_codes.slice(0, 4).map((reason) => (
                            <span key={`llm-out-sel-reason:${row.url}:${reason}`} className="px-1.5 py-0.5 sf-chip-success">
                              {reason}
                            </span>
                          ))}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="sf-surface-elevated p-2 overflow-x-auto">
              <div className="font-semibold sf-text-primary">Wrong model / junk skips</div>
              <table className="mt-2 min-w-full text-xs sf-table-shell">
                <thead>
                  <tr className="sf-table-head border-b sf-border-soft">
                    <th className="sf-table-head-cell">url</th>
                    <th className="sf-table-head-cell">query</th>
                    <th className="sf-table-head-cell">doc kind</th>
                    <th className="sf-table-head-cell">score</th>
                    <th className="sf-table-head-cell">skip reasons</th>
                  </tr>
                </thead>
                <tbody>
                  {llmOutputRejectedCandidates.length === 0 && (
                    <tr>
                      <td className="py-2 sf-table-empty-state" colSpan={5}>
                        no junk/wrong-model skips yet ({phase3Status.label})
                      </td>
                    </tr>
                  )}
                  {llmOutputRejectedCandidates.slice(0, 20).map((row) => (
                    <tr key={`llm-out-rej:${row.query}:${row.url}`} className="sf-table-row border-b sf-border-soft">
                      <td className="py-1 pr-3 font-mono truncate max-w-[28rem]" title={row.url}>{row.url}</td>
                      <td className="py-1 pr-3 font-mono truncate max-w-[20rem]" title={row.query}>{row.query}</td>
                      <td className="py-1 pr-3">{row.doc_kind || '-'}</td>
                      <td className="py-1 pr-3">{formatNumber(row.score, 3)}</td>
                      <td className="py-1 pr-3">
                        <div className="flex flex-wrap gap-1">
                          {row.reason_codes.slice(0, 4).map((reason) => (
                            <span key={`llm-out-rej-reason:${row.url}:${reason}`} className="px-1.5 py-0.5 sf-chip-danger">
                              {reason}
                            </span>
                          ))}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="sf-surface-elevated p-2 space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="font-semibold sf-text-primary">LLM call trace (all phases)</div>
                <div className="text-xs sf-text-muted">
                  {formatNumber(Number(indexlabLlmTracesResp?.count || llmTraceRows.length))} calls traced
                </div>
              </div>
              <div className="sf-surface-elevated p-2 overflow-x-auto">
                <table className="min-w-full text-xs sf-table-shell">
                  <thead>
                    <tr className="sf-table-head border-b sf-border-soft">
                      <th className="sf-table-head-cell">time</th>
                      <th className="sf-table-head-cell">phase</th>
                      <th className="sf-table-head-cell">role</th>
                      <th className="sf-table-head-cell">purpose</th>
                      <th className="sf-table-head-cell">provider</th>
                      <th className="sf-table-head-cell">model</th>
                      <th className="sf-table-head-cell">status</th>
                      <th className="sf-table-head-cell">tokens</th>
                    </tr>
                  </thead>
                  <tbody>
                    {llmTraceRows.length === 0 && (
                      <tr>
                        <td className="py-2 sf-table-empty-state" colSpan={8}>
                          no llm traces yet for this run
                        </td>
                      </tr>
                    )}
                    {llmTraceRows.slice(0, 40).map((row) => {
                      const isSelected = selectedLlmTrace?.id === row.id;
                      const tokenCount = Number(row.usage?.total_tokens || 0);
                      return (
                        <tr
                          key={row.id}
                          className={`sf-table-row border-b sf-border-soft cursor-pointer ${isSelected ? 'sf-table-row-active' : ''}`}
                          onClick={() => onTraceSelect(row.id)}
                          title="Click to inspect prompt/response"
                        >
                          <td className="py-1 pr-3">{formatDateTime(row.ts || null)}</td>
                          <td className="py-1 pr-3">{llmPhaseLabel(String(row.phase || ''))}</td>
                          <td className="py-1 pr-3">{row.role || '-'}</td>
                          <td className="py-1 pr-3 font-mono truncate max-w-[18rem]" title={String(row.purpose || '')}>{row.purpose || '-'}</td>
                          <td className="py-1 pr-3">{row.provider || '-'}</td>
                          <td className="py-1 pr-3 font-mono truncate max-w-[16rem]" title={String(row.model || '')}>{row.model || '-'}</td>
                          <td className="py-1 pr-3">{row.status || '-'}</td>
                          <td className="py-1 pr-3">{formatNumber(tokenCount)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="sf-surface-elevated p-2">
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                  <div className="font-semibold sf-text-primary">
                    Selected call details
                  </div>
                  {selectedLlmTrace ? (
                    <div className="sf-text-muted">
                      {llmPhaseLabel(String(selectedLlmTrace.phase || ''))}
                      {selectedLlmTrace.purpose ? ` | ${selectedLlmTrace.purpose}` : ''}
                    </div>
                  ) : null}
                </div>
                {!selectedLlmTrace ? (
                  <div className="mt-2 text-xs sf-text-muted">select a traced call to inspect its output</div>
                ) : (
                  <div className="mt-2 grid grid-cols-1 xl:grid-cols-2 gap-2 text-xs">
                    <div className="sf-surface-elevated p-2">
                      <div className="font-semibold sf-text-primary">prompt</div>
                      <pre className="mt-1 whitespace-pre-wrap break-words sf-text-label max-h-64 overflow-y-auto sf-pre-block">
                        {prettyJsonText(String(selectedLlmTrace.prompt_preview || '')) || '(no prompt trace)'}
                      </pre>
                    </div>
                    <div className="sf-surface-elevated p-2">
                      <div className="font-semibold sf-text-primary">response</div>
                      <pre className="mt-1 whitespace-pre-wrap break-words sf-text-label max-h-64 overflow-y-auto sf-pre-block">
                        {prettyJsonText(String(selectedLlmTrace.response_preview || '')) || '(no response trace)'}
                      </pre>
                      {selectedLlmTrace.error ? (
                        <div className="mt-2 sf-callout sf-callout-danger p-2">
                          {selectedLlmTrace.error}
                        </div>
                      ) : null}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
