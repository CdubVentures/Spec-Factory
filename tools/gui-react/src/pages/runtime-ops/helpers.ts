export function statusBadgeClass(status: string): string {
  switch (status) {
    case 'running':
      return 'sf-chip-info';
    case 'fetching':
      return 'sf-chip-success';
    case 'parsing':
      return 'sf-chip-info';
    case 'indexing':
      return 'sf-chip-success';
    case 'completed':
    case 'fetched':
    case 'parsed':
    case 'indexed':
    case 'idle':
      return 'sf-chip-success';
    case 'stuck':
    case 'fetch_error':
    case 'failed':
      return 'sf-chip-danger';
    case 'skipped':
      return 'sf-chip-warning';
    default:
      return 'sf-chip-neutral';
  }
}

export function workerStateBadgeClass(state: string): string {
  switch (state) {
    case 'stuck':
      return 'sf-chip-danger animate-pulse';
    case 'running':
      return 'sf-chip-info';
    case 'idle':
      return 'sf-chip-neutral';
    default:
      return 'sf-chip-neutral';
  }
}

export function poolBadgeClass(pool: string): string {
  switch (pool) {
    case 'search':
      return 'sf-chip-accent';
    case 'fetch':
      return 'sf-chip-success';
    case 'parse':
      return 'sf-chip-info';
    case 'llm':
      return 'sf-chip-warning';
    case 'index':
      return 'sf-chip-success';
    default:
      return 'sf-chip-neutral';
  }
}

export function poolDotClass(pool: string): string {
  switch (pool) {
    case 'search':
      return 'sf-dot-accent';
    case 'fetch':
      return 'sf-dot-success';
    case 'parse':
      return 'sf-dot-info';
    case 'llm':
      return 'sf-dot-warning';
    case 'index':
      return 'sf-dot-success';
    default:
      return 'sf-dot-neutral';
  }
}

export function poolMeterFillClass(pool: string): string {
  switch (pool) {
    case 'search':
      return 'sf-meter-fill';
    case 'fetch':
      return 'sf-meter-fill-success';
    case 'parse':
      return 'sf-meter-fill-info';
    case 'llm':
      return 'sf-meter-fill-warning';
    case 'index':
      return 'sf-meter-fill-success';
    default:
      return 'sf-meter-fill-neutral';
  }
}

export function poolSelectedTabClass(pool: string): string {
  switch (pool) {
    case 'search':
      return 'sf-prefetch-tab-idle-accent';
    case 'fetch':
      return 'sf-prefetch-tab-idle-success';
    case 'parse':
      return 'sf-prefetch-tab-idle-info';
    case 'llm':
      return 'sf-prefetch-tab-idle-warning';
    case 'index':
      return 'sf-prefetch-tab-idle-success';
    default:
      return 'sf-prefetch-tab-idle-neutral';
  }
}

export function poolOutlineTabClass(pool: string): string {
  switch (pool) {
    case 'search':
      return 'sf-prefetch-tab-outline-accent';
    case 'fetch':
      return 'sf-prefetch-tab-outline-success';
    case 'parse':
      return 'sf-prefetch-tab-outline-info';
    case 'llm':
      return 'sf-prefetch-tab-outline-warning';
    case 'index':
      return 'sf-prefetch-tab-outline-success';
    default:
      return 'sf-prefetch-tab-outline-neutral';
  }
}

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

export function methodBadgeClass(method: string): string {
  switch (method) {
    case 'html_spec_table':
    case 'html_table':
      return 'sf-chip-info';
    case 'embedded_json':
    case 'json_ld':
    case 'microdata':
    case 'opengraph':
      return 'sf-chip-accent';
    case 'main_article':
    case 'dom':
      return 'sf-chip-info';
    case 'pdf_text':
    case 'pdf_kv':
    case 'pdf_table':
      return 'sf-chip-warning';
    case 'scanned_pdf_ocr':
    case 'scanned_pdf_ocr_table':
    case 'scanned_pdf_ocr_kv':
    case 'scanned_pdf_ocr_text':
    case 'image_ocr':
      return 'sf-chip-danger';
    case 'chart_payload':
    case 'network_json':
      return 'sf-chip-accent';
    case 'llm_extract':
    case 'llm_validate':
      return 'sf-chip-warning';
    case 'deterministic_normalizer':
    case 'consensus_policy_reducer':
      return 'sf-chip-success';
    default:
      return 'sf-chip-neutral';
  }
}

