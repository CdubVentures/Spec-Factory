const POOL_RANK = {
  llm: 0,
  search: 1,
  fetch: 2,
};

const STATE_RANK = {
  stuck: 0,
  running: 1,
  idle: 2,
};

/* WHY: pipeline call-type ordering so LLM workers render in logical stage order */
const CALL_TYPE_RANK = {
  needset_planner: 0,
  brand_resolver: 1,
  search_planner: 2,
  serp_triage: 3,
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
    && positiveIntOrMax(worker?.assigned_search_attempt_no) !== Number.MAX_SAFE_INTEGER;
}

function compareFetchWorkers(a, b) {
  const byAssignmentPresence = (hasFetchAssignment(a) ? 0 : 1) - (hasFetchAssignment(b) ? 0 : 1);
  if (byAssignmentPresence !== 0) return byAssignmentPresence;

  const bySlot = slotIndex(a.assigned_search_slot) - slotIndex(b.assigned_search_slot);
  if (bySlot !== 0) return bySlot;

  const byAttempt = positiveIntOrMax(a.assigned_search_attempt_no) - positiveIntOrMax(b.assigned_search_attempt_no);
  if (byAttempt !== 0) return byAttempt;

  return compareText(a.worker_id, b.worker_id);
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

  if (worker.pool === 'search' && worker.slot) {
    return `slot ${worker.slot}`;
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
    const queryLabel = truncateText(worker.current_query);
    return [workerId, queryLabel].filter(Boolean).join(' \u00b7 ') || null;
  }

  if (worker.pool === 'fetch') {
    const host = fetchHostLabel(worker.current_url);
    const displayLabel = String(worker.display_label || '').trim();
    if (displayLabel && workerId && displayLabel !== workerId) {
      return host ? `${workerId} \u00b7 ${host}` : workerId;
    }
    return host;
  }

  return null;
}
