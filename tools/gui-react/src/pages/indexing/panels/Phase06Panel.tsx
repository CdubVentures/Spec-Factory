import { useState } from 'react';
import { Tip } from '../../../components/common/Tip';
import { ActivityGauge, formatNumber, formatBytes, formatDateTime } from '../helpers';
import type {
  IndexLabEvidenceIndexDocumentRow,
  IndexLabEvidenceIndexFieldRow,
  IndexLabEvidenceIndexSearchRow,
} from '../types';

interface Phase06RuntimeShape {
  processed: number;
  uniqueHashes: number;
  dedupeHits: number;
  missingHash: number;
  hashCoveragePct: number;
  totalBytes: number;
  parseFinished: number;
  indexFinished: number;
  repeatedHashes: {
    contentHash: string;
    hits: number;
    bytes: number;
    lastUrl: string;
    host: string;
    contentType: string;
    lastTs: string;
  }[];
}

interface Phase06EvidenceSummaryShape {
  dbReady: boolean;
  scopeMode: string;
  documents: number;
  artifacts: number;
  artifactsWithHash: number;
  uniqueHashes: number;
  assertions: number;
  evidenceRefs: number;
  fieldsCovered: number;
}

interface Phase06DedupeStreamShape {
  total: number;
  newCount: number;
  reusedCount: number;
  updatedCount: number;
  totalChunksIndexed: number;
}

interface Phase06PanelProps {
  collapsed: boolean;
  onToggle: () => void;
  selectedIndexLabRunId: string;
  phase6StatusLabel: string;
  phase6Activity: { currentPerMin: number; peakPerMin: number };
  processRunning: boolean;
  phase6Runtime: Phase06RuntimeShape;
  phase6EvidenceSummary: Phase06EvidenceSummaryShape;
  phase6DedupeStream: Phase06DedupeStreamShape;
  phase6EvidenceDocuments: IndexLabEvidenceIndexDocumentRow[];
  phase6EvidenceTopFields: IndexLabEvidenceIndexFieldRow[];
  phase6EvidenceSearchRows: IndexLabEvidenceIndexSearchRow[];
  initialSearchQuery: string;
  onSearchQueryChange: (query: string) => void;
  normalizedSearchQuery: string;
}

