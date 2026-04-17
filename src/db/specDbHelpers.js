/**
 * Pure helper functions for SpecDb.
 * Extracted from specDb.js — no side effects, no DB access.
 */

export function normalizeListLinkToken(value) {
  return String(value ?? '').trim();
}

export function expandListLinkValues(value) {
  if (Array.isArray(value)) {
    return [...new Set(value.map(normalizeListLinkToken).filter(Boolean))];
  }
  const raw = normalizeListLinkToken(value);
  if (!raw) return [];
  const split = raw
    .split(/[,;|/]+/)
    .map((part) => normalizeListLinkToken(part))
    .filter(Boolean);
  const ordered = split.length > 1 ? split : [raw];
  const seen = new Set();
  const out = [];
  for (const token of ordered) {
    const key = token.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(token);
  }
  return out;
}

export function toPositiveInteger(value) {
  const n = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function toBoolInt(value, fallback = 0) {
  if (value === undefined || value === null) return fallback ? 1 : 0;
  return value ? 1 : 0;
}

// WHY: Generic boolean hydration for DB rows. SQLite stores booleans as
// INTEGER 0/1 — this converts them back to JS booleans on read.
export function hydrateRow(booleanKeys, row) {
  if (!row) return row;
  const out = { ...row };
  for (const key of booleanKeys) {
    if (key in out) {
      out[key] = Number(out[key]) === 1;
    }
  }
  return out;
}

export function hydrateRows(booleanKeys, rows) {
  return rows.map(row => hydrateRow(booleanKeys, row));
}
