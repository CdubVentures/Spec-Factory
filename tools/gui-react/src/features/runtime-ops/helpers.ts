import { resolvePoolStage, POOL_STAGE_KEYS } from './poolStageRegistry.ts';
import {
  resolveMethodBadge,
  resolveTierBadge,
  resolveStatusBadge,
  resolveWorkerStateBadge,
  resolveFieldStatusBadge,
  resolveFallbackResultBadge,
  resolveFetchModeBadge,
  resolveQueueStatusBadge,
  resolveLlmCallStatusBadge,
  resolveTriageDecisionBadge,
  resolveDomainRoleBadge,
  resolveSafetyClassBadge,
} from './badgeRegistries.ts';

export { POOL_STAGE_KEYS as STAGE_ORDER };

export function poolBadgeClass(pool: string): string { return resolvePoolStage(pool).badge; }
export function poolDotClass(pool: string): string { return resolvePoolStage(pool).dot; }
export function poolMeterFillClass(pool: string): string { return resolvePoolStage(pool).meterFill; }
export function poolSelectedTabClass(pool: string): string { return resolvePoolStage(pool).selectedTab; }
export function poolOutlineTabClass(pool: string): string { return resolvePoolStage(pool).outlineTab; }
export function stageBadgeClass(stage: string): string { return resolvePoolStage(stage).badge; }
export function stageMeterFillClass(stage: string): string { return resolvePoolStage(stage).meterFill; }
export function stageLabel(stage: string): string { return resolvePoolStage(stage).stageLabel || stage; }

export function statusBadgeClass(status: string): string { return resolveStatusBadge(status); }
export function workerStateBadgeClass(state: string): string { return resolveWorkerStateBadge(state); }

