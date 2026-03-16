export function toInt(v, fallback = 0) {
  const n = Number.parseInt(String(v ?? ''), 10);
  return Number.isFinite(n) ? n : fallback;
}

export function toFloat(v, fallback = 0) {
  const n = Number.parseFloat(String(v ?? ''));
  return Number.isFinite(n) ? n : fallback;
}

export function toUnitRatio(v) {
  const n = Number.parseFloat(String(v ?? ''));
  if (!Number.isFinite(n)) return undefined;
  if (n > 1) return Math.max(0, Math.min(1, n / 100));
  return Math.max(0, Math.min(1, n));
}

export function hasKnownValue(v) {
  const token = String(v ?? '').trim().toLowerCase();
  return token !== '' && token !== 'unk' && token !== 'unknown' && token !== 'n/a';
}

export function normalizeModelToken(value) {
  return String(value || '').trim().toLowerCase();
}

export function parseCsvTokens(value) {
  return String(value || '')
    .split(/[,\n]/g)
    .map((item) => String(item || '').trim())
    .filter(Boolean);
}

export function normalizePathToken(value, fallback = '') {
  const token = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return token || fallback;
}

export function normalizeJsonText(value, maxChars = 12000) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'object') {
    try {
      return JSON.stringify(value, null, 2).slice(0, Math.max(0, Number(maxChars) || 0));
    } catch {
      return '';
    }
  }
  const text = String(value || '');
  return text.slice(0, Math.max(0, Number(maxChars) || 0));
}

export function normalizeDomainToken(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .replace(/\/.*$/, '');
}

export function domainFromUrl(url) {
  try {
    const parsed = new URL(String(url || ''));
    return normalizeDomainToken(parsed.hostname);
  } catch {
    return normalizeDomainToken(url);
  }
}

export function urlPathToken(url) {
  try {
    const parsed = new URL(String(url || ''));
    return `${parsed.pathname}${parsed.search}`.toLowerCase();
  } catch {
    return String(url || '').toLowerCase();
  }
}

export function parseTsMs(value) {
  const ms = Date.parse(String(value || ''));
  return Number.isFinite(ms) ? ms : NaN;
}

export function percentileFromSorted(values, percentile) {
  if (!Array.isArray(values) || values.length === 0) return 0;
  const idx = Math.min(
    values.length - 1,
    Math.max(0, Math.floor((values.length - 1) * percentile))
  );
  return Number(values[idx]) || 0;
}

export function clampScore(value, min = 0, max = 100) {
  return Math.max(min, Math.min(max, Number(value) || 0));
}

export function incrementMapCounter(mapRef, key) {
  if (!mapRef || !key) return;
  mapRef.set(key, (mapRef.get(key) || 0) + 1);
}

export function countMapValuesAbove(mapRef, threshold = 1) {
  if (!mapRef || typeof mapRef.values !== 'function') return 0;
  let total = 0;
  for (const value of mapRef.values()) {
    if (Number(value) > threshold) total += 1;
  }
  return total;
}

export const UNKNOWN_VALUE_TOKENS = new Set(['', 'unk', 'unknown', 'n/a', 'na', 'none', 'null']);

export function isKnownValue(value) {
  const token = String(value || '').trim().toLowerCase();
  return !UNKNOWN_VALUE_TOKENS.has(token);
}

export function addTokensFromText(set, value) {
  for (const token of String(value || '').toLowerCase().split(/[^a-z0-9]+/g)) {
    const trimmed = token.trim();
    if (trimmed.length >= 4) {
      set.add(trimmed);
    }
  }
}
