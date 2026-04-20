import { useMemo } from 'react';
import { SkeletonBlock } from '../../../shared/ui/feedback/SkeletonBlock.tsx';
import { usd, compactNumber } from '../../../utils/formatting.ts';
import { computeAvgPerCall, computePeriodDeltas, chartColor } from '../billingTransforms.ts';
import { resolveBillingCallType } from '../billingCallTypeRegistry.generated.ts';
import type {
  BillingSummaryResponse,
  BillingDailyResponse,
  BillingByReasonResponse,
  BillingTrendDelta,
} from '../billingTypes.ts';

interface BillingHeroBandProps {
  summary: BillingSummaryResponse | undefined;
  priorSummary: BillingSummaryResponse | undefined;
  daily: BillingDailyResponse | undefined;
  byReason: BillingByReasonResponse | undefined;
  dateRangeLabel: string;
  runsLabel: string;
  isLoading: boolean;
  isStale?: boolean;
}

function TrendBadge({ delta, suffix }: { delta: BillingTrendDelta; suffix?: string }) {
  if (delta.direction === 'flat') {
    return <span className="sf-hero-trend sf-hero-trend-flat">◆ 0%{suffix ? ` ${suffix}` : ''}</span>;
  }
  const arrow = delta.direction === 'up' ? '▲' : '▼';
  const sign = delta.pct > 0 ? '+' : '';
  return (
    <span className={`sf-hero-trend sf-hero-trend-${delta.direction}`}>
      {arrow} {sign}{delta.pct.toFixed(1)}%{suffix ? ` ${suffix}` : ''}
    </span>
  );
}

