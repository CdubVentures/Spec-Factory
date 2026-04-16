import type { ProductReviewPayload } from '../../../types/review.ts';
import type { KpiCard } from '../../../shared/ui/finder/types.ts';
import { pct } from '../../../utils/formatting.ts';

// ── Types ─────────────────────────────────────────────

export interface ReviewDashboardMetrics {
  readonly products: { readonly filtered: number; readonly total: number };
  readonly brands: number;
  readonly avgConfidence: number;
  readonly avgCoverage: number;
  readonly missingFields: number;
  readonly totalFields: number;
  readonly runStatus: { readonly ran: number; readonly total: number };
}

export type MetricKey = 'products' | 'brands' | 'avgConfidence' | 'avgCoverage' | 'missingFields' | 'runStatus';

// ── Compute ───────────────────────────────────────────

export function computeReviewDashboardMetrics(
  products: readonly ProductReviewPayload[],
  totalProducts: number,
  fieldCount: number,
): ReviewDashboardMetrics {
  const filtered = products.length;
  const brandSet = new Set<string>();
  let totalConf = 0;
  let totalCov = 0;
  let totalMissing = 0;
  let ranCount = 0;

  for (const p of products) {
    const brand = (p.identity?.brand || '').trim();
    if (brand) brandSet.add(brand);
    totalConf += p.metrics.confidence;
    totalCov += p.metrics.coverage;
    totalMissing += p.metrics.missing || 0;
    if (p.metrics.has_run) ranCount += 1;
  }

  return {
    products: { filtered, total: totalProducts },
    brands: brandSet.size,
    avgConfidence: filtered > 0 ? totalConf / filtered : 0,
    avgCoverage: filtered > 0 ? totalCov / filtered : 0,
    missingFields: totalMissing,
    totalFields: filtered * fieldCount,
    runStatus: { ran: ranCount, total: filtered },
  };
}

// ── Tone Assignment ───────────────────────────────────

export function assignMetricTone(key: MetricKey, m: ReviewDashboardMetrics): string {
  switch (key) {
    case 'products':
      if (m.products.filtered === 0) return 'danger';
      if (m.products.filtered === m.products.total) return 'success';
      return 'warning';
    case 'brands':
      return 'accent';
    case 'avgConfidence':
      if (m.avgConfidence >= 0.8) return 'success';
      if (m.avgConfidence >= 0.5) return 'warning';
      return 'danger';
    case 'avgCoverage':
      if (m.avgCoverage >= 0.8) return 'success';
      if (m.avgCoverage >= 0.5) return 'warning';
      return 'danger';
    case 'missingFields': {
      if (m.missingFields === 0) return 'success';
      const ratio = m.totalFields > 0 ? m.missingFields / m.totalFields : 0;
      if (ratio >= 0.2) return 'danger';
      return 'warning';
    }
    case 'runStatus':
      if (m.runStatus.ran === m.runStatus.total && m.runStatus.total > 0) return 'success';
      if (m.runStatus.ran === 0) return 'danger';
      return 'warning';
  }
}

// ── KPI Card Derivation ───────────────────────────────

export function deriveReviewKpiCards(m: ReviewDashboardMetrics): KpiCard[] {
  return [
    {
      label: 'Products',
      value: `${m.products.filtered}/${m.products.total}`,
      tone: assignMetricTone('products', m),
    },
    {
      label: 'Brands',
      value: String(m.brands),
      tone: assignMetricTone('brands', m),
    },
    {
      label: 'Avg Confidence',
      value: pct(m.avgConfidence),
      tone: assignMetricTone('avgConfidence', m),
    },
    {
      label: 'Avg Coverage',
      value: pct(m.avgCoverage),
      tone: assignMetricTone('avgCoverage', m),
    },
    {
      label: 'Missing Fields',
      value: m.totalFields > 0 ? `${m.missingFields}/${m.totalFields}` : String(m.missingFields),
      tone: assignMetricTone('missingFields', m),
    },
    {
      label: 'Run Status',
      value: `${m.runStatus.ran}/${m.runStatus.total}`,
      tone: assignMetricTone('runStatus', m),
    },
  ];
}
