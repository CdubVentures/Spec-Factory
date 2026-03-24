import crypto from 'node:crypto';
import zlib from 'node:zlib';

export function nowIso() {
  return new Date().toISOString();
}

export function buildRunId(date = new Date()) {
  const stamp = date.toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
  const suffix = crypto.randomBytes(3).toString('hex');
  return `${stamp}-${suffix}`;
}

export function gzipBuffer(input) {
  const buffer = Buffer.isBuffer(input) ? input : Buffer.from(String(input), 'utf8');
  return zlib.gzipSync(buffer);
}

export function toNdjson(rows) {
  return rows.map((row) => JSON.stringify(row)).join('\n') + (rows.length ? '\n' : '');
}

export function safeJsonParse(value, fallback = null) {
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

export function normalizeWhitespace(value) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function normalizeToken(value) {
  return normalizeWhitespace(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

const LOW_VALUE_SUBDOMAIN_PREFIXES = new Set([
  'mysupport', 'support', 'help', 'community', 'forum', 'forums',
  'status', 'blog', 'careers', 'jobs', 'investor', 'ir',
]);

export function isLowValueSubdomain(host) {
  const parts = String(host || '').toLowerCase().split('.');
  return parts.length > 2 && LOW_VALUE_SUBDOMAIN_PREFIXES.has(parts[0]);
}

export function extractRootDomain(hostname) {
  const host = (hostname || '').toLowerCase();
  const parts = host.split('.').filter(Boolean);
  if (parts.length <= 2) {
    return host;
  }
  return parts.slice(-2).join('.');
}

export function parseNumber(value) {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  const match = String(value).replace(/,/g, '.').match(/-?\d+(?:\.\d+)?/);
  if (!match) {
    return null;
  }
  const parsed = Number.parseFloat(match[0]);
  return Number.isFinite(parsed) ? parsed : null;
}

export function splitListValue(value) {
  if (Array.isArray(value)) {
    return value.map((v) => normalizeWhitespace(v)).filter(Boolean);
  }
  return String(value || '')
    .split(/[,;|\/]+/)
    .map((part) => normalizeWhitespace(part))
    .filter(Boolean);
}

export function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function clamp(num, min, max) {
  return Math.max(min, Math.min(max, num));
}