// WHY: Tiny inline sparkline — keeps the hero band self-contained without
// pulling recharts for a 22-pixel decoration.
function Sparkline({ values, stroke, fill }: { values: readonly number[]; stroke: string; fill?: string }) {
  if (values.length === 0) return null;
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const range = max - min || 1;
  const w = 120;
  const h = 22;
  const step = values.length > 1 ? w / (values.length - 1) : 0;
  const points = values.map((v, i) => {
    const x = i * step;
    const y = h - ((v - min) / range) * (h - 2) - 1;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const pathD = `M${points.join(' L')}`;
  const gradientId = `sf-sparkline-${stroke.replace(/[^a-zA-Z0-9]/g, '')}`;
  const areaD = fill
    ? `${pathD} L${w},${h} L0,${h} Z`
    : '';
  return (
    <svg className="sf-hero-sparkline" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none">
      {fill ? (
        <>
          <defs>
            <linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor={fill} stopOpacity="0.5" />
              <stop offset="100%" stopColor={fill} stopOpacity="0" />
            </linearGradient>
          </defs>
          <path d={areaD} fill={`url(#${gradientId})`} />
        </>
      ) : null}
      <path d={pathD} stroke={stroke} strokeWidth="1.3" fill="none" />
    </svg>
  );
}

// WHY: Hero-band KPI cell — shared layout for Cost + Tokens sides.
function HeroKpi({
  label,
  ico,
  value,
  unit,
  trend,
  sparkValues,
  sparkStroke,
  sparkFill,
  subline,
  valueClass,
}: {
  label: string;
  ico: string;
  value: string;
  unit?: string;
  trend?: BillingTrendDelta | null;
  sparkValues?: readonly number[];
  sparkStroke: string;
  sparkFill?: string;
  subline?: string;
  valueClass?: string;
}) {
  return (
    <div className="sf-hero-kpi">
      <div className="sf-hero-kpi-label">
        <span className="sf-hero-kpi-ico">{ico}</span>
        {label}
      </div>
      <div className={`sf-hero-kpi-value${valueClass ? ` ${valueClass}` : ''}`}>
        {value}
        {unit ? <span className="sf-hero-kpi-unit">{unit}</span> : null}
      </div>
      <div className="sf-hero-kpi-sub">
        {trend ? <TrendBadge delta={trend} /> : null}
        {subline ? <span>{subline}</span> : null}
      </div>
      {sparkValues && sparkValues.length > 0 ? (
        <Sparkline values={sparkValues} stroke={sparkStroke} fill={sparkFill} />
      ) : null}
    </div>
  );
}

export function BillingHeroBand({
  summary,
  priorSummary,
  daily,
  byReason,
  dateRangeLabel,
  runsLabel,
  isLoading,
  isStale,
}: BillingHeroBandProps) {
  const totals = summary?.totals ?? { cost_usd: 0, calls: 0, prompt_tokens: 0, completion_tokens: 0 };
  const avg = computeAvgPerCall(totals.cost_usd, totals.calls);
  const totalTokens = totals.prompt_tokens + totals.completion_tokens;
  const deltas = useMemo(() => computePeriodDeltas(summary, priorSummary), [summary, priorSummary]);

  // WHY: Top call type for hero KPI — already sorted by cost in by-reason response.
  const topReason = byReason?.reasons?.[0] ?? null;
  const topReasonEntry = topReason ? resolveBillingCallType(topReason.key) : null;
  const topReasonPct = topReason && totals.cost_usd > 0
    ? (topReason.cost_usd / totals.cost_usd) * 100
    : 0;

  // Sparkline series from daily data (last 30 days of whatever's in range)
  const days = daily?.days ?? [];
  const costSeries = useMemo(() => days.map((d) => d.cost_usd), [days]);
  const callsSeries = useMemo(() => days.map((d) => d.calls), [days]);
  const avgSeries = useMemo(
    () => days.map((d) => (d.calls > 0 ? d.cost_usd / d.calls : 0)),
    [days],
  );
  const tokensSeries = useMemo(
    () => days.map((d) => d.prompt_tokens + d.completion_tokens),
    [days],
  );
  const promptSeries = useMemo(() => days.map((d) => d.prompt_tokens), [days]);
  const completionSeries = useMemo(() => days.map((d) => d.completion_tokens), [days]);

  const staleClass = isStale ? ' sf-stale-refetch' : '';

  if (isLoading) {
    return <SkeletonBlock className="sf-hero-band-skel" />;
  }

  return (
    <section className={`sf-hero-band${staleClass}`}>
      <div className="sf-hero-header">
        <div className="sf-hero-title-block">
          <div className="sf-hero-eyebrow">LLM Billing &amp; Usage</div>
          <h1 className="sf-hero-title">Cost &amp; Token Overview</h1>
          <p className="sf-hero-meta">{dateRangeLabel} · {runsLabel}</p>
        </div>
      </div>

      <div className="sf-hero-split">

        <div className="sf-hero-half sf-hero-cost">
          <div className="sf-hero-half-header">
            <span className="sf-hero-flame sf-hero-flame-cost" />
            <h2>Cost Overview</h2>
            <span className="sf-hero-half-meta">USD billed</span>
          </div>
          <div className="sf-hero-kpi-grid">
            <HeroKpi
              label="Total"
              ico="$"
              value={usd(totals.cost_usd, 2)}
              trend={deltas.cost_usd}
              sparkValues={costSeries}
              sparkStroke="var(--sf-cost-accent, #818cf8)"
              sparkFill="var(--sf-cost-accent, #818cf8)"
            />
            <HeroKpi
              label="Calls"
              ico="⚡"
              value={compactNumber(totals.calls)}
              trend={deltas.calls}
              sparkValues={callsSeries}
              sparkStroke="var(--sf-cost-accent, #818cf8)"
            />
            <HeroKpi
              label="Avg / Call"
              ico="⊘"
              value={usd(avg, 4)}
              sparkValues={avgSeries}
              sparkStroke="var(--sf-token-text-subtle, #94a3b8)"
            />
            <HeroKpi
              label="Top Type"
              ico="★"
              value={topReasonEntry?.label ?? '—'}
              unit={topReason ? usd(topReason.cost_usd, 2) : undefined}
              subline={topReason ? `${topReasonPct.toFixed(1)}% of spend` : undefined}
              sparkStroke={topReasonEntry ? chartColor(topReasonEntry.color) : 'var(--sf-token-text-subtle, #94a3b8)'}
              sparkFill={topReasonEntry ? chartColor(topReasonEntry.color) : undefined}
              sparkValues={topReason ? buildReasonSeries(days, topReason.key, byReason) : []}
              valueClass="sf-hero-kpi-value-compact"
            />
          </div>
        </div>

        <div className="sf-hero-divider" aria-hidden="true" />

        <div className="sf-hero-half sf-hero-tok">
          <div className="sf-hero-half-header">
            <span className="sf-hero-flame sf-hero-flame-tok" />
            <h2>Token Overview</h2>
            <span className="sf-hero-half-meta">billable units</span>
          </div>
          <div className="sf-hero-kpi-grid">
            <HeroKpi
              label="Total"
              ico="#"
              value={compactNumber(totalTokens)}
              trend={sumDelta(deltas.prompt_tokens, deltas.completion_tokens)}
              sparkValues={tokensSeries}
              sparkStroke="var(--sf-tok-accent, #22d3ee)"
              sparkFill="var(--sf-tok-accent, #22d3ee)"
            />
            <HeroKpi
              label="Prompt"
              ico="◐"
              value={compactNumber(totals.prompt_tokens)}
              subline={totalTokens > 0 ? `${((totals.prompt_tokens / totalTokens) * 100).toFixed(1)}%` : undefined}
              sparkValues={promptSeries}
              sparkStroke="var(--sf-tok-prompt, #22d3ee)"
            />
            <HeroKpi
              label="Completion"
              ico="◑"
              value={compactNumber(totals.completion_tokens)}
              subline={totalTokens > 0 ? `${((totals.completion_tokens / totalTokens) * 100).toFixed(1)}%` : undefined}
              sparkValues={completionSeries}
              sparkStroke="var(--sf-tok-completion, #a78bfa)"
            />
            <HeroKpi
              label="Cache Hit"
              ico="✦"
              value="—"
              subline="Not yet tracked"
              sparkStroke="var(--sf-tok-cached, #34d399)"
              valueClass="sf-hero-kpi-value-placeholder"
            />
          </div>
        </div>

      </div>
    </section>
  );
}

// WHY: The daily endpoint doesn't emit per-reason series, so the top-reason
// sparkline uses the flat daily costs as a proxy — still shows the shape of
// activity over time without a dedicated series.
function buildReasonSeries(
  days: ReadonlyArray<{ cost_usd: number }>,
  _reasonKey: string,
  _byReason: BillingByReasonResponse | undefined,
): number[] {
  return days.map((d) => d.cost_usd);
}

// WHY: Combined token trend = weighted delta across prompt+completion. Simple
// average of directions is meaningless; recompute against the total.
function sumDelta(a: BillingTrendDelta, b: BillingTrendDelta): BillingTrendDelta {
  const pct = (a.pct + b.pct) / 2;
  if (Math.abs(pct) < 0.5) return { pct: 0, direction: 'flat' };
  return { pct, direction: pct > 0 ? 'up' : 'down' };
}

