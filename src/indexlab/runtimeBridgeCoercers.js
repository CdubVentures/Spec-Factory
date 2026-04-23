// WHY: Pure type-coercion and classification helpers extracted from runtimeBridge.js
// All functions are stateless, side-effect-free, and import nothing.

export function toIso(value) {
  const raw = String(value || '').trim();
  const ms = Date.parse(raw);
  if (Number.isFinite(ms)) return new Date(ms).toISOString();
  return new Date().toISOString();
}

export function asInt(value, fallback = 0) {
  const n = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(n) ? n : fallback;
}

export function asFloat(value, fallback = 0) {
  const n = Number.parseFloat(String(value ?? ''));
  return Number.isFinite(n) ? n : fallback;
}

export function asNullableInt(value) {
  if (value === undefined || value === null || value === '') {
    return null;
  }
  const n = Number.parseInt(String(value), 10);
  return Number.isFinite(n) ? n : null;
}

export function asNullableFloat(value) {
  if (value === undefined || value === null || value === '') {
    return null;
  }
  const n = Number.parseFloat(String(value));
  return Number.isFinite(n) ? n : null;
}

export function asNullableText(value) {
  const token = String(value ?? '').trim();
  return token ? token : null;
}

export function asBool(value, fallback = false) {
  if (value === undefined || value === null || value === '') {
    return fallback;
  }
  if (typeof value === 'boolean') {
    return value;
  }
  const token = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(token)) return true;
  if (['0', 'false', 'no', 'off'].includes(token)) return false;
  return fallback;
}

export function normalizeRunId(row = {}) {
  return String(row.runId || row.run_id || '').trim();
}

export function normalizeStageStatus(statusCode) {
  const status = asInt(statusCode, 0);
  if (status >= 200 && status < 300) return 'ok';
  if (status === 404 || status === 410) return '404';
  if (status === 403 || status === 429) return 'blocked';
  if (status >= 300 && status < 400) return 'redirect';
  if (status > 0) return 'error';
  return 'error';
}

export function isSearchEvent(name = '') {
  return (
    name.startsWith('discovery_')
    || name.startsWith('search_provider_')
    || name === 'search_provider_diagnostics'
    || name === 'search_request_throttled'
  );
}

export function toObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

export function inferLlmRouteRole(routeRole = '', reason = '') {
  const explicit = String(routeRole || '').trim().toLowerCase();
  if (explicit === 'plan') {
    return explicit;
  }
  const token = String(reason || '').trim().toLowerCase();
  if (!token) return '';
  if (
    token.includes('planner')
    || token.includes('search_profile')
    || token.includes('searchprofile')
    || token.includes('triage')
    || token.includes('rerank')
  ) {
    return 'plan';
  }
  return '';
}

export function classifyLlmCallType(reason = '') {
  const r = String(reason || '').trim().toLowerCase();
  if (r === 'brand_resolution') return 'brand_resolver';
  if (r === 'needset_search_planner') return 'needset_planner';
  if (r.startsWith('search_planner') || r.startsWith('discovery_planner') || r === 'uber_query_planner') return 'search_planner';
  if (r.includes('triage') || r.includes('rerank') || r.includes('serp')) return 'serp_selector';
  if (r === 'domain_safety_classification') return 'domain_classifier';
  if (r.startsWith('verify_extract')) return 'verification';
  if (r.startsWith('extract_')) return 'extraction';
  if (r === 'escalation_planner' || r.includes('escalation')) return 'escalation_planner';
  return 'unknown';
}

export const LLM_CALL_TYPE_TAB = {
  brand_resolver: '02',
  needset_planner: '01',
  search_planner: '04',
  serp_selector: '07',
  domain_classifier: '08',
};

export function buildLlmCallKey(row = {}, reason = '') {
  const batchId = String(row.batch_id || row.batchId || '').trim();
  if (batchId) {
    return `batch:${batchId}`;
  }
  const normalizedReason = String(reason || '').trim().toLowerCase();
  const normalizedModel = String(row.model || '').trim().toLowerCase();
  if (normalizedReason || normalizedModel) {
    return `reason:${normalizedReason}::model:${normalizedModel}`;
  }
  return '';
}

export function incrementCounterMap(target = {}, key = '') {
  const token = String(key || '').trim();
  if (!token) return target;
  target[token] = asInt(target[token], 0) + 1;
  return target;
}

export function decrementCounterMap(target = {}, key = '') {
  const token = String(key || '').trim();
  if (!token) return target;
  const current = asInt(target[token], 0);
  if (current <= 1) {
    delete target[token];
  } else {
    target[token] = current - 1;
  }
  return target;
}
