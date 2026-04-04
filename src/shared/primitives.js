// WHY: SSOT for pure type-guard and text-normalization primitives.
// Every domain-helper file (engineTextHelpers, compilerPrimitives, publishPrimitives,
// reviewNormalization, compileUtils, runtimeOpsEventPrimitives)
// must import from here instead of defining its own copy.

import crypto from 'node:crypto';
import { toFloat } from './valueNormalizers.js';

export function clamp01(value, fallback = 0) {
  const parsed = toFloat(value, fallback);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(0, Math.min(1, parsed));
}

export function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function toArray(value) {
  return Array.isArray(value) ? value : [];
}

export function normalizeText(value) {
  return String(value ?? '').trim();
}

export function normalizeToken(value) {
  return normalizeText(value).toLowerCase();
}

export function normalizeTokenCollapsed(value) {
  return normalizeToken(value).replace(/\s+/g, ' ');
}

export function normalizeFieldKey(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

export function nowIso() {
  return new Date().toISOString();
}

export function buildRunId(date = new Date()) {
  const stamp = date.toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
  const suffix = crypto.randomBytes(3).toString('hex');
  return `${stamp}-${suffix}`;
}

/**
 * Generate a stable product ID: {category}-{8-char-hex}.
 * Category provides human context; the hex suffix is crypto-random and immutable.
 * Identity fields (brand, base_model, model, variant) are NOT encoded in the ID.
 */
export function buildProductId(category) {
  const cat = String(category ?? '').trim().toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  if (!cat) throw new Error('buildProductId requires a non-empty category');
  return `${cat}-${crypto.randomBytes(4).toString('hex')}`;
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

// WHY: Strips non-alphanumeric chars and lowercases. Different from normalizeToken
// which only lowercases. Used by identity/validation subsystem for fuzzy matching.
export function normalizeAlphanumToken(value) {
  return normalizeWhitespace(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function clamp(num, min, max) {
  return Math.max(min, Math.min(max, num));
}

export function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
