/**
 * Discovery Identity & Text Utilities
 *
 * Extracted from searchDiscovery.js (Phase 1 of structural decomposition).
 * All functions are pure — zero module state, zero side effects.
 */

// ---------------------------------------------------------------------------
// Core text utilities
// ---------------------------------------------------------------------------

export function normalizeHost(hostname) {
  return String(hostname || '').toLowerCase().replace(/^www\./, '');
}

export function slug(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function tokenize(value) {
  return String(value || '')
    .toLowerCase()
    .split(/[^a-z0-9]+/g)
    .map((token) => token.trim())
    .filter((token) => token.length >= 3);
}

export function compactToken(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
}

export { toArray } from '../../../../shared/primitives.js';

export function uniqueTokens(values = [], limit = 32) {
  const out = [];
  const seen = new Set();
  for (const value of values || []) {
    const token = String(value || '').trim();
    if (!token || seen.has(token)) continue;
    seen.add(token);
    out.push(token);
    if (out.length >= Math.max(1, Number(limit || 32))) break;
  }
  return out;
}

export function countTokenHits(haystack = '', tokens = []) {
  const text = String(haystack || '').toLowerCase();
  let hits = 0;
  for (const token of tokens || []) {
    const norm = String(token || '').toLowerCase().trim();
    if (!norm) {
      continue;
    }
    if (text.includes(norm)) {
      hits += 1;
    }
  }
  return hits;
}

// ---------------------------------------------------------------------------
// Identity resolution
// ---------------------------------------------------------------------------

export function resolveJobIdentity(job = {}) {
  const identityLock = job?.identityLock && typeof job.identityLock === 'object'
    ? job.identityLock
    : {};
  return {
    brand: String(identityLock.brand || job?.brand || '').trim(),
    model: String(identityLock.model || job?.model || '').trim(),
    variant: String(identityLock.variant || job?.variant || '').trim()
  };
}

export function productText(variables = {}) {
  return [variables.brand, variables.model, variables.variant]
    .map((value) => String(value || '').trim())
    .filter(Boolean)
    .join(' ')
    .trim();
}

export const GENERIC_MODEL_TOKENS = new Set([
  'gaming',
  'mouse',
  'mice',
  'wireless',
  'wired',
  'edition',
  'black',
  'white',
  'mini',
  'ultra',
  'pro',
  'plus',
  'core',
  'version',
  'series'
]);

export function normalizeIdentityTokens(variables = {}) {
  const brandTokens = [...new Set(tokenize(variables.brand))];
  const modelTokens = [...new Set([
    ...tokenize(variables.model),
    ...tokenize(variables.variant)
  ])].filter((token) => !brandTokens.includes(token) && !GENERIC_MODEL_TOKENS.has(token));
  return {
    brandTokens,
    modelTokens
  };
}

// ---------------------------------------------------------------------------
// Slug / alias building
// ---------------------------------------------------------------------------

export function buildModelSlugCandidates(variables = {}, cap = 6) {
  const entries = [];
  const brandSlug = slug(variables.brand || '');
  const modelSlug = slug(variables.model || '');
  const variantSlug = slug(variables.variant || '');
  const combinedModel = slug([variables.model, variables.variant].filter(Boolean).join(' '));
  const brandModel = slug([variables.brand, variables.model, variables.variant].filter(Boolean).join(' '));

  for (const value of [combinedModel, modelSlug, brandModel]) {
    if (value) {
      entries.push(value);
    }
  }
  if (modelSlug && variantSlug) {
    entries.push(`${modelSlug}-${variantSlug}`);
  }
  if (brandSlug && modelSlug) {
    entries.push(`${brandSlug}-${modelSlug}`);
    if (variantSlug) {
      entries.push(`${brandSlug}-${modelSlug}-${variantSlug}`);
    }
  }

  const unique = [];
  const seen = new Set();
  for (const value of entries) {
    const token = String(value || '').trim();
    if (!token || seen.has(token)) {
      continue;
    }
    seen.add(token);
    unique.push(token);
  }
  const normalizedCap = Math.max(1, Number.parseInt(String(cap ?? 6), 10) || 6);
  return unique.slice(0, normalizedCap);
}

export function categoryPathSegments(category) {
  const token = slug(category || '');
  if (!token) {
    return [];
  }
  if (token === 'mouse') {
    return ['mouse', 'mice', 'gaming-mice'];
  }
  if (token === 'keyboard') {
    return ['keyboard', 'keyboards', 'gaming-keyboards'];
  }
  if (token === 'headset') {
    return ['headset', 'headsets', 'gaming-headsets'];
  }
  return [token, `${token}s`];
}

// ---------------------------------------------------------------------------
// Identity guard context helpers
// ---------------------------------------------------------------------------

export function containsGuardToken(haystackLower = '', compactHaystack = '', token = '') {
  const normalized = String(token || '').toLowerCase().trim();
  if (!normalized) return false;
  if (haystackLower.includes(normalized)) return true;
  const compact = compactToken(normalized);
  return compact ? compactHaystack.includes(compact) : false;
}

export function extractDigitGroups(value = '') {
  return [...new Set(String(value || '').toLowerCase().match(/\d{2,}/g) || [])];
}

export function extractQueryModelLikeTokens(value = '') {
  return [...new Set(
    String(value || '')
      .toLowerCase()
      .split(/[^a-z0-9]+/g)
      .map((token) => token.trim())
      .filter((token) => token.length >= 3 && /[a-z]/.test(token) && /\d/.test(token))
  )];
}

export function isLikelyUnitToken(token = '') {
  const value = String(token || '').toLowerCase().trim();
  if (!value) return false;
  return /^(?:\d+k|\d+hz|\d+khz|\d+ghz|\d+mhz|\d+dpi|\d+cpi|\d+mm|\d+cm|\d+g|\d+kg|\d+ms|\d+s|\d+mah|\d+v|\d+mb|\d+gb)$/.test(value);
}
