import type { LlmCallRow, LlmWorkerSummary, PrefetchTabKey } from '../../types.ts';

// ── Call type metadata ───────────────────────────────────────────────────────

export interface CallTypeDef {
  symbol: string;
  label: string;
  prefetchTab: PrefetchTabKey | null;
  tabCode: string | null;
  chipClass: string;
  barClass: string;
}

export const CALL_TYPE_META: Record<string, CallTypeDef> = {
  needset_planner: { symbol: '\u25A3', label: 'NeedSet Planner', prefetchTab: 'needset',        tabCode: '01', chipClass: 'sf-chip-warning', barClass: 'sf-bar-ct-needset-planner' },
  brand_resolver:  { symbol: '\u25C8', label: 'Brand Resolver',  prefetchTab: 'brand_resolver', tabCode: '02', chipClass: 'sf-chip-info',    barClass: 'sf-bar-ct-brand-resolver' },
  search_planner:  { symbol: '\u25CE', label: 'Search Planner',  prefetchTab: 'search_planner', tabCode: '04', chipClass: 'sf-chip-purple',  barClass: 'sf-bar-ct-search-planner' },
  serp_selector:   { symbol: '\u229E', label: 'SERP Selector',   prefetchTab: 'serp_selector',  tabCode: '07', chipClass: 'sf-chip-warning', barClass: 'sf-bar-ct-serp-triage' },
  unknown:         { symbol: '?',      label: 'Unknown',         prefetchTab: null, tabCode: null,  chipClass: 'sf-chip-neutral', barClass: 'sf-bar-ct-extraction' },
};

export const CALL_TYPE_ORDER = [
  'needset_planner', 'brand_resolver', 'search_planner', 'serp_selector',
];

export function ctMeta(ct: string): CallTypeDef {
  return CALL_TYPE_META[ct] ?? CALL_TYPE_META['unknown'];
}

// ── Formatting helpers ───────────────────────────────────────────────────────

export function fmtNum(value: number): string {
  if (!Number.isFinite(value)) return '0';
  return value.toLocaleString();
}

export function fmtCost(usd: number, active = false): string {
  if (active) return '\u2014';
  if (!Number.isFinite(usd) || usd === 0) return '$0';
  if (usd < 0.001) return `$${usd.toFixed(6)}`;
  if (usd < 0.01) return `$${usd.toFixed(5)}`;
  if (usd < 1) return `$${usd.toFixed(4)}`;
  return `$${usd.toFixed(2)}`;
}

export function fmtDur(ms: number | null, active = false): string {
  if (active) return '\u2014';
  if (ms == null || !Number.isFinite(ms) || ms === 0) return '\u2014';
  return `${(ms / 1000).toFixed(1)}s`;
}

