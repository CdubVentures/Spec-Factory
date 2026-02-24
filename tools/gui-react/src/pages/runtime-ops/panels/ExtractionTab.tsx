import { useMemo, useState } from 'react';
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
  onNavigateToDocument?: (url: string) => void;
}

function ConfidenceBar({ value }: { value: number }) {
  const color =
    value >= 0.9
      ? 'bg-green-500'
      : value >= 0.7
        ? 'bg-blue-500'
        : value >= 0.5
          ? 'bg-yellow-500'
          : 'bg-red-500';

  return (
    <div className="flex items-center gap-1.5">
      <div className="w-16 h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full ${color}`}
          style={{ width: `${Math.round(value * 100)}%` }}
        />
      </div>
      <span className="text-[10px] text-gray-500 dark:text-gray-400 font-mono w-8">
        {pctString(value)}
      </span>
    </div>
  );
}

export function ExtractionTab({ fields, onNavigateToDocument }: ExtractionTabProps) {
  const [searchFilter, setSearchFilter] = useState('');
  const [methodFilter, setMethodFilter] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [selectedField, setSelectedField] = useState<ExtractionFieldRow | null>(null);

  const methods = useMemo(() => {
    const set = new Set(fields.map((f) => f.method).filter(Boolean));
    return Array.from(set).sort();
  }, [fields]);

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
        <div className="px-4 py-2 flex flex-wrap items-center gap-2 border-b border-gray-200 dark:border-gray-700">
          <input
            type="text"
            placeholder="Filter by field, value, method..."
            value={searchFilter}
            onChange={(e) => setSearchFilter(e.target.value)}
            className="flex-1 min-w-[12rem] text-xs rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-2 py-1"
          />
          <select
            value={statusFilter || ''}
            onChange={(e) => setStatusFilter(e.target.value || null)}
            className="text-xs rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-2 py-1"
          >
            <option value="">All status</option>
            <option value="accepted">Accepted</option>
            <option value="conflict">Conflict</option>
            <option value="candidate">Candidate</option>
            <option value="unknown">Unknown</option>
          </select>
          <span className="text-xs text-gray-400 dark:text-gray-500">
            {filtered.length}/{fields.length}
          </span>
        </div>

        {/* Method chip bar */}
        {methods.length > 0 && (
          <div className="px-4 py-1.5 flex items-center gap-1.5 overflow-x-auto border-b border-gray-100 dark:border-gray-700/50">
            <button
              type="button"
              onClick={() => setMethodFilter(null)}
              className={`px-2 py-0.5 rounded text-[10px] font-medium transition-opacity ${
                methodFilter === null
                  ? 'bg-gray-200 dark:bg-gray-600 text-gray-800 dark:text-gray-200 ring-1 ring-gray-400'
                  : 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 opacity-60'
              }`}
            >
              All
            </button>
            {methods.map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMethodFilter(methodFilter === m ? null : m)}
                className={`px-2 py-0.5 rounded text-[10px] font-medium transition-opacity ${methodBadgeClass(m)} ${
                  methodFilter === m ? 'ring-1 ring-gray-400 dark:ring-gray-500' : 'opacity-50'
                }`}
              >
                {friendlyMethod(m)}
              </button>
            ))}
          </div>
        )}

        {/* Table */}
        <table className="w-full text-xs">
          <thead className="bg-gray-50 dark:bg-gray-800 sticky top-0">
            <tr>
              <th className="text-left px-3 py-2 text-gray-500 dark:text-gray-400 font-medium">Field<Tip text={METRIC_TIPS.ext_field} /></th>
              <th className="text-left px-3 py-2 text-gray-500 dark:text-gray-400 font-medium">Value<Tip text={METRIC_TIPS.ext_value} /></th>
              <th className="text-left px-3 py-2 text-gray-500 dark:text-gray-400 font-medium">Status<Tip text={METRIC_TIPS.ext_status} /></th>
              <th className="text-left px-3 py-2 text-gray-500 dark:text-gray-400 font-medium">Confidence<Tip text={METRIC_TIPS.ext_confidence} /></th>
              <th className="text-left px-3 py-2 text-gray-500 dark:text-gray-400 font-medium">Method<Tip text={METRIC_TIPS.ext_method} /></th>
              <th className="text-left px-3 py-2 text-gray-500 dark:text-gray-400 font-medium">Tier<Tip text={METRIC_TIPS.ext_tier} /></th>
              <th className="text-right px-3 py-2 text-gray-500 dark:text-gray-400 font-medium">Refs<Tip text={METRIC_TIPS.ext_refs} /></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((f) => (
              <tr
                key={f.field}
                onClick={() => setSelectedField(selectedField?.field === f.field ? null : f)}
                className={`cursor-pointer border-b border-gray-100 dark:border-gray-700/50 transition-colors ${
                  selectedField?.field === f.field
                    ? 'bg-blue-50 dark:bg-blue-900/20'
                    : 'hover:bg-gray-50 dark:hover:bg-gray-800/50'
                }`}
              >
                <td className="px-3 py-2 font-mono font-medium text-gray-800 dark:text-gray-200">{f.field}</td>
                <td className="px-3 py-2 font-mono text-gray-600 dark:text-gray-400 max-w-[12rem] truncate">
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
                  <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${methodBadgeClass(f.method)}`}>
                    {friendlyMethod(f.method)}
                  </span>
                </td>
                <td className="px-3 py-2">
                  <span className={`px-1.5 py-0.5 rounded text-[10px] ${tierBadgeClass(f.source_tier)}`}>
                    {tierLabel(f.source_tier)}
                  </span>
                </td>
                <td className="px-3 py-2 text-right font-mono text-gray-500 dark:text-gray-400">{f.refs_count}</td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={7} className="px-3 py-8 text-center text-gray-400 dark:text-gray-500">
                  No extraction fields found
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Inspector pane */}
      {selectedField && (
        <div className="w-80 shrink-0 border-l border-gray-200 dark:border-gray-700 overflow-y-auto p-4">
          <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
            Field Detail
          </h3>

          <dl className="space-y-2 text-xs mb-4">
            <div>
              <dt className="text-gray-500 dark:text-gray-400">Field</dt>
              <dd className="font-mono font-medium text-gray-800 dark:text-gray-200">{selectedField.field}</dd>
            </div>
            <div>
              <dt className="text-gray-500 dark:text-gray-400">Value</dt>
              <dd className="font-mono text-gray-800 dark:text-gray-200">{selectedField.value || '-'}</dd>
            </div>
            <div>
              <dt className="text-gray-500 dark:text-gray-400">Status</dt>
              <dd>
                <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${fieldStatusBadgeClass(selectedField.status)}`}>
                  {selectedField.status}
                </span>
              </dd>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <dt className="text-gray-500 dark:text-gray-400">Confidence</dt>
                <dd className="font-mono">{pctString(selectedField.confidence)}</dd>
              </div>
              <div>
                <dt className="text-gray-500 dark:text-gray-400">Round</dt>
                <dd className="font-mono">{selectedField.round}</dd>
              </div>
            </div>
            {selectedField.batch_id && (
              <div>
                <dt className="text-gray-500 dark:text-gray-400">Batch</dt>
                <dd className="font-mono text-gray-600 dark:text-gray-400">{selectedField.batch_id}</dd>
              </div>
            )}
          </dl>

          {selectedField.status === 'conflict' && (
            <div className="mb-3 p-2 rounded border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 text-xs text-red-700 dark:text-red-300">
              Multiple sources found different values for this field. Review the candidates below to see which sources disagree.
              The system will attempt additional searches to resolve the conflict.
            </div>
          )}
          {selectedField.status === 'unknown' && (
            <div className="mb-3 p-2 rounded border border-yellow-200 dark:border-yellow-800 bg-yellow-50 dark:bg-yellow-900/20 text-xs text-yellow-700 dark:text-yellow-300">
              This field could not be determined from any source found so far. Additional discovery rounds may find it,
              or it may not be available for this product.
            </div>
          )}

          <h4 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">
            Raw Candidates ({selectedField.candidates.length})
          </h4>
          <div className="space-y-2 mb-4">
            {selectedField.candidates.map((c: ExtractionCandidate, i: number) => (
              <div
                key={`${c.value}-${c.source_host}-${i}`}
                className="p-2 rounded border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50"
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="font-mono text-xs text-gray-800 dark:text-gray-200">{c.value}</span>
                  <span className={`px-1 py-0.5 rounded text-[10px] ${tierBadgeClass(c.source_tier)}`}>
                    T{c.source_tier}
                  </span>
                </div>
                <ConfidenceBar value={c.confidence} />
                <div className="flex items-center gap-2 mt-1">
                  <span className={`px-1 py-0.5 rounded text-[10px] ${methodBadgeClass(c.method)}`}>{friendlyMethod(c.method)}</span>
                  <span className="text-[10px] text-gray-400 font-mono truncate">{c.source_host}</span>
                </div>
                {c.quote && (
                  <div className="mt-1 text-[10px] text-gray-500 dark:text-gray-400 italic truncate">
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
              className="w-full text-xs text-center py-2 rounded border border-blue-300 dark:border-blue-600 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors"
            >
              View Source Document
            </button>
          )}
        </div>
      )}
    </div>
  );
}
