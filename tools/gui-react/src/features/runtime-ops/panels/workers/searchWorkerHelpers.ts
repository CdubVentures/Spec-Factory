import type { SearchWorkerAttempt, RuntimeOpsWorkerRow } from '../../types.ts';

// ── Provider colors (theme-aware) ────────────────────────────────────────────
// WHY: Each provider's palette resolves through --sf-token-provider-* tokens
// (defined in theme.css with light + dark variants). The lookup returns
// var() references; light/dark switching happens automatically via the
// --sf-theme-mode CSS cascade \u2014 no JS branching required.

const PROVIDER_KEYS = ['google', 'bing', 'brave', 'serper'] as const;
type ProviderKey = typeof PROVIDER_KEYS[number] | 'unknown';

function tokenSet(key: ProviderKey): { text: string; bg: string; border: string } {
  return {
    text:   `var(--sf-token-provider-${key}-fg)`,
    bg:     `var(--sf-token-provider-${key}-bg)`,
    border: `var(--sf-token-provider-${key}-border)`,
  };
}

export function getProviderColors(provider: string): { text: string; bg: string; border: string } {
  const p = provider.toLowerCase();
  for (const key of PROVIDER_KEYS) {
    if (p.includes(key)) return tokenSet(key);
  }
  return tokenSet('unknown');
}

// ── Status helpers ───────────────────────────────────────────────────────────

export function searchStatusLabel(status: string): { label: string; chipClass: string } {
  switch (status) {
    case 'done':    return { label: 'Done',        chipClass: 'sf-chip-success' };
    case 'zero':    return { label: '0 results',   chipClass: 'sf-chip-warning' };
    case 'running': return { label: 'Running\u2026', chipClass: 'sf-chip-info' };
    default:        return { label: status,        chipClass: 'sf-chip-neutral' };
  }
}

export function stateBadgeContent(state: string): { label: string; chipClass: string; pulse: boolean } {
  switch (state) {
    case 'running': return { label: 'Running',       chipClass: 'sf-chip-success',           pulse: true };
    case 'stuck':   return { label: '\u26A0 Stalled', chipClass: 'sf-chip-warning',           pulse: false };
    case 'queued':  return { label: 'Queued',         chipClass: 'sf-chip-neutral opacity-50', pulse: false };
    case 'idle':    return { label: '\u25CB Idle',     chipClass: 'sf-chip-neutral',           pulse: false };
    default:        return { label: state,            chipClass: 'sf-chip-neutral',           pulse: false };
  }
}

// ── Attempt label (p1, p2, f1, f2) ──────────────────────────────────────────

export function attemptLabel(attempt: SearchWorkerAttempt): string {
  const prefix = attempt.attempt_type === 'fallback' ? 'f' : 'p';
  return `${prefix}${attempt.attempt_type_label || attempt.attempt_no}`;
}

// ── Computed stats ───────────────────────────────────────────────────────────

export interface SearchWorkerStats {
  started: number;
  completed: number;
  zeroResults: number;
  avgLatencyMs: number;
  avgResults: number;
  totalResults: number;
}

export function computeSearchStats(
  attempts: SearchWorkerAttempt[],
  worker: RuntimeOpsWorkerRow,
): SearchWorkerStats {
  const started = attempts.length || (worker.tasks_started ?? 0);
  const completed = attempts.filter((a) => a.status === 'done').length;
  const zeroResults = attempts.filter((a) => a.status === 'zero').length;
  const totalResults = attempts.reduce((sum, a) => sum + a.result_count, 0);

  const durAttempts = attempts.filter((a) => a.status !== 'running' && a.duration_ms > 0);
  const avgLatencyMs = durAttempts.length > 0
    ? Math.round(durAttempts.reduce((s, a) => s + a.duration_ms, 0) / durAttempts.length)
    : 0;

  const resAttempts = attempts.filter((a) => a.status === 'done');
  const avgResults = resAttempts.length > 0
    ? totalResults / resAttempts.length
    : 0;

  return { started, completed, zeroResults, avgLatencyMs, avgResults, totalResults };
}

// ── Narrative ────────────────────────────────────────────────────────────────

export interface SearchNarrativeData {
  completed: number;
  started: number;
  provider: string;
  zeroResults: number;
  avgResults: string;
  avgLatency: string;
}

export function buildSearchNarrative(
  stats: SearchWorkerStats,
  activeProvider: string,
  fmtMs: (ms: number) => string,
): SearchNarrativeData {
  return {
    completed: stats.completed,
    started: stats.started,
    provider: activeProvider || 'unknown',
    zeroResults: stats.zeroResults,
    avgResults: stats.avgResults.toFixed(1),
    avgLatency: stats.avgLatencyMs > 0 ? fmtMs(stats.avgLatencyMs) : '\u2014',
  };
}

// ── Provider usage aggregation ───────────────────────────────────────────────

export interface ProviderUsage {
  provider: string;
  queries: number;
  results: number;
}

export function computeProviderUsage(attempts: SearchWorkerAttempt[]): ProviderUsage[] {
  const map: Record<string, ProviderUsage> = {};
  for (const a of attempts) {
    const p = a.provider || 'unknown';
    if (!map[p]) map[p] = { provider: p, queries: 0, results: 0 };
    map[p].queries++;
    map[p].results += a.result_count;
  }
  return Object.values(map).sort((a, b) => b.queries - a.queries);
}

// ── Triage summary ───────────────────────────────────────────────────────────

export interface TriageSummary {
  keep: number;
  maybe: number;
  drop: number;
  hardDrop: number;
  total: number;
  fetched: number;
}

export function computeTriageSummary(results: Array<{ decision: string; fetched: boolean }>): TriageSummary {
  let keep = 0, maybe = 0, drop = 0, hardDrop = 0, fetched = 0;
  for (const r of results) {
    if (r.decision === 'keep') keep++;
    else if (r.decision === 'maybe') maybe++;
    else if (r.decision === 'hard_drop') hardDrop++;
    else drop++;
    if (r.fetched) fetched++;
  }
  return { keep, maybe, drop, hardDrop, total: results.length, fetched };
}
