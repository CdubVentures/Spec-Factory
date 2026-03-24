import { useMemo } from 'react';
import { usePersistedNullableTab } from '../../../../stores/tabStore.ts';
import type { WorkerExtractionField } from '../../types.ts';
import { methodBadgeClass, friendlyMethod } from '../../helpers.ts';
import { ConfidenceBar } from '../../components/ConfidenceBar.tsx';
import { resolveIndexedFieldHydrationNotice } from '../../selectors/prefetchUiContracts.ts';

interface DrawerExtractTabProps {
  fields: WorkerExtractionField[];
  indexedFieldNames?: string[];
  category: string;
}

function hostFromUrl(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

export function DrawerExtractTab({ fields, indexedFieldNames = [], category }: DrawerExtractTabProps) {
  const [methodFilter, setMethodFilter] = usePersistedNullableTab(`runtimeOps:drawerExtract:methodFilter:${category}`, null);
  const hydrationNotice = resolveIndexedFieldHydrationNotice(fields, indexedFieldNames);

  const summary = useMemo(() => {
    const avgConfidence = fields.length > 0
      ? fields.reduce((s, f) => s + f.confidence, 0) / fields.length
      : 0;
    const methodCounts: Record<string, number> = {};
    for (const f of fields) {
      const m = f.method || 'unknown';
      methodCounts[m] = (methodCounts[m] ?? 0) + 1;
    }
    const tiers = { high: 0, medium: 0, low: 0 };
    for (const f of fields) {
      if (f.confidence >= 0.9) tiers.high += 1;
      else if (f.confidence >= 0.7) tiers.medium += 1;
      else tiers.low += 1;
    }
    return { avgConfidence, methodCounts, tiers };
  }, [fields]);

  const sorted = useMemo(() => {
    let list = [...fields];
    if (methodFilter) {
      list = list.filter((f) => f.method === methodFilter);
    }
    list.sort((a, b) => b.confidence - a.confidence);
    return list;
  }, [fields, methodFilter]);

  if (fields.length === 0 && hydrationNotice) {
    return (
      <div className="space-y-3">
        <div className="sf-surface-elevated p-3 text-xs space-y-2">
          <div className="sf-text-primary font-medium">
            {hydrationNotice.title}
          </div>
          <div className="sf-text-subtle">
            {hydrationNotice.description}
          </div>
          <div className="flex gap-1 flex-wrap">
            {hydrationNotice.fieldNames.map((field) => (
              <span key={field} className="px-1.5 py-0.5 rounded sf-chip-info font-mono">
                {field}
              </span>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (fields.length === 0) {
    return <div className="text-xs sf-text-subtle text-center py-4">No fields extracted</div>;
  }

  return (
    <div className="space-y-3">
      {hydrationNotice && (
        <div className="sf-surface-elevated p-3 text-xs space-y-2">
          <div className="sf-text-primary font-medium">
            {hydrationNotice.title}
          </div>
          <div className="sf-text-subtle">
            {hydrationNotice.description}
          </div>
          <div className="flex gap-1 flex-wrap">
            {hydrationNotice.fieldNames.map((field) => (
              <span key={field} className="px-1.5 py-0.5 rounded sf-chip-info font-mono">
                {field}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Summary strip */}
      <div className="sf-surface-elevated p-2 text-xs space-y-2">
        <div className="flex items-center justify-between">
          <span className="sf-text-subtle">{fields.length} fields</span>
          <ConfidenceBar value={summary.avgConfidence} />
        </div>
        <div className="flex gap-1 flex-wrap">
          {Object.entries(summary.methodCounts)
            .sort((a, b) => b[1] - a[1])
            .map(([m, count]) => (
              <span key={m} className={`px-1.5 py-0.5 rounded text-xs ${methodBadgeClass(m)}`}>
                {friendlyMethod(m)} &times;{count}
              </span>
            ))}
        </div>
        <div className="flex gap-2">
          <span className="sf-chip-success px-1.5 py-0.5 rounded text-xs">High {summary.tiers.high}</span>
          <span className="sf-chip-warning px-1.5 py-0.5 rounded text-xs">Med {summary.tiers.medium}</span>
          <span className="sf-chip-danger px-1.5 py-0.5 rounded text-xs">Low {summary.tiers.low}</span>
        </div>
      </div>

      {/* Method chip filter */}
      <div className="flex gap-1 flex-wrap">
        <button
          type="button"
          className={`px-1.5 py-0.5 rounded text-xs transition-colors ${methodFilter === null ? 'sf-chip-info' : 'sf-text-subtle'}`}
          onClick={() => setMethodFilter(null)}
        >
          All
        </button>
        {Object.keys(summary.methodCounts).sort().map((m) => (
          <button
            key={m}
            type="button"
            className={`px-1.5 py-0.5 rounded text-xs transition-colors ${methodFilter === m ? 'sf-chip-info' : methodBadgeClass(m)}`}
            onClick={() => setMethodFilter(methodFilter === m ? null : m)}
          >
            {friendlyMethod(m)}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="sf-table-shell overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="sf-table-head">
              <th className="sf-table-head-cell text-left px-1.5 py-1">Field</th>
              <th className="sf-table-head-cell text-left px-1.5 py-1">Value</th>
              <th className="sf-table-head-cell text-left px-1.5 py-1">Conf</th>
              <th className="sf-table-head-cell text-left px-1.5 py-1">Method</th>
              <th className="sf-table-head-cell text-left px-1.5 py-1">Source</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((f, i) => (
              <tr key={`${f.field}-${i}`} className="sf-table-row">
                <td className="px-1.5 py-1 font-mono font-medium sf-text-primary whitespace-nowrap">{f.field}</td>
                <td className="px-1.5 py-1 font-mono sf-text-muted max-w-[8rem] truncate" title={f.value ?? undefined}>{f.value ?? '\u2013'}</td>
                <td className="px-1.5 py-1"><ConfidenceBar value={f.confidence} /></td>
                <td className="px-1.5 py-1">
                  <span className={`px-1 py-0.5 rounded ${methodBadgeClass(f.method)}`}>{friendlyMethod(f.method)}</span>
                </td>
                <td className="px-1.5 py-1 font-mono sf-text-subtle" title={f.source_url}>{hostFromUrl(f.source_url)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