export function fmtLatency(ms: number): string {
  if (ms >= 1000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.round(ms)}ms`;
}

export function pctOf(v: number, t: number): number {
  return t <= 0 ? 0 : Math.round((v / t) * 100);
}

export function fmtSec(ms: number | null | undefined): string {
  if (ms == null || !Number.isFinite(ms) || ms <= 0) return '\u2014';
  return `${(ms / 1000).toFixed(1)}s`;
}

// ── Compact number formatter for hero stats ──────────────────────────────────

export function fmtCompact(n: number): string {
  if (!Number.isFinite(n) || n === 0) return '0';
  if (n >= 10_000) return `${(n / 1000).toFixed(1)}K`;
  return n.toLocaleString();
}

// ── Preview formatters ───────────────────────────────────────────────────────

export function formatInputPreview(call: LlmCallRow): string {
  if (!call.prompt_preview) return '\u2014';
  try {
    const p = JSON.parse(call.prompt_preview);
    if (p.user) return String(p.user).slice(0, 120);
    if (p.redacted) return `${call.call_type} (${(p.system_chars || 0) + (p.user_chars || 0)} chars)`;
  } catch { /* use raw */ }
  return call.prompt_preview.slice(0, 120);
}

export function formatOutputPreview(call: LlmCallRow): string {
  if (!call.response_preview) return '\u2014';
  return call.response_preview.slice(0, 120);
}

// ── Filter groups ────────────────────────────────────────────────────────────

export const FILTER_GROUPS: ReadonlyArray<{ label: string; types: string[] }> = [
  { label: 'LLM Calls', types: ['needset_planner', 'brand_resolver', 'search_planner', 'serp_selector'] },
];

// ── Computed stats (filter-aware) ────────────────────────────────────────────

export function computeFilteredStats(
  filteredCalls: LlmCallRow[],
  summary: LlmWorkerSummary | null,
  activeFilter: string,
): LlmWorkerSummary {
  if (activeFilter === 'all' && summary) return summary;

  const fc = filteredCalls;
  let totalCost = 0, pTok = 0, cTok = 0, durSum = 0, durN = 0;
  const roundSet = new Set<number>();
  const modelMap: Record<string, { model: string; calls: number; cost_usd: number }> = {};
  const ctMap: Record<string, { call_type: string; cost_usd: number }> = {};
  let activeN = 0, doneN = 0;

  for (const c of fc) {
    totalCost += c.estimated_cost;
    pTok += c.prompt_tokens;
    cTok += c.completion_tokens;
    if (c.status === 'active') activeN++; else doneN++;
    if (c.status !== 'active' && c.duration_ms && c.duration_ms > 0) { durSum += c.duration_ms; durN++; }
    roundSet.add(c.round);
    const mk = c.model || 'unknown';
    if (!modelMap[mk]) modelMap[mk] = { model: mk, calls: 0, cost_usd: 0 };
    modelMap[mk].calls++;
    modelMap[mk].cost_usd += c.estimated_cost;
    const ck = c.call_type || 'unknown';
    if (!ctMap[ck]) ctMap[ck] = { call_type: ck, cost_usd: 0 };
    ctMap[ck].cost_usd += c.estimated_cost;
  }

  const maxRound = roundSet.size > 0 ? Math.max(...roundSet) : 0;
  return {
    total_calls: fc.length,
    active_calls: activeN,
    completed_calls: doneN,
    total_cost_usd: totalCost,
    total_tokens: pTok + cTok,
    prompt_tokens: pTok,
    completion_tokens: cTok,
    avg_latency_ms: durN > 0 ? Math.round(durSum / durN) : 0,
    rounds: roundSet.size,
    calls_in_latest_round: maxRound > 0 ? fc.filter((c) => c.round === maxRound).length : 0,
    by_model: Object.values(modelMap).sort((a, b) => b.cost_usd - a.cost_usd),
    by_call_type: Object.values(ctMap).sort((a, b) => b.cost_usd - a.cost_usd),
  };
}

// ── Group calls by round ─────────────────────────────────────────────────────

export function groupByRound(filteredCalls: LlmCallRow[]): Array<{ round: number; calls: LlmCallRow[] }> {
  const map = new Map<number, LlmCallRow[]>();
  for (const c of filteredCalls) {
    if (!map.has(c.round)) map.set(c.round, []);
    map.get(c.round)!.push(c);
  }
  const ctIdx = new Map(CALL_TYPE_ORDER.map((ct, i) => [ct, i]));
  const ctRank = (ct: string) => ctIdx.get(ct) ?? CALL_TYPE_ORDER.length;
  return [...map.entries()]
    .map(([round, rc]) => ({ round, calls: rc.sort((a, b) => ctRank(a.call_type) - ctRank(b.call_type)) }))
    .sort((a, b) => a.round - b.round);
}

// ── Donut chart geometry ─────────────────────────────────────────────────────

export interface DonutSegment {
  model: string;
  calls: number;
  costUsd: number;
  dashArray: string;
  dashOffset: string;
  color: string;
}

const DONUT_RADIUS = 43;
const DONUT_CIRCUMFERENCE = 2 * Math.PI * DONUT_RADIUS;

export function modelRingColor(model: string): string {
  const m = model.toLowerCase();
  if (m.includes('haiku'))  return 'var(--sf-token-state-success-fg)';
  if (m.includes('sonnet')) return 'var(--sf-token-state-info-fg)';
  if (m.includes('opus'))   return 'var(--sf-token-accent)';
  if (m.includes('flash-lite') || m.includes('flash_lite')) return 'var(--sf-teal-fg)';
  if (m.includes('flash') || m.includes('gemini')) return 'var(--sf-token-state-info-fg)';
  if (m.includes('deepseek')) return 'var(--sf-purple-fg)';
  if (m.includes('gpt'))   return 'var(--sf-token-state-warning-fg)';
  return 'var(--sf-token-text-subtle)';
}

export function computeDonutSegments(
  byModel: Array<{ model: string; calls: number; cost_usd: number }>,
): DonutSegment[] {
  const totalCalls = byModel.reduce((sum, m) => sum + m.calls, 0);
  if (totalCalls === 0) return [];

  let offsetAcc = 0;
  return byModel.map((m) => {
    const arcLen = (m.calls / totalCalls) * DONUT_CIRCUMFERENCE;
    const segment: DonutSegment = {
      model: m.model,
      calls: m.calls,
      costUsd: m.cost_usd,
      dashArray: `${arcLen} ${DONUT_CIRCUMFERENCE}`,
      dashOffset: `${-offsetAcc}`,
      color: modelRingColor(m.model),
    };
    offsetAcc += arcLen;
    return segment;
  });
}

// ── Narrative builder ────────────────────────────────────────────────────────

export interface NarrativeData {
  completed: number;
  rounds: number;
  modelCount: number;
  topType: string;
  topPct: number;
  avgLatency: string;
  latestRoundCalls: number;
}

export function buildNarrative(stats: LlmWorkerSummary): NarrativeData {
  const topCt = stats.by_call_type[0];
  const topPct = stats.total_cost_usd > 0 && topCt
    ? Math.round((topCt.cost_usd / stats.total_cost_usd) * 100)
    : 0;
  return {
    completed: stats.completed_calls,
    rounds: stats.rounds,
    modelCount: stats.by_model.length,
    topType: topCt ? ctMeta(topCt.call_type).label : 'N/A',
    topPct,
    avgLatency: stats.avg_latency_ms > 0 ? fmtLatency(stats.avg_latency_ms) : '\u2014',
    latestRoundCalls: stats.calls_in_latest_round,
  };
}