export function formatMs(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60_000).toFixed(1)}m`;
}

export function formatBytes(bytes: number | null): string {
  if (bytes === null || bytes === undefined) return '-';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function truncateUrl(url: string, maxLen = 60): string {
  if (!url || url.length <= maxLen) return url;
  return `${url.slice(0, maxLen - 3)}...`;
}

export function getRefetchInterval(
  isRunning: boolean,
  isInactive: boolean,
  activeMs = 2000,
  idleMs = 10000,
): number | false {
  if (isInactive) return false;
  return isRunning ? activeMs : idleMs;
}

export function pctString(value: number): string {
  return `${Math.round(value * 100)}%`;
}

export function methodBadgeClass(method: string): string { return resolveMethodBadge(method).badge; }
export function fieldStatusBadgeClass(status: string): string { return resolveFieldStatusBadge(status); }
export function fallbackResultBadgeClass(result: string): string { return resolveFallbackResultBadge(result); }
export function fetchModeBadgeClass(mode: string): string { return resolveFetchModeBadge(mode); }
export function queueStatusBadgeClass(status: string): string { return resolveQueueStatusBadge(status); }
export function tierLabel(tier: number | null): string { return resolveTierBadge(tier).label; }

export const METRIC_TIPS: Record<string, string> = {
  pool_search: 'Search pool: workers sending queries to search engines to discover new source URLs.',
  pool_fetch: 'Fetch pool: workers downloading web pages, PDFs, and other documents from discovered URLs.',
  pool_parse: 'Parse pool: workers extracting structured data from downloaded documents (HTML tables, JSON-LD, article text, PDF text).',
  pool_llm: 'LLM pool: workers sending extraction/validation requests to language models.',
  pool_active: 'Currently executing tasks in this pool.',
  pool_done: 'Tasks completed successfully.',
  pool_fail: 'Tasks that ended in error (timeout, HTTP error, parse failure, etc).',

  identity_status: 'Product identity lock state.\n\n- locked: brand + model confirmed with high confidence\n- provisional: likely match but not yet confirmed\n- unlocked: identity not yet determined',
  confidence: 'Average confidence score across all accepted field values (0-100%). Higher means more sources agree on the extracted values.',
  acceptance_rate: 'Percentage of extracted field values that passed validation and were accepted into the final spec.',

  fallback_rate: 'Percentage of fetches that required switching to a backup fetch method (e.g., HTTP failed, tried Playwright instead).',
  blocked_hosts: 'Number of domains currently blocked due to repeated failures (403s, rate limits, or timeouts).',
  retries: 'Total retry attempts across all fetch operations.',
  no_progress: 'Consecutive rounds where no new field values were accepted. High values suggest the run is stalling.',

  status: 'Current run status: running, completed, or stopped with a reason.',
  round: 'Discovery round number. Each round searches for new sources, fetches them, and extracts field values.',
  fetches: 'Total web pages and documents fetched so far.',
  parses: 'Total documents successfully parsed into structured data.',
  llm_calls: 'Total requests sent to language models for extraction or validation.',
  error_rate: 'Percentage of all operations that resulted in an error.',
  docs_per_min: 'Documents processed per minute (fetch + parse). Shows current throughput.',
  fields_per_min: 'Spec fields accepted per minute. The core productivity metric.',

  top_blockers: 'Domains causing the most errors. These hosts are slowing down the run and may need cooldown or blocking.',

  worker_id: 'Unique identifier for this worker thread.',
  worker_pool: 'Which task pool this worker belongs to (search, fetch, parse, or llm).',
  worker_state: 'Current worker state: idle (waiting for work), running (processing a task), or stuck (no response for too long).',
  worker_url: 'The URL or query this worker is currently processing.',
  worker_elapsed: 'Time spent on the current task. Long durations may indicate a stuck worker.',
  worker_error: 'Last error message from this worker, if any.',
  worker_fetch_mode: 'The fetch transport being used: HTTP (fast, lightweight), Playwright (full browser), or Crawlee (headless crawl).',
  worker_retries: 'Number of retry attempts on the current task.',

  doc_url: 'Full URL of the fetched document.',
  doc_host: 'Domain name of the source website.',
  doc_status: 'Document lifecycle stage: fetching, fetched, parsing, parsed, indexed, or failed.',
  doc_code: 'HTTP status code returned by the server (200 = OK, 403 = blocked, 404 = not found).',
  doc_size: 'Downloaded content size in bytes.',
  doc_hash: 'Content fingerprint used to detect duplicate pages.',
  doc_dedupe: 'Whether this document was a duplicate of one already seen.',
  doc_parse: 'Parser used to extract structured data from this document.',

  ext_field: 'Spec field name (e.g., weight, sensor, dpi, polling_rate).',
  ext_value: 'The extracted value for this field, or "-" if not yet found.',
  ext_status: 'Field resolution status:\n\n- accepted: value confirmed by multiple sources\n- conflict: sources disagree on the value\n- candidate: only one source found so far\n- unknown: value could not be determined',
  ext_confidence: 'How confident the system is in this value (0-100%). Based on source agreement and tier quality.',
  ext_method: 'The extraction technique that produced this value.',
  ext_tier: 'Source quality tier:\n\n- T1 Official: manufacturer specs (most trusted)\n- T2 Lab Review: professional reviews/teardowns\n- T3 Retail: store listings and forums\n- T4 Unverified: low-confidence sources',
  ext_refs: 'Number of independent evidence references supporting this value.',

  fb_url: 'URL that triggered the fallback.',
  fb_host: 'Domain of the affected URL.',
  fb_transition: 'Fetch mode change: the original mode that failed and the backup mode tried next.',
  fb_reason: 'Why the fallback was triggered (timeout, HTTP error, blocked, empty response).',
  fb_attempt: 'Which attempt number this fallback represents for this URL.',
  fb_result: 'Outcome of the fallback attempt: succeeded, failed, or exhausted (all modes tried).',
  fb_time: 'Time spent on this fallback attempt.',
  fb_host_profile: 'Aggregated fallback statistics for this domain.',

  q_id: 'Unique job identifier (dedupe key).',
  q_lane: 'Queue lane: repair_search (re-discover URLs), refetch (retry failed downloads), or cooldown (waiting for rate limits to clear).',
  q_status: 'Job state: queued (waiting), running (active), done (complete), failed (gave up), or cooldown (rate-limited).',
  q_host: 'Target domain for this queue job.',
  q_url: 'Target URL for this queue job.',
  q_reason: 'Why this job was created (e.g., "404 on primary URL", "missing field: weight").',
  q_cooldown: 'When this job can be retried (if rate-limited).',
  q_blocked_hosts: 'Blocked hosts have exceeded the failure threshold and are temporarily excluded from fetching. They will be retried after the cooldown period expires.',
};

export function friendlyMethod(method: string): string {
  return resolveMethodBadge(method).label || method;
}

export function timeUntil(isoStr: string): string {
  if (!isoStr) return '';
  const diffMs = new Date(isoStr).getTime() - Date.now();
  if (diffMs <= 0) return 'now';
  const sec = Math.floor(diffMs / 1000);
  if (sec < 60) return `in ${sec}s`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `in ${min}m ${sec % 60}s`;
  return `in ${Math.floor(min / 60)}h ${min % 60}m`;
}

export function tierBadgeClass(tier: number | null): string { return resolveTierBadge(tier).badge; }

// ── Pre-Fetch Phase Helpers ──

export function llmCallStatusBadgeClass(status: string): string { return resolveLlmCallStatusBadge(status); }
export function triageDecisionBadgeClass(decision: string): string { return resolveTriageDecisionBadge(decision); }
export function domainRoleBadgeClass(role: string): string { return resolveDomainRoleBadge(role); }
export function safetyClassBadgeClass(safetyClass: string): string { return resolveSafetyClassBadge(safetyClass); }

import type { TriageScoreComponents } from './types.ts';

export function scoreBarSegments(components: TriageScoreComponents): { label: string; value: number; color: string }[] {
  return [
    { label: 'Relevance', value: Math.max(0, components.base_relevance), color: 'sf-metric-fill-info' },
    { label: 'Tier Boost', value: Math.max(0, components.tier_boost), color: 'sf-metric-fill-success' },
    { label: 'Identity', value: Math.max(0, components.identity_match), color: 'sf-metric-fill-accent' },
    { label: 'Penalties', value: Math.abs(components.penalties), color: 'sf-metric-fill-danger' },
  ];
}


