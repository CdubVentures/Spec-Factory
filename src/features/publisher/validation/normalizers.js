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

// --- parseNumberListWithRanges ---
// WHY: Handles "1.2, 2.4-3.2 mm" → [1.2, 2.4, 3.2].
// Splits by delimiters, expands ranges into endpoints, strips unit suffixes.

const RANGE_SEP = /[-\u2013]/; // hyphen or en-dash

function extractNum(token) {
  const m = String(token).trim().match(/^(-?\d+(?:\.\d+)?)/);
  if (!m) return null;
  const n = parseFloat(m[1]);
  return Number.isFinite(n) ? n : null;
}

export function parseNumberListWithRanges(value) {
  if (value === null || value === undefined) return [];

  if (Array.isArray(value)) {
    return value
      .map(v => typeof v === 'number' && Number.isFinite(v) ? v : extractNum(String(v)))
      .filter(v => v !== null);
  }

  if (typeof value === 'number' && Number.isFinite(value)) return [value];

  const str = String(value ?? '').trim();
  if (!str) return [];
  const lower = str.toLowerCase();
  if (UNK_TOKENS.has(lower) || lower === 'n/a') return [];

  // Split by delimiters: comma, slash, pipe, semicolon
  const tokens = str.split(/[,/|;]+/).map(t => t.trim()).filter(Boolean);
  const result = [];

  for (const token of tokens) {
    // WHY: Try range first — "2.4-3.2" or "2.4mm-3.2mm" or "2.4 - 3.2"
    // Strip unit suffixes from each side before parsing.
    const rangeParts = token.split(RANGE_SEP);
    if (rangeParts.length === 2) {
      const lo = extractNum(rangeParts[0]);
      const hi = extractNum(rangeParts[1]);
      if (lo !== null && hi !== null) {
        result.push(lo, hi);
        continue;
      }
    }
    // Single number (with optional unit suffix)
    const n = extractNum(token);
    if (n !== null) result.push(n);
  }

  return result;
}