export function fieldStatusBadgeClass(status: string): string {
  switch (status) {
    case 'accepted':
      return 'sf-chip-success';
    case 'conflict':
      return 'sf-chip-danger';
    case 'candidate':
      return 'sf-chip-info';
    case 'unknown':
      return 'sf-chip-warning';
    default:
      return 'sf-chip-neutral';
  }
}

export function fallbackResultBadgeClass(result: string): string {
  switch (result) {
    case 'succeeded':
      return 'sf-chip-success';
    case 'exhausted':
    case 'failed':
      return 'sf-chip-danger';
    case 'pending':
      return 'sf-chip-info';
    default:
      return 'sf-chip-neutral';
  }
}

export function fetchModeBadgeClass(mode: string): string {
  switch (mode) {
    case 'playwright':
      return 'sf-chip-accent';
    case 'crawlee':
      return 'sf-chip-info';
    case 'http':
      return 'sf-chip-success';
    default:
      return 'sf-chip-neutral';
  }
}

export function queueStatusBadgeClass(status: string): string {
  switch (status) {
    case 'queued':
      return 'sf-chip-info';
    case 'running':
      return 'sf-chip-info animate-pulse';
    case 'done':
      return 'sf-chip-success';
    case 'failed':
      return 'sf-chip-danger';
    case 'cooldown':
      return 'sf-chip-warning';
    default:
      return 'sf-chip-neutral';
  }
}

export function tierLabel(tier: number | null): string {
  switch (tier) {
    case 1: return 'T1 Official';
    case 2: return 'T2 Lab Review';
    case 3: return 'T3 Retail';
    case 4: return 'T4 Unverified';
    default: return '-';
  }
}

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
  const MAP: Record<string, string> = {
    html_spec_table: 'HTML Spec Table',
    html_table: 'HTML Table',
    embedded_json: 'Embedded JSON',
    json_ld: 'JSON-LD',
    microdata: 'Microdata',
    opengraph: 'OpenGraph',
    main_article: 'Article Text',
    dom: 'DOM Selector',
    pdf_text: 'PDF Text',
    pdf_kv: 'PDF Key-Value',
    pdf_table: 'PDF Table',
    scanned_pdf_ocr: 'Scanned PDF (OCR)',
    scanned_pdf_ocr_table: 'Scanned PDF Table (OCR)',
    scanned_pdf_ocr_kv: 'Scanned PDF KV (OCR)',
    scanned_pdf_ocr_text: 'Scanned PDF Text (OCR)',
    image_ocr: 'Image OCR',
    chart_payload: 'Chart Data',
    network_json: 'Network JSON',
    llm_extract: 'LLM Extraction',
    llm_validate: 'LLM Validation',
    deterministic_normalizer: 'Normalizer',
    consensus_policy_reducer: 'Consensus',
  };
  return MAP[method] || method;
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

export function tierBadgeClass(tier: number | null): string {
  switch (tier) {
    case 1: return 'sf-chip-success';
    case 2: return 'sf-chip-info';
    case 3: return 'sf-chip-warning';
    case 4: return 'sf-chip-neutral';
    default: return 'sf-chip-neutral';
  }
}

export const STAGE_ORDER = ['search', 'fetch', 'parse', 'index', 'llm'] as const;

export function stageBadgeClass(stage: string): string {
  switch (stage) {
    case 'search': return 'sf-chip-accent';
    case 'fetch': return 'sf-chip-success';
    case 'parse': return 'sf-chip-info';
    case 'index': return 'sf-chip-success';
    case 'llm': return 'sf-chip-warning';
    default: return 'sf-chip-neutral';
  }
}

export function stageMeterFillClass(stage: string): string {
  return poolMeterFillClass(stage);
}

export function stageLabel(stage: string): string {
  switch (stage) {
    case 'search': return 'Searching';
    case 'fetch': return 'Fetching';
    case 'parse': return 'Parsing';
    case 'index': return 'Indexing';
    case 'llm': return 'Extracting';
    default: return stage;
  }
}

// ── Pre-Fetch Phase Helpers ──

export function llmCallStatusBadgeClass(status: string): string {
  switch (status) {
    case 'finished':
      return 'sf-chip-success';
    case 'failed':
      return 'sf-chip-danger';
    case 'running':
      return 'sf-chip-info animate-pulse';
    default:
      return 'sf-chip-neutral';
  }
}

