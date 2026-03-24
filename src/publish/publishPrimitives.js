import { isObject, toArray, normalizeToken } from '../shared/primitives.js';
import { toInt, toFloat as toNumber } from '../shared/valueNormalizers.js';

export { isObject, toArray, normalizeToken, toInt, toNumber };
export { hasKnownValue } from '../shared/valueNormalizers.js';

export function nowIso() {
  return new Date().toISOString();
}

export function toPosix(...parts) {
  return parts.filter(Boolean).join('/').replace(/\\/g, '/').replace(/\/+/g, '/');
}

export function normalizeCategory(value) {
  return String(value || '').trim().toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '');
}

// WHY: Different from shared/primitives.js normalizeFieldKey — this variant
// strips the "fields." prefix before normalizing. Used by publish pipeline.
export function normalizeFieldKey(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/^fields\./, '')
    .replace(/[^a-z0-9_]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

export function parseDateMs(value) {
  const parsed = Date.parse(String(value || ''));
  return Number.isFinite(parsed) ? parsed : 0;
}

export function parsePeriodDays(period, fallback = 30) {
  const token = normalizeToken(period);
  if (!token) {
    return fallback;
  }
  if (token === 'week' || token === 'weekly' || token === '7d') {
    return 7;
  }
  if (token === 'month' || token === 'monthly' || token === '30d') {
    return 30;
  }
  const match = token.match(/^(\d+)d$/);
  if (match) {
    return Math.max(1, Number.parseInt(match[1], 10) || fallback);
  }
  const asInt = Number.parseInt(token, 10);
  if (Number.isFinite(asInt) && asInt > 0) {
    return asInt;
  }
  return fallback;
}

export function parseJsonLines(text = '') {
  const out = [];
  for (const raw of String(text || '').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) {
      continue;
    }
    try {
      out.push(JSON.parse(line));
    } catch {
      // Ignore malformed lines.
    }
  }
  return out;
}

export function coerceOutputValue(value) {
  if (value === null || value === undefined) {
    return 'unk';
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }
  if (Array.isArray(value) || isObject(value)) {
    return value;
  }
  const text = String(value).trim();
  if (!text) {
    return 'unk';
  }
  const lower = text.toLowerCase();
  if (lower === 'true') {
    return true;
  }
  if (lower === 'false') {
    return false;
  }
  if (/^-?\d+(\.\d+)?$/.test(text)) {
    const numeric = Number.parseFloat(text);
    if (Number.isFinite(numeric)) {
      return numeric;
    }
  }
  return text;
}

export function csvEscape(value) {
  const text = String(value ?? '');
  if (!/[",\n\r]/.test(text)) {
    return text;
  }
  return `"${text.replace(/"/g, '""')}"`;
}
