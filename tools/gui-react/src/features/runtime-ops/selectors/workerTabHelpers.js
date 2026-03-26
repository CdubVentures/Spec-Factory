const POOL_RANK = {
  llm: 0,
  search: 1,
  fetch: 2,
};

const STATE_RANK = {
  stuck: 0,
  failed: 0,
  captcha: 0.5,
  blocked: 0.5,
  rate_limited: 0.5,
  running: 1,
  crawling: 1,
  retrying: 1.5,
  idle: 2,
  crawled: 2,
  queued: 3,
};

/* WHY: pipeline call-type ordering so LLM workers render in logical stage order */
const CALL_TYPE_RANK = {
  needset_planner: 0,
  brand_resolver: 1,
  search_planner: 2,
  serp_selector: 3,
  domain_classifier: 4,
  extraction: 5,
  validation: 6,
  verification: 6,
  field_judge: 7,
  summary_writer: 8,
  escalation_planner: 9,
};

function compareText(a, b) {
  return String(a || '').localeCompare(String(b || ''));
}

function slotIndex(slot) {
  const normalized = String(slot || '').trim().toLowerCase();
  if (!normalized) return Number.MAX_SAFE_INTEGER;
  if (normalized.length === 1) {
    const code = normalized.charCodeAt(0);
    if (code >= 97 && code <= 122) {
      return code - 97;
    }
  }
  return Number.MAX_SAFE_INTEGER - 1;
}

function positiveIntOrMax(value) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return Number.MAX_SAFE_INTEGER;
  return parsed;
}

function truncateText(value, maxLength = 30) {
  const text = String(value || '').trim();
  if (!text) return null;
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength)}...`;
}

function fetchHostLabel(currentUrl) {
  const url = String(currentUrl || '').trim();
  if (!url) return null;
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return truncateText(url);
  }
}

// WHY: Show host + truncated path (e.g. "rog.asus.com/strix/xg27...") instead of bare hostname.
function fetchUrlPath(currentUrl) {
  const url = String(currentUrl || '').trim();
  if (!url) return null;
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.replace(/^www\./, '');
    const path = parsed.pathname === '/' ? '' : parsed.pathname;
    const full = path ? `${host}${path}` : host;
    return full.length > 40 ? `${full.slice(0, 37)}...` : full;
  } catch {
    return truncateText(url, 40);
  }
}

// WHY: Shorten proxy URL to a recognizable label (e.g. "proxy-us-1" from full URL).
function proxyShortLabel(proxyUrl) {
  const url = String(proxyUrl || '').trim();
  if (!url) return null;
  try {
    const parsed = new URL(url);
    return parsed.hostname.length > 20
      ? `${parsed.hostname.slice(0, 17)}...`
      : parsed.hostname;
  } catch {
    return truncateText(url, 15);
  }
}

function compareByState(a, b) {
  const byState = (STATE_RANK[a.state] ?? 99) - (STATE_RANK[b.state] ?? 99);
  if (byState !== 0) return byState;

  const byElapsed = Number(b.elapsed_ms || 0) - Number(a.elapsed_ms || 0);
  if (byElapsed !== 0) return byElapsed;

  return compareText(a.worker_id, b.worker_id);
}

function compareSearchWorkers(a, b) {
  const bySlot = slotIndex(a.slot) - slotIndex(b.slot);
  if (bySlot !== 0) return bySlot;

  const bySlotText = compareText(a.slot, b.slot);
  if (bySlotText !== 0) return bySlotText;

  return compareText(a.worker_id, b.worker_id);
}

function hasFetchAssignment(worker) {
  return String(worker?.assigned_search_slot || '').trim() !== ''
    && positiveIntOrMax(worker?.assigned_result_rank) !== Number.MAX_SAFE_INTEGER;
}

function numericWorkerIdSuffix(workerId) {
  const match = String(workerId || '').match(/(\d+)$/);
  return match ? Number.parseInt(match[1], 10) : Number.MAX_SAFE_INTEGER;
}

function compareFetchWorkers(a, b) {
  const byAssignmentPresence = (hasFetchAssignment(a) ? 0 : 1) - (hasFetchAssignment(b) ? 0 : 1);
  if (byAssignmentPresence !== 0) return byAssignmentPresence;

  const bySlot = slotIndex(a.assigned_search_slot) - slotIndex(b.assigned_search_slot);
  if (bySlot !== 0) return bySlot;

  const byRank = positiveIntOrMax(a.assigned_result_rank) - positiveIntOrMax(b.assigned_result_rank);
  if (byRank !== 0) return byRank;

  return numericWorkerIdSuffix(a.worker_id) - numericWorkerIdSuffix(b.worker_id);
}

export function sortWorkersForTabs(workers = []) {
  return [...workers].sort((a, b) => {
    const byPool = (POOL_RANK[a.pool] ?? 99) - (POOL_RANK[b.pool] ?? 99);
    if (byPool !== 0) return byPool;

    if (a.pool === 'search' && b.pool === 'search') {
      return compareSearchWorkers(a, b);
    }

    if (a.pool === 'fetch' && b.pool === 'fetch') {
      return compareFetchWorkers(a, b);
    }

    if (a.pool === 'llm' && b.pool === 'llm') {
      const byCallType = (CALL_TYPE_RANK[a.call_type] ?? 99) - (CALL_TYPE_RANK[b.call_type] ?? 99);
      if (byCallType !== 0) return byCallType;
    }

    return compareByState(a, b);
  });
}

export function buildWorkerButtonLabel(worker) {
  if (worker.pool === 'llm' && worker.call_type) {
    return String(worker.call_type).replace(/_/g, ' ');
  }

  if (worker.pool === 'search') {
    if (worker.slot) return `Slot ${String(worker.slot).toUpperCase()}`;
    const query = truncateText(worker.current_query, 40);
    if (query) return query;
  }

  if (worker.pool === 'fetch') {
    return String(worker.display_label || worker.worker_id || '').trim();
  }

  return String(worker.worker_id || '').trim();
}

export function buildWorkerButtonSubtitle(worker) {
  const workerId = String(worker.worker_id || '').trim();

  if (worker.pool === 'llm' && worker.model) {
    return [workerId, String(worker.model)].filter(Boolean).join(' \u00b7 ');
  }

  if (worker.pool === 'search') {
    return truncateText(worker.current_query, 45) || truncateText(worker.last_query, 45) || null;
  }

  if (worker.pool === 'fetch') {
    // WHY: Show truncated URL path (more useful than bare hostname).
    // Add proxy label so you can see it switch from "direct" to proxy on retry.
    const urlPath = fetchUrlPath(worker.current_url);
    const proxyLabel = worker.proxy_url ? proxyShortLabel(worker.proxy_url) : 'direct';
    const parts = [urlPath || fetchHostLabel(worker.current_url), proxyLabel].filter(Boolean);
    return parts.join(' \u00b7 ') || null;
  }

  return null;
}