export function identityStatusBadgeClass(status: string): string {
  switch (status) {
    case 'locked':
      return 'sf-chip-success';
    case 'provisional':
      return 'sf-chip-warning';
    case 'conflict':
      return 'sf-chip-danger';
    case 'unlocked':
      return 'sf-chip-info';
    default:
      return 'sf-chip-neutral';
  }
}

export function identityStatusTooltip(status: string): string {
  switch (status) {
    case 'locked':
      return 'Identity confirmed with high confidence (>=95%). Extraction gates are open for all fields.';
    case 'provisional':
      return 'Identity partially confirmed (>=70% confidence). Some field extraction is gated until confidence improves.';
    case 'conflict':
      return 'Sources disagree about this product\'s identity. Conflicting anchors detected.';
    case 'unlocked':
      return 'Identity not yet resolved. The brand resolver and source matching have not run or have not reached confidence thresholds.';
    default:
      return 'Identity status has not been computed yet.';
  }
}

export function needsetReasonBadgeClass(reason: string): string {
  switch (reason) {
    case 'missing':
      return 'sf-chip-danger';
    case 'low_confidence':
      return 'sf-chip-warning';
    case 'conflict':
      return 'sf-chip-danger';
    default:
      return 'sf-chip-neutral';
  }
}

export function domainClassBadgeClass(classification: string): string {
  switch (classification) {
    case 'safe':
    case 'manufacturer':
      return 'sf-chip-success';
    case 'review':
    case 'lab':
      return 'sf-chip-info';
    case 'retail':
      return 'sf-chip-warning';
    case 'blocked':
    case 'unsafe':
      return 'sf-chip-danger';
    default:
      return 'sf-chip-neutral';
  }
}

export function triageDecisionBadgeClass(decision: string): string {
  switch (decision) {
    case 'keep':
      return 'sf-chip-success';
    case 'maybe':
      return 'sf-chip-warning';
    case 'drop':
    case 'skip':
      return 'sf-chip-danger';
    case 'fetch':
      return 'sf-chip-info';
    default:
      return 'sf-chip-neutral';
  }
}

export function riskFlagBadgeClass(flag: string): string {
  switch (flag) {
    case 'low_trust':
    case 'potential_paywall':
    case 'blocked':
      return 'sf-chip-danger';
    case 'pdf_only':
    case 'slow':
      return 'sf-chip-warning';
    default:
      return 'sf-chip-neutral';
  }
}

export function domainRoleBadgeClass(role: string): string {
  switch (role) {
    case 'manufacturer':
      return 'sf-chip-success';
    case 'lab_review':
    case 'review':
      return 'sf-chip-info';
    case 'retail':
      return 'sf-chip-warning';
    case 'database':
      return 'sf-chip-accent';
    default:
      return 'sf-chip-neutral';
  }
}

export function safetyClassBadgeClass(safetyClass: string): string {
  switch (safetyClass) {
    case 'safe':
      return 'sf-chip-success';
    case 'caution':
      return 'sf-chip-warning';
    case 'blocked':
    case 'unsafe':
      return 'sf-chip-danger';
    default:
      return 'sf-chip-neutral';
  }
}

export function confidenceBarWidth(confidence: number): string {
  return `${Math.min(100, Math.max(0, Math.round(confidence * 100)))}%`;
}

import type { TriageScoreComponents } from './types';

export function scoreBarSegments(components: TriageScoreComponents): { label: string; value: number; color: string }[] {
  return [
    { label: 'Relevance', value: Math.max(0, components.base_relevance), color: 'sf-metric-fill-info' },
    { label: 'Tier Boost', value: Math.max(0, components.tier_boost), color: 'sf-metric-fill-success' },
    { label: 'Identity', value: Math.max(0, components.identity_match), color: 'sf-metric-fill-accent' },
    { label: 'Penalties', value: Math.abs(components.penalties), color: 'sf-metric-fill-danger' },
  ];
}

export function prefetchTabAccent(tab: string): string {
  switch (tab) {
    case 'needset': return 'sf-prefetch-tab-selected-success';
    case 'search_profile':
    case 'search_results': return 'sf-prefetch-tab-selected-accent';
    case 'query_journey': return 'sf-prefetch-tab-selected-info';
    case 'brand_resolver':
    case 'search_planner':
    case 'url_predictor':
    case 'serp_triage':
    case 'domain_classifier': return 'sf-prefetch-tab-selected-warning';
    default: return 'sf-prefetch-tab-selected-neutral';
  }
}
