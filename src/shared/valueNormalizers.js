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
  if (v == null) return false;
  const token = String(v).trim().toLowerCase();
  return !UNKNOWN_VALUE_TOKENS.has(token);
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

import { normalizeHost as _normalizeHost } from './hostParser.js';
export const normalizeDomainToken = _normalizeHost;

export function domainFromUrl(url) {
  try {
    const parsed = new URL(String(url || ''));
    return _normalizeHost(parsed.hostname);
  } catch {
    return _normalizeHost(url);
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

// WHY: SSOT for unknown-value tokens. Every hasKnownValue call site in the
// codebase must agree on this set. Frontend mirror: tools/gui-react/src/utils/constants.ts UNKNOWN_VALUES
export const UNKNOWN_VALUE_TOKENS = new Set(['', 'unknown', 'n/a', 'na', 'none', 'null', 'undefined', '-']);

export function addTokensFromText(set, value) {
  for (const token of String(value || '').toLowerCase().split(/[^a-z0-9]+/g)) {
    const trimmed = token.trim();
    if (trimmed.length >= 4) {
      set.add(trimmed);
    }
  }
}

export function parseNumber(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const match = String(value).replace(/,/g, '.').match(/-?\d+(?:\.\d+)?/);
  if (!match) return null;
  const parsed = Number.parseFloat(match[0]);
  return Number.isFinite(parsed) ? parsed : null;
}

export function splitListValue(value) {
  if (Array.isArray(value)) {
    return value.map((v) => String(v || '').replace(/\s+/g, ' ').trim()).filter(Boolean);
  }
  return String(value || '')
    .split(/[,;|\/]+/)
    .map((part) => String(part || '').replace(/\s+/g, ' ').trim())
    .filter(Boolean);
}

export function extractRootDomain(hostname) {
  const host = (hostname || '').toLowerCase();
  const parts = host.split('.').filter(Boolean);
  if (parts.length <= 2) return host;
  return parts.slice(-2).join('.');
}

const LOW_VALUE_SUBDOMAIN_PREFIXES = new Set([
  'mysupport', 'support', 'help', 'community', 'forum', 'forums',
  'status', 'blog', 'careers', 'jobs', 'investor', 'ir',
]);

export function isLowValueSubdomain(host) {
  const parts = String(host || '').toLowerCase().split('.');
  return parts.length > 2 && LOW_VALUE_SUBDOMAIN_PREFIXES.has(parts[0]);
}
