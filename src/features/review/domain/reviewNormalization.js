// ── Review Normalization ─────────────────────────────────────────────
//
// Shared normalizers used across the review subsystem.
// Unified from duplicated definitions in componentReviewData.js,
// reviewGridData.js, and reviewRoutes.js.

export function isObject(v) {
  return Boolean(v) && typeof v === 'object' && !Array.isArray(v);
}

export function toArray(v) {
  return Array.isArray(v) ? v : [];
}

export function normalizeToken(v) {
  return String(v ?? '').trim().toLowerCase();
}

export function normalizeFieldKey(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

// WHY: normalizeField strips a "fields." prefix before applying normalizeFieldKey logic.
// Used by reviewGridData.js for field-state keys that arrive prefixed.
export function normalizeField(field) {
  return String(field || '')
    .trim()
    .toLowerCase()
    .replace(/^fields\./, '')
    .replace(/[^a-z0-9_]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

export function slugify(v) {
  return String(v || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

export function splitCandidateParts(v) {
  if (Array.isArray(v)) {
    const nested = v.flatMap((entry) => splitCandidateParts(entry));
    return [...new Set(nested)];
  }
  const text = String(v ?? '').trim();
  if (!text) return [];
  const parts = text.includes(',')
    ? text.split(',').map((part) => part.trim()).filter(Boolean)
    : [text];
  return [...new Set(parts)];
}

export function normalizePathToken(value, fallback = 'unknown') {
  const token = normalizeToken(value).replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '');
  return token || fallback;
}

export function toNumber(value, fallback = 0) {
  const parsed = Number.parseFloat(String(value ?? ''));
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function parseDateMs(value) {
  const text = String(value || '').trim();
  if (!text) return 0;
  const parsed = Date.parse(text);
  return Number.isFinite(parsed) ? parsed : 0;
}
