export function statusBadgeClass(status: string): string {
  switch (status) {
    case 'running':
    case 'fetching':
    case 'parsing':
    case 'indexing':
      return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200';
    case 'completed':
    case 'fetched':
    case 'parsed':
    case 'indexed':
    case 'idle':
      return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200';
    case 'stuck':
    case 'fetch_error':
    case 'failed':
      return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200';
    case 'skipped':
      return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200';
    default:
      return 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200';
  }
}

export function workerStateBadgeClass(state: string): string {
  switch (state) {
    case 'stuck':
      return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200 animate-pulse';
    case 'running':
      return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200';
    case 'idle':
      return 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300';
    default:
      return 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200';
  }
}

export function poolBadgeClass(pool: string): string {
  switch (pool) {
    case 'search':
      return 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200';
    case 'fetch':
      return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200';
    case 'parse':
      return 'bg-teal-100 text-teal-800 dark:bg-teal-900 dark:text-teal-200';
    case 'llm':
      return 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200';
    default:
      return 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200';
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
      return 'bg-cyan-100 text-cyan-800 dark:bg-cyan-900 dark:text-cyan-200';
    case 'embedded_json':
    case 'json_ld':
    case 'microdata':
    case 'opengraph':
      return 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-200';
    case 'main_article':
    case 'dom':
      return 'bg-sky-100 text-sky-800 dark:bg-sky-900 dark:text-sky-200';
    case 'pdf_text':
    case 'pdf_kv':
    case 'pdf_table':
      return 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200';
    case 'scanned_pdf_ocr':
    case 'scanned_pdf_ocr_table':
    case 'scanned_pdf_ocr_kv':
    case 'scanned_pdf_ocr_text':
    case 'image_ocr':
      return 'bg-rose-100 text-rose-800 dark:bg-rose-900 dark:text-rose-200';
    case 'chart_payload':
    case 'network_json':
      return 'bg-violet-100 text-violet-800 dark:bg-violet-900 dark:text-violet-200';
    case 'llm_extract':
    case 'llm_validate':
      return 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200';
    case 'deterministic_normalizer':
    case 'consensus_policy_reducer':
      return 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200';
    default:
      return 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200';
  }
}

export function fieldStatusBadgeClass(status: string): string {
  switch (status) {
    case 'accepted':
      return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200';
    case 'conflict':
      return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200';
    case 'candidate':
      return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200';
    case 'unknown':
      return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200';
    default:
      return 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200';
  }
}

export function fallbackResultBadgeClass(result: string): string {
  switch (result) {
    case 'succeeded':
      return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200';
    case 'exhausted':
    case 'failed':
      return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200';
    case 'pending':
      return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200';
    default:
      return 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200';
  }
}

export function fetchModeBadgeClass(mode: string): string {
  switch (mode) {
    case 'playwright':
      return 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200';
    case 'crawlee':
      return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200';
    case 'http':
      return 'bg-teal-100 text-teal-800 dark:bg-teal-900 dark:text-teal-200';
    default:
      return 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200';
  }
}

export function queueStatusBadgeClass(status: string): string {
  switch (status) {
    case 'queued':
      return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200';
    case 'running':
      return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200 animate-pulse';
    case 'done':
      return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200';
    case 'failed':
      return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200';
    case 'cooldown':
      return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200';
    default:
      return 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200';
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
    case 1: return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200';
    case 2: return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200';
    case 3: return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200';
    case 4: return 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300';
    default: return 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200';
  }
}

export const STAGE_ORDER = ['search', 'fetch', 'parse', 'index', 'llm'] as const;

export function stageBadgeClass(stage: string): string {
  switch (stage) {
    case 'search': return 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200';
    case 'fetch': return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200';
    case 'parse': return 'bg-teal-100 text-teal-800 dark:bg-teal-900 dark:text-teal-200';
    case 'index': return 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200';
    case 'llm': return 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200';
    default: return 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200';
  }
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
      return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200';
    case 'failed':
      return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200';
    case 'running':
      return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200 animate-pulse';
    default:
      return 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200';
  }
}

export function identityStatusBadgeClass(status: string): string {
  switch (status) {
    case 'locked':
      return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200';
    case 'provisional':
      return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200';
    case 'unlocked':
    case 'unknown':
      return 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300';
    default:
      return 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200';
  }
}

export function needsetReasonBadgeClass(reason: string): string {
  switch (reason) {
    case 'missing':
      return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200';
    case 'low_confidence':
      return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200';
    case 'conflict':
      return 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200';
    default:
      return 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200';
  }
}

export function domainClassBadgeClass(classification: string): string {
  switch (classification) {
    case 'safe':
    case 'manufacturer':
      return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200';
    case 'review':
    case 'lab':
      return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200';
    case 'retail':
      return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200';
    case 'blocked':
    case 'unsafe':
      return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200';
    default:
      return 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200';
  }
}

export function triageDecisionBadgeClass(decision: string): string {
  switch (decision) {
    case 'keep':
      return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200';
    case 'maybe':
      return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200';
    case 'drop':
    case 'skip':
      return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200';
    case 'fetch':
      return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200';
    default:
      return 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200';
  }
}

export function riskFlagBadgeClass(flag: string): string {
  switch (flag) {
    case 'low_trust':
    case 'potential_paywall':
    case 'blocked':
      return 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-200';
    case 'pdf_only':
    case 'slow':
      return 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-200';
    default:
      return 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300';
  }
}

export function domainRoleBadgeClass(role: string): string {
  switch (role) {
    case 'manufacturer':
      return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200';
    case 'lab_review':
    case 'review':
      return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200';
    case 'retail':
      return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200';
    case 'database':
      return 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200';
    default:
      return 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200';
  }
}

export function safetyClassBadgeClass(safetyClass: string): string {
  switch (safetyClass) {
    case 'safe':
      return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200';
    case 'caution':
      return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200';
    case 'blocked':
    case 'unsafe':
      return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200';
    default:
      return 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200';
  }
}

export function confidenceBarWidth(confidence: number): string {
  return `${Math.min(100, Math.max(0, Math.round(confidence * 100)))}%`;
}

import type { TriageScoreComponents } from './types';

export function scoreBarSegments(components: TriageScoreComponents): { label: string; value: number; color: string }[] {
  return [
    { label: 'Relevance', value: Math.max(0, components.base_relevance), color: 'bg-blue-500' },
    { label: 'Tier Boost', value: Math.max(0, components.tier_boost), color: 'bg-green-500' },
    { label: 'Identity', value: Math.max(0, components.identity_match), color: 'bg-purple-500' },
    { label: 'Penalties', value: Math.abs(components.penalties), color: 'bg-red-400' },
  ];
}

export function prefetchTabAccent(tab: string): string {
  switch (tab) {
    case 'needset': return 'border-emerald-500';
    case 'search_profile':
    case 'search_results': return 'border-purple-500';
    case 'brand_resolver':
    case 'search_planner':
    case 'url_predictor':
    case 'serp_triage':
    case 'domain_classifier': return 'border-amber-500';
    default: return 'border-gray-400';
  }
}