export function Phase06Panel({
  collapsed,
  onToggle,
  selectedIndexLabRunId,
  phase6StatusLabel,
  phase6Activity,
  processRunning,
  phase6Runtime,
  phase6EvidenceSummary,
  phase6DedupeStream,
  phase6EvidenceDocuments,
  phase6EvidenceTopFields,
  phase6EvidenceSearchRows,
  initialSearchQuery,
  onSearchQueryChange,
  normalizedSearchQuery,
}: Phase06PanelProps) {
  return (
    <div className="sf-surface-panel p-3 space-y-3" style={{ order: 50 }}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center text-sm font-semibold sf-text-primary">
          <button
            onClick={onToggle}
            className="inline-flex items-center justify-center w-5 h-5 mr-1 sf-text-caption sf-icon-button"
            title={collapsed ? 'Open panel' : 'Close panel'}
          >
            {collapsed ? '+' : '-'}
          </button>
          <span>Evidence Index & Dedupe</span>
          <Tip text="Phase 06A: content-hash dedupe plus DB-backed evidence inventory and search for this run." />
        </div>
        <div className="ml-auto flex items-center gap-2">
          <div className="text-xs sf-text-muted">
            run {selectedIndexLabRunId || '-'} | {phase6StatusLabel}
          </div>
          <ActivityGauge
            label="phase 06a activity"
            currentPerMin={phase6Activity.currentPerMin}
            peakPerMin={phase6Activity.peakPerMin}
            active={processRunning}
          />
        </div>
      </div>
      {!collapsed ? (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-12 gap-2 text-xs">
            <div className="sf-surface-elevated px-2 py-1">
              <div className="sf-text-muted flex items-center">sources processed<Tip text="Total source_processed events observed for this run." /></div>
              <div className="font-semibold">{formatNumber(phase6Runtime.processed)}</div>
            </div>
            <div className="sf-surface-elevated px-2 py-1">
              <div className="sf-text-muted flex items-center">unique hashes<Tip text="Distinct content_hash values seen across processed sources." /></div>
              <div className="font-semibold">{formatNumber(phase6Runtime.uniqueHashes)}</div>
            </div>
            <div className="sf-surface-elevated px-2 py-1">
              <div className="sf-text-muted flex items-center">dedupe hits<Tip text="Repeated content_hash occurrences beyond first-seen unique payloads." /></div>
              <div className="font-semibold">{formatNumber(phase6Runtime.dedupeHits)}</div>
            </div>
            <div className="sf-surface-elevated px-2 py-1">
              <div className="sf-text-muted flex items-center">hash coverage<Tip text="Percent of processed rows carrying a non-empty content_hash." /></div>
              <div className="font-semibold">{formatNumber(phase6Runtime.hashCoveragePct, 1)}%</div>
            </div>
            <div className="sf-surface-elevated px-2 py-1">
              <div className="sf-text-muted flex items-center">parse finished<Tip text="Parse completion count correlated with this run window." /></div>
              <div className="font-semibold">{formatNumber(phase6Runtime.parseFinished)}</div>
            </div>
            <div className="sf-surface-elevated px-2 py-1">
              <div className="sf-text-muted flex items-center">index finished<Tip text="Index completion count correlated with this run window." /></div>
              <div className="font-semibold">{formatNumber(phase6Runtime.indexFinished)}</div>
            </div>
            <div className="sf-surface-elevated px-2 py-1">
              <div className="sf-text-muted flex items-center">payload bytes<Tip text="Total source_processed payload byte volume represented in this run view." /></div>
              <div className="font-semibold">{formatBytes(phase6Runtime.totalBytes)}</div>
            </div>
            <div className="sf-surface-elevated px-2 py-1">
              <div className="sf-text-muted flex items-center">missing hash rows<Tip text="Processed rows without content_hash (cannot dedupe safely)." /></div>
              <div className="font-semibold">{formatNumber(phase6Runtime.missingHash)}</div>
            </div>
            <div className="sf-surface-elevated px-2 py-1">
              <div className="sf-text-muted flex items-center">inventory docs<Tip text="Phase 06A DB inventory: matched source documents for this run scope." /></div>
              <div className="font-semibold">{formatNumber(phase6EvidenceSummary.documents)}</div>
            </div>
            <div className="sf-surface-elevated px-2 py-1">
              <div className="sf-text-muted flex items-center">assertions<Tip text="Phase 06A DB inventory: extracted assertions linked to sources." /></div>
              <div className="font-semibold">{formatNumber(phase6EvidenceSummary.assertions)}</div>
            </div>
            <div className="sf-surface-elevated px-2 py-1">
              <div className="sf-text-muted flex items-center">evidence refs<Tip text="Phase 06A DB inventory: quote/snippet evidence rows tied to assertions." /></div>
              <div className="font-semibold">{formatNumber(phase6EvidenceSummary.evidenceRefs)}</div>
            </div>
            <div className="sf-surface-elevated px-2 py-1">
              <div className="sf-text-muted flex items-center">inventory mode<Tip text="run: exact run_id rows were found; product_fallback: used product scope when run-scoped rows were unavailable." /></div>
              <div className="font-semibold font-mono">
                {phase6EvidenceSummary.dbReady ? phase6EvidenceSummary.scopeMode : 'db offline'}
              </div>
            </div>
          </div>
          {phase6DedupeStream.total > 0 && (
            <div className="grid grid-cols-2 md:grid-cols-5 gap-2 text-xs">
              <div className="sf-callout sf-callout-info px-2 py-1">
                <div className="sf-text-muted flex items-center">index events<Tip text="Total evidence_index_result events captured from the NDJSON stream for this run." /></div>
                <div className="font-semibold">{formatNumber(phase6DedupeStream.total)}</div>
              </div>
              <div className="sf-callout sf-callout-success px-2 py-1">
                <div className="sf-text-muted flex items-center">new docs<Tip text="Documents indexed for the first time (new content hash)." /></div>
                <div className="font-semibold">{formatNumber(phase6DedupeStream.newCount)}</div>
              </div>
              <div className="sf-callout sf-callout-warning px-2 py-1">
                <div className="sf-text-muted flex items-center">dedupe reused<Tip text="Documents skipped because an identical content hash was already indexed." /></div>
                <div className="font-semibold">{formatNumber(phase6DedupeStream.reusedCount)}</div>
              </div>
              <div className="sf-callout sf-callout-accent px-2 py-1">
                <div className="sf-text-muted flex items-center">updated<Tip text="Documents re-indexed with updated content (different parser version or content change)." /></div>
                <div className="font-semibold">{formatNumber(phase6DedupeStream.updatedCount)}</div>
              </div>
              <div className="sf-surface-elevated px-2 py-1">
                <div className="sf-text-muted flex items-center">chunks indexed<Tip text="Total evidence chunks written to the index across all new and updated documents." /></div>
                <div className="font-semibold">{formatNumber(phase6DedupeStream.totalChunksIndexed)}</div>
              </div>
            </div>
          )}
          <div className="sf-surface-elevated p-2 overflow-x-auto">
            <div className="text-xs font-semibold sf-text-primary flex items-center">
              Repeated Content Hashes ({formatNumber(phase6Runtime.repeatedHashes.length)} shown)
              <Tip text="Top repeated content hashes to prove dedupe behavior and repeated-source churn." />
            </div>
            <table className="mt-2 min-w-full text-xs sf-table-shell">
              <thead>
                <tr className="sf-table-head border-b sf-border-soft">
                  <th className="sf-table-head-cell">content hash</th>
                  <th className="sf-table-head-cell">hits</th>
                  <th className="sf-table-head-cell">host</th>
                  <th className="sf-table-head-cell">content type</th>
                  <th className="sf-table-head-cell">bytes</th>
                  <th className="sf-table-head-cell">last url</th>
                  <th className="sf-table-head-cell">last seen</th>
                </tr>
              </thead>
              <tbody>
                {phase6Runtime.repeatedHashes.length === 0 ? (
                  <tr>
                    <td className="py-2 sf-table-empty-state" colSpan={7}>no repeated content hashes yet</td>
                  </tr>
                ) : (
                  phase6Runtime.repeatedHashes.map((row) => (
                    <tr key={`phase6-hash:${row.contentHash}`} className="sf-table-row border-b sf-border-soft">
                      <td className="py-1 pr-3 font-mono">{String(row.contentHash || '').slice(0, 24)}...</td>
                      <td className="py-1 pr-3">{formatNumber(row.hits)}</td>
                      <td className="py-1 pr-3 font-mono">{row.host || '-'}</td>
                      <td className="py-1 pr-3">{row.contentType || '-'}</td>
                      <td className="py-1 pr-3">{formatBytes(row.bytes)}</td>
                      <td className="py-1 pr-3 font-mono truncate max-w-[32rem]" title={row.lastUrl}>
                        {row.lastUrl || '-'}
                      </td>
                      <td className="py-1 pr-3">{formatDateTime(row.lastTs)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          <div className="sf-surface-elevated p-2 overflow-x-auto">
            <div className="text-xs font-semibold sf-text-primary flex items-center">
              Evidence Inventory Documents ({formatNumber(phase6EvidenceDocuments.length)} shown)
              <Tip text="Phase 06A DB-backed source inventory for this run scope (source rows, artifacts, hashes, assertions)." />
            </div>
            <table className="mt-2 min-w-full text-xs sf-table-shell">
              <thead>
                <tr className="sf-table-head border-b sf-border-soft">
                  <th className="sf-table-head-cell">source</th>
                  <th className="sf-table-head-cell">tier</th>
                  <th className="sf-table-head-cell">artifacts</th>
                  <th className="sf-table-head-cell">hashes</th>
                  <th className="sf-table-head-cell">assertions</th>
                  <th className="sf-table-head-cell">refs</th>
                  <th className="sf-table-head-cell">url</th>
                </tr>
              </thead>
              <tbody>
                {phase6EvidenceDocuments.length === 0 ? (
                  <tr>
                    <td className="py-2 sf-table-empty-state" colSpan={7}>no evidence inventory documents yet</td>
                  </tr>
                ) : (
                  phase6EvidenceDocuments.slice(0, 40).map((row) => (
                    <tr key={`phase6-doc:${row.source_id}`} className="sf-table-row border-b sf-border-soft">
                      <td className="py-1 pr-3 font-mono">{row.source_id || '-'}</td>
                      <td className="py-1 pr-3">{row.source_tier === null || row.source_tier === undefined ? '-' : formatNumber(Number(row.source_tier || 0))}</td>
                      <td className="py-1 pr-3">{formatNumber(Number(row.artifact_count || 0))}</td>
                      <td className="py-1 pr-3">{formatNumber(Number(row.unique_hashes || 0))}</td>
                      <td className="py-1 pr-3">{formatNumber(Number(row.assertion_count || 0))}</td>
                      <td className="py-1 pr-3">{formatNumber(Number(row.evidence_ref_count || 0))}</td>
                      <td className="py-1 pr-3 font-mono truncate max-w-[28rem]" title={row.source_url || ''}>{row.source_url || '-'}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          <div className="sf-surface-elevated p-2 overflow-x-auto">
            <div className="text-xs font-semibold sf-text-primary flex items-center">
              Top Indexed Fields ({formatNumber(phase6EvidenceTopFields.length)} shown)
              <Tip text="Phase 06A field coverage from source assertions/evidence refs in DB scope." />
            </div>
            <table className="mt-2 min-w-full text-xs sf-table-shell">
              <thead>
                <tr className="sf-table-head border-b sf-border-soft">
                  <th className="sf-table-head-cell">field</th>
                  <th className="sf-table-head-cell">assertions</th>
                  <th className="sf-table-head-cell">refs</th>
                  <th className="sf-table-head-cell">sources</th>
                </tr>
              </thead>
              <tbody>
                {phase6EvidenceTopFields.length === 0 ? (
                  <tr>
                    <td className="py-2 sf-table-empty-state" colSpan={4}>no field coverage rows yet</td>
                  </tr>
                ) : (
                  phase6EvidenceTopFields.slice(0, 24).map((row) => (
                    <tr key={`phase6-field:${row.field_key}`} className="sf-table-row border-b sf-border-soft">
                      <td className="py-1 pr-3 font-mono">{row.field_key || '-'}</td>
                      <td className="py-1 pr-3">{formatNumber(Number(row.assertions || 0))}</td>
                      <td className="py-1 pr-3">{formatNumber(Number(row.evidence_refs || 0))}</td>
                      <td className="py-1 pr-3">{formatNumber(Number(row.distinct_sources || 0))}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          <div className="sf-surface-elevated p-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-xs font-semibold sf-text-primary flex items-center">
                Evidence Search
                <Tip text="DB-backed search over field key/value/quote/snippet text for this run scope." />
              </div>
              <div className="sf-text-label sf-text-muted">
                matches {formatNumber(phase6EvidenceSearchRows.length)}
              </div>
            </div>
            <div className="mt-2 flex items-center gap-2">
              <input
                value={initialSearchQuery}
                onChange={(event) => onSearchQueryChange(event.target.value)}
                placeholder="search evidence text, value, or field key"
                className="w-full max-w-xl sf-input sf-text-caption"
              />
              <button
                onClick={() => onSearchQueryChange('')}
                className="px-2 py-1 sf-text-caption sf-action-button"
              >
                clear
              </button>
            </div>
            <div className="mt-2 overflow-x-auto">
              <table className="min-w-full text-xs sf-table-shell">
                <thead>
                  <tr className="sf-table-head border-b sf-border-soft">
                    <th className="sf-table-head-cell">field</th>
                    <th className="sf-table-head-cell">context</th>
                    <th className="sf-table-head-cell">value</th>
                    <th className="sf-table-head-cell">quote/snippet</th>
                    <th className="sf-table-head-cell">source</th>
                  </tr>
                </thead>
                <tbody>
                  {normalizedSearchQuery && phase6EvidenceSearchRows.length === 0 ? (
                    <tr>
                      <td className="py-2 sf-table-empty-state" colSpan={5}>no search matches for this run scope</td>
                    </tr>
                  ) : null}
                  {!normalizedSearchQuery ? (
                    <tr>
                      <td className="py-2 sf-table-empty-state" colSpan={5}>enter a term to search indexed evidence</td>
                    </tr>
                  ) : null}
                  {phase6EvidenceSearchRows.slice(0, 24).map((row, idx) => (
                    <tr key={`phase6-search:${row.assertion_id || idx}:${row.source_id || idx}`} className="sf-table-row border-b sf-border-soft">
                      <td className="py-1 pr-3 font-mono">{row.field_key || '-'}</td>
                      <td className="py-1 pr-3">{row.context_kind || '-'}</td>
                      <td className="py-1 pr-3">{row.value_preview || '-'}</td>
                      <td className="py-1 pr-3">
                        <div className="max-w-[40rem] truncate" title={row.quote_preview || row.snippet_preview || ''}>
                          {row.quote_preview || row.snippet_preview || '-'}
                        </div>
                      </td>
                      <td className="py-1 pr-3 font-mono truncate max-w-[20rem]" title={row.source_url || ''}>
                        {row.source_host || row.source_id || '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <div className="text-xs sf-text-muted">
            phase 06a now includes live content-hash dedupe metrics plus DB-backed inventory and search over indexed evidence rows.
          </div>
        </>
      ) : null}
    </div>
  );
}
