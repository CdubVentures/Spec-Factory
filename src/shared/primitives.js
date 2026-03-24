// WHY: SSOT for pure type-guard and text-normalization primitives.
// Every domain-helper file (engineTextHelpers, compilerPrimitives, publishPrimitives,
// reviewNormalization, compileUtils, convergenceHelpers, runtimeOpsEventPrimitives)
// must import from here instead of defining its own copy.

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

export function normalizeFieldKey(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}
