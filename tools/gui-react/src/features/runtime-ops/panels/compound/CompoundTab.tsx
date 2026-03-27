import { useQuery } from '@tanstack/react-query';
import { api } from '../../../../api/client.ts';
import { usePersistedScroll } from '../../../../hooks/usePersistedScroll.ts';
import { usePersistedTab } from '../../../../stores/tabStore.ts';
import { getRefetchInterval } from '../../helpers.ts';
import { KpiStrip } from '../../components/KpiStrip.tsx';
import { CompoundCurveSubTab } from './CompoundCurveSubTab.tsx';
import { QueryIndexSubTab } from './QueryIndexSubTab.tsx';
import { UrlIndexSubTab } from './UrlIndexSubTab.tsx';
import { PlanDiffSubTab } from './PlanDiffSubTab.tsx';
import { KnobTelemetrySubTab } from './KnobTelemetrySubTab.tsx';
import type {
  CompoundSubTab,
  CompoundCurveResponse,
  CrossRunMetricsResponse,
  QuerySummaryResponse,
  UrlSummaryResponse,
  HostHealthResponse,
  KnobSnapshotsResponse,
} from '../../types.ts';

interface CompoundTabProps {
  category: string;
  runs: Array<{ run_id: string; category: string; started_at: string; status: string }>;
  isRunning: boolean;
}

const COMPOUND_SUB_TAB_KEYS = ['curve', 'queries', 'urls', 'plan-diff', 'knobs'] as const;

import { TabStrip } from '../../../../shared/ui/navigation/TabStrip.tsx';

const SUB_TAB_DEFS = [
  { id: 'curve', label: 'Compound Curve' },
  { id: 'queries', label: 'Query Index' },
  { id: 'urls', label: 'URL Index' },
  { id: 'plan-diff', label: 'Plan Diff' },
  { id: 'knobs', label: 'Knob Telemetry' },
] as const;

function verdictChipClass(verdict: string): string {
  switch (verdict) {
    case 'PROVEN': return 'sf-chip-success';
    case 'PARTIAL': return 'sf-chip-warning';
    case 'NOT_PROVEN': return 'sf-chip-danger';
    default: return 'sf-chip-neutral';
  }
}

function trendChipClass(trend: string): string {
  switch (trend) {
    case 'increasing': return 'sf-chip-success';
    case 'flat': return 'sf-chip-neutral';
    case 'decreasing': return 'sf-chip-danger';
    default: return 'sf-chip-neutral';
  }
}

export function CompoundTab({ category, runs, isRunning }: CompoundTabProps) {
  const scrollRef = usePersistedScroll(`scroll:compound:${category}`);
  const [activeSubTab, setActiveSubTab] = usePersistedTab<CompoundSubTab>(
    'runtimeOps:compound:subTab',
    'curve',
    { validValues: COMPOUND_SUB_TAB_KEYS },
  );

  const isHidden = false;
  const refetchMs = getRefetchInterval(isRunning, isHidden, 10000, 30000);

  const { data: compoundCurve } = useQuery({
    queryKey: ['compound', 'curve', category],
    queryFn: () => api.get<CompoundCurveResponse>(`/indexlab/analytics/compound-curve?category=${category}`),
    enabled: Boolean(category),
    refetchInterval: refetchMs,
  });

  const { data: crossRunMetrics } = useQuery({
    queryKey: ['compound', 'cross-run-metrics', category],
    queryFn: () => api.get<CrossRunMetricsResponse>(`/indexlab/analytics/cross-run-metrics?category=${category}`),
    enabled: Boolean(category),
    refetchInterval: refetchMs,
  });

  const { data: querySummary } = useQuery({
    queryKey: ['compound', 'query-summary', category],
    queryFn: () => api.get<QuerySummaryResponse>(`/indexlab/indexes/query-summary?category=${category}`),
    enabled: Boolean(category) && activeSubTab === 'queries',
    refetchInterval: refetchMs,
  });

  const { data: urlSummary } = useQuery({
    queryKey: ['compound', 'url-summary', category],
    queryFn: () => api.get<UrlSummaryResponse>(`/indexlab/indexes/url-summary?category=${category}`),
    enabled: Boolean(category) && activeSubTab === 'urls',
    refetchInterval: refetchMs,
  });

  const { data: hostHealth } = useQuery({
    queryKey: ['compound', 'host-health', category],
    queryFn: () => api.get<HostHealthResponse>(`/indexlab/analytics/host-health?category=${category}`),
    enabled: Boolean(category) && activeSubTab === 'urls',
    refetchInterval: refetchMs,
  });

  const { data: knobSnapshots } = useQuery({
    queryKey: ['compound', 'knob-snapshots', category],
    queryFn: () => api.get<KnobSnapshotsResponse>(`/indexlab/indexes/knob-snapshots?category=${category}`),
    enabled: Boolean(category) && activeSubTab === 'knobs',
    refetchInterval: refetchMs,
  });

  const kpiCards = [
    {
      label: 'Runs',
      value: String(crossRunMetrics?.run_count ?? '—'),
    },
    {
      label: 'Fill Rate',
      value: crossRunMetrics ? `${(crossRunMetrics.field_fill_rate * 100).toFixed(1)}%` : '—',
    },
    {
      label: 'Searches/Product',
      value: String(crossRunMetrics?.searches_per_product ?? '—'),
    },
    {
      label: 'Search Reduction',
      value: compoundCurve ? `${compoundCurve.search_reduction_pct.toFixed(1)}%` : '—',
      chipClass: compoundCurve
        ? compoundCurve.search_reduction_pct >= 30 ? 'sf-chip-success' : compoundCurve.search_reduction_pct >= 10 ? 'sf-chip-warning' : 'sf-chip-danger'
        : undefined,
    },
    {
      label: 'URL Reuse Trend',
      value: compoundCurve?.url_reuse_trend ?? '—',
      chipClass: compoundCurve ? trendChipClass(compoundCurve.url_reuse_trend) : undefined,
    },
    {
      label: 'Verdict',
      value: compoundCurve?.verdict ?? '—',
      chipClass: compoundCurve ? verdictChipClass(compoundCurve.verdict) : undefined,
    },
  ];

  return (
    <div ref={scrollRef} className="flex flex-col gap-4 p-4 overflow-y-auto">
      <KpiStrip cards={kpiCards} />

      <TabStrip
        tabs={SUB_TAB_DEFS}
        activeTab={activeSubTab}
        onSelect={setActiveSubTab}
      />

      {activeSubTab === 'curve' && <CompoundCurveSubTab data={compoundCurve} />}
      {activeSubTab === 'queries' && <QueryIndexSubTab data={querySummary} />}
      {activeSubTab === 'urls' && <UrlIndexSubTab urlData={urlSummary} hostData={hostHealth} />}
      {activeSubTab === 'plan-diff' && <PlanDiffSubTab runs={runs} category={category} />}
      {activeSubTab === 'knobs' && <KnobTelemetrySubTab data={knobSnapshots} category={category} />}
    </div>
  );
}
