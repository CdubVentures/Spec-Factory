import { useMemo } from 'react';
import { usePersistedNullableTab, usePersistedTab } from '../../../stores/tabStore';
import type { ExtractionFieldRow, ExtractionCandidate } from '../types';
import {
  methodBadgeClass,
  fieldStatusBadgeClass,
  tierLabel,
  tierBadgeClass,
  truncateUrl,
  pctString,
  METRIC_TIPS,
  friendlyMethod,
} from '../helpers';
import { Tip } from '../../../components/common/Tip';

interface ExtractionTabProps {
  fields: ExtractionFieldRow[];
  category: string;
  onNavigateToDocument?: (url: string) => void;
}

function ConfidenceBar({ value }: { value: number }) {
  const toneVar =
    value >= 0.9
      ? '--sf-state-success-border'
      : value >= 0.7
        ? '--sf-color-accent-rgb'
        : value >= 0.5
          ? '--sf-state-warning-border'
          : '--sf-state-danger-border';

  return (
    <div className="flex items-center gap-1.5">
      <div
        className="w-16 h-1.5 rounded-full overflow-hidden"
        style={{ background: 'rgb(var(--sf-color-border-subtle-rgb) / 0.34)' }}
      >
        <div
          className="h-full rounded-full"
          style={{
            width: `${Math.round(value * 100)}%`,
            background: toneVar === '--sf-color-accent-rgb'
              ? 'rgb(var(--sf-color-accent-rgb))'
              : `var(${toneVar})`,
          }}
        />
      </div>
      <span className="sf-text-caption sf-text-subtle font-mono w-8">
        {pctString(value)}
      </span>
    </div>
  );
}

const EXTRACTION_STATUS_FILTER_KEYS = [
  'accepted',
  'conflict',
  'candidate',
  'unknown',
] as const;

