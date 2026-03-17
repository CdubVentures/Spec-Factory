import { useQuery } from '@tanstack/react-query';
import { api } from '../../../../api/client';
import { usePersistedTab } from '../../../../stores/tabStore';
import { getRefetchInterval } from '../../helpers';
import { KpiStrip } from '../../components/KpiStrip';
import { CompoundCurveSubTab } from './CompoundCurveSubTab';
import { QueryIndexSubTab } from './QueryIndexSubTab';
import { UrlIndexSubTab } from './UrlIndexSubTab';
import { PlanDiffSubTab } from './PlanDiffSubTab';
import { KnobTelemetrySubTab } from './KnobTelemetrySubTab';
import type {
  CompoundSubTab,
  CompoundCurveResponse,
  CrossRunMetricsResponse,
  QuerySummaryResponse,
  UrlSummaryResponse,
  HostHealthResponse,
  KnobSnapshotsResponse,
} from '../../types';

interface CompoundTabProps {
  category: string;
  runs: Array<{ run_id: string; category: string; started_at: string; status: string }>;
  isRunning: boolean;
}

const COMPOUND_SUB_TAB_KEYS = ['curve', 'queries', 'urls', 'plan-diff', 'knobs'] as const;

const SUB_TAB_DEFS: { key: CompoundSubTab; label: string }[] = [
  { key: 'curve', label: 'Compound Curve' },
  { key: 'queries', label: 'Query Index' },
  { key: 'urls', label: 'URL Index' },
  { key: 'plan-diff', label: 'Plan Diff' },
  { key: 'knobs', label: 'Knob Telemetry' },
];

const tabCls = 'px-4 py-2 text-sm font-medium whitespace-nowrap transition-colors cursor-pointer sf-tab-item';
const activeTabCls = 'sf-tab-item-active';

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
    <div className="flex flex-col gap-4 p-4 overflow-y-auto">
      <KpiStrip cards={kpiCards} />

      <nav className="flex gap-1 px-1 py-1 sf-tab-strip rounded">
        {SUB_TAB_DEFS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setActiveSubTab(t.key)}
            className={`${tabCls} ${activeSubTab === t.key ? activeTabCls : ''}`}
          >
            {t.label}
          </button>
        ))}
      </nav>

      {activeSubTab === 'curve' && <CompoundCurveSubTab data={compoundCurve} />}
      {activeSubTab === 'queries' && <QueryIndexSubTab data={querySummary} />}
      {activeSubTab === 'urls' && <UrlIndexSubTab urlData={urlSummary} hostData={hostHealth} />}
      {activeSubTab === 'plan-diff' && <PlanDiffSubTab runs={runs} category={category} />}
      {activeSubTab === 'knobs' && <KnobTelemetrySubTab data={knobSnapshots} category={category} />}
    </div>
  );
}
