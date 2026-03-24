import { useMemo } from 'react';
import type { WorkerDetailResponse } from '../../types.ts';
import { formatBytes, pctString, methodBadgeClass, friendlyMethod, statusBadgeClass } from '../../helpers.ts';

interface DrawerMetricsTabProps {
  data: WorkerDetailResponse | undefined;
}

interface KpiCard {
  label: string;
  value: string;
}

const DOC_STATUS_FUNNEL = ['discovered', 'fetching', 'fetched', 'parsed', 'indexed', 'fetch_error'] as const;

export function DrawerMetricsTab({ data }: DrawerMetricsTabProps) {
  const computed = useMemo(() => {
    const docs = data?.documents ?? [];
    const fields = data?.extraction_fields ?? [];
    const totalBytes = docs.reduce((sum, d) => sum + (d.bytes ?? 0), 0);
    const avgConfidence = fields.length > 0
      ? fields.reduce((sum, f) => sum + f.confidence, 0) / fields.length
      : 0;
    const queueCount = data?.queue_jobs?.length ?? 0;
    const shotCount = data?.screenshots?.length ?? 0;

    const kpis: KpiCard[] = [
      { label: 'Documents', value: String(docs.length) },
      { label: 'Fields', value: String(fields.length) },
      { label: 'Total Size', value: formatBytes(totalBytes) },
      { label: 'Avg Confidence', value: pctString(avgConfidence) },
      { label: 'Queue Jobs', value: String(queueCount) },
      { label: 'Screenshots', value: String(shotCount) },
    ];

    // Content type distribution
    const ctCounts: Record<string, number> = {};
    for (const d of docs) {
      const ct = d.content_type || 'unknown';
      ctCounts[ct] = (ctCounts[ct] ?? 0) + 1;
    }

    // Method distribution
    const methodCounts: Record<string, number> = {};
    for (const f of fields) {
      const m = f.method || 'unknown';
      methodCounts[m] = (methodCounts[m] ?? 0) + 1;
    }

    // Status funnel
    const statusCounts: Record<string, number> = {};
    for (const d of docs) {
      statusCounts[d.status] = (statusCounts[d.status] ?? 0) + 1;
    }
    const maxStatusCount = Math.max(1, ...Object.values(statusCounts));

    // Confidence histogram
    const confTiers = { high: 0, medium: 0, low: 0 };
    for (const f of fields) {
      if (f.confidence >= 0.9) confTiers.high += 1;
      else if (f.confidence >= 0.7) confTiers.medium += 1;
      else confTiers.low += 1;
    }
    const maxConfTier = Math.max(1, confTiers.high, confTiers.medium, confTiers.low);

    return { kpis, ctCounts, methodCounts, statusCounts, maxStatusCount, confTiers, maxConfTier, docCount: docs.length };
  }, [data]);

  return (
    <div className="space-y-4 text-xs">
      {/* KPI cards */}
      <div className="grid grid-cols-2 gap-2">
        {computed.kpis.map((kpi) => (
          <div key={kpi.label} className="sf-surface-elevated p-2 rounded">
            <div className="sf-text-subtle">{kpi.label}</div>
            <div className="font-mono sf-text-primary text-lg">{kpi.value}</div>
          </div>
        ))}
      </div>

      {/* Content type distribution */}
      {computed.docCount > 0 && (
        <div className="space-y-1">
          <div className="sf-text-subtle font-medium">Content Types</div>
          <div className="flex h-3 rounded-full overflow-hidden gap-px">
            {Object.entries(computed.ctCounts).map(([ct, count]) => {
              const pct = (count / computed.docCount) * 100;
              const isHtml = ct.includes('html');
              const isPdf = ct.includes('pdf');
              const isJson = ct.includes('json');
              const cls = isHtml ? 'sf-chip-info' : isPdf ? 'sf-chip-warning' : isJson ? 'sf-chip-success' : 'sf-chip-neutral';
              return (
                <div key={ct} className={`${cls} h-full`} style={{ width: `${pct}%` }} title={`${ct}: ${count}`} />
              );
            })}
          </div>
          <div className="flex gap-1.5 flex-wrap">
            {Object.entries(computed.ctCounts).map(([ct, count]) => (
              <span key={ct} className="sf-text-muted">{ct.split('/').pop()} {count}</span>
            ))}
          </div>
        </div>
      )}

      {/* Method distribution */}
      {Object.keys(computed.methodCounts).length > 0 && (
        <div className="space-y-1">
          <div className="sf-text-subtle font-medium">Extraction Methods</div>
          <div className="flex gap-1 flex-wrap">
            {Object.entries(computed.methodCounts)
              .sort((a, b) => b[1] - a[1])
              .map(([m, count]) => (
                <span key={m} className={`px-1.5 py-0.5 rounded ${methodBadgeClass(m)}`}>{friendlyMethod(m)} {count}</span>
              ))}
          </div>
        </div>
      )}

      {/* Status funnel */}
      {computed.docCount > 0 && (
        <div className="space-y-1">
          <div className="sf-text-subtle font-medium">Status Funnel</div>
          <div className="space-y-1">
            {DOC_STATUS_FUNNEL.map((status) => {
              const count = computed.statusCounts[status] ?? 0;
              if (count === 0) return null;
              const widthPct = (count / computed.maxStatusCount) * 100;
              return (
                <div key={status} className="flex items-center gap-2">
                  <span className={`w-16 text-right px-1 py-0.5 rounded ${statusBadgeClass(status)}`}>{status}</span>
                  <div className="flex-1 h-3 rounded-full overflow-hidden sf-surface-panel">
                    <div className={`h-full rounded-full ${statusBadgeClass(status)}`} style={{ width: `${widthPct}%` }} />
                  </div>
                  <span className="font-mono sf-text-muted w-6 text-right">{count}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Confidence histogram */}
      <div className="space-y-1">
        <div className="sf-text-subtle font-medium">Confidence Distribution</div>
        <div className="space-y-1">
          {[
            { label: 'High (\u226590%)', count: computed.confTiers.high, cls: 'sf-chip-success' },
            { label: 'Med (70-89%)', count: computed.confTiers.medium, cls: 'sf-chip-warning' },
            { label: 'Low (<70%)', count: computed.confTiers.low, cls: 'sf-chip-danger' },
          ].map((tier) => {
            const widthPct = (tier.count / computed.maxConfTier) * 100;
            return (
              <div key={tier.label} className="flex items-center gap-2">
                <span className="w-20 sf-text-subtle">{tier.label}</span>
                <div className="flex-1 h-3 rounded-full overflow-hidden sf-surface-panel">
                  <div className={`h-full rounded-full ${tier.cls}`} style={{ width: `${widthPct}%` }} />
                </div>
                <span className="font-mono sf-text-muted w-6 text-right">{tier.count}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