export function ExtractionTab({ fields, category, onNavigateToDocument }: ExtractionTabProps) {
  const [searchFilter, setSearchFilter] = usePersistedTab<string>(
    `runtimeOps:extraction:search:${category}`,
    '',
  );

  const methods = useMemo(() => {
    const set = new Set(fields.map((f) => f.method).filter(Boolean));
    return Array.from(set).sort();
  }, [fields]);
  const [methodFilter, setMethodFilter] = usePersistedNullableTab<string>(
    `runtimeOps:extraction:method:${category}`,
    null,
    { validValues: methods },
  );
  const [statusFilter, setStatusFilter] = usePersistedNullableTab<string>(
    `runtimeOps:extraction:status:${category}`,
    null,
    { validValues: EXTRACTION_STATUS_FILTER_KEYS },
  );
  const fieldKeys = useMemo(
    () => fields.map((field) => field.field),
    [fields],
  );
  const [selectedFieldKey, setSelectedFieldKey] = usePersistedNullableTab<string>(
    `runtimeOps:extraction:selectedField:${category}`,
    null,
    { validValues: fieldKeys },
  );
  const selectedField = useMemo(
    () => fields.find((field) => field.field === selectedFieldKey) ?? null,
    [fields, selectedFieldKey],
  );

  const filtered = useMemo(() => {
    let list = fields;
    if (methodFilter) list = list.filter((f) => f.method === methodFilter);
    if (statusFilter) list = list.filter((f) => f.status === statusFilter);
    if (searchFilter) {
      const lower = searchFilter.toLowerCase();
      list = list.filter(
        (f) =>
          f.field.toLowerCase().includes(lower) ||
          (f.value || '').toLowerCase().includes(lower) ||
          f.method.toLowerCase().includes(lower),
      );
    }
    return list;
  }, [fields, methodFilter, statusFilter, searchFilter]);

  return (
    <div className="flex flex-1 min-h-0">
      <div className="flex-1 overflow-y-auto">
        {/* Filter bar */}
        <div className="px-4 py-2 flex flex-wrap items-center gap-2 border-b sf-border-soft">
          <input
            type="text"
            placeholder="Filter by field, value, method..."
            value={searchFilter}
            onChange={(e) => setSearchFilter(e.target.value)}
            className="flex-1 min-w-[12rem] text-xs px-2 py-1 sf-input"
          />
          <select
            value={statusFilter || ''}
            onChange={(e) => setStatusFilter(e.target.value || null)}
            className="text-xs px-2 py-1 sf-select"
          >
            <option value="">All status</option>
            <option value="accepted">Accepted</option>
            <option value="conflict">Conflict</option>
            <option value="candidate">Candidate</option>
            <option value="unknown">Unknown</option>
          </select>
          <span className="text-xs sf-text-subtle">
            {filtered.length}/{fields.length}
          </span>
        </div>

        {/* Method chip bar */}
        {methods.length > 0 && (
          <div className="px-4 py-1.5 flex items-center gap-1.5 overflow-x-auto border-b sf-border-soft">
            <button
              type="button"
              onClick={() => setMethodFilter(null)}
              className={`px-2 py-0.5 rounded sf-text-caption font-medium transition-opacity border sf-border-soft ${
                methodFilter === null
                  ? 'sf-chip-neutral'
                  : 'sf-chip-neutral opacity-60'
              }`}
            >
              All
            </button>
            {methods.map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMethodFilter(methodFilter === m ? null : m)}
                className={`px-2 py-0.5 rounded sf-text-caption font-medium transition-opacity border sf-border-soft ${methodBadgeClass(m)} ${
                  methodFilter === m ? '' : 'opacity-50'
                }`}
              >
                {friendlyMethod(m)}
              </button>
            ))}
          </div>
        )}

        {/* Table */}
        <div className="sf-table-shell rounded overflow-hidden">
          <table className="w-full text-xs">
            <thead className="sf-table-head sticky top-0">
              <tr>
                <th className="sf-table-head-cell text-left px-3 py-2">Field<Tip text={METRIC_TIPS.ext_field} /></th>
                <th className="sf-table-head-cell text-left px-3 py-2">Value<Tip text={METRIC_TIPS.ext_value} /></th>
                <th className="sf-table-head-cell text-left px-3 py-2">Status<Tip text={METRIC_TIPS.ext_status} /></th>
                <th className="sf-table-head-cell text-left px-3 py-2">Confidence<Tip text={METRIC_TIPS.ext_confidence} /></th>
                <th className="sf-table-head-cell text-left px-3 py-2">Method<Tip text={METRIC_TIPS.ext_method} /></th>
                <th className="sf-table-head-cell text-left px-3 py-2">Tier<Tip text={METRIC_TIPS.ext_tier} /></th>
                <th className="sf-table-head-cell text-right px-3 py-2">Refs<Tip text={METRIC_TIPS.ext_refs} /></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((f) => (
                <tr
                  key={f.field}
                  onClick={() => setSelectedFieldKey(selectedField?.field === f.field ? null : f.field)}
                  className={`cursor-pointer sf-table-row ${selectedField?.field === f.field ? 'sf-table-row-active' : ''}`}
                >
                  <td className="px-3 py-2 font-mono font-medium sf-text-primary">{f.field}</td>
                  <td className="px-3 py-2 font-mono sf-text-muted max-w-[12rem] truncate">
                    {f.value || '-'}
                  </td>
                  <td className="px-3 py-2">
                    <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${fieldStatusBadgeClass(f.status)}`}>
                      {f.status}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    <ConfidenceBar value={f.confidence} />
                  </td>
                  <td className="px-3 py-2">
                    <span className={`px-1.5 py-0.5 rounded sf-text-caption font-medium ${methodBadgeClass(f.method)}`}>
                      {friendlyMethod(f.method)}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    <span className={`px-1.5 py-0.5 rounded sf-text-caption ${tierBadgeClass(f.source_tier)}`}>
                      {tierLabel(f.source_tier)}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right font-mono sf-text-subtle">{f.refs_count}</td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-3 py-8 text-center sf-text-subtle">
                    No extraction fields found
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Inspector pane */}
      {selectedField && (
        <div className="w-80 shrink-0 border-l sf-border-soft overflow-y-auto p-4">
          <h3 className="text-sm font-semibold sf-text-primary mb-3">
            Field Detail
          </h3>

          <dl className="space-y-2 text-xs mb-4">
            <div>
              <dt className="sf-text-subtle">Field</dt>
              <dd className="font-mono font-medium sf-text-primary">{selectedField.field}</dd>
            </div>
            <div>
              <dt className="sf-text-subtle">Value</dt>
              <dd className="font-mono sf-text-primary">{selectedField.value || '-'}</dd>
            </div>
            <div>
              <dt className="sf-text-subtle">Status</dt>
              <dd>
                <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${fieldStatusBadgeClass(selectedField.status)}`}>
                  {selectedField.status}
                </span>
              </dd>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <dt className="sf-text-subtle">Confidence</dt>
                <dd className="font-mono">{pctString(selectedField.confidence)}</dd>
              </div>
              <div>
                <dt className="sf-text-subtle">Round</dt>
                <dd className="font-mono">{selectedField.round}</dd>
              </div>
            </div>
            {selectedField.batch_id && (
              <div>
                <dt className="sf-text-subtle">Batch</dt>
                <dd className="font-mono sf-text-muted">{selectedField.batch_id}</dd>
              </div>
            )}
          </dl>

          {selectedField.status === 'conflict' && (
            <div className="mb-3 p-2 sf-callout sf-callout-danger text-xs">
              Multiple sources found different values for this field. Review the candidates below to see which sources disagree.
              The system will attempt additional searches to resolve the conflict.
            </div>
          )}
          {selectedField.status === 'unknown' && (
            <div className="mb-3 p-2 sf-callout sf-callout-warning text-xs">
              This field could not be determined from any source found so far. Additional discovery rounds may find it,
              or it may not be available for this product.
            </div>
          )}

          <h4 className="text-xs font-semibold sf-text-subtle uppercase tracking-wide mb-2">
            Raw Candidates ({selectedField.candidates.length})
          </h4>
          <div className="space-y-2 mb-4">
            {selectedField.candidates.map((c: ExtractionCandidate, i: number) => (
              <div
                key={`${c.value}-${c.source_host}-${i}`}
                className="p-2 sf-surface-elevated"
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="font-mono text-xs sf-text-primary">{c.value}</span>
                  <span className={`px-1 py-0.5 rounded sf-text-caption ${tierBadgeClass(c.source_tier)}`}>
                    T{c.source_tier}
                  </span>
                </div>
                <ConfidenceBar value={c.confidence} />
                <div className="flex items-center gap-2 mt-1">
                  <span className={`px-1 py-0.5 rounded sf-text-caption ${methodBadgeClass(c.method)}`}>{friendlyMethod(c.method)}</span>
                  <span className="sf-text-caption sf-text-subtle font-mono truncate">{c.source_host}</span>
                </div>
                {c.quote && (
                  <div className="mt-1 sf-text-caption sf-text-muted italic truncate">
                    &ldquo;{c.quote}&rdquo;
                  </div>
                )}
              </div>
            ))}
          </div>

          {selectedField.source_host && onNavigateToDocument && (
            <button
              type="button"
              onClick={() => onNavigateToDocument(selectedField.source_host)}
              className="w-full text-xs text-center py-2 sf-action-button transition-colors"
            >
              View Source Document
            </button>
          )}
        </div>
      )}
    </div>
  );
}
