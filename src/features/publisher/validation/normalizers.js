import { UNK_TOKENS } from './unkTokens.js';

// --- Helpers ---

function toStringSafe(value) {
  return String(value ?? '').trim();
}

function asNumber(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const parsed = Number.parseFloat(String(value ?? '').replace(/,/g, '').trim());
  return Number.isFinite(parsed) ? parsed : null;
}

// --- parseList ---

export function parseList(value) {
  if (Array.isArray(value)) return value;
  const token = String(value ?? '').trim();
  if (!token) return [];
  return token
    .split(/[,;|/]+/)
    .map(part => String(part || '').trim())
    .filter(Boolean);
}

// --- normalizeBoolean ---
// WHY returns string tokens ('yes'/'no'/'unk'), NOT JS booleans:
// boolean_yes_no_unk fields are type: string with values {yes, no, unk}.

const YES_TOKENS = new Set(['yes', 'y', 'true', '1', 'on']);
const NO_TOKENS = new Set(['no', 'n', 'false', '0', 'off']);

export function normalizeBoolean(value) {
  if (value === true) return 'yes';
  if (value === false) return 'no';
  if (value === null || value === undefined) return 'unk';
  if (typeof value !== 'string') return null;

  const token = value.trim().toLowerCase();
  if (token === '' || UNK_TOKENS.has(token)) return 'unk';
  if (YES_TOKENS.has(token)) return 'yes';
  if (NO_TOKENS.has(token)) return 'no';
  return null;
}

// --- normalizeColorList ---

export function normalizeColorList(value) {
  return parseList(value)
    .map(entry => toStringSafe(entry).toLowerCase())
    .filter(Boolean);
}

// --- parseDate ---
// WHY: Returns YYYY-MM-DD only. Full ISO timestamps fail the date_field format regex.

export function parseDate(value) {
  if (value instanceof Date && Number.isFinite(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }
  const token = String(value ?? '').trim();
  if (!token) return null;
  const parsed = new Date(token);
  if (!Number.isFinite(parsed.getTime())) return null;
  return parsed.toISOString().slice(0, 10);
}

// --- parseLatencyList ---

export function parseLatencyList(value) {
  const parts = parseList(value);
  const out = [];
  for (const part of parts) {
    const match = String(part).match(/([\d.]+)\s*(wireless|wired|bluetooth|usb|2\.4g|2\.4ghz)?/i);
    if (!match) continue;
    const latency = asNumber(match[1]);
    if (latency === null) continue;
    out.push({
      value: latency,
      mode: toStringSafe(match[2] || 'default').toLowerCase(),
    });
  }
  return out;
}

// --- parsePollingList ---

export function parsePollingList(value) {
  const values = parseList(value)
    .map(entry => Number.parseInt(String(entry).replace(/,/g, '').trim(), 10))
    .filter(entry => Number.isFinite(entry));
  return [...new Set(values)].sort((a, b) => b - a);
}
