/**
 * Value normalization helpers for indexing schema packets.
 * Hashing, date coercion, clamping, type inference, host parsing.
 * Extracted from indexingSchemaPackets.js (P4 decomposition).
 */
import crypto from 'node:crypto';
import { toFloat, hasKnownValue } from '../shared/valueNormalizers.js';

export function sha256(value = '') {
  return crypto.createHash('sha256').update(String(value || ''), 'utf8').digest('hex');
}

export function toIso(value, fallback = '') {
  const raw = String(value || '').trim();
  const ms = Date.parse(raw);
  if (Number.isFinite(ms)) return new Date(ms).toISOString();
  if (fallback) return toIso(fallback, '');
  return new Date().toISOString();
}

export function clamp01(value, fallback = 0) {
  const n = toFloat(value, fallback);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, Math.min(1, n));
}

export { hasKnownValue };

export function firstKnownValue(candidates = [], fallback = '') {
  for (const candidate of candidates) {
    const token = String(candidate ?? '').trim();
    if (hasKnownValue(token)) {
      return token;
    }
  }
  return String(fallback ?? '').trim();
}

export function normalizeHost(value = '') {
  return String(value || '').trim().toLowerCase().replace(/^www\./, '');
}

export function rootDomainFromHost(host = '') {
  const token = normalizeHost(host);
  if (!token) return '';
  const parts = token.split('.').filter(Boolean);
  if (parts.length <= 2) return token;
  return `${parts[parts.length - 2]}.${parts[parts.length - 1]}`;
}

export function unitForField(fieldKey = '') {
  const token = String(fieldKey || '').toLowerCase();
  if (token.endsWith('_hz') || token.includes('polling_rate')) return 'Hz';
  if (token.endsWith('_dpi')) return 'DPI';
  if (token.endsWith('_mm')) return 'mm';
  if (token.endsWith('_g')) return 'g';
  if (token.endsWith('_ms')) return 'ms';
  return null;
}

export function inferValueType(value) {
  if (Array.isArray(value)) return 'list';
  if (typeof value === 'boolean') return 'boolean';
  if (typeof value === 'number') return 'number';
  const token = String(value ?? '').trim();
  if (token === '') return 'string';
  if (/^-?\d+(\.\d+)?$/.test(token)) return 'number';
  return 'string';
}

export function tryNormalizeValue(value) {
  const type = inferValueType(value);
  if (type === 'number') {
    const n = toFloat(value, NaN);
    if (Number.isFinite(n)) return n;
  }
  if (type === 'boolean') {
    return Boolean(value);
  }
  return value;
}
